from __future__ import annotations

import json
import os
from dataclasses import asdict, is_dataclass
from enum import Enum
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import unquote, urlparse

from .contracts import Settings
from .pipeline.orchestrator import analyze_media
from .service import (
    DEFAULT_DATABASE_PATH,
    add_profile_example_request,
    analyze_request,
    apply_candidate_edit,
    apply_review_update,
    cancel_media_alignment_job_request,
    create_media_edit_pair_request,
    create_media_alignment_job_request,
    create_media_library_asset_request,
    create_profile_request,
    cancel_media_index_job_request,
    create_media_index_job_request,
    replace_media_thumbnail_outputs_request,
    list_media_edit_pairs_request,
    list_media_alignment_jobs_request,
    list_media_alignment_matches_request,
    list_media_index_artifacts_request,
    list_media_index_jobs_request,
    list_media_library_assets_request,
    list_profile_examples_request,
    list_profiles_request,
    list_session_summaries_request,
    load_session_request,
)


# API payload contract
def _convert(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if is_dataclass(value):
        return _convert(asdict(value))
    if isinstance(value, dict):
        converted: dict[str, Any] = {}
        for key, inner in value.items():
            if key == "use_mock_data" or inner is None:
                continue
            converted[_camel_case(key)] = _convert(inner)
        return converted
    if isinstance(value, list):
        return [_convert(item) for item in value]
    return value


def _camel_case(value: str) -> str:
    parts = value.split("_")
    return parts[0] + "".join(part.capitalize() for part in parts[1:])


# Demo-mode boundary
def _demo_mode_enabled() -> bool:
    value = os.getenv("VAEXCORE_PULSE_ENABLE_DEMO_MODE", "").strip().lower()
    return value in {"1", "true", "yes", "on"}


# Analyzer HTTP boundary
class AnalyzerRequestHandler(BaseHTTPRequestHandler):
    # Read route boundary
    def do_GET(self) -> None:  # noqa: N802
        request_path = urlparse(self.path).path

        if request_path == "/health":
            self._send_json(
                200,
                {
                    "service": "analyzer",
                    "status": "ok",
                    "mode": "heuristic-local",
                },
            )
            return

        if request_path == "/session/mock" and _demo_mode_enabled():
            session = analyze_media(None, Settings(use_mock_data=True))
            self._send_json(200, _convert(session))
            return

        if request_path == "/sessions":
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            summaries = list_session_summaries_request(
                database_path=database_path,
            )
            self._send_json(
                200,
                {
                    "status": "listed",
                    "sessions": _convert(summaries),
                },
            )
            return

        if request_path == "/profiles":
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            profiles = list_profiles_request(database_path=database_path)
            self._send_json(
                200,
                {
                    "status": "listed",
                    "profiles": _convert(profiles),
                },
            )
            return

        if request_path == "/library/assets":
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            assets = list_media_library_assets_request(database_path=database_path)
            self._send_json(
                200,
                {
                    "status": "listed",
                    "assets": _convert(assets),
                },
            )
            return

        if request_path == "/library/pairs":
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            pairs = list_media_edit_pairs_request(database_path=database_path)
            self._send_json(
                200,
                {
                    "status": "listed",
                    "pairs": _convert(pairs),
                },
            )
            return

        if request_path == "/library/index-jobs":
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            jobs = list_media_index_jobs_request(database_path=database_path)
            self._send_json(
                200,
                {
                    "status": "listed",
                    "jobs": _convert(jobs),
                },
            )
            return

        if request_path == "/library/index-artifacts":
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            artifacts = list_media_index_artifacts_request(database_path=database_path)
            self._send_json(
                200,
                {
                    "status": "listed",
                    "artifacts": _convert(artifacts),
                },
            )
            return

        if request_path == "/library/alignment-jobs":
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            jobs = list_media_alignment_jobs_request(database_path=database_path)
            self._send_json(
                200,
                {
                    "status": "listed",
                    "jobs": _convert(jobs),
                },
            )
            return

        if request_path == "/library/alignment-matches":
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            matches = list_media_alignment_matches_request(database_path=database_path)
            self._send_json(
                200,
                {
                    "status": "listed",
                    "matches": _convert(matches),
                },
            )
            return

        if request_path.startswith("/library/pairs/") and request_path.endswith("/alignment-matches"):
            pair_id = self._pair_id_from_alignment_matches_path(request_path)
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            matches = list_media_alignment_matches_request(
                pair_id=pair_id,
                database_path=database_path,
            )
            self._send_json(
                200,
                {
                    "status": "listed",
                    "matches": _convert(matches),
                },
            )
            return

        if request_path.startswith("/library/assets/") and request_path.endswith("/index-artifacts"):
            asset_id = self._asset_id_from_index_artifacts_path(request_path)
            if not asset_id:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "assetId is required",
                    },
                )
                return

            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            artifacts = list_media_index_artifacts_request(
                asset_id=asset_id,
                database_path=database_path,
            )
            self._send_json(
                200,
                {
                    "status": "listed",
                    "artifacts": _convert(artifacts),
                },
            )
            return

        if request_path.startswith("/profiles/") and request_path.endswith("/examples"):
            profile_id = self._profile_id_from_examples_path(request_path)
            if not profile_id:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "profileId is required",
                    },
                )
                return

            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            try:
                examples = list_profile_examples_request(
                    profile_id,
                    database_path=database_path,
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "listed",
                    "examples": _convert(examples),
                },
            )
            return

        if request_path.startswith("/session/"):
            session_id = unquote(request_path.removeprefix("/session/")).strip()
            database_path = str(
                os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH") or DEFAULT_DATABASE_PATH
            )
            try:
                session = load_session_request(
                    session_id,
                    database_path=database_path,
                )
            except KeyError:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": f"Project session not found: {session_id}",
                    },
                )
                return
            except FileNotFoundError as error:
                self._send_json(
                    400,
                    {
                        "error": "session_unavailable",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "loaded",
                    "session": _convert(session),
                },
            )
            return

        self._send_json(404, {"error": "not_found"})

    # Mutation route boundary
    def do_POST(self) -> None:  # noqa: N802
        request_path = urlparse(self.path).path

        if request_path == "/analyze/mock" and _demo_mode_enabled():
            _ = self._read_json_body()
            session = analyze_media(None, Settings(use_mock_data=True))
            self._send_json(
                200,
                {
                    "status": "completed",
                    "session": _convert(session),
                },
            )
            return

        if request_path == "/analyze":
            payload = self._read_json_body()
            source_path = str(payload.get("sourcePath", "")).strip()
            if not source_path:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "sourcePath is required",
                    },
                )
                return

            profile_id = str(payload.get("profileId", "generic")).strip() or "generic"
            session_title = payload.get("sessionTitle")
            session_title = str(session_title).strip() if session_title else None
            transcript_path = payload.get("transcriptPath")
            transcript_path = str(transcript_path).strip() if transcript_path else None
            persist = bool(payload.get("persist", True))
            database_path = self._database_path_from_payload(payload)

            try:
                session = analyze_request(
                    source_path,
                    profile_id=profile_id,
                    session_title=session_title,
                    transcript_path=transcript_path,
                    persist=persist,
                    database_path=database_path,
                    settings=Settings(),
                )
            except (FileNotFoundError, ValueError) as error:
                self._send_json(
                    400,
                    {
                        "error": "analysis_failed",
                        "message": str(error),
                    },
                )
                return
            except Exception as error:  # pragma: no cover - defensive server guard
                self._send_json(
                    500,
                    {
                        "error": "analysis_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "completed",
                    "session": _convert(session),
                },
            )
            return

        if request_path == "/profiles":
            payload = self._read_json_body()
            name = str(payload.get("name", "")).strip()
            description = payload.get("description")
            description = str(description).strip() if description is not None else None
            state = str(payload.get("state", "ACTIVE")).strip() or "ACTIVE"
            if not name:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "name is required",
                    },
                )
                return

            try:
                profile = create_profile_request(
                    name,
                    description=description,
                    state=state,
                    database_path=self._database_path_from_payload(payload),
                )
            except ValueError as error:
                self._send_json(
                    400,
                    {
                        "error": "profile_create_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "created",
                    "profile": _convert(profile),
                },
            )
            return

        if request_path.startswith("/profiles/") and request_path.endswith("/examples"):
            profile_id = self._profile_id_from_examples_path(request_path)
            if not profile_id:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "profileId is required",
                    },
                )
                return

            payload = self._read_json_body()
            source_type = str(payload.get("sourceType", "")).strip()
            source_value = str(payload.get("sourceValue", "")).strip()
            title = payload.get("title")
            title = str(title).strip() if title is not None else None
            note = payload.get("note")
            note = str(note).strip() if note is not None else None
            if not source_type or not source_value:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "sourceType and sourceValue are required",
                    },
                )
                return

            try:
                example = add_profile_example_request(
                    profile_id,
                    source_type=source_type,
                    source_value=source_value,
                    title=title,
                    note=note,
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except ValueError as error:
                self._send_json(
                    400,
                    {
                        "error": "example_create_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "created",
                    "example": _convert(example),
                },
            )
            return

        if request_path == "/library/assets":
            payload = self._read_json_body()
            try:
                asset = create_media_library_asset_request(
                    asset_type=str(payload.get("assetType", "")).strip(),
                    scope=str(payload.get("scope", "")).strip(),
                    profile_id=(
                        str(payload.get("profileId", "")).strip()
                        if payload.get("profileId") is not None
                        else None
                    ),
                    source_type=str(payload.get("sourceType", "")).strip(),
                    source_value=str(payload.get("sourceValue", "")).strip(),
                    title=(
                        str(payload.get("title", "")).strip()
                        if payload.get("title") is not None
                        else None
                    ),
                    note=(
                        str(payload.get("note", "")).strip()
                        if payload.get("note") is not None
                        else None
                    ),
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except ValueError as error:
                self._send_json(
                    400,
                    {
                        "error": "asset_create_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "created",
                    "asset": _convert(asset),
                },
            )
            return

        if request_path.startswith("/library/assets/") and request_path.endswith("/thumbnail-outputs"):
            asset_id = self._asset_id_from_thumbnail_outputs_path(request_path)
            if not asset_id:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "assetId is required",
                    },
                )
                return

            payload = self._read_json_body()
            selected_suggestion_ids = payload.get("selectedSuggestionIds")
            if selected_suggestion_ids is None:
                selected_suggestion_ids = []
            if not isinstance(selected_suggestion_ids, list):
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "selectedSuggestionIds must be an array",
                    },
                )
                return

            try:
                asset = replace_media_thumbnail_outputs_request(
                    asset_id,
                    selected_suggestion_ids=[
                        str(suggestion_id).strip()
                        for suggestion_id in selected_suggestion_ids
                    ],
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except ValueError as error:
                self._send_json(
                    400,
                    {
                        "error": "thumbnail_output_update_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "updated",
                    "asset": _convert(asset),
                },
            )
            return

        if request_path == "/library/pairs":
            payload = self._read_json_body()
            try:
                pair = create_media_edit_pair_request(
                    str(payload.get("vodAssetId", "")).strip(),
                    str(payload.get("editAssetId", "")).strip(),
                    profile_id=(
                        str(payload.get("profileId", "")).strip()
                        if payload.get("profileId") is not None
                        else None
                    ),
                    title=(
                        str(payload.get("title", "")).strip()
                        if payload.get("title") is not None
                        else None
                    ),
                    note=(
                        str(payload.get("note", "")).strip()
                        if payload.get("note") is not None
                        else None
                    ),
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except ValueError as error:
                self._send_json(
                    400,
                    {
                        "error": "pair_create_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "created",
                    "pair": _convert(pair),
                },
            )
            return

        if request_path.startswith("/library/assets/") and request_path.endswith("/index-jobs"):
            asset_id = self._asset_id_from_index_jobs_path(request_path)
            if not asset_id:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "assetId is required",
                    },
                )
                return

            payload = self._read_json_body()
            try:
                job = create_media_index_job_request(
                    asset_id,
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except ValueError as error:
                self._send_json(
                    400,
                    {
                        "error": "index_job_create_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "created",
                    "job": _convert(job),
                },
            )
            return

        if request_path == "/library/alignment-jobs":
            payload = self._read_json_body()
            try:
                job = create_media_alignment_job_request(
                    pair_id=(
                        str(payload.get("pairId", "")).strip()
                        if payload.get("pairId") is not None
                        else None
                    ),
                    source_asset_id=(
                        str(payload.get("sourceAssetId", "")).strip()
                        if payload.get("sourceAssetId") is not None
                        else None
                    ),
                    query_asset_id=(
                        str(payload.get("queryAssetId", "")).strip()
                        if payload.get("queryAssetId") is not None
                        else None
                    ),
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except ValueError as error:
                self._send_json(
                    400,
                    {
                        "error": "alignment_job_create_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "created",
                    "job": _convert(job),
                },
            )
            return

        if request_path.startswith("/library/pairs/") and request_path.endswith("/alignment-jobs"):
            pair_id = self._pair_id_from_alignment_jobs_path(request_path)
            payload = self._read_json_body()
            try:
                job = create_media_alignment_job_request(
                    pair_id=pair_id,
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except ValueError as error:
                self._send_json(
                    400,
                    {
                        "error": "alignment_job_create_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "created",
                    "job": _convert(job),
                },
            )
            return

        if request_path.startswith("/library/alignment-jobs/") and request_path.endswith("/cancel"):
            job_id = self._alignment_job_id_from_cancel_path(request_path)
            payload = self._read_json_body()
            try:
                job = cancel_media_alignment_job_request(
                    job_id,
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "cancelled",
                    "job": _convert(job),
                },
            )
            return

        if request_path.startswith("/library/index-jobs/") and request_path.endswith("/cancel"):
            job_id = self._job_id_from_cancel_path(request_path)
            if not job_id:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "jobId is required",
                    },
                )
                return

            payload = self._read_json_body()
            try:
                job = cancel_media_index_job_request(
                    job_id,
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "cancelled",
                    "job": _convert(job),
                },
            )
            return

        if request_path == "/review":
            payload = self._read_json_body()
            session_id = str(payload.get("sessionId", "")).strip()
            candidate_id = str(payload.get("candidateId", "")).strip()
            action = str(payload.get("action", "")).strip()
            if not session_id or not candidate_id or not action:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "sessionId, candidateId, and action are required",
                    },
                )
                return

            label = payload.get("label")
            label = str(label).strip() if label is not None else None
            notes = payload.get("notes")
            notes = str(notes).strip() if notes is not None else None
            timestamp = payload.get("timestamp")
            timestamp = str(timestamp).strip() if timestamp else None
            adjusted_segment_payload = payload.get("adjustedSegment")
            adjusted_segment = None
            if isinstance(adjusted_segment_payload, dict):
                adjusted_segment = {
                    "start_seconds": float(adjusted_segment_payload["startSeconds"]),
                    "end_seconds": float(adjusted_segment_payload["endSeconds"]),
                }

            try:
                session = apply_review_update(
                    session_id,
                    candidate_id,
                    action=action,
                    label=label,
                    adjusted_segment=adjusted_segment,
                    notes=notes,
                    timestamp=timestamp,
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except (ValueError, TypeError) as error:
                self._send_json(
                    400,
                    {
                        "error": "review_failed",
                        "message": str(error),
                    },
                )
                return
            except Exception as error:  # pragma: no cover - defensive server guard
                self._send_json(
                    500,
                    {
                        "error": "review_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "updated",
                    "session": _convert(session),
                },
            )
            return

        if request_path == "/candidates/edit":
            payload = self._read_json_body()
            session_id = str(payload.get("sessionId", "")).strip()
            action = str(payload.get("action", "")).strip()
            if not session_id or not action:
                self._send_json(
                    400,
                    {
                        "error": "invalid_request",
                        "message": "sessionId and action are required",
                    },
                )
                return

            try:
                session = apply_candidate_edit(
                    session_id,
                    action=action,
                    candidate_id=(
                        str(payload.get("candidateId", "")).strip()
                        if payload.get("candidateId") is not None
                        else None
                    ),
                    target_candidate_id=(
                        str(payload.get("targetCandidateId", "")).strip()
                        if payload.get("targetCandidateId") is not None
                        else None
                    ),
                    label=(
                        str(payload.get("label", "")).strip()
                        if payload.get("label") is not None
                        else None
                    ),
                    transcript_snippet=(
                        str(payload.get("transcriptSnippet", "")).strip()
                        if payload.get("transcriptSnippet") is not None
                        else None
                    ),
                    candidate_window=payload.get("candidateWindow"),
                    suggested_segment=payload.get("suggestedSegment"),
                    split_seconds=(
                        float(payload["splitSeconds"])
                        if payload.get("splitSeconds") is not None
                        else None
                    ),
                    rank_delta=(
                        int(payload["rankDelta"])
                        if payload.get("rankDelta") is not None
                        else None
                    ),
                    transcript_chunk_id=(
                        str(payload.get("transcriptChunkId", "")).strip()
                        if payload.get("transcriptChunkId") is not None
                        else None
                    ),
                    transcript_text=(
                        str(payload.get("transcriptText", "")).strip()
                        if payload.get("transcriptText") is not None
                        else None
                    ),
                    timestamp=(
                        str(payload.get("timestamp", "")).strip()
                        if payload.get("timestamp")
                        else None
                    ),
                    database_path=self._database_path_from_payload(payload),
                )
            except KeyError as error:
                self._send_json(
                    404,
                    {
                        "error": "not_found",
                        "message": str(error),
                    },
                )
                return
            except (ValueError, TypeError) as error:
                self._send_json(
                    400,
                    {
                        "error": "candidate_edit_failed",
                        "message": str(error),
                    },
                )
                return
            except Exception as error:  # pragma: no cover - defensive server guard
                self._send_json(
                    500,
                    {
                        "error": "candidate_edit_failed",
                        "message": str(error),
                    },
                )
                return

            self._send_json(
                200,
                {
                    "status": "updated",
                    "session": _convert(session),
                },
            )
            return

        self._send_json(404, {"error": "not_found"})

    def log_message(self, format: str, *args: object) -> None:
        return

    def _read_json_body(self) -> dict[str, Any]:
        raw_body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        if not raw_body:
            return {}
        try:
            return json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _send_json(self, status_code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _database_path_from_payload(self, payload: dict[str, Any]) -> str:
        return str(
            payload.get("databasePath")
            or os.getenv("VAEXCORE_PULSE_ANALYZER_DATABASE_PATH")
            or DEFAULT_DATABASE_PATH
        )

    def _profile_id_from_examples_path(self, request_path: str) -> str:
        profile_path = request_path.removeprefix("/profiles/")
        profile_id, _, _ = profile_path.partition("/examples")
        return unquote(profile_id).strip()

    def _asset_id_from_index_jobs_path(self, request_path: str) -> str:
        asset_path = request_path.removeprefix("/library/assets/")
        asset_id, _, _ = asset_path.partition("/index-jobs")
        return unquote(asset_id).strip()

    def _asset_id_from_index_artifacts_path(self, request_path: str) -> str:
        asset_path = request_path.removeprefix("/library/assets/")
        asset_id, _, _ = asset_path.partition("/index-artifacts")
        return unquote(asset_id).strip()

    def _asset_id_from_thumbnail_outputs_path(self, request_path: str) -> str:
        asset_path = request_path.removeprefix("/library/assets/")
        asset_id, _, _ = asset_path.partition("/thumbnail-outputs")
        return unquote(asset_id).strip()

    def _pair_id_from_alignment_jobs_path(self, request_path: str) -> str:
        pair_path = request_path.removeprefix("/library/pairs/")
        pair_id, _, _ = pair_path.partition("/alignment-jobs")
        return unquote(pair_id).strip()

    def _pair_id_from_alignment_matches_path(self, request_path: str) -> str:
        pair_path = request_path.removeprefix("/library/pairs/")
        pair_id, _, _ = pair_path.partition("/alignment-matches")
        return unquote(pair_id).strip()

    def _alignment_job_id_from_cancel_path(self, request_path: str) -> str:
        job_path = request_path.removeprefix("/library/alignment-jobs/")
        job_id, _, _ = job_path.partition("/cancel")
        return unquote(job_id).strip()

    def _job_id_from_cancel_path(self, request_path: str) -> str:
        job_path = request_path.removeprefix("/library/index-jobs/")
        job_id, _, _ = job_path.partition("/cancel")
        return unquote(job_id).strip()


# Local runtime boundary
def main() -> int:
    host = os.getenv("VAEXCORE_PULSE_ANALYZER_HOST", "127.0.0.1")
    port = int(os.getenv("VAEXCORE_PULSE_ANALYZER_PORT", "9010"))
    server = ThreadingHTTPServer((host, port), AnalyzerRequestHandler)
    print(f"vaexcore pulse analyzer listening on http://{host}:{port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
