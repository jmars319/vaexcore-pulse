import type {
  StudioIntakeQueueItem,
  StudioIntakeQueueState,
  StudioRecordingCandidate,
} from "./studioTypes";

export function enqueueStudioRecording(
  queue: StudioIntakeQueueItem[],
  candidate: StudioRecordingCandidate | null,
  options: {
    source: StudioIntakeQueueItem["source"];
    requestId?: string | null;
    receivedAt?: string;
    consumedKeys?: Set<string>;
    exportedKeys?: Set<string>;
    dismissedKeys?: Set<string>;
    maxAgeHours?: number;
    maxItems?: number;
  },
): StudioIntakeQueueItem[] {
  if (!candidate) {
    return queue;
  }

  const receivedAt = options.receivedAt ?? new Date().toISOString();
  const requestId = options.requestId ?? null;
  const key = studioRecordingQueueKey(candidate);
  const duplicate = queue.some((item) => studioRecordingQueueKey(item) === key);
  const consumed = options.consumedKeys?.has(key) ?? false;
  const exported = options.exportedKeys?.has(key) ?? false;
  const dismissed = options.dismissedKeys?.has(key) ?? false;
  const stale = isStudioRecordingStale(
    candidate.stoppedAt,
    receivedAt,
    options.maxAgeHours ?? 24,
  );
  const state: StudioIntakeQueueState = exported
    ? "already-exported"
    : consumed
      ? "already-consumed"
      : dismissed
        ? "dismissed"
        : isStudioRecordingUnusable(candidate)
          ? "unusable"
          : duplicate
            ? "duplicate"
            : stale
              ? "stale"
              : "ready";
  const item: StudioIntakeQueueItem = {
    ...candidate,
    queueId: `${options.source}:${requestId ?? key}:${receivedAt}`,
    requestId,
    source: options.source,
    state,
    detail: studioIntakeQueueDetail(state, candidate),
    receivedAt,
  };

  return [item, ...queue].slice(0, options.maxItems ?? 8);
}

export function markStudioRecordingQueueItem(
  queue: StudioIntakeQueueItem[],
  queueId: string,
  state: StudioIntakeQueueState,
): StudioIntakeQueueItem[] {
  return queue.map((item) =>
    item.queueId === queueId
      ? { ...item, state, detail: studioIntakeQueueDetail(state, item) }
      : item,
  );
}

export function canImportStudioRecording(item: StudioIntakeQueueItem): boolean {
  return (
    !isStudioRecordingUnusable(item) &&
    item.state !== "already-consumed" &&
    item.state !== "already-exported" &&
    item.state !== "dismissed" &&
    item.state !== "malformed"
  );
}

export function studioRecordingImportBlockReason(
  item: StudioIntakeQueueItem,
): string | null {
  if (canImportStudioRecording(item)) {
    return null;
  }
  if (item.state === "already-consumed") {
    return "This recording is already imported into Pulse.";
  }
  if (item.state === "already-exported") {
    return "This recording already has exported review results.";
  }
  if (item.state === "dismissed") {
    return "Restore this recording before importing it.";
  }
  if (item.state === "malformed") {
    return "Pulse could not parse the Studio handoff.";
  }
  if (item.completionState === "failed") {
    return "Studio marked this recording as failed.";
  }
  if (item.verificationState === "missing") {
    return "The recording file is missing.";
  }
  if (item.verificationState === "empty") {
    return "The recording file is empty.";
  }
  if (item.verificationState === "unreadable") {
    return "The recording file could not be read.";
  }
  return item.detail;
}

export function studioRecordingWarning(
  item: StudioIntakeQueueItem,
): string | null {
  if (item.verificationState === "basic_verified") {
    return "Only basic file verification is available; import is allowed.";
  }
  if (!item.completionState || !item.verificationState) {
    return "Legacy Studio handoff has limited recording metadata.";
  }
  return null;
}

export function isStudioRecordingUnusable(
  candidate: StudioRecordingCandidate,
): boolean {
  return (
    candidate.completionState === "failed" ||
    candidate.verificationState === "missing" ||
    candidate.verificationState === "empty" ||
    candidate.verificationState === "unreadable"
  );
}

export function studioRecordingQueueKey(
  candidate: Pick<StudioRecordingCandidate, "sessionId" | "outputPath">,
): string {
  const sessionId = candidate.sessionId.trim();
  return sessionId && sessionId !== "unknown"
    ? `session:${sessionId}`
    : `path:${candidate.outputPath.trim()}`;
}

function isStudioRecordingStale(
  stoppedAt: string,
  receivedAt: string,
  maxAgeHours: number,
): boolean {
  const stopped = Date.parse(stoppedAt);
  const received = Date.parse(receivedAt);
  if (!Number.isFinite(stopped) || !Number.isFinite(received)) {
    return true;
  }
  return received - stopped > maxAgeHours * 60 * 60 * 1000;
}

function studioIntakeQueueDetail(
  state: StudioIntakeQueueState,
  candidate: StudioRecordingCandidate,
): string {
  const name = candidate.profileName
    ? `${candidate.profileName} recording`
    : "Studio recording";
  switch (state) {
    case "ready":
      return `${name} is ready for manual import.`;
    case "stale":
      return `${name} is older than the intake window.`;
    case "malformed":
      return "Studio handoff could not be parsed.";
    case "unusable":
      return `${name} needs attention before Pulse can import it.`;
    case "duplicate":
      return `${name} is already in the intake queue.`;
    case "already-consumed":
      return `${name} was already imported into Pulse.`;
    case "already-exported":
      return `${name} already has exported review results.`;
    case "dismissed":
      return `${name} is hidden from the active intake queue.`;
  }
}
