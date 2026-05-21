import { isSupportedInput } from "@vaexcore/pulse-media";

export type StudioConnectionState = "checking" | "connected" | "unavailable";

export type StudioDiscovery = {
  apiUrl: string;
  wsUrl: string;
  token: string | null;
  discovered: boolean;
  source: string;
  detail: string;
};

export type StudioRecordingCandidate = {
  sessionId: string;
  outputPath: string;
  profileId: string | null;
  profileName?: string | null;
  captureMode?: string | null;
  captureDetail?: string | null;
  stoppedAt: string;
  outputReadiness?: StudioOutputReadiness | null;
};

export type StudioIntakeQueueState =
  | "ready"
  | "stale"
  | "malformed"
  | "duplicate"
  | "already-consumed"
  | "already-exported";

export type StudioIntakeQueueItem = StudioRecordingCandidate & {
  queueId: string;
  requestId: string | null;
  source: "history" | "event" | "handoff";
  state: StudioIntakeQueueState;
  detail: string;
  receivedAt: string;
};

export type StudioOutputReadiness = {
  ready: boolean;
  state: "ready" | "degraded" | "blocked" | "not_applicable" | string;
  detail: string;
  activeSceneId?: string | null;
  activeSceneName?: string | null;
  programPreviewFrameReady?: boolean | null;
  compositorRenderPlanReady?: boolean | null;
  outputPreflightReady?: boolean | null;
  mediaPipelineReady?: boolean | null;
  blockers: string[];
  warnings: string[];
};

export type StudioIntakeState = {
  connection: StudioConnectionState;
  detail: string;
  apiUrl: string | null;
  latestRecording: StudioRecordingCandidate | null;
  recordings: StudioIntakeQueueItem[];
};

type StudioRecentRecordingsSnapshot = {
  recordings?: unknown;
};

type StudioApiEnvelope = {
  ok?: unknown;
  data?: unknown;
  error?: unknown;
};

export function studioRequestHeaders(discovery: StudioDiscovery): HeadersInit {
  const headers: Record<string, string> = {
    "x-vaexcore-client-id": "vaexcore-pulse",
    "x-vaexcore-client-name": "vaexcore pulse",
  };

  if (discovery.token) {
    headers["x-vaexcore-token"] = discovery.token;
  }

  return headers;
}

export function studioEventSocketUrl(discovery: StudioDiscovery): string {
  const url = new URL(discovery.wsUrl);
  url.searchParams.set("client_id", "vaexcore-pulse-events");
  url.searchParams.set("client_name", "vaexcore pulse events");
  url.searchParams.set("limit", "25");
  if (discovery.token) {
    url.searchParams.set("token", discovery.token);
  }
  return url.toString();
}

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
    stoppedAt:
      typeof record.stopped_at === "string"
        ? record.stopped_at
        : new Date().toISOString(),
    outputReadiness: parseStudioOutputReadiness(
      record.output_readiness ?? record.outputReady,
    ),
  };
}

export async function fetchLatestStudioRecording(
  discovery: StudioDiscovery,
  fetchImpl: typeof fetch = fetch,
): Promise<StudioRecordingCandidate | null> {
  const response = await fetchImpl(`${discovery.apiUrl}/recordings/recent`, {
    headers: studioRequestHeaders(discovery),
  });
  const body = (await response.json()) as StudioApiEnvelope;

  if (!response.ok || body.ok !== true) {
    return null;
  }

  const snapshot =
    body.data && typeof body.data === "object"
      ? (body.data as StudioRecentRecordingsSnapshot)
      : {};
  const recordings = Array.isArray(snapshot.recordings)
    ? snapshot.recordings
    : [];

  for (const recording of recordings) {
    const candidate = studioRecordingFromHistoryEntry(recording);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

export function enqueueStudioRecording(
  queue: StudioIntakeQueueItem[],
  candidate: StudioRecordingCandidate | null,
  options: {
    source: StudioIntakeQueueItem["source"];
    requestId?: string | null;
    receivedAt?: string;
    consumedKeys?: Set<string>;
    exportedKeys?: Set<string>;
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
  const stale = isStudioRecordingStale(
    candidate.stoppedAt,
    receivedAt,
    options.maxAgeHours ?? 24,
  );
  const state: StudioIntakeQueueState = exported
    ? "already-exported"
    : consumed
      ? "already-consumed"
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
  state: Extract<
    StudioIntakeQueueState,
    "already-consumed" | "already-exported"
  >,
): StudioIntakeQueueItem[] {
  return queue.map((item) =>
    item.queueId === queueId
      ? { ...item, state, detail: studioIntakeQueueDetail(state, item) }
      : item,
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
    case "duplicate":
      return `${name} is already in the intake queue.`;
    case "already-consumed":
      return `${name} was already imported into Pulse.`;
    case "already-exported":
      return `${name} already has exported review results.`;
  }
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
