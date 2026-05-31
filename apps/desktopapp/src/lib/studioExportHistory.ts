import type {
  StudioRecordingExportHistory,
  StudioRecordingExportHistoryEntry,
} from "./studioTypes";

export function createEmptyStudioExportHistory(): StudioRecordingExportHistory {
  return {
    schemaVersion: 1,
    recordings: {},
  };
}

export function parseStudioExportHistory(
  raw: string | null,
): StudioRecordingExportHistory {
  if (!raw) {
    return createEmptyStudioExportHistory();
  }
  try {
    const parsed = JSON.parse(raw) as Partial<StudioRecordingExportHistory>;
    if (parsed.schemaVersion !== 1 || !parsed.recordings) {
      return createEmptyStudioExportHistory();
    }
    return {
      schemaVersion: 1,
      recordings: Object.fromEntries(
        Object.entries(parsed.recordings).flatMap(([key, value]) => {
          const entry = sanitizeExportHistoryEntry(value);
          return entry ? [[key, entry]] : [];
        }),
      ),
    };
  } catch {
    return createEmptyStudioExportHistory();
  }
}

export function serializeStudioExportHistory(
  history: StudioRecordingExportHistory,
): string {
  return JSON.stringify(history);
}

export function markStudioRecordingExported(
  history: StudioRecordingExportHistory,
  key: string,
  entry: StudioRecordingExportHistoryEntry,
): StudioRecordingExportHistory {
  return {
    ...history,
    recordings: {
      ...history.recordings,
      [key]: entry,
    },
  };
}

function sanitizeExportHistoryEntry(
  value: unknown,
): StudioRecordingExportHistoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<StudioRecordingExportHistoryEntry>;
  const formats = Array.isArray(record.formats)
    ? record.formats.filter(
        (format): format is "timestamps" | "json" | "edl" =>
          format === "timestamps" || format === "json" || format === "edl",
      )
    : [];
  if (
    typeof record.exportedAt !== "string" ||
    typeof record.pulseSessionId !== "string" ||
    typeof record.pulseSessionTitle !== "string" ||
    typeof record.acceptedCount !== "number"
  ) {
    return null;
  }
  return {
    exportedAt: record.exportedAt,
    formats,
    acceptedCount: record.acceptedCount,
    pulseSessionId: record.pulseSessionId,
    pulseSessionTitle: record.pulseSessionTitle,
  };
}
