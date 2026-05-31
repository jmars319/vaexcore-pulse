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
  completionState?: StudioRecordingCompletionState | null;
  completionDetail?: string | null;
  verificationState?: StudioRecordingVerificationState | null;
  verificationDetail?: string | null;
  fileSizeBytes?: number | null;
  durationMs?: number | null;
  processStatus?: string | null;
  stoppedAt: string;
  outputReadiness?: StudioOutputReadiness | null;
};

export type StudioRecordingCompletionState =
  | "completed"
  | "failed"
  | "partial"
  | "skipped"
  | "unknown";

export type StudioRecordingVerificationState =
  | "verified"
  | "basic_verified"
  | "missing"
  | "empty"
  | "unreadable"
  | "skipped";

export type StudioIntakeQueueState =
  | "ready"
  | "stale"
  | "malformed"
  | "unusable"
  | "duplicate"
  | "already-consumed"
  | "already-exported"
  | "dismissed";

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

export type StudioIntakePersistenceBucket =
  | "consumed"
  | "exported"
  | "dismissed";

export type StudioIntakePersistence = {
  schemaVersion: 1;
  consumed: Record<string, string>;
  exported: Record<string, string>;
  dismissed: Record<string, string>;
};

export const STUDIO_INTAKE_STORAGE_KEY = "vaexcore:pulse:studio-intake:v1";
export const STUDIO_EXPORT_HISTORY_STORAGE_KEY =
  "vaexcore:pulse:studio-export-history:v1";

export type StudioRecordingExportHistoryEntry = {
  exportedAt: string;
  formats: Array<"timestamps" | "json" | "edl">;
  acceptedCount: number;
  pulseSessionId: string;
  pulseSessionTitle: string;
};

export type StudioRecordingExportHistory = {
  schemaVersion: 1;
  recordings: Record<string, StudioRecordingExportHistoryEntry>;
};

export type StudioRecentRecordingsSnapshot = {
  recordings?: unknown;
};

export type StudioApiEnvelope = {
  ok?: unknown;
  data?: unknown;
  error?: unknown;
};
