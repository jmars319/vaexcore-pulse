import { invoke } from "@tauri-apps/api/core";
import type {
  StudioDiscovery,
  StudioOutputReadiness,
  StudioRecordingCandidate,
} from "./studioIntegration";
import { isTauriRuntime } from "./tauriRuntime";

export type SuiteLaunchResult = {
  appName: string;
  ok: boolean;
  detail: string;
};

export type SuiteAppStatus = {
  appId: string;
  appName: string;
  launchName: string;
  bundleIdentifier: string;
  installed: boolean;
  running: boolean;
  reachable: boolean;
  stale: boolean;
  discoveryFile: string;
  pid: number | null;
  apiUrl: string | null;
  healthUrl: string | null;
  updatedAt: string | null;
  capabilities: string[];
  suiteSessionId: string | null;
  activity: string | null;
  activityDetail: string | null;
  localRuntime: SuiteLocalRuntime | null;
  detail: string;
};

export type SuiteLocalRuntime = {
  contractVersion: 1;
  mode: "local-first";
  state: "ready" | "degraded" | "blocked";
  appStorageDir: string;
  suiteDir: string;
  secureStorage: string;
  secretStorageState: string;
  durableStorage: string[];
  networkPolicy: "localhost-only";
  dependencies: SuiteLocalRuntimeDependency[];
};

export type SuiteLocalRuntimeDependency = {
  name: string;
  kind: string;
  state: string;
  detail: string;
};

export type SuiteSession = {
  schemaVersion: number;
  sessionId: string;
  title: string;
  status: string;
  ownerApp: string;
  createdAt: string;
  updatedAt: string;
};

export type SuiteTimelineEvent = {
  schemaVersion: number;
  eventId: string;
  sourceApp: string;
  sourceAppName: string;
  kind: string;
  title: string;
  detail: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type SuiteTimelineItem = {
  id: string;
  kind: "presence" | "recording" | "review" | "event";
  title: string;
  detail: string;
  timestamp: string;
  source: string;
};

export type PulseRecordingHandoff = {
  schemaVersion: number;
  requestId: string;
  sourceApp: string;
  sourceAppName: string;
  targetApp: string;
  requestedAt: string;
  recording: {
    sessionId: string;
    outputPath: string;
    profileId: string | null;
    profileName: string | null;
    captureMode?: string | null;
    captureDetail?: string | null;
    completionState?: StudioRecordingCandidate["completionState"];
    completionDetail?: string | null;
    verificationState?: StudioRecordingCandidate["verificationState"];
    verificationDetail?: string | null;
    fileSizeBytes?: number | null;
    durationMs?: number | null;
    processStatus?: string | null;
    stoppedAt: string;
  };
  outputReady?: StudioOutputReadiness | null;
};

export type SuiteCommand = {
  schemaVersion: number;
  commandId: string;
  sourceApp: string;
  sourceAppName: string;
  targetApp: string;
  command: string;
  requestedAt: string;
  payload: unknown;
};

export function isPulseRecordingHandoff(
  value: unknown,
): value is PulseRecordingHandoff {
  if (!value || typeof value !== "object") {
    return false;
  }
  const recording = (value as { recording?: unknown }).recording;
  if (!recording || typeof recording !== "object") {
    return false;
  }
  return typeof (recording as { outputPath?: unknown }).outputPath === "string";
}

export function formatSuiteLaunchFailure(results: SuiteLaunchResult[]): string {
  const appNames = results.map((result) => result.appName).join(", ");
  return `Could not launch ${appNames}. Install the app bundles in Applications, then try again.`;
}

export async function recordPulseTimelineEvent(input: {
  kind: string;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
}) {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invoke<void>("append_suite_timeline", { input });
  } catch {
    // Suite timeline writes are best-effort and should not interrupt review.
  }
}

export function buildSuiteTimeline(
  suiteStatus: SuiteAppStatus[],
  events: SuiteTimelineEvent[],
): SuiteTimelineItem[] {
  const persistedItems = events.map((event) => ({
    id: `event-${event.eventId}`,
    kind: suiteTimelineItemKind(event.kind),
    title: event.title,
    detail: event.detail,
    timestamp: event.createdAt,
    source: event.sourceAppName,
  }));
  const presenceItems = suiteStatus
    .filter((app) => app.updatedAt)
    .map((app) => ({
      id: `presence-${app.appId}-${app.updatedAt}`,
      kind: "presence" as const,
      title: app.activity ?? app.appName,
      detail: app.activityDetail ?? app.detail,
      timestamp: app.updatedAt ?? new Date().toISOString(),
      source: app.appName,
    }));

  return [...persistedItems, ...presenceItems]
    .sort(
      (left, right) =>
        suiteTimestampMs(right.timestamp) - suiteTimestampMs(left.timestamp),
    )
    .slice(0, 18);
}

function suiteTimelineItemKind(kind: string): SuiteTimelineItem["kind"] {
  if (kind.includes("recording")) return "recording";
  if (kind.includes("review") || kind.includes("pulse.session"))
    return "review";
  if (kind.includes("presence") || kind.includes("session")) return "presence";
  return "event";
}

function suiteTimestampMs(value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatSuiteTimestamp(value: string): string {
  const timestamp = suiteTimestampMs(value);
  if (!timestamp) return value;
  return new Date(timestamp).toLocaleTimeString();
}

export function suiteStatusTone(app: SuiteAppStatus): string {
  if (!app.installed) return "pending";
  if (!app.running) return "pending";
  if (app.stale || !app.reachable) return "in-progress";
  return "reviewed";
}

export function suiteStatusLabel(app: SuiteAppStatus): string {
  if (!app.installed) return "Missing";
  if (!app.running) return "Offline";
  if (app.stale) return "Stale";
  if (!app.reachable) return "Starting";
  return "Ready";
}

export function timelineTone(kind: SuiteTimelineItem["kind"]): string {
  if (kind === "presence") return "reviewed";
  if (kind === "recording") return "in-progress";
  if (kind === "review") return "active-session";
  return "pending";
}

export function studioPulseSourceEventId(
  sessionId: string,
  candidateId: string,
): string {
  return `vaexcore-pulse:session:${sessionId}:candidate:${candidateId}:accepted`;
}

export async function resolveStudioDiscovery(): Promise<StudioDiscovery> {
  if (isTauriRuntime()) {
    try {
      return await invoke<StudioDiscovery>("studio_api_discovery");
    } catch {
      // Fall through to the browser/dev defaults below.
    }
  }

  const apiUrl =
    import.meta.env.VITE_VAEXCORE_STUDIO_API_URL ?? "http://127.0.0.1:51287";
  const wsUrl =
    import.meta.env.VITE_VAEXCORE_STUDIO_WS_URL ??
    `${apiUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/events`;
  const token = import.meta.env.VITE_VAEXCORE_STUDIO_API_TOKEN ?? null;

  return {
    apiUrl,
    wsUrl,
    token,
    discovered: false,
    source: "default",
    detail: "Using the default Studio localhost URL.",
  };
}
