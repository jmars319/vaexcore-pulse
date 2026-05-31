import { isSupportedInput } from "@vaexcore/pulse-media";

import type {
  StudioOutputReadiness,
  StudioRecordingCandidate,
  StudioRecordingCompletionState,
  StudioRecordingVerificationState,
} from "./studioTypes";

export function studioRecordingFromMessage(
  rawMessage: unknown,
): StudioRecordingCandidate | null {
  if (typeof rawMessage !== "string") {
    return null;
  }

  let event: unknown;
  try {
    event = JSON.parse(rawMessage);
  } catch {
    return null;
  }

  if (!event || typeof event !== "object") {
    return null;
  }

  const typedEvent = event as {
    type?: unknown;
    timestamp?: unknown;
    payload?: unknown;
  };
  if (typedEvent.type !== "recording.stopped") {
    return null;
  }

  const payload =
    typedEvent.payload && typeof typedEvent.payload === "object"
      ? (typedEvent.payload as Record<string, unknown>)
      : {};
  const outputPath =
    typeof payload.output_path === "string" ? payload.output_path.trim() : "";

  if (!outputPath || !isSupportedInput(outputPath)) {
    return null;
  }

  return {
    sessionId:
      typeof payload.session_id === "string" ? payload.session_id : "unknown",
    outputPath,
    profileId:
      typeof payload.profile_id === "string" ? payload.profile_id : null,
    profileName:
      typeof payload.profile_name === "string" ? payload.profile_name : null,
    captureMode:
      typeof payload.capture_mode === "string" ? payload.capture_mode : null,
    captureDetail:
      typeof payload.capture_detail === "string"
        ? payload.capture_detail
        : null,
    completionState: parseCompletionState(payload.completion_state),
    completionDetail:
      typeof payload.completion_detail === "string"
        ? payload.completion_detail
        : null,
    verificationState: parseVerificationState(payload.verification_state),
    verificationDetail:
      typeof payload.verification_detail === "string"
        ? payload.verification_detail
        : null,
    fileSizeBytes: parseNullableNumber(payload.file_size_bytes),
    durationMs: parseNullableNumber(payload.duration_ms),
    processStatus:
      typeof payload.process_status === "string"
        ? payload.process_status
        : null,
    stoppedAt:
      typeof typedEvent.timestamp === "string"
        ? typedEvent.timestamp
        : new Date().toISOString(),
  };
}

export function studioRecordingFromHistoryEntry(
  entry: unknown,
): StudioRecordingCandidate | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const outputPath =
    typeof record.output_path === "string" ? record.output_path.trim() : "";
  if (!outputPath || !isSupportedInput(outputPath)) {
    return null;
  }

  return {
    sessionId:
      typeof record.session_id === "string" ? record.session_id : "unknown",
    outputPath,
    profileId: typeof record.profile_id === "string" ? record.profile_id : null,
    profileName:
      typeof record.profile_name === "string" ? record.profile_name : null,
    captureMode:
      typeof record.capture_mode === "string" ? record.capture_mode : null,
    captureDetail:
      typeof record.capture_detail === "string" ? record.capture_detail : null,
    completionState: parseCompletionState(
      record.completion_state ?? record.completionState,
    ),
    completionDetail:
      typeof record.completion_detail === "string"
        ? record.completion_detail
        : typeof record.completionDetail === "string"
          ? record.completionDetail
          : null,
    verificationState: parseVerificationState(
      record.verification_state ?? record.verificationState,
    ),
    verificationDetail:
      typeof record.verification_detail === "string"
        ? record.verification_detail
        : typeof record.verificationDetail === "string"
          ? record.verificationDetail
          : null,
    fileSizeBytes: parseNullableNumber(
      record.file_size_bytes ?? record.fileSizeBytes,
    ),
    durationMs: parseNullableNumber(record.duration_ms ?? record.durationMs),
    processStatus:
      typeof record.process_status === "string"
        ? record.process_status
        : typeof record.processStatus === "string"
          ? record.processStatus
          : null,
    stoppedAt:
      typeof record.stopped_at === "string"
        ? record.stopped_at
        : new Date().toISOString(),
    outputReadiness: parseStudioOutputReadiness(
      record.output_readiness ?? record.outputReady,
    ),
  };
}

function parseCompletionState(
  value: unknown,
): StudioRecordingCompletionState | null {
  return value === "completed" ||
    value === "failed" ||
    value === "partial" ||
    value === "skipped" ||
    value === "unknown"
    ? value
    : null;
}

function parseVerificationState(
  value: unknown,
): StudioRecordingVerificationState | null {
  return value === "verified" ||
    value === "basic_verified" ||
    value === "missing" ||
    value === "empty" ||
    value === "unreadable" ||
    value === "skipped"
    ? value
    : null;
}

function parseNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function parseStudioOutputReadiness(
  value: unknown,
): StudioOutputReadiness | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const detail = typeof record.detail === "string" ? record.detail : "";
  if (!detail) {
    return null;
  }
  return {
    ready: record.ready === true,
    state: typeof record.state === "string" ? record.state : "not_applicable",
    detail,
    activeSceneId:
      typeof record.activeSceneId === "string"
        ? record.activeSceneId
        : typeof record.active_scene_id === "string"
          ? record.active_scene_id
          : null,
    activeSceneName:
      typeof record.activeSceneName === "string"
        ? record.activeSceneName
        : typeof record.active_scene_name === "string"
          ? record.active_scene_name
          : null,
    programPreviewFrameReady:
      typeof record.programPreviewFrameReady === "boolean"
        ? record.programPreviewFrameReady
        : typeof record.program_preview_frame_ready === "boolean"
          ? record.program_preview_frame_ready
          : null,
    compositorRenderPlanReady:
      typeof record.compositorRenderPlanReady === "boolean"
        ? record.compositorRenderPlanReady
        : typeof record.compositor_render_plan_ready === "boolean"
          ? record.compositor_render_plan_ready
          : null,
    outputPreflightReady:
      typeof record.outputPreflightReady === "boolean"
        ? record.outputPreflightReady
        : typeof record.output_preflight_ready === "boolean"
          ? record.output_preflight_ready
          : null,
    mediaPipelineReady:
      typeof record.mediaPipelineReady === "boolean"
        ? record.mediaPipelineReady
        : typeof record.media_pipeline_ready === "boolean"
          ? record.media_pipeline_ready
          : null,
    blockers: Array.isArray(record.blockers)
      ? record.blockers.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
}
