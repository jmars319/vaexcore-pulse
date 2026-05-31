import {
  parseStudioExportHistory,
  parseStudioIntakePersistence,
  serializeStudioExportHistory,
  serializeStudioIntakePersistence,
  STUDIO_EXPORT_HISTORY_STORAGE_KEY,
  STUDIO_INTAKE_STORAGE_KEY,
  type StudioIntakePersistence,
  type StudioIntakeQueueItem,
  type StudioOutputReadiness,
  type StudioRecordingCandidate,
  type StudioRecordingExportHistory,
} from "./studioIntegration";

export type StudioIntakeFilter =
  | "ready"
  | "needs-attention"
  | "imported"
  | "exported"
  | "hidden";

export function outputReadinessLabel(readiness: StudioOutputReadiness): string {
  if (readiness.ready) {
    return "Output ready";
  }

  if (readiness.state === "degraded") {
    return "Output degraded";
  }

  if (readiness.state === "not_applicable") {
    return "Output pending";
  }

  return "Output blocked";
}

export function outputReadinessTone(
  readiness: StudioOutputReadiness,
): "ready" | "blocked" {
  return readiness.ready ? "ready" : "blocked";
}

export function studioIntakeStateLabel(
  state: StudioIntakeQueueItem["state"],
): string {
  switch (state) {
    case "ready":
      return "Ready";
    case "stale":
      return "Stale";
    case "malformed":
      return "Malformed";
    case "unusable":
      return "Needs attention";
    case "duplicate":
      return "Duplicate";
    case "already-consumed":
      return "Imported";
    case "already-exported":
      return "Exported";
    case "dismissed":
      return "Hidden";
  }
}

export function studioIntakeStateTone(
  state: StudioIntakeQueueItem["state"],
): "ready" | "blocked" {
  return state === "ready" || state === "already-consumed"
    ? "ready"
    : "blocked";
}

export function studioRecordingVerificationLabel(
  recording: StudioRecordingCandidate,
): string {
  switch (recording.verificationState) {
    case "verified":
      return "Verified";
    case "basic_verified":
      return "Basic verified";
    case "missing":
      return "Missing";
    case "empty":
      return "Empty";
    case "unreadable":
      return "Unreadable";
    case "skipped":
      return "Skipped";
    default:
      return "Unverified";
  }
}

export function studioRecordingCompletionLabel(
  recording: StudioRecordingCandidate,
): string {
  switch (recording.completionState) {
    case "completed":
      return "Completed";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "unknown":
      return "Unknown";
    default:
      return "Legacy";
  }
}

export function studioRecordingSizeLabel(
  recording: StudioRecordingCandidate,
): string {
  const size =
    typeof recording.fileSizeBytes === "number"
      ? formatByteCount(recording.fileSizeBytes)
      : "size unknown";
  const duration =
    typeof recording.durationMs === "number"
      ? `${(recording.durationMs / 1000).toFixed(1)} sec`
      : "duration unknown";
  return `${size}, ${duration}`;
}

export function filterStudioIntakeRecordings(
  recordings: StudioIntakeQueueItem[],
  filter: StudioIntakeFilter,
): StudioIntakeQueueItem[] {
  return recordings.filter((recording) => {
    switch (filter) {
      case "ready":
        return recording.state === "ready";
      case "needs-attention":
        return (
          recording.state === "stale" ||
          recording.state === "malformed" ||
          recording.state === "unusable" ||
          recording.state === "duplicate"
        );
      case "imported":
        return recording.state === "already-consumed";
      case "exported":
        return recording.state === "already-exported";
      case "hidden":
        return recording.state === "dismissed";
    }
  });
}

export function buildStudioIntakeFilterCounts(
  recordings: StudioIntakeQueueItem[],
): Record<StudioIntakeFilter, number> {
  return {
    ready: filterStudioIntakeRecordings(recordings, "ready").length,
    "needs-attention": filterStudioIntakeRecordings(
      recordings,
      "needs-attention",
    ).length,
    imported: filterStudioIntakeRecordings(recordings, "imported").length,
    exported: filterStudioIntakeRecordings(recordings, "exported").length,
    hidden: filterStudioIntakeRecordings(recordings, "hidden").length,
  };
}

export function formatByteCount(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function studioIntakeSourceLabel(
  source: StudioIntakeQueueItem["source"],
): string {
  switch (source) {
    case "history":
      return "Studio history";
    case "event":
      return "Studio event";
    case "handoff":
      return "Studio handoff";
  }
}

export function loadStudioIntakePersistence(): StudioIntakePersistence {
  if (typeof window === "undefined") {
    return parseStudioIntakePersistence(null);
  }
  return parseStudioIntakePersistence(
    window.localStorage.getItem(STUDIO_INTAKE_STORAGE_KEY),
  );
}

export function persistStudioIntakePersistence(
  persistence: StudioIntakePersistence,
) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    STUDIO_INTAKE_STORAGE_KEY,
    serializeStudioIntakePersistence(persistence),
  );
}

export function loadStudioExportHistory(): StudioRecordingExportHistory {
  if (typeof window === "undefined") {
    return parseStudioExportHistory(null);
  }
  return parseStudioExportHistory(
    window.localStorage.getItem(STUDIO_EXPORT_HISTORY_STORAGE_KEY),
  );
}

export function persistStudioExportHistory(
  history: StudioRecordingExportHistory,
) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    STUDIO_EXPORT_HISTORY_STORAGE_KEY,
    serializeStudioExportHistory(history),
  );
}
