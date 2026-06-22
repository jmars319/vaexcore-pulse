from __future__ import annotations

import hashlib
import json
import math
import shutil
import struct
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..contracts import (
    MediaIndexArtifact,
    MediaIndexArtifactKind,
    MediaIndexArtifactMethod,
    MediaIndexAudioBucket,
    MediaIndexSummary,
    MediaThumbnailSuggestion,
)
from ..paths import resolve_thumbnail_output_root
from .ingest import inspect_media_with_metadata

# Media index contract
MEDIA_INDEX_VERSION = "MEDIA_INDEX_V1"
DEFAULT_BUCKET_DURATION_SECONDS = 30.0
MAX_AUDIO_PROXY_BUCKETS = 720
SAMPLE_BYTES_PER_BUCKET = 4096
DECODED_AUDIO_SAMPLE_RATE = 1000
DECODED_AUDIO_SAMPLE_WIDTH_BYTES = 2
MAX_DECODED_AUDIO_BUCKETS = 720
MAX_DECODED_AUDIO_SECONDS = 14_400.0
FFMPEG_DECODE_TIMEOUT_SECONDS = 180
THUMBNAIL_SUGGESTION_VERSION = "FFMPEG_TIMELINE_THUMBNAILS_V1"
MAX_THUMBNAIL_CANDIDATE_WINDOWS = 12
MAX_THUMBNAIL_SUGGESTIONS = 4
MIN_THUMBNAIL_SPACING_SECONDS = 45.0
THUMBNAIL_ANALYSIS_WIDTH = 160
THUMBNAIL_ANALYSIS_HEIGHT = 90
THUMBNAIL_EXPORT_WIDTH = 960
FFMPEG_FRAME_TIMEOUT_SECONDS = 30
THUMBNAIL_OUTPUT_ROOT = resolve_thumbnail_output_root()


# Metadata summary boundary
def build_media_index_summary(source_path: str) -> MediaIndexSummary:
    media_source, metadata = inspect_media_with_metadata(
        source_path,
        use_mock_data=False,
    )
    streams = metadata.get("streams", []) if metadata else []
    video_stream = _first_stream(streams, "video")
    audio_stream = _first_stream(streams, "audio")

    return MediaIndexSummary(
        method_version=MEDIA_INDEX_VERSION,
        generated_at=datetime.now(timezone.utc).isoformat(),
        source_path=media_source.path,
        file_name=media_source.file_name,
        file_size_bytes=media_source.file_size_bytes,
        kind=media_source.kind,
        format=str(
            metadata.get("format", {}).get("format_name")
            if metadata
            else media_source.format
        ),
        duration_seconds=round(media_source.duration_seconds, 2),
        frame_rate=media_source.frame_rate,
        width=_positive_int(video_stream.get("width") if video_stream else None),
        height=_positive_int(video_stream.get("height") if video_stream else None),
        video_codec=_optional_string(video_stream.get("codec_name") if video_stream else None),
        audio_codec=_optional_string(audio_stream.get("codec_name") if audio_stream else None),
        has_video=video_stream is not None,
        has_audio=audio_stream is not None,
        stream_count=len(streams),
        notes=media_source.ingest_notes,
    )


# Artifact assembly boundary
def build_media_index_artifacts(
    *,
    asset_id: str,
    job_id: str,
    index_summary: MediaIndexSummary,
) -> list[MediaIndexArtifact]:
    artifacts: list[MediaIndexArtifact] = []
    decoded_audio_artifact = build_decoded_audio_fingerprint_artifact(
        asset_id=asset_id,
        job_id=job_id,
        index_summary=index_summary,
    )
    if decoded_audio_artifact is not None:
        artifacts.append(decoded_audio_artifact)
    else:
        artifacts.append(
            build_audio_fingerprint_artifact(
                asset_id=asset_id,
                job_id=job_id,
                index_summary=index_summary,
            )
        )

    thumbnail_artifact = build_thumbnail_suggestion_artifact(
        asset_id=asset_id,
        job_id=job_id,
        index_summary=index_summary,
        reference_audio_artifact=artifacts[0],
    )
    if thumbnail_artifact is not None:
        artifacts.append(thumbnail_artifact)

    return artifacts


# Decoded audio boundary
def build_decoded_audio_fingerprint_artifact(
    *,
    asset_id: str,
    job_id: str,
    index_summary: MediaIndexSummary,
) -> MediaIndexArtifact | None:
    if not index_summary.has_audio and index_summary.kind != "AUDIO":
        return None

    pcm_bytes = _decode_low_rate_pcm(index_summary)
    if not pcm_bytes:
        return None

    return build_decoded_audio_fingerprint_artifact_from_pcm(
        asset_id=asset_id,
        job_id=job_id,
        index_summary=index_summary,
        pcm_bytes=pcm_bytes,
    )


def build_decoded_audio_fingerprint_artifact_from_pcm(
    *,
    asset_id: str,
    job_id: str,
    index_summary: MediaIndexSummary,
    pcm_bytes: bytes,
) -> MediaIndexArtifact | None:
    sample_count = len(pcm_bytes) // DECODED_AUDIO_SAMPLE_WIDTH_BYTES
    if sample_count <= 0:
        return None

    decoded_duration_seconds = min(
        index_summary.duration_seconds,
        sample_count / DECODED_AUDIO_SAMPLE_RATE,
        MAX_DECODED_AUDIO_SECONDS,
    )
    if decoded_duration_seconds <= 0:
        return None

    now = datetime.now(timezone.utc).isoformat()
    bucket_duration_seconds = max(
        DEFAULT_BUCKET_DURATION_SECONDS,
        math.ceil(decoded_duration_seconds / MAX_DECODED_AUDIO_BUCKETS),
    )
    bucket_count = max(1, math.ceil(decoded_duration_seconds / bucket_duration_seconds))
    buckets = [
        _build_decoded_audio_bucket(
            index=index,
            bucket_duration_seconds=bucket_duration_seconds,
            decoded_duration_seconds=decoded_duration_seconds,
            pcm_bytes=pcm_bytes,
        )
        for index in range(bucket_count)
    ]
    buckets = [bucket for bucket in buckets if bucket is not None]
    if not buckets:
        return None

    energy_values = [bucket.energy_score for bucket in buckets]
    onset_values = [bucket.onset_score for bucket in buckets]
    silence_values = [bucket.silence_score for bucket in buckets]
    payload_byte_size = len(
        json.dumps([_bucket_payload(bucket) for bucket in buckets], separators=(",", ":")).encode(
            "utf-8"
        )
    )
    artifact_id_seed = f"decoded:{asset_id}:{job_id}:{index_summary.source_path}:{now}"

    return MediaIndexArtifact(
        id=f"artifact_audio_{hashlib.sha1(artifact_id_seed.encode('utf-8')).hexdigest()[:12]}",
        asset_id=asset_id,
        job_id=job_id,
        kind=MediaIndexArtifactKind.AUDIO_FINGERPRINT,
        method=MediaIndexArtifactMethod.DECODED_AUDIO_FINGERPRINT_V1,
        bucket_duration_seconds=bucket_duration_seconds,
        duration_seconds=round(decoded_duration_seconds, 2),
        bucket_count=len(buckets),
        confidence_score=0.78,
        payload_byte_size=payload_byte_size,
        energy_mean=_mean(energy_values),
        energy_peak=max(energy_values, default=0.0),
        onset_mean=_mean(onset_values),
        silence_share=_mean(silence_values),
        buckets=buckets,
        note=(
            "Decoded low-rate mono PCM fingerprint. This is still compact and bounded, "
            "but it measures audio content instead of container bytes."
        ),
        created_at=now,
        updated_at=now,
    )


# Byte proxy fallback
def build_audio_fingerprint_artifact(
    *,
    asset_id: str,
    job_id: str,
    index_summary: MediaIndexSummary,
) -> MediaIndexArtifact:
    now = datetime.now(timezone.utc).isoformat()
    bucket_duration_seconds = _bucket_duration_seconds(index_summary.duration_seconds)
    bucket_count = max(
        1,
        math.ceil(index_summary.duration_seconds / bucket_duration_seconds),
    )
    buckets = [
        _build_proxy_audio_bucket(
            index=index,
            bucket_count=bucket_count,
            bucket_duration_seconds=bucket_duration_seconds,
            index_summary=index_summary,
        )
        for index in range(bucket_count)
    ]
    energy_values = [bucket.energy_score for bucket in buckets]
    onset_values = [bucket.onset_score for bucket in buckets]
    silence_values = [bucket.silence_score for bucket in buckets]
    payload_byte_size = len(
        json.dumps([_bucket_payload(bucket) for bucket in buckets], separators=(",", ":")).encode(
            "utf-8"
        )
    )
    has_confirmed_audio = index_summary.has_audio or index_summary.kind == "AUDIO"
    artifact_id_seed = f"{asset_id}:{job_id}:{index_summary.source_path}:{now}"

    return MediaIndexArtifact(
        id=f"artifact_audio_{hashlib.sha1(artifact_id_seed.encode('utf-8')).hexdigest()[:12]}",
        asset_id=asset_id,
        job_id=job_id,
        kind=MediaIndexArtifactKind.AUDIO_FINGERPRINT,
        method=MediaIndexArtifactMethod.BYTE_SAMPLED_AUDIO_PROXY_V1,
        bucket_duration_seconds=bucket_duration_seconds,
        duration_seconds=round(index_summary.duration_seconds, 2),
        bucket_count=len(buckets),
        confidence_score=0.32 if has_confirmed_audio else 0.18,
        payload_byte_size=payload_byte_size,
        energy_mean=_mean(energy_values),
        energy_peak=max(energy_values, default=0.0),
        onset_mean=_mean(onset_values),
        silence_share=_mean(silence_values),
        buckets=buckets,
        note=(
            "Bounded byte-sampled audio proxy. This stores stable time-bucketed signatures "
            "without decoding the full media file; it is suitable for plumbing and coarse future "
            "matching, but not yet a high-confidence decoded audio fingerprint."
        ),
        created_at=now,
        updated_at=now,
    )


# Thumbnail scoring boundary
def build_thumbnail_suggestion_artifact(
    *,
    asset_id: str,
    job_id: str,
    index_summary: MediaIndexSummary,
    reference_audio_artifact: MediaIndexArtifact,
) -> MediaIndexArtifact | None:
    if not index_summary.has_video or index_summary.kind != "VIDEO":
        return None

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None

    candidate_frames = _score_thumbnail_candidate_frames(
        ffmpeg=ffmpeg,
        index_summary=index_summary,
        reference_audio_artifact=reference_audio_artifact,
    )
    if not candidate_frames:
        return None

    selected_frames = _select_thumbnail_candidate_frames(
        candidate_frames,
        duration_seconds=index_summary.duration_seconds,
    )
    if not selected_frames:
        return None

    output_directory = THUMBNAIL_OUTPUT_ROOT / asset_id
    try:
        output_directory.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None

    suggestions: list[MediaThumbnailSuggestion] = []
    generated_at = datetime.now(timezone.utc).isoformat()
    for suggestion_index, frame in enumerate(selected_frames, start=1):
        suggestion_timestamp_millis = int(round(float(frame["timestamp_seconds"]) * 1000))
        output_path = (
            output_directory
            / f"{job_id}_{suggestion_index:02d}_{suggestion_timestamp_millis}.jpg"
        )
        if not _export_thumbnail_frame(
            ffmpeg=ffmpeg,
            source_path=index_summary.source_path,
            timestamp_seconds=frame["timestamp_seconds"],
            output_path=output_path,
        ):
            continue

        suggestions.append(
            MediaThumbnailSuggestion(
                id=f"thumbnail_{asset_id}_{suggestion_timestamp_millis}",
                image_path=str(output_path.resolve()),
                timestamp_seconds=round(frame["timestamp_seconds"], 2),
                score=round(frame["score"], 4),
                activity_score=round(frame["activity_score"], 4),
                brightness_score=round(frame["brightness_score"], 4),
                contrast_score=round(frame["contrast_score"], 4),
                sharpness_score=round(frame["sharpness_score"], 4),
                note=str(frame["note"]),
            )
        )

    if not suggestions:
        return None

    payload = [_thumbnail_payload(suggestion) for suggestion in suggestions]
    payload_byte_size = len(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    )
    artifact_id_seed = (
        f"thumbnail:{asset_id}:{job_id}:{index_summary.source_path}:{generated_at}"
    )

    return MediaIndexArtifact(
        id=f"artifact_thumbnail_{hashlib.sha1(artifact_id_seed.encode('utf-8')).hexdigest()[:12]}",
        asset_id=asset_id,
        job_id=job_id,
        kind=MediaIndexArtifactKind.THUMBNAIL_SUGGESTIONS,
        method=MediaIndexArtifactMethod.FFMPEG_TIMELINE_THUMBNAILS_V1,
        bucket_duration_seconds=reference_audio_artifact.bucket_duration_seconds,
        duration_seconds=round(index_summary.duration_seconds, 2),
        bucket_count=reference_audio_artifact.bucket_count,
        confidence_score=round(_mean([suggestion.score for suggestion in suggestions]), 4),
        payload_byte_size=payload_byte_size,
        sample_window_count=len(candidate_frames),
        thumbnail_suggestions=suggestions,
        note=(
            "Bounded ffmpeg thumbnail suggestions scored from local activity buckets and "
            "simple visual clarity heuristics."
        ),
        created_at=generated_at,
        updated_at=generated_at,
    )


def _bucket_duration_seconds(duration_seconds: float) -> float:
    if duration_seconds <= 0:
        return DEFAULT_BUCKET_DURATION_SECONDS
    return max(
        DEFAULT_BUCKET_DURATION_SECONDS,
        math.ceil(duration_seconds / MAX_AUDIO_PROXY_BUCKETS),
    )


def _build_proxy_audio_bucket(
    *,
    index: int,
    bucket_count: int,
    bucket_duration_seconds: float,
    index_summary: MediaIndexSummary,
) -> MediaIndexAudioBucket:
    start_seconds = round(index * bucket_duration_seconds, 2)
    end_seconds = round(
        min((index + 1) * bucket_duration_seconds, index_summary.duration_seconds),
        2,
    )
    sample = _read_bounded_media_sample(
        index_summary.source_path,
        index,
        bucket_count,
        index_summary.file_size_bytes,
    )
    if not sample:
        sample = hashlib.sha1(
            f"{index_summary.source_path}:{index_summary.file_size_bytes}:{index}".encode(
                "utf-8"
            )
        ).digest()

    energy_score = _clamp(sum(sample) / (len(sample) * 255))
    onset_score = _clamp(_mean_absolute_delta(sample) / 255)
    spectral_flux_score = _clamp(_byte_stddev(sample) / 128)
    silence_score = _clamp(1 - (energy_score * 1.7))
    fingerprint_seed = sample + f":{index}:{start_seconds}:{end_seconds}".encode("utf-8")

    return MediaIndexAudioBucket(
        index=index,
        start_seconds=start_seconds,
        end_seconds=end_seconds,
        energy_score=round(energy_score, 4),
        onset_score=round(onset_score, 4),
        spectral_flux_score=round(spectral_flux_score, 4),
        silence_score=round(silence_score, 4),
        fingerprint=hashlib.sha1(fingerprint_seed).hexdigest()[:20],
    )


# FFMPEG decode boundary
def _decode_low_rate_pcm(index_summary: MediaIndexSummary) -> bytes | None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None

    decode_seconds = min(index_summary.duration_seconds, MAX_DECODED_AUDIO_SECONDS)
    if decode_seconds <= 0:
        return None

    try:
        result = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                index_summary.source_path,
                "-vn",
                "-ac",
                "1",
                "-ar",
                str(DECODED_AUDIO_SAMPLE_RATE),
                "-t",
                f"{decode_seconds:.2f}",
                "-f",
                "s16le",
                "-acodec",
                "pcm_s16le",
                "-",
            ],
            capture_output=True,
            check=False,
            timeout=FFMPEG_DECODE_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    if result.returncode != 0 or not result.stdout:
        return None
    return result.stdout


def _build_decoded_audio_bucket(
    *,
    index: int,
    bucket_duration_seconds: float,
    decoded_duration_seconds: float,
    pcm_bytes: bytes,
) -> MediaIndexAudioBucket | None:
    start_seconds = round(index * bucket_duration_seconds, 2)
    end_seconds = round(
        min((index + 1) * bucket_duration_seconds, decoded_duration_seconds),
        2,
    )
    if end_seconds <= start_seconds:
        return None

    start_sample = int(start_seconds * DECODED_AUDIO_SAMPLE_RATE)
    end_sample = int(end_seconds * DECODED_AUDIO_SAMPLE_RATE)
    sample_bytes = pcm_bytes[
        start_sample * DECODED_AUDIO_SAMPLE_WIDTH_BYTES : end_sample
        * DECODED_AUDIO_SAMPLE_WIDTH_BYTES
    ]
    samples = [
        value[0]
        for value in struct.iter_unpack(
            "<h",
            sample_bytes[: len(sample_bytes) - (len(sample_bytes) % 2)],
        )
    ]
    if not samples:
        return None

    rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples)) / 32768
    mean_abs_delta = (
        sum(abs(samples[index] - samples[index - 1]) for index in range(1, len(samples)))
        / max(len(samples) - 1, 1)
    )
    zero_crossing_rate = (
        sum(
            1
            for sample_index in range(1, len(samples))
            if (samples[sample_index] >= 0) != (samples[sample_index - 1] >= 0)
        )
        / max(len(samples) - 1, 1)
    )
    silence_share = sum(1 for sample in samples if abs(sample) < 512) / len(samples)
    fingerprint_seed = (
        f"{index}:{start_seconds}:{end_seconds}:"
        f"{round(rms, 4)}:{round(mean_abs_delta / 32768, 4)}:"
        f"{round(zero_crossing_rate, 4)}:{round(silence_share, 4)}"
    )

    return MediaIndexAudioBucket(
        index=index,
        start_seconds=start_seconds,
        end_seconds=end_seconds,
        energy_score=round(_clamp(rms * 2.25), 4),
        onset_score=round(_clamp(mean_abs_delta / 32768), 4),
        spectral_flux_score=round(_clamp(zero_crossing_rate * 3.0), 4),
        silence_score=round(_clamp(silence_share), 4),
        fingerprint=hashlib.sha1(fingerprint_seed.encode("utf-8")).hexdigest()[:20],
    )


# Thumbnail scoring boundary
def _score_thumbnail_candidate_frames(
    *,
    ffmpeg: str,
    index_summary: MediaIndexSummary,
    reference_audio_artifact: MediaIndexArtifact,
) -> list[dict[str, float | str]]:
    candidate_windows = _thumbnail_candidate_windows(index_summary, reference_audio_artifact)
    scored_frames: list[dict[str, float | str]] = []
    for window in candidate_windows[:MAX_THUMBNAIL_CANDIDATE_WINDOWS]:
        timestamp_seconds = float(window["timestamp_seconds"])
        frame_metrics = _analyze_video_frame(
            ffmpeg=ffmpeg,
            source_path=index_summary.source_path,
            timestamp_seconds=timestamp_seconds,
        )
        if frame_metrics is None:
            continue

        activity_score = float(window["activity_score"])
        brightness_score = float(frame_metrics["brightness_score"])
        contrast_score = float(frame_metrics["contrast_score"])
        sharpness_score = float(frame_metrics["sharpness_score"])
        dark_penalty = float(frame_metrics["dark_penalty"])
        visual_score = _clamp(
            (brightness_score * 0.35)
            + (contrast_score * 0.35)
            + (sharpness_score * 0.3)
            - dark_penalty
        )
        composite_score = _clamp((activity_score * 0.58) + (visual_score * 0.42))

        scored_frames.append(
            {
                "timestamp_seconds": timestamp_seconds,
                "activity_score": activity_score,
                "brightness_score": brightness_score,
                "contrast_score": contrast_score,
                "sharpness_score": sharpness_score,
                "score": composite_score,
                "note": (
                    f"Activity {round(activity_score * 100)}%, "
                    f"brightness {round(brightness_score * 100)}%, "
                    f"contrast {round(contrast_score * 100)}%, "
                    f"clarity {round(sharpness_score * 100)}%."
                ),
            }
        )

    scored_frames.sort(
        key=lambda frame: (
            float(frame["score"]),
            float(frame["activity_score"]),
            float(frame["contrast_score"]),
        ),
        reverse=True,
    )
    return scored_frames


def _thumbnail_candidate_windows(
    index_summary: MediaIndexSummary,
    reference_audio_artifact: MediaIndexArtifact,
) -> list[dict[str, float]]:
    if not reference_audio_artifact.buckets:
        return _fallback_thumbnail_windows(index_summary.duration_seconds)

    start_guard_seconds = _thumbnail_guard_seconds(index_summary.duration_seconds)
    end_guard_seconds = _thumbnail_guard_seconds(index_summary.duration_seconds)
    candidate_windows: list[dict[str, float]] = []
    for bucket in reference_audio_artifact.buckets:
        midpoint_seconds = (bucket.start_seconds + bucket.end_seconds) / 2
        if midpoint_seconds <= start_guard_seconds:
            continue
        if midpoint_seconds >= max(index_summary.duration_seconds - end_guard_seconds, 0.0):
            continue

        activity_score = _clamp(
            (bucket.energy_score * 0.5)
            + (bucket.onset_score * 0.3)
            + (bucket.spectral_flux_score * 0.15)
            + ((1 - bucket.silence_score) * 0.05)
        )
        candidate_windows.append(
            {
                "timestamp_seconds": midpoint_seconds,
                "activity_score": activity_score,
            }
        )

    if not candidate_windows:
        return _fallback_thumbnail_windows(index_summary.duration_seconds)

    candidate_windows.sort(
        key=lambda window: (
            float(window["activity_score"]),
            -abs((index_summary.duration_seconds / 2) - float(window["timestamp_seconds"])),
        ),
        reverse=True,
    )
    return candidate_windows


def _fallback_thumbnail_windows(duration_seconds: float) -> list[dict[str, float]]:
    if duration_seconds <= 0:
        return []

    start_guard_seconds = _thumbnail_guard_seconds(duration_seconds, fraction=0.04)
    end_guard_seconds = _thumbnail_guard_seconds(duration_seconds, fraction=0.04)
    usable_start = start_guard_seconds
    usable_end = max(duration_seconds - end_guard_seconds, usable_start + 1.0)
    step_count = max(MAX_THUMBNAIL_CANDIDATE_WINDOWS, 1)
    return [
        {
            "timestamp_seconds": usable_start
            + ((usable_end - usable_start) * ((index + 1) / (step_count + 1))),
            "activity_score": 0.45,
        }
        for index in range(step_count)
    ]


def _select_thumbnail_candidate_frames(
    candidate_frames: list[dict[str, float | str]],
    *,
    duration_seconds: float,
) -> list[dict[str, float | str]]:
    selected_frames: list[dict[str, float | str]] = []
    min_spacing_seconds = min(
        MIN_THUMBNAIL_SPACING_SECONDS,
        max(duration_seconds / max(MAX_THUMBNAIL_SUGGESTIONS + 1, 1), 1.5),
    )
    for frame in candidate_frames:
        timestamp_seconds = float(frame["timestamp_seconds"])
        if any(
            abs(float(existing["timestamp_seconds"]) - timestamp_seconds) < min_spacing_seconds
            for existing in selected_frames
        ):
            continue
        selected_frames.append(frame)
        if len(selected_frames) >= MAX_THUMBNAIL_SUGGESTIONS:
            break
    return selected_frames


def _thumbnail_guard_seconds(
    duration_seconds: float,
    *,
    fraction: float = 0.02,
) -> float:
    if duration_seconds <= 0:
        return 0.0
    return min(max(duration_seconds * fraction, 8.0), max(duration_seconds / 4, 1.0), 90.0)


def _analyze_video_frame(
    *,
    ffmpeg: str,
    source_path: str,
    timestamp_seconds: float,
) -> dict[str, float] | None:
    try:
        result = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{timestamp_seconds:.2f}",
                "-i",
                source_path,
                "-frames:v",
                "1",
                "-vf",
                (
                    f"scale={THUMBNAIL_ANALYSIS_WIDTH}:{THUMBNAIL_ANALYSIS_HEIGHT}:"
                    "force_original_aspect_ratio=decrease,"
                    f"pad={THUMBNAIL_ANALYSIS_WIDTH}:{THUMBNAIL_ANALYSIS_HEIGHT}:"
                    "(ow-iw)/2:(oh-ih)/2:black,format=rgb24"
                ),
                "-f",
                "rawvideo",
                "-",
            ],
            capture_output=True,
            check=False,
            timeout=FFMPEG_FRAME_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None

    expected_size = THUMBNAIL_ANALYSIS_WIDTH * THUMBNAIL_ANALYSIS_HEIGHT * 3
    if result.returncode != 0 or len(result.stdout) != expected_size:
        return None

    return _frame_metrics_from_rgb24(result.stdout)


def _frame_metrics_from_rgb24(rgb_bytes: bytes) -> dict[str, float]:
    if not rgb_bytes:
        return {
            "brightness_score": 0.0,
            "contrast_score": 0.0,
            "sharpness_score": 0.0,
            "dark_penalty": 0.0,
        }

    luminance_values: list[float] = []
    dark_pixels = 0
    index = 0
    while index + 2 < len(rgb_bytes):
        red = rgb_bytes[index]
        green = rgb_bytes[index + 1]
        blue = rgb_bytes[index + 2]
        luminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
        luminance_values.append(luminance)
        if luminance < 24:
            dark_pixels += 1
        index += 3

    if not luminance_values:
        return {
            "brightness_score": 0.0,
            "contrast_score": 0.0,
            "sharpness_score": 0.0,
            "dark_penalty": 0.0,
        }

    mean_luminance = sum(luminance_values) / len(luminance_values)
    variance = sum((value - mean_luminance) ** 2 for value in luminance_values) / len(
        luminance_values
    )
    contrast = math.sqrt(variance)

    horizontal_diff = 0.0
    vertical_diff = 0.0
    for row in range(THUMBNAIL_ANALYSIS_HEIGHT):
        row_offset = row * THUMBNAIL_ANALYSIS_WIDTH
        for column in range(1, THUMBNAIL_ANALYSIS_WIDTH):
            current_index = row_offset + column
            previous_index = current_index - 1
            horizontal_diff += abs(
                luminance_values[current_index] - luminance_values[previous_index]
            )
    for row in range(1, THUMBNAIL_ANALYSIS_HEIGHT):
        row_offset = row * THUMBNAIL_ANALYSIS_WIDTH
        previous_row_offset = (row - 1) * THUMBNAIL_ANALYSIS_WIDTH
        for column in range(THUMBNAIL_ANALYSIS_WIDTH):
            current_index = row_offset + column
            previous_index = previous_row_offset + column
            vertical_diff += abs(
                luminance_values[current_index] - luminance_values[previous_index]
            )

    brightness_mean = mean_luminance / 255
    dark_share = dark_pixels / len(luminance_values)
    brightness_score = _clamp(1 - (abs(brightness_mean - 0.56) / 0.56))
    contrast_score = _clamp(contrast / 90)
    sharpness_score = _clamp(
        ((horizontal_diff + vertical_diff) / max(len(luminance_values), 1)) / 48
    )
    dark_penalty = _clamp(max(dark_share - 0.45, 0.0) * 1.6)

    return {
        "brightness_score": round(brightness_score, 4),
        "contrast_score": round(contrast_score, 4),
        "sharpness_score": round(sharpness_score, 4),
        "dark_penalty": round(dark_penalty, 4),
    }


def _export_thumbnail_frame(
    *,
    ffmpeg: str,
    source_path: str,
    timestamp_seconds: float,
    output_path: Path,
) -> bool:
    try:
        result = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-ss",
                f"{timestamp_seconds:.2f}",
                "-i",
                source_path,
                "-frames:v",
                "1",
                "-vf",
                f"scale={THUMBNAIL_EXPORT_WIDTH}:-2:force_original_aspect_ratio=decrease",
                "-q:v",
                "2",
                str(output_path),
            ],
            capture_output=True,
            check=False,
            timeout=FFMPEG_FRAME_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False

    return result.returncode == 0 and output_path.exists()


def _read_bounded_media_sample(
    source_path: str,
    index: int,
    bucket_count: int,
    file_size_bytes: int,
) -> bytes:
    if file_size_bytes <= 0:
        return b""

    path = Path(source_path)
    if not path.exists() or not path.is_file():
        return b""

    max_offset = max(file_size_bytes - SAMPLE_BYTES_PER_BUCKET, 0)
    offset = int(max_offset * ((index + 0.5) / max(bucket_count, 1)))
    try:
        with path.open("rb") as file:
            file.seek(offset)
            return file.read(SAMPLE_BYTES_PER_BUCKET)
    except OSError:
        return b""


# Artifact payload boundary
def _bucket_payload(bucket: MediaIndexAudioBucket) -> dict[str, Any]:
    return {
        "index": bucket.index,
        "start_seconds": bucket.start_seconds,
        "end_seconds": bucket.end_seconds,
        "energy_score": bucket.energy_score,
        "onset_score": bucket.onset_score,
        "spectral_flux_score": bucket.spectral_flux_score,
        "silence_score": bucket.silence_score,
        "fingerprint": bucket.fingerprint,
    }


def _thumbnail_payload(suggestion: MediaThumbnailSuggestion) -> dict[str, Any]:
    return {
        "id": suggestion.id,
        "image_path": suggestion.image_path,
        "timestamp_seconds": suggestion.timestamp_seconds,
        "score": suggestion.score,
        "activity_score": suggestion.activity_score,
        "brightness_score": suggestion.brightness_score,
        "contrast_score": suggestion.contrast_score,
        "sharpness_score": suggestion.sharpness_score,
        "note": suggestion.note,
    }


def _mean_absolute_delta(sample: bytes) -> float:
    if len(sample) < 2:
        return 0.0
    return sum(abs(sample[index] - sample[index - 1]) for index in range(1, len(sample))) / (
        len(sample) - 1
    )


def _byte_stddev(sample: bytes) -> float:
    if not sample:
        return 0.0
    mean_value = sum(sample) / len(sample)
    variance = sum((value - mean_value) ** 2 for value in sample) / len(sample)
    return math.sqrt(variance)


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return round(sum(values) / len(values), 4)


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, value))


def _first_stream(streams: list[Any], codec_type: str) -> dict[str, Any] | None:
    for stream in streams:
        if isinstance(stream, dict) and stream.get("codec_type") == codec_type:
            return stream
    return None


def _positive_int(value: Any) -> int | None:
    try:
        parsed_value = int(value)
    except (TypeError, ValueError):
        return None
    return parsed_value if parsed_value > 0 else None


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    parsed_value = str(value).strip()
    return parsed_value or None
