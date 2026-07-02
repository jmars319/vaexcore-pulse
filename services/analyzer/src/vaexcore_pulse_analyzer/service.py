from __future__ import annotations

import threading
import uuid
from dataclasses import replace
from datetime import datetime, timezone

from .contracts import (
    CandidateEditRecord,
    CandidateWindow,
    ConfidenceBand,
    MediaLibraryAssetType,
    ProjectSession,
    ReasonCode,
    ReviewAction,
    ReviewDecision,
    ScoreContribution,
    Settings,
    SuggestedSegment,
    TimeRange,
)
from .pipeline.alignment import build_audio_proxy_alignment_matches
from .pipeline.indexing import build_media_index_artifacts, build_media_index_summary
from .pipeline.orchestrator import analyze_media
from .pipeline.profile_matching import (
    build_local_example_feature_summary,
    build_profile_match,
)
from .paths import resolve_default_database_path
from .storage.session_store import SessionStore

DEFAULT_DATABASE_PATH = resolve_default_database_path()


# Analysis request boundary
def analyze_request(
    source_path: str,
    *,
    profile_id: str = "generic",
    session_title: str | None = None,
    transcript_path: str | None = None,
    persist: bool = True,
    database_path: str = DEFAULT_DATABASE_PATH,
    settings: Settings | None = None,
) -> ProjectSession:
    store = SessionStore(database_path)
    store.initialize()
    resolved_profile_id = store.resolve_profile_id(profile_id)
    session = analyze_media(
        source_path,
        settings=settings or Settings(),
        profile_id=resolved_profile_id,
        session_title=session_title,
        transcript_path=transcript_path,
    )
    session = _apply_profile_matches(store, session)

    if persist:
        store.save_session(session)

    return session


def load_session_request(
    session_id: str,
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> ProjectSession:
    store = SessionStore(database_path)
    store.initialize()
    session = store.load_session(session_id)
    previous_snapshot = _profile_match_snapshot(session)
    hydrated_session = _apply_profile_matches(store, session)
    if _profile_matches_changed(previous_snapshot, hydrated_session):
        store.save_session(hydrated_session)
    return hydrated_session


def list_session_summaries_request(
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[dict[str, object]]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_session_summaries()


def search_sessions_request(
    query: str,
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
    limit: int = 50,
) -> list[dict[str, object]]:
    normalized_query = query.strip().lower()
    if not normalized_query:
        return []

    store = SessionStore(database_path)
    store.initialize()
    results: list[dict[str, object]] = []
    for session_id in store.list_session_ids():
        session = store.load_session(session_id)
        result = _search_session(session, normalized_query)
        if result:
            results.append(result)

    results.sort(
        key=lambda result: (int(result["score"]), str(result["updated_at"])),
        reverse=True,
    )
    return results[:limit]


def apply_review_update(
    session_id: str,
    candidate_id: str,
    *,
    action: str,
    label: str | None = None,
    adjusted_segment: dict[str, float] | None = None,
    notes: str | None = None,
    timestamp: str | None = None,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> ProjectSession:
    store = SessionStore(database_path)
    store.initialize()
    session = store.load_session(session_id)

    if not any(candidate.id == candidate_id for candidate in session.candidates):
        raise KeyError(f"Candidate not found in session {session_id}: {candidate_id}")

    existing_decision = next(
        (decision for decision in session.review_decisions if decision.candidate_id == candidate_id),
        None,
    )

    normalized_action = ReviewAction(action)
    if (
        normalized_action in {ReviewAction.RELABEL, ReviewAction.RETIME}
        and existing_decision
        and existing_decision.action in {ReviewAction.ACCEPT, ReviewAction.REJECT}
    ):
        normalized_action = existing_decision.action
    normalized_adjusted_segment = (
        TimeRange(
            start_seconds=float(adjusted_segment["start_seconds"]),
            end_seconds=float(adjusted_segment["end_seconds"]),
        )
        if adjusted_segment
        else existing_decision.adjusted_segment if existing_decision else None
    )
    normalized_label = label if label is not None else existing_decision.label if existing_decision else None
    normalized_notes = notes if notes is not None else existing_decision.notes if existing_decision else None

    decision = ReviewDecision(
        id=existing_decision.id if existing_decision else f"review_{session_id}_{candidate_id}",
        project_session_id=session_id,
        candidate_id=candidate_id,
        action=normalized_action,
        label=normalized_label,
        adjusted_segment=normalized_adjusted_segment,
        notes=normalized_notes,
        created_at=timestamp or datetime.now(timezone.utc).isoformat(),
    )
    store.save_review_decision(decision)
    session = store.load_session(session_id)
    previous_snapshot = _profile_match_snapshot(session)
    hydrated_session = _apply_profile_matches(store, session)
    if _profile_matches_changed(previous_snapshot, hydrated_session):
        store.save_session(hydrated_session)
    return hydrated_session


def _search_session(
    session: ProjectSession,
    normalized_query: str,
) -> dict[str, object] | None:
    matched_fields: set[str] = set()
    snippets: list[str] = []
    score = 0

    def collect(field: str, value: object, weight: int = 1) -> None:
        nonlocal score
        text = str(value or "")
        if not text or normalized_query not in text.lower():
            return
        matched_fields.add(field)
        score += weight
        if len(snippets) < 4:
            snippets.append(_snippet(text, normalized_query))

    collect("title", session.title, 5)
    collect("source", session.media_source.file_name, 4)
    collect("source", session.media_source.path, 3)
    collect("profile", session.profile_id, 2)
    for transcript in session.transcript:
        collect("transcript", transcript.text, 3)
    for candidate in session.candidates:
        collect("candidate", candidate.editable_label, 3)
        collect("candidate", candidate.transcript_snippet, 2)
        collect("candidate", " ".join(reason.value for reason in candidate.reason_codes), 1)
        collect("tag", " ".join(tag.value for tag in candidate.review_tags), 2)
    for decision in session.review_decisions:
        collect("decision", decision.action.value, 1)
        collect("decision", decision.label, 3)
        collect("decision", decision.notes, 2)
    collect("export", " ".join(decision.label or "" for decision in session.review_decisions), 2)

    if score == 0:
        return None

    accepted_count = sum(1 for decision in session.review_decisions if decision.action == ReviewAction.ACCEPT)
    rejected_count = sum(1 for decision in session.review_decisions if decision.action == ReviewAction.REJECT)
    deferred_count = sum(1 for decision in session.review_decisions if decision.action == ReviewAction.DEFER)
    candidate_count = len(session.candidates)
    return {
        "session_id": session.id,
        "session_title": session.title,
        "source_name": session.media_source.file_name,
        "source_path": session.media_source.path,
        "profile_id": session.profile_id,
        "updated_at": session.updated_at,
        "score": score,
        "matched_fields": sorted(matched_fields),
        "snippets": snippets,
        "candidate_count": candidate_count,
        "accepted_count": accepted_count,
        "rejected_count": rejected_count,
        "deferred_count": deferred_count,
        "pending_count": max(
            candidate_count - accepted_count - rejected_count - deferred_count,
            0,
        ),
    }


def _snippet(value: str, normalized_query: str) -> str:
    lower_value = value.lower()
    index = lower_value.find(normalized_query)
    if index < 0:
        return value[:160]
    start = max(0, index - 60)
    end = min(len(value), index + len(normalized_query) + 80)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(value) else ""
    return f"{prefix}{value[start:end].strip()}{suffix}"


def apply_candidate_edit(
    session_id: str,
    *,
    action: str,
    candidate_id: str | None = None,
    target_candidate_id: str | None = None,
    label: str | None = None,
    transcript_snippet: str | None = None,
    candidate_window: dict[str, float] | None = None,
    suggested_segment: dict[str, object] | None = None,
    split_seconds: float | None = None,
    rank_delta: int | None = None,
    transcript_chunk_id: str | None = None,
    transcript_text: str | None = None,
    timestamp: str | None = None,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> ProjectSession:
    store = SessionStore(database_path)
    store.initialize()
    session = store.load_session(session_id)
    created_at = timestamp or datetime.now(timezone.utc).isoformat()

    if action == "CREATE":
        session.candidates.append(
            _build_manual_candidate(
                session,
                candidate_window,
                suggested_segment,
                label,
                transcript_snippet,
                created_at,
            )
        )
    elif action == "SPLIT":
        _split_candidate(session, candidate_id, split_seconds, created_at)
    elif action == "MERGE":
        _merge_candidates(session, candidate_id, target_candidate_id, created_at)
    elif action == "RANK":
        _rank_candidate(session, candidate_id, rank_delta, created_at)
    elif action == "TRANSCRIPT_CORRECTION":
        _apply_transcript_correction(
            session,
            transcript_chunk_id,
            transcript_text,
            created_at,
        )
    else:
        raise ValueError(f"Unsupported candidate edit action: {action}")

    session.updated_at = created_at
    store.save_session(session)
    return load_session_request(session_id, database_path=database_path)


def _build_manual_candidate(
    session: ProjectSession,
    candidate_window_payload: dict[str, float] | None,
    suggested_segment_payload: dict[str, object] | None,
    label: str | None,
    transcript_snippet: str | None,
    created_at: str,
) -> CandidateWindow:
    if not candidate_window_payload or not suggested_segment_payload or not label:
        raise ValueError("candidateWindow, suggestedSegment, and label are required")

    candidate_window = _time_range_from_payload(candidate_window_payload)
    suggested_segment = _suggested_segment_from_payload(suggested_segment_payload)
    _validate_time_range(candidate_window, session.media_source.duration_seconds)
    _validate_time_range(
        TimeRange(
            start_seconds=suggested_segment.start_seconds,
            end_seconds=suggested_segment.end_seconds,
        ),
        session.media_source.duration_seconds,
    )
    candidate_id = f"{session.id}_manual_{len(session.candidates) + 1:03d}_{uuid.uuid4().hex[:6]}"
    return CandidateWindow(
        id=candidate_id,
        candidate_window=candidate_window,
        suggested_segment=suggested_segment,
        confidence_band=ConfidenceBand.LOW,
        score_estimate=0.45,
        reason_codes=[ReasonCode.STRUCTURE_SETUP],
        transcript_snippet=transcript_snippet or "Operator-created candidate.",
        score_breakdown=[
            ScoreContribution(
                reason_code=ReasonCode.STRUCTURE_SETUP,
                label="Operator-created candidate",
                contribution=0.45,
                direction="POSITIVE",
            )
        ],
        context_required=True,
        editable_label=label,
        quality_signals={"operatorCreated": 1.0},
        edit_history=[
            _candidate_edit_record(
                "MANUAL_CREATE",
                "Operator created this candidate manually.",
                [candidate_id],
                created_at,
            )
        ],
    )


def _split_candidate(
    session: ProjectSession,
    candidate_id: str | None,
    split_seconds: float | None,
    created_at: str,
) -> None:
    candidate, index = _find_candidate(session, candidate_id)
    start_seconds = candidate.candidate_window.start_seconds
    end_seconds = candidate.candidate_window.end_seconds
    split_at = split_seconds or ((start_seconds + end_seconds) / 2)
    if split_at <= start_seconds + 1 or split_at >= end_seconds - 1:
        raise ValueError("splitSeconds must fall safely inside the candidate window")

    first = replace(
        candidate,
        id=f"{candidate.id}_split_a_{uuid.uuid4().hex[:4]}",
        candidate_window=TimeRange(start_seconds, split_at),
        suggested_segment=_clip_suggested_segment(
            candidate.suggested_segment,
            start_seconds,
            split_at,
        ),
        editable_label=f"{candidate.editable_label} A",
        duplicate_of_candidate_id=None,
        near_duplicate_candidate_ids=[],
        edit_history=[
            *candidate.edit_history,
            _candidate_edit_record(
                "SPLIT",
                f"Split from {candidate.id}.",
                [candidate.id],
                created_at,
            ),
        ],
    )
    second = replace(
        candidate,
        id=f"{candidate.id}_split_b_{uuid.uuid4().hex[:4]}",
        candidate_window=TimeRange(split_at, end_seconds),
        suggested_segment=_clip_suggested_segment(
            candidate.suggested_segment,
            split_at,
            end_seconds,
        ),
        editable_label=f"{candidate.editable_label} B",
        duplicate_of_candidate_id=None,
        near_duplicate_candidate_ids=[],
        edit_history=[
            *candidate.edit_history,
            _candidate_edit_record(
                "SPLIT",
                f"Split from {candidate.id}.",
                [candidate.id],
                created_at,
            ),
        ],
    )
    session.candidates[index : index + 1] = [first, second]
    session.review_decisions = [
        decision
        for decision in session.review_decisions
        if decision.candidate_id != candidate.id
    ]


def _merge_candidates(
    session: ProjectSession,
    candidate_id: str | None,
    target_candidate_id: str | None,
    created_at: str,
) -> None:
    candidate, index = _find_candidate(session, candidate_id)
    target, target_index = _find_candidate(session, target_candidate_id)
    if candidate.id == target.id:
        raise ValueError("A candidate cannot be merged with itself")

    start_seconds = min(
        candidate.candidate_window.start_seconds,
        target.candidate_window.start_seconds,
    )
    end_seconds = max(
        candidate.candidate_window.end_seconds,
        target.candidate_window.end_seconds,
    )
    merged = replace(
        candidate,
        candidate_window=TimeRange(start_seconds, end_seconds),
        suggested_segment=SuggestedSegment(
            start_seconds=min(
                candidate.suggested_segment.start_seconds,
                target.suggested_segment.start_seconds,
            ),
            end_seconds=max(
                candidate.suggested_segment.end_seconds,
                target.suggested_segment.end_seconds,
            ),
            setup_padding_seconds=candidate.suggested_segment.setup_padding_seconds,
            resolution_padding_seconds=(
                candidate.suggested_segment.resolution_padding_seconds
            ),
            trim_dead_air_applied=(
                candidate.suggested_segment.trim_dead_air_applied
                and target.suggested_segment.trim_dead_air_applied
            ),
        ),
        score_estimate=round(
            max(candidate.score_estimate, target.score_estimate),
            2,
        ),
        transcript_snippet=_join_snippets(
            candidate.transcript_snippet,
            target.transcript_snippet,
        ),
        editable_label=f"Merged: {candidate.editable_label}",
        duplicate_of_candidate_id=None,
        near_duplicate_candidate_ids=[],
        edit_history=[
            *candidate.edit_history,
            *target.edit_history,
            _candidate_edit_record(
                "MERGE",
                f"Merged {candidate.id} with {target.id}.",
                [candidate.id, target.id],
                created_at,
            ),
        ],
    )
    session.candidates[index] = merged
    del session.candidates[target_index if target_index < index else target_index]
    session.review_decisions = [
        decision
        for decision in session.review_decisions
        if decision.candidate_id not in {candidate.id, target.id}
    ]


def _rank_candidate(
    session: ProjectSession,
    candidate_id: str | None,
    rank_delta: int | None,
    created_at: str,
) -> None:
    if not rank_delta:
        raise ValueError("rankDelta is required")
    candidate, index = _find_candidate(session, candidate_id)
    next_index = max(0, min(len(session.candidates) - 1, index - rank_delta))
    candidate.rank_adjustment += float(rank_delta)
    candidate.edit_history.append(
        _candidate_edit_record(
            "RANK_ADJUST",
            f"Rank adjusted by {rank_delta}.",
            [candidate.id],
            created_at,
        )
    )
    if next_index == index:
        return
    session.candidates.pop(index)
    session.candidates.insert(next_index, candidate)


def _apply_transcript_correction(
    session: ProjectSession,
    transcript_chunk_id: str | None,
    transcript_text: str | None,
    created_at: str,
) -> None:
    if not transcript_chunk_id or not transcript_text:
        raise ValueError("transcriptChunkId and transcriptText are required")

    chunk = next(
        (item for item in session.transcript if item.id == transcript_chunk_id),
        None,
    )
    if chunk is None:
        raise KeyError(f"Transcript chunk not found: {transcript_chunk_id}")

    previous_text = chunk.text
    chunk.text = transcript_text
    for candidate in session.candidates:
        overlaps_chunk = (
            candidate.candidate_window.start_seconds < chunk.end_seconds
            and candidate.candidate_window.end_seconds > chunk.start_seconds
        )
        if not overlaps_chunk:
            continue
        if candidate.transcript_snippet == previous_text:
            candidate.transcript_snippet = transcript_text
        elif previous_text in candidate.transcript_snippet:
            candidate.transcript_snippet = candidate.transcript_snippet.replace(
                previous_text,
                transcript_text,
            )
        candidate.edit_history.append(
            _candidate_edit_record(
                "TRANSCRIPT_CORRECTION",
                f"Transcript chunk {transcript_chunk_id} corrected.",
                [candidate.id],
                created_at,
            )
        )


def _find_candidate(
    session: ProjectSession,
    candidate_id: str | None,
) -> tuple[CandidateWindow, int]:
    if not candidate_id:
        raise ValueError("candidateId is required")
    for index, candidate in enumerate(session.candidates):
        if candidate.id == candidate_id:
            return candidate, index
    raise KeyError(f"Candidate not found in session {session.id}: {candidate_id}")


def _time_range_from_payload(value: dict[str, float]) -> TimeRange:
    start_seconds = value.get("start_seconds", value.get("startSeconds"))
    end_seconds = value.get("end_seconds", value.get("endSeconds"))
    if start_seconds is None or end_seconds is None:
        raise ValueError("startSeconds and endSeconds are required")
    return TimeRange(
        start_seconds=float(start_seconds),
        end_seconds=float(end_seconds),
    )


def _suggested_segment_from_payload(value: dict[str, object]) -> SuggestedSegment:
    start_seconds = value.get("start_seconds", value.get("startSeconds"))
    end_seconds = value.get("end_seconds", value.get("endSeconds"))
    if start_seconds is None or end_seconds is None:
        raise ValueError("suggestedSegment startSeconds and endSeconds are required")
    return SuggestedSegment(
        start_seconds=float(start_seconds),
        end_seconds=float(end_seconds),
        setup_padding_seconds=float(
            value.get("setup_padding_seconds", value.get("setupPaddingSeconds", 0)),
        ),
        resolution_padding_seconds=float(
            value.get(
                "resolution_padding_seconds",
                value.get("resolutionPaddingSeconds", 0),
            ),
        ),
        trim_dead_air_applied=bool(
            value.get("trim_dead_air_applied", value.get("trimDeadAirApplied", False)),
        ),
    )


def _validate_time_range(value: TimeRange, duration_seconds: float) -> None:
    if value.start_seconds < 0 or value.end_seconds <= value.start_seconds:
        raise ValueError("Invalid candidate time range")
    if value.end_seconds > duration_seconds:
        raise ValueError("Candidate time range exceeds the media duration")


def _clip_suggested_segment(
    segment: SuggestedSegment,
    start_seconds: float,
    end_seconds: float,
) -> SuggestedSegment:
    clipped_start = max(start_seconds, segment.start_seconds)
    clipped_end = min(end_seconds, segment.end_seconds)
    if clipped_end <= clipped_start:
        clipped_start = start_seconds
        clipped_end = end_seconds
    return replace(
        segment,
        start_seconds=clipped_start,
        end_seconds=clipped_end,
    )


def _candidate_edit_record(
    kind: str,
    note: str,
    source_candidate_ids: list[str],
    created_at: str,
) -> CandidateEditRecord:
    return CandidateEditRecord(
        id=f"candidate_edit_{uuid.uuid4().hex[:12]}",
        kind=kind,
        note=note,
        source_candidate_ids=source_candidate_ids,
        created_at=created_at,
    )


def _join_snippets(left: str, right: str) -> str:
    if left == right:
        return left
    return f"{left} / {right}"


# Profile request boundary
def list_profiles_request(
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[object]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_profiles()


def create_profile_request(
    name: str,
    *,
    description: str | None = None,
    state: str = "ACTIVE",
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    return store.create_profile(
        name=name,
        description=description or "",
        state=state,
    )


def list_profile_examples_request(
    profile_id: str,
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[object]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_example_clips(profile_id)


def add_profile_example_request(
    profile_id: str,
    *,
    source_type: str,
    source_value: str,
    title: str | None = None,
    note: str | None = None,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    return store.add_example_clip(
        profile_id,
        source_type=source_type,
        source_value=source_value,
        title=title,
        note=note,
    )


# Media library boundary
def list_media_library_assets_request(
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[object]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_media_library_assets()


def create_media_library_asset_request(
    *,
    asset_type: str,
    scope: str,
    profile_id: str | None = None,
    source_type: str,
    source_value: str,
    title: str | None = None,
    note: str | None = None,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    return store.create_media_library_asset(
        asset_type=asset_type,
        scope=scope,
        profile_id=profile_id,
        source_type=source_type,
        source_value=source_value,
        title=title,
        note=note,
    )


def replace_media_thumbnail_outputs_request(
    asset_id: str,
    *,
    selected_suggestion_ids: list[str],
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    return store.replace_media_thumbnail_outputs(
        asset_id,
        selected_suggestion_ids=selected_suggestion_ids,
    )


def list_media_edit_pairs_request(
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[object]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_media_edit_pairs()


def create_media_edit_pair_request(
    vod_asset_id: str,
    edit_asset_id: str,
    *,
    profile_id: str | None = None,
    title: str | None = None,
    note: str | None = None,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    return store.create_media_edit_pair(
        vod_asset_id,
        edit_asset_id,
        profile_id=profile_id,
        title=title,
        note=note,
    )


# Index job boundary
def list_media_index_jobs_request(
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[object]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_media_index_jobs()


def list_media_index_artifacts_request(
    *,
    asset_id: str | None = None,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[object]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_media_index_artifacts(asset_id)


def create_media_index_job_request(
    asset_id: str,
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    job = store.create_media_index_job(asset_id)
    if job.status.value == "QUEUED":
        worker = threading.Thread(
            target=_run_media_index_job,
            args=(job.id, database_path),
            daemon=True,
        )
        worker.start()
    return job


def cancel_media_index_job_request(
    job_id: str,
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    return store.cancel_media_index_job(job_id)


def run_media_index_job_inline(
    job_id: str,
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    return _run_media_index_job(job_id, database_path)


def _run_media_index_job(job_id: str, database_path: str):
    store = SessionStore(database_path)
    store.initialize()
    try:
        job = store.claim_media_index_job(job_id)
        if job is None:
            return store.list_media_index_jobs()

        assets_by_id = {asset.id: asset for asset in store.list_media_library_assets()}
        asset = assets_by_id.get(job.asset_id)
        if asset is None:
            raise KeyError(f"Media library asset not found: {job.asset_id}")

        store.update_media_index_job_progress(
            job_id,
            progress=0.35,
            status_detail="Validated local media path. Running bounded metadata probe.",
        )
        result = build_media_index_summary(asset.source_value)
        if store.media_index_job_is_cancelled(job_id):
            return store.cancel_media_index_job(job_id)

        store.update_media_index_job_progress(
            job_id,
            progress=0.7,
            status_detail="Metadata ready. Building bounded time-bucketed signal artifacts.",
        )
        artifacts = build_media_index_artifacts(
            asset_id=asset.id,
            job_id=job_id,
            index_summary=result,
        )
        for artifact in artifacts:
            store.save_media_index_artifact(artifact)
        if store.media_index_job_is_cancelled(job_id):
            return store.cancel_media_index_job(job_id)

        feature_summary = None
        asset_status_detail = None
        if (
            asset.asset_type == MediaLibraryAssetType.EDIT
            and asset.profile_id is not None
        ):
            store.update_media_index_job_progress(
                job_id,
                progress=0.88,
                status_detail=(
                    "Index ready. Building longform edit reference summary for future matching."
                ),
            )
            try:
                feature_summary = build_local_example_feature_summary(
                    asset.source_value,
                    Settings(),
                )
                asset_status_detail = (
                    "Media index ready. This profile-scoped edit can now act as a "
                    "longform reference for future VOD matching."
                )
            except Exception as error:  # pragma: no cover - defensive local-media guard
                asset_status_detail = (
                    "Media index ready, but vaexcore pulse could not build this "
                    f"edit's longform reference summary yet: {error}"
                )

        return store.complete_media_index_job(
            job_id,
            result,
            feature_summary=feature_summary,
            asset_status_detail=asset_status_detail,
        )
    except Exception as error:  # pragma: no cover - defensive background guard
        return store.fail_media_index_job(job_id, str(error))


# Alignment job boundary
def list_media_alignment_jobs_request(
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[object]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_media_alignment_jobs()


def list_media_alignment_matches_request(
    *,
    pair_id: str | None = None,
    database_path: str = DEFAULT_DATABASE_PATH,
) -> list[object]:
    store = SessionStore(database_path)
    store.initialize()
    return store.list_media_alignment_matches(pair_id)


def create_media_alignment_job_request(
    *,
    pair_id: str | None = None,
    source_asset_id: str | None = None,
    query_asset_id: str | None = None,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    job = store.create_media_alignment_job(
        pair_id=pair_id,
        source_asset_id=source_asset_id,
        query_asset_id=query_asset_id,
    )
    if job.status.value == "QUEUED":
        worker = threading.Thread(
            target=_run_media_alignment_job,
            args=(job.id, database_path),
            daemon=True,
        )
        worker.start()
    return job


def cancel_media_alignment_job_request(
    job_id: str,
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    store = SessionStore(database_path)
    store.initialize()
    return store.cancel_media_alignment_job(job_id)


def run_media_alignment_job_inline(
    job_id: str,
    *,
    database_path: str = DEFAULT_DATABASE_PATH,
):
    return _run_media_alignment_job(job_id, database_path)


def _run_media_alignment_job(job_id: str, database_path: str):
    store = SessionStore(database_path)
    store.initialize()
    try:
        job = store.claim_media_alignment_job(job_id)
        if job is None:
            return store.list_media_alignment_jobs()

        source_artifact = store.load_latest_audio_fingerprint_artifact(
            job.source_asset_id,
        )
        query_artifact = store.load_latest_audio_fingerprint_artifact(
            job.query_asset_id,
        )
        store.update_media_alignment_job_progress(
            job_id,
            progress=0.55,
            status_detail="Comparing query audio proxy buckets against source buckets.",
        )
        matches = build_audio_proxy_alignment_matches(
            job_id=job.id,
            source_asset_id=job.source_asset_id,
            query_asset_id=job.query_asset_id,
            source_artifact=source_artifact,
            query_artifact=query_artifact,
            pair_id=job.pair_id,
        )
        store.save_media_alignment_matches(job_id, matches)
        if store.media_alignment_job_is_cancelled(job_id):
            return store.cancel_media_alignment_job(job_id)
        return store.complete_media_alignment_job(job_id, len(matches))
    except Exception as error:  # pragma: no cover - defensive background guard
        return store.fail_media_alignment_job(job_id, str(error))


# Profile matching boundary
def _apply_profile_matches(
    store: SessionStore,
    session: ProjectSession,
) -> ProjectSession:
    if not session.profile_id:
        return session

    try:
        profile = store.load_profile(session.profile_id)
    except KeyError:
        return session

    updated_candidates = []
    for candidate in session.candidates:
        match = build_profile_match(
            candidate,
            session.feature_windows,
            profile,
        )
        existing_matches = [
            existing_match
            for existing_match in candidate.profile_matches
            if existing_match.profile_id != profile.id
        ]
        candidate.profile_matches = [*existing_matches, match]
        updated_candidates.append(candidate)

    session.candidates = updated_candidates
    return session


def _profile_match_snapshot(
    session: ProjectSession,
) -> list[tuple[str, tuple[tuple[str, str, str, str | None], ...]]]:
    return [
        (
            candidate.id,
            tuple(
                (
                    match.profile_id,
                    match.status.value,
                    match.strength.value,
                    f"{match.similarity_score:.4f}" if match.similarity_score is not None else None,
                )
                for match in candidate.profile_matches
            ),
        )
        for candidate in session.candidates
    ]


def _profile_matches_changed(
    previous_snapshot: list[tuple[str, tuple[tuple[str, str, str, str | None], ...]]],
    next_session: ProjectSession,
) -> bool:
    next_snapshot = _profile_match_snapshot(next_session)
    if len(previous_snapshot) != len(next_snapshot):
        return True

    for previous_candidate, next_candidate in zip(previous_snapshot, next_snapshot):
        if previous_candidate != next_candidate:
            return True

    return False
