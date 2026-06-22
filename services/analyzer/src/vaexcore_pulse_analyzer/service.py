from __future__ import annotations

import threading
from datetime import datetime, timezone

from .contracts import (
    MediaLibraryAssetType,
    ProjectSession,
    ReviewAction,
    ReviewDecision,
    Settings,
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
