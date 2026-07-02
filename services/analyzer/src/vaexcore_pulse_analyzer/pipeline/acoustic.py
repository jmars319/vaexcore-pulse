from __future__ import annotations

import math
import shutil
import subprocess
import sys
from array import array
from dataclasses import dataclass

from ..contracts import (
    FeatureWindow,
    MediaSource,
    SpeechRegion,
    TimeRange,
    TranscriptChunk,
)

FFMPEG_AUDIO_TIMEOUT_SECONDS = 90
FFMPEG_AUDIO_SAMPLE_RATE = 8_000
FFMPEG_AUDIO_ANALYSIS_LIMIT_SECONDS = 1_800.0


@dataclass
class AudioSignalAnalysis:
    status: str
    source: str
    feature_windows: list[FeatureWindow]
    notes: list[str]


def extract_feature_windows(
    micro_windows: list[TimeRange],
    transcript: list[TranscriptChunk],
    speech_regions: list[SpeechRegion],
) -> list[FeatureWindow]:
    feature_windows: list[FeatureWindow] = []

    for index, window in enumerate(micro_windows, start=1):
        baseline = FeatureWindow(
            id=f"feature_{index:04d}",
            start_seconds=window.start_seconds,
            end_seconds=window.end_seconds,
            rms_loudness=0.22,
            onset_density=0.18,
            spectral_contrast=0.25,
            zero_crossing_rate=0.15,
            speech_density=0.08,
            overlap_activity=0.02,
            laughter_like_burst=0.0,
            pitch_excursion=0.12,
            abrupt_silence_after_intensity=0.03,
        )

        related_chunks = [
            chunk
            for chunk in transcript
            if chunk.start_seconds < window.end_seconds
            and chunk.end_seconds > window.start_seconds
        ]
        related_speech = [
            region
            for region in speech_regions
            if region.start_seconds < window.end_seconds
            and region.end_seconds > window.start_seconds
        ]

        if related_speech:
            baseline.speech_density = max(
                baseline.speech_density,
                max(region.speech_density for region in related_speech),
            )
            baseline.overlap_activity = max(
                baseline.overlap_activity,
                max(region.overlap_activity for region in related_speech),
            )

        for chunk in related_chunks:
            lowered = chunk.text.lower()
            if "wait wait" in lowered or "no way" in lowered:
                baseline.rms_loudness = 0.8
                baseline.onset_density = 0.76
                baseline.pitch_excursion = 0.7
                baseline.abrupt_silence_after_intensity = 0.55
            if "here we go" in lowered or "push now" in lowered:
                baseline.speech_density = max(baseline.speech_density, 0.78)
                baseline.onset_density = max(baseline.onset_density, 0.68)
                baseline.spectral_contrast = max(baseline.spectral_contrast, 0.63)
            if "we survived" in lowered:
                baseline.rms_loudness = max(baseline.rms_loudness, 0.83)
                baseline.laughter_like_burst = 0.74
                baseline.overlap_activity = max(baseline.overlap_activity, 0.67)
            if "this might be bad" in lowered:
                baseline.pitch_excursion = max(baseline.pitch_excursion, 0.39)
                baseline.speech_density = max(baseline.speech_density, 0.54)

        feature_windows.append(baseline)

    return feature_windows


def apply_local_audio_signals(
    media_source: MediaSource,
    feature_windows: list[FeatureWindow],
) -> AudioSignalAnalysis:
    if not feature_windows:
        return AudioSignalAnalysis(
            status="unavailable",
            source="transcript-heuristic",
            feature_windows=feature_windows,
            notes=["No feature windows were available for audio signal analysis."],
        )

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return AudioSignalAnalysis(
            status="unavailable",
            source="transcript-heuristic",
            feature_windows=feature_windows,
            notes=["FFmpeg was not available; using transcript-derived feature estimates."],
        )

    decoded = _decode_audio_samples(
        ffmpeg,
        media_source.path,
        media_source.duration_seconds,
    )
    if decoded is None:
        return AudioSignalAnalysis(
            status="failed",
            source="transcript-heuristic",
            feature_windows=feature_windows,
            notes=["Audio signal probe failed; using transcript-derived feature estimates."],
        )

    samples, decoded_duration_seconds = decoded
    if not samples or decoded_duration_seconds <= 0:
        return AudioSignalAnalysis(
            status="failed",
            source="transcript-heuristic",
            feature_windows=feature_windows,
            notes=["Audio signal probe returned no samples; using transcript-derived feature estimates."],
        )

    analyzed_count = 0
    previous_rms = 0.0
    for window in feature_windows:
        if window.start_seconds >= decoded_duration_seconds:
            continue
        window_samples = _samples_for_window(
            samples,
            window.start_seconds,
            window.end_seconds,
        )
        if not window_samples:
            continue

        audio_rms = _rms_score(window_samples)
        silence_share = _silence_share(window_samples)
        onset_score = _onset_score(window_samples)
        zero_crossing_rate = _zero_crossing_rate(window_samples)
        peak_score = _peak_score(window_samples)

        window.rms_loudness = max(window.rms_loudness, audio_rms)
        window.onset_density = max(window.onset_density, onset_score)
        window.zero_crossing_rate = max(window.zero_crossing_rate, zero_crossing_rate)
        window.spectral_contrast = max(window.spectral_contrast, peak_score)
        if previous_rms >= 0.58 and silence_share >= 0.62:
            window.abrupt_silence_after_intensity = max(
                window.abrupt_silence_after_intensity,
                min(1.0, silence_share),
            )
        previous_rms = audio_rms
        analyzed_count += 1

    if analyzed_count == 0:
        return AudioSignalAnalysis(
            status="failed",
            source="transcript-heuristic",
            feature_windows=feature_windows,
            notes=["Audio signal probe produced no usable feature windows."],
        )

    is_partial = decoded_duration_seconds < media_source.duration_seconds - 1.0
    return AudioSignalAnalysis(
        status="partial" if is_partial else "real",
        source="ffmpeg-pcm",
        feature_windows=feature_windows,
        notes=[
            (
                f"Audio signal windows computed with local FFmpeg for "
                f"{round(decoded_duration_seconds, 1)} seconds."
            ),
            (
                "Audio signal analysis was bounded; transcript-derived estimates fill the remaining timeline."
                if is_partial
                else "Audio signal analysis covered the available local media duration."
            ),
        ],
    )


def _decode_audio_samples(
    ffmpeg: str,
    media_path: str,
    duration_seconds: float,
) -> tuple[array, float] | None:
    analysis_seconds = min(
        max(duration_seconds, 0.0),
        FFMPEG_AUDIO_ANALYSIS_LIMIT_SECONDS,
    )
    command = [
        ffmpeg,
        "-v",
        "error",
        "-i",
        media_path,
        "-t",
        f"{analysis_seconds:.3f}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(FFMPEG_AUDIO_SAMPLE_RATE),
        "-f",
        "s16le",
        "-",
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            check=False,
            timeout=FFMPEG_AUDIO_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0 or not result.stdout:
        return None

    samples = array("h")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    decoded_duration = len(samples) / FFMPEG_AUDIO_SAMPLE_RATE
    return samples, decoded_duration


def _samples_for_window(
    samples: array,
    start_seconds: float,
    end_seconds: float,
) -> array:
    start = max(0, int(start_seconds * FFMPEG_AUDIO_SAMPLE_RATE))
    end = min(len(samples), int(end_seconds * FFMPEG_AUDIO_SAMPLE_RATE))
    if end <= start:
        return array("h")
    return samples[start:end]


def _rms_score(samples: array) -> float:
    stride = max(1, len(samples) // 4_000)
    selected = samples[::stride]
    if not selected:
        return 0.0
    mean_square = sum(sample * sample for sample in selected) / len(selected)
    return _clamp(math.sqrt(mean_square) / 14_000.0)


def _silence_share(samples: array) -> float:
    stride = max(1, len(samples) // 4_000)
    selected = samples[::stride]
    if not selected:
        return 1.0
    silent = sum(1 for sample in selected if abs(sample) <= 420)
    return _clamp(silent / len(selected))


def _onset_score(samples: array) -> float:
    stride = max(1, len(samples) // 2_000)
    selected = samples[::stride]
    if len(selected) < 2:
        return 0.0
    average_delta = sum(
        abs(selected[index] - selected[index - 1])
        for index in range(1, len(selected))
    ) / (len(selected) - 1)
    return _clamp(average_delta / 12_000.0)


def _zero_crossing_rate(samples: array) -> float:
    stride = max(1, len(samples) // 2_000)
    selected = samples[::stride]
    if len(selected) < 2:
        return 0.0
    crossings = sum(
        1
        for index in range(1, len(selected))
        if (selected[index - 1] < 0 <= selected[index])
        or (selected[index - 1] >= 0 > selected[index])
    )
    return _clamp(crossings / (len(selected) - 1))


def _peak_score(samples: array) -> float:
    stride = max(1, len(samples) // 4_000)
    selected = samples[::stride]
    if not selected:
        return 0.0
    return _clamp(max(abs(sample) for sample in selected) / 22_000.0)


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, round(value, 3)))
