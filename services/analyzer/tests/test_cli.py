from __future__ import annotations

import os
import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from vaexcore_pulse_analyzer.contracts import (
    AnalysisCoverage,
    AnalysisCoverageBand,
    ExampleReferenceKind,
    MediaIndexSummary,
    Settings,
)
from vaexcore_pulse_analyzer.mock_data import (
    build_mock_candidates,
    build_mock_feature_windows,
    build_mock_speech_regions,
)
from vaexcore_pulse_analyzer.paths import (
    DATABASE_FILENAME,
    resolve_default_database_path,
    resolve_thumbnail_output_root,
    THUMBNAIL_OUTPUT_DIR_NAME,
)
from vaexcore_pulse_analyzer.pipeline.scoring import apply_review_post_filter
from vaexcore_pulse_analyzer.pipeline.orchestrator import analyze_media
from vaexcore_pulse_analyzer.pipeline.indexing import (
    build_decoded_audio_fingerprint_artifact_from_pcm,
)
from vaexcore_pulse_analyzer.pipeline.ingest import (
    INGEST_NOTE_SEEDED_TRANSCRIPT,
    INGEST_NOTE_TRANSCRIPT_COMPLETED,
    INGEST_NOTE_TRANSCRIPT_PROVIDER_UNAVAILABLE,
)
from vaexcore_pulse_analyzer.service import (
    analyze_request,
    apply_review_update,
    create_profile_request,
    create_media_edit_pair_request,
    create_media_library_asset_request,
    list_profile_examples_request,
    run_media_alignment_job_inline,
    list_session_summaries_request,
    load_session_request,
    run_media_index_job_inline,
)
from vaexcore_pulse_analyzer.storage.session_store import SessionStore


class AnalyzerScaffoldTests(unittest.TestCase):
    def test_default_database_path_uses_application_support(self) -> None:
        with tempfile.TemporaryDirectory() as temp_home:
            with tempfile.TemporaryDirectory() as temp_cwd:
                previous_cwd = Path.cwd()
                try:
                    os.chdir(temp_cwd)
                    with patch.dict(
                        os.environ,
                        {"HOME": temp_home, "VAEXCORE_PULSE_ANALYZER_DATABASE_PATH": ""},
                        clear=False,
                    ):
                        expected_path = (
                            Path(temp_home)
                            / "Library"
                            / "Application Support"
                            / "vaexcore pulse"
                            / DATABASE_FILENAME
                        )
                        self.assertEqual(resolve_default_database_path(), str(expected_path))
                finally:
                    os.chdir(previous_cwd)

    def test_default_database_path_preserves_legacy_local_database(self) -> None:
        with tempfile.TemporaryDirectory() as temp_home:
            with tempfile.TemporaryDirectory() as temp_cwd:
                previous_cwd = Path.cwd()
                try:
                    os.chdir(temp_cwd)
                    legacy_path = Path(".local") / DATABASE_FILENAME
                    legacy_path.parent.mkdir(parents=True)
                    legacy_path.write_text("legacy", encoding="utf-8")
                    with patch.dict(
                        os.environ,
                        {"HOME": temp_home, "VAEXCORE_PULSE_ANALYZER_DATABASE_PATH": ""},
                        clear=False,
                    ):
                        self.assertEqual(
                            resolve_default_database_path(),
                            str(legacy_path),
                        )
                finally:
                    os.chdir(previous_cwd)

    def test_default_database_path_honors_explicit_env_path(self) -> None:
        with patch.dict(
            os.environ,
            {"VAEXCORE_PULSE_ANALYZER_DATABASE_PATH": "/tmp/custom-vcp.sqlite3"},
            clear=False,
        ):
            self.assertEqual(
                resolve_default_database_path(),
                "/tmp/custom-vcp.sqlite3",
            )

    def test_thumbnail_output_path_uses_application_support(self) -> None:
        with tempfile.TemporaryDirectory() as temp_home:
            with tempfile.TemporaryDirectory() as temp_cwd:
                previous_cwd = Path.cwd()
                try:
                    os.chdir(temp_cwd)
                    with patch.dict(os.environ, {"HOME": temp_home}, clear=False):
                        expected_path = (
                            Path(temp_home)
                            / "Library"
                            / "Application Support"
                            / "vaexcore pulse"
                            / THUMBNAIL_OUTPUT_DIR_NAME
                        )
                        self.assertEqual(resolve_thumbnail_output_root(), expected_path)
                finally:
                    os.chdir(previous_cwd)

    def test_thumbnail_output_path_preserves_legacy_local_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp_home:
            with tempfile.TemporaryDirectory() as temp_cwd:
                previous_cwd = Path.cwd()
                try:
                    os.chdir(temp_cwd)
                    legacy_path = Path(".local") / THUMBNAIL_OUTPUT_DIR_NAME
                    legacy_path.mkdir(parents=True)
                    with patch.dict(os.environ, {"HOME": temp_home}, clear=False):
                        self.assertEqual(resolve_thumbnail_output_root(), legacy_path)
                finally:
                    os.chdir(previous_cwd)

    def test_mock_pipeline_generates_candidates(self) -> None:
        session = analyze_media(None, settings=Settings(use_mock_data=True))
        self.assertGreaterEqual(len(session.candidates), 4)
        self.assertTrue(any(candidate.confidence_band.value == "HIGH" for candidate in session.candidates))

    def test_session_store_persists_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = str(Path(temp_dir) / "vaexcore-pulse.sqlite3")
            store = SessionStore(database_path)
            store.initialize()
            session = analyze_media(None, settings=Settings(use_mock_data=True))
            store.save_session(session)
            self.assertEqual(store.count_candidates(session.id), len(session.candidates))

    def test_real_file_request_generates_candidates_and_persists_session(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            media_path = Path(temp_dir) / "backlog-pass-01.mp4"
            media_path.write_bytes(b"not-a-real-video-but-a-real-local-path")
            database_path = str(Path(temp_dir) / "vaexcore-pulse.sqlite3")

            session = analyze_request(
                str(media_path),
                profile_id="generic",
                session_title="Backlog pass 01",
                persist=True,
                database_path=database_path,
            )

            self.assertEqual(session.title, "Backlog pass 01")
            self.assertEqual(
                Path(session.media_source.path).resolve(),
                media_path.resolve(),
            )
            self.assertGreaterEqual(len(session.candidates), 3)
            self.assertTrue(
                any(
                    "heuristics" in note.lower() or "ffprobe" in note.lower()
                    for note in session.media_source.ingest_notes
                )
            )
            self.assertTrue(
                all(
                    candidate.transcript_snippet.startswith("Seeded local anchor near")
                    for candidate in session.candidates
                )
            )
            self.assertTrue(
                all("near" in candidate.editable_label.lower() for candidate in session.candidates)
            )
            self.assertEqual(session.analysis_coverage.band.value, "PARTIAL")
            self.assertIn(
                "SEEDED_TRANSCRIPT",
                [flag.value for flag in session.analysis_coverage.flags],
            )
            self.assertTrue(any(candidate.review_tags for candidate in session.candidates))
            self.assertEqual(
                len(session.candidates),
                len({candidate.id for candidate in session.candidates}),
            )
            store = SessionStore(database_path)
            self.assertEqual(store.count_candidates(session.id), len(session.candidates))

    def test_real_file_request_uses_local_sidecar_transcript_when_present(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            media_path = Path(temp_dir) / "backlog-pass-02.mp4"
            media_path.write_bytes(b"not-a-real-video-but-a-real-local-path")
            media_path.with_suffix(".srt").write_text(
                "\n".join(
                    [
                        "1",
                        "00:00:04,000 --> 00:00:08,000",
                        "Clutch reset before the final push.",
                        "",
                        "2",
                        "00:00:18,000 --> 00:00:22,000",
                        "Strong payoff after the setup.",
                    ]
                ),
                encoding="utf-8",
            )

            session = analyze_request(
                str(media_path),
                profile_id="generic",
                session_title="Backlog pass 02",
                persist=False,
                database_path=str(Path(temp_dir) / "vaexcore-pulse.sqlite3"),
            )

            transcript_text = " ".join(chunk.text for chunk in session.transcript)
            self.assertIn("Clutch reset", transcript_text)
            self.assertIn("Strong payoff", transcript_text)
            self.assertIn(INGEST_NOTE_TRANSCRIPT_COMPLETED, session.media_source.ingest_notes)
            self.assertNotIn(INGEST_NOTE_TRANSCRIPT_PROVIDER_UNAVAILABLE, session.media_source.ingest_notes)
            self.assertNotIn(INGEST_NOTE_SEEDED_TRANSCRIPT, session.media_source.ingest_notes)
            self.assertNotIn(
                "SEEDED_TRANSCRIPT",
                [flag.value for flag in session.analysis_coverage.flags],
            )

    @unittest.skipUnless(hasattr(os, "mkfifo"), "mkfifo unavailable on this platform")
    def test_real_file_request_rejects_non_regular_media_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            media_path = Path(temp_dir) / "blocked-input.mp4"
            os.mkfifo(media_path)

            with self.assertRaisesRegex(ValueError, "regular file"):
                analyze_request(
                    str(media_path),
                    profile_id="generic",
                    session_title="Blocked input",
                    persist=False,
                    database_path=str(Path(temp_dir) / "vaexcore-pulse.sqlite3"),
                )

    def test_media_library_assets_and_vod_edit_pair_persist(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = str(Path(temp_dir) / "vaexcore-pulse.sqlite3")
            clip_path = Path(temp_dir) / "global-clip.mp4"
            vod_path = Path(temp_dir) / "session-vod.mp4"
            edit_path = Path(temp_dir) / "session-edit.mp4"
            clip_path.write_bytes(b"clip-fixture")
            vod_path.write_bytes(b"vod-fixture" * 2048)
            edit_path.write_bytes(b"edit-fixture" * 512)

            clip_asset = create_media_library_asset_request(
                asset_type="CLIP",
                scope="GLOBAL",
                source_type="LOCAL_FILE_PATH",
                source_value=str(clip_path),
                title="Global clip",
                database_path=database_path,
            )
            vod_asset = create_media_library_asset_request(
                asset_type="VOD",
                scope="GLOBAL",
                source_type="LOCAL_FILE_PATH",
                source_value=str(vod_path),
                title="Source VOD",
                database_path=database_path,
            )
            edit_asset = create_media_library_asset_request(
                asset_type="EDIT",
                scope="GLOBAL",
                source_type="LOCAL_FILE_PATH",
                source_value=str(edit_path),
                title="Edited cut",
                database_path=database_path,
            )
            pair = create_media_edit_pair_request(
                vod_asset.id,
                edit_asset.id,
                title="VOD + edit",
                database_path=database_path,
            )
            self.assertEqual(pair.status.value, "INCOMPLETE")

            store = SessionStore(database_path)
            with self.assertRaisesRegex(
                ValueError,
                "Cannot start media alignment yet",
            ):
                store.create_media_alignment_job(pair_id=pair.id)

            vod_index_job = store.create_media_index_job(vod_asset.id)
            edit_index_job = store.create_media_index_job(edit_asset.id)
            vod_index_result = run_media_index_job_inline(
                vod_index_job.id,
                database_path=database_path,
            )
            edit_index_result = run_media_index_job_inline(
                edit_index_job.id,
                database_path=database_path,
            )
            alignment_job = store.create_media_alignment_job(pair_id=pair.id)
            alignment_result = run_media_alignment_job_inline(
                alignment_job.id,
                database_path=database_path,
            )
            assets = store.list_media_library_assets()
            jobs = store.list_media_index_jobs()
            artifacts = store.list_media_index_artifacts()
            alignment_jobs = store.list_media_alignment_jobs()
            alignment_matches = store.list_media_alignment_matches(pair.id)
            pairs = store.list_media_edit_pairs()

            self.assertEqual(len(assets), 3)
            self.assertTrue(any(asset.id == clip_asset.id for asset in assets))
            stored_vod_asset = next(asset for asset in assets if asset.id == vod_asset.id)
            stored_edit_asset = next(asset for asset in assets if asset.id == edit_asset.id)
            self.assertIsNotNone(stored_vod_asset.index_summary)
            self.assertIsNotNone(stored_edit_asset.index_summary)
            self.assertEqual(vod_index_result.status.value, "SUCCEEDED")
            self.assertEqual(edit_index_result.status.value, "SUCCEEDED")
            self.assertEqual(len(jobs), 2)
            self.assertGreaterEqual(len(artifacts), 2)
            self.assertEqual(alignment_result.status.value, "SUCCEEDED")
            self.assertEqual(len(alignment_jobs), 1)
            self.assertGreaterEqual(len(alignment_matches), 1)
            self.assertEqual(alignment_matches[0].pair_id, pair.id)
            self.assertEqual(alignment_matches[0].kind.value, "EDIT_TO_VOD_KEEP")
            self.assertTrue(
                all(
                    artifact.kind.value == "AUDIO_FINGERPRINT"
                    and artifact.bucket_count > 0
                    and artifact.payload_byte_size > 0
                    for artifact in artifacts
                )
            )
            self.assertIsNotNone(stored_vod_asset.index_artifact_summary)
            self.assertGreater(
                stored_vod_asset.index_artifact_summary.audio_fingerprint_bucket_count,
                0,
            )
            thumbnail_artifacts = [
                artifact
                for artifact in artifacts
                if artifact.kind.value == "THUMBNAIL_SUGGESTIONS"
            ]
            if thumbnail_artifacts:
                self.assertIsNotNone(stored_vod_asset.thumbnail_suggestion_set)
                assert stored_vod_asset.thumbnail_suggestion_set is not None
                self.assertGreaterEqual(
                    len(stored_vod_asset.thumbnail_suggestion_set.suggestions),
                    1,
                )
                self.assertTrue(
                    all(
                        Path(suggestion.image_path).exists()
                        for suggestion in stored_vod_asset.thumbnail_suggestion_set.suggestions
                    )
                )
            self.assertEqual(pairs[0].id, pair.id)
            self.assertEqual(pairs[0].vod_asset_id, vod_asset.id)
            self.assertEqual(pairs[0].edit_asset_id, edit_asset.id)
            self.assertIn("runtime-based edit coverage", pairs[0].status_detail)
            self.assertEqual(len(pairs[0].alignment_segments), 2)
            self.assertEqual(pairs[0].alignment_segments[0].kind.value, "PROVISIONAL_KEEP")
            self.assertEqual(
                pairs[0].alignment_segments[1].kind.value,
                "PROVISIONAL_REMOVED_POOL",
            )

    def test_profile_scoped_edit_indexes_into_longform_reference(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = str(Path(temp_dir) / "vaexcore-pulse.sqlite3")
            edit_path = Path(temp_dir) / "profile-edit.mp4"
            edit_path.write_bytes(b"profile-edit-fixture" * 512)

            profile = create_profile_request(
                "Editorial style",
                database_path=database_path,
            )
            edit_asset = create_media_library_asset_request(
                asset_type="EDIT",
                scope="PROFILE",
                profile_id=profile.id,
                source_type="LOCAL_FILE_PATH",
                source_value=str(edit_path),
                title="Profile edit",
                database_path=database_path,
            )

            store = SessionStore(database_path)
            index_job = store.create_media_index_job(edit_asset.id)
            run_media_index_job_inline(
                index_job.id,
                database_path=database_path,
            )

            listed_examples = list_profile_examples_request(
                profile.id,
                database_path=database_path,
            )
            self.assertEqual(len(listed_examples), 1)
            self.assertEqual(listed_examples[0].id, edit_asset.id)
            self.assertEqual(
                listed_examples[0].reference_kind,
                ExampleReferenceKind.PROFILE_EDIT,
            )
            self.assertIsNotNone(listed_examples[0].feature_summary)
            self.assertIn(
                "longform reference",
                listed_examples[0].status_detail or "",
            )

            loaded_profile = store.load_profile(profile.id)
            self.assertEqual(len(loaded_profile.example_clips), 1)
            self.assertEqual(
                loaded_profile.example_clips[0].reference_kind,
                ExampleReferenceKind.PROFILE_EDIT,
            )
            self.assertEqual(loaded_profile.example_clips[0].id, edit_asset.id)

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg unavailable on this machine")
    def test_real_video_index_can_persist_thumbnail_suggestions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = str(Path(temp_dir) / "vaexcore-pulse.sqlite3")
            media_path = Path(temp_dir) / "thumbnail-source.mp4"
            result = subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    "testsrc=size=640x360:rate=30:duration=6",
                    "-c:v",
                    "mpeg4",
                    str(media_path),
                ],
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, msg=result.stderr.decode("utf-8", errors="ignore"))

            asset = create_media_library_asset_request(
                asset_type="VOD",
                scope="GLOBAL",
                source_type="LOCAL_FILE_PATH",
                source_value=str(media_path),
                title="Thumbnail source",
                database_path=database_path,
            )

            store = SessionStore(database_path)
            job = store.create_media_index_job(asset.id)
            completed_job = run_media_index_job_inline(
                job.id,
                database_path=database_path,
            )

            self.assertEqual(completed_job.status.value, "SUCCEEDED")
            stored_asset = next(
                candidate_asset
                for candidate_asset in store.list_media_library_assets()
                if candidate_asset.id == asset.id
            )
            self.assertIsNotNone(stored_asset.thumbnail_suggestion_set)
            assert stored_asset.thumbnail_suggestion_set is not None
            self.assertGreaterEqual(
                len(stored_asset.thumbnail_suggestion_set.suggestions),
                1,
            )
            self.assertTrue(
                all(
                    Path(suggestion.image_path).exists()
                    for suggestion in stored_asset.thumbnail_suggestion_set.suggestions
                )
            )
            selected_suggestion_ids = [
                suggestion.id
                for suggestion in stored_asset.thumbnail_suggestion_set.suggestions[:2]
            ]
            updated_asset = store.replace_media_thumbnail_outputs(
                asset.id,
                selected_suggestion_ids=selected_suggestion_ids,
            )
            self.assertIsNotNone(updated_asset.thumbnail_output_set)
            assert updated_asset.thumbnail_output_set is not None
            self.assertEqual(
                len(updated_asset.thumbnail_output_set.outputs),
                len(selected_suggestion_ids),
            )
            self.assertEqual(
                [output.source_suggestion_id for output in updated_asset.thumbnail_output_set.outputs],
                selected_suggestion_ids,
            )

    def test_decoded_audio_fingerprint_can_be_built_from_pcm(self) -> None:
        pcm_samples = []
        for sample_index in range(60_000):
            amplitude = 8000 if sample_index < 30_000 else 16000
            value = amplitude if sample_index % 24 < 12 else -amplitude
            pcm_samples.append(value)
        pcm_bytes = b"".join(struct.pack("<h", sample) for sample in pcm_samples)

        artifact = build_decoded_audio_fingerprint_artifact_from_pcm(
            asset_id="asset_audio_fixture",
            job_id="index_job_audio_fixture",
            index_summary=MediaIndexSummary(
                method_version="MEDIA_INDEX_V1",
                generated_at="2026-04-22T00:00:00.000Z",
                source_path="/tmp/audio-fixture.wav",
                file_name="audio-fixture.wav",
                file_size_bytes=len(pcm_bytes),
                kind="AUDIO",
                format="wav",
                duration_seconds=60.0,
                has_video=False,
                has_audio=True,
                stream_count=1,
            ),
            pcm_bytes=pcm_bytes,
        )

        self.assertIsNotNone(artifact)
        assert artifact is not None
        self.assertEqual(artifact.method.value, "DECODED_AUDIO_FINGERPRINT_V1")
        self.assertEqual(artifact.bucket_count, 2)
        self.assertGreater(artifact.energy_peak, 0)
        self.assertTrue(all(bucket.fingerprint for bucket in artifact.buckets))

    def test_partial_coverage_demotes_weaker_candidates_without_hiding_them(self) -> None:
        candidates = build_mock_candidates()
        weakest_candidate = candidates[-1]
        original_score = weakest_candidate.score_estimate

        reviewed_candidates = apply_review_post_filter(
            candidates,
            build_mock_feature_windows(),
            build_mock_speech_regions(),
            AnalysisCoverage(
                band=AnalysisCoverageBand.PARTIAL,
                note="Partial coverage",
                flags=[],
            ),
        )

        reviewed_weakest = next(
            candidate for candidate in reviewed_candidates if candidate.id == weakest_candidate.id
        )
        self.assertEqual(len(reviewed_candidates), len(candidates))
        self.assertLess(reviewed_weakest.score_estimate, original_score)
        self.assertIn(
            "LOW_INFORMATION_RISK",
            [tag.value for tag in reviewed_weakest.review_tags],
        )

    def test_same_basename_sources_persist_as_distinct_sessions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = str(Path(temp_dir) / "vaexcore-pulse.sqlite3")
            media_dir_a = Path(temp_dir) / "creator-a"
            media_dir_b = Path(temp_dir) / "creator-b"
            media_dir_a.mkdir()
            media_dir_b.mkdir()

            media_path_a = media_dir_a / "raid-night.mp4"
            media_path_b = media_dir_b / "raid-night.mp4"
            media_path_a.write_bytes(b"creator-a-fixture")
            media_path_b.write_bytes(b"creator-b-fixture")

            session_a = analyze_request(
                str(media_path_a),
                session_title="Creator A",
                persist=True,
                database_path=database_path,
            )
            session_b = analyze_request(
                str(media_path_b),
                session_title="Creator B",
                persist=True,
                database_path=database_path,
            )

            self.assertNotEqual(session_a.media_source.id, session_b.media_source.id)
            self.assertNotEqual(session_a.id, session_b.id)
            self.assertTrue(
                all(candidate.id.startswith(session_a.media_source.id) for candidate in session_a.candidates)
            )
            self.assertTrue(
                all(candidate.id.startswith(session_b.media_source.id) for candidate in session_b.candidates)
            )

            store = SessionStore(database_path)
            self.assertEqual(store.count_candidates(session_a.id), len(session_a.candidates))
            self.assertEqual(store.count_candidates(session_b.id), len(session_b.candidates))

    def test_review_updates_persist_and_reload_from_sqlite(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            media_path = Path(temp_dir) / "review-pass-01.mp4"
            media_path.write_bytes(b"review-persistence-fixture")
            database_path = str(Path(temp_dir) / "vaexcore-pulse.sqlite3")

            session = analyze_request(
                str(media_path),
                session_title="Review Persistence",
                persist=True,
                database_path=database_path,
            )
            candidate = session.candidates[0]
            adjusted_start = candidate.suggested_segment.start_seconds + 1.5
            adjusted_end = candidate.suggested_segment.end_seconds + 1.5

            updated_session = apply_review_update(
                session.id,
                candidate.id,
                action="ACCEPT",
                label="Keep opener payoff",
                adjusted_segment={
                    "start_seconds": adjusted_start,
                    "end_seconds": adjusted_end,
                },
                database_path=database_path,
            )

            self.assertEqual(updated_session.status, "REVIEWING")
            self.assertEqual(updated_session.review_decisions[0].action.value, "ACCEPT")
            self.assertEqual(updated_session.review_decisions[0].label, "Keep opener payoff")
            self.assertAlmostEqual(
                updated_session.review_decisions[0].adjusted_segment.start_seconds,
                adjusted_start,
            )
            self.assertEqual(updated_session.candidates[0].editable_label, "Keep opener payoff")
            self.assertAlmostEqual(
                updated_session.candidates[0].suggested_segment.start_seconds,
                adjusted_start,
            )

            reloaded_session = load_session_request(
                session.id,
                database_path=database_path,
            )
            self.assertEqual(reloaded_session.review_decisions[0].action.value, "ACCEPT")
            self.assertEqual(reloaded_session.candidates[0].editable_label, "Keep opener payoff")
            self.assertAlmostEqual(
                reloaded_session.candidates[0].suggested_segment.end_seconds,
                adjusted_end,
            )

    def test_session_summaries_list_real_persisted_sessions(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = str(Path(temp_dir) / "vaexcore-pulse.sqlite3")
            media_path_a = Path(temp_dir) / "backlog-a.mp4"
            media_path_b = Path(temp_dir) / "backlog-b.mp4"
            media_path_a.write_bytes(b"backlog-a-fixture")
            media_path_b.write_bytes(b"backlog-b-fixture")

            session_a = analyze_request(
                str(media_path_a),
                session_title="Backlog A",
                persist=True,
                database_path=database_path,
            )
            session_b = analyze_request(
                str(media_path_b),
                session_title="Backlog B",
                persist=True,
                database_path=database_path,
            )

            apply_review_update(
                session_b.id,
                session_b.candidates[0].id,
                action="ACCEPT",
                timestamp="2099-03-25T15:30:00+00:00",
                database_path=database_path,
            )
            apply_review_update(
                session_b.id,
                session_b.candidates[1].id,
                action="REJECT",
                timestamp="2099-03-25T15:31:00+00:00",
                database_path=database_path,
            )

            summaries = list_session_summaries_request(database_path=database_path)

            self.assertEqual(len(summaries), 2)
            self.assertEqual(summaries[0]["session_id"], session_b.id)
            self.assertEqual(summaries[0]["session_title"], "Backlog B")
            self.assertEqual(summaries[0]["source_name"], media_path_b.name)
            self.assertIn("analysis_coverage", summaries[0])
            self.assertEqual(summaries[0]["analysis_coverage"]["band"], "PARTIAL")
            self.assertEqual(summaries[0]["candidate_count"], len(session_b.candidates))
            self.assertEqual(summaries[0]["accepted_count"], 1)
            self.assertEqual(summaries[0]["rejected_count"], 1)
            self.assertEqual(
                summaries[0]["pending_count"],
                len(session_b.candidates) - 2,
            )
            self.assertEqual(summaries[1]["session_id"], session_a.id)
            self.assertEqual(summaries[1]["accepted_count"], 0)
            self.assertEqual(summaries[1]["rejected_count"], 0)
            self.assertEqual(
                summaries[1]["pending_count"],
                len(session_a.candidates),
            )


if __name__ == "__main__":
    unittest.main()
