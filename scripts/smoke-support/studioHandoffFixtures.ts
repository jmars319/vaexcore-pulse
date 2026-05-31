import { readFileSync } from "node:fs";

export const generatedAt = "2026-05-21T03:20:00.000Z";

export type HandoffFixtureState =
  | "ready"
  | "stale"
  | "malformed"
  | "duplicate"
  | "already-consumed"
  | "already-exported";

export type HandoffClassification = {
  state: HandoffFixtureState;
  requestId: string | null;
  detail: string;
};

export function loadHandoffFixture(argv: string[]) {
  const handoffFileIndex = argv.indexOf("--handoff");
  const externalHandoff =
    handoffFileIndex >= 0 && argv[handoffFileIndex + 1]
      ? JSON.parse(readFileSync(argv[handoffFileIndex + 1], "utf8"))
      : null;

  return (
    externalHandoff ?? {
      schemaVersion: 1,
      requestId: "studio-handoff-smoke-001",
      sourceApp: "vaexcore-studio",
      sourceAppName: "vaexcore studio",
      targetApp: "vaexcore-pulse",
      requestedAt: generatedAt,
      recording: {
        sessionId: "rec_source_aware_smoke",
        outputPath: "/tmp/vaexcore/studio/source-aware-smoke.mkv",
        profileId: "profile_1080p",
        profileName: "1080p Local",
        captureMode: "display",
        captureDetail: "Main Display recorded as a source-backed display.",
        completionState: "completed",
        completionDetail:
          "FFmpeg stopped after a quit signal. Output passed recording verification.",
        verificationState: "verified",
        verificationDetail:
          "Recording file exists, is non-empty, and ffprobe metadata was read.",
        fileSizeBytes: 360093,
        durationMs: 2125,
        processStatus: "exit status: 0",
        stoppedAt: generatedAt,
      },
      outputReady: {
        ready: true,
        state: "ready",
        detail: "Source-backed local recording available.",
        activeSceneId: "scene_main",
        activeSceneName: "Main",
        programPreviewFrameReady: true,
        compositorRenderPlanReady: true,
        outputPreflightReady: true,
        mediaPipelineReady: true,
        blockers: [],
        warnings: [],
      },
    }
  );
}

export function classifyHandoffFixture(
  rawFixture: string,
  options: {
    seenRequestIds: Set<string>;
    consumedRequestIds: Set<string>;
    exportedRequestIds: Set<string>;
    generatedAt: string;
  },
): HandoffClassification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawFixture);
  } catch {
    return {
      state: "malformed",
      requestId: null,
      detail: "Studio handoff fixture is not valid JSON.",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      state: "malformed",
      requestId: null,
      detail: "Studio handoff fixture must be an object.",
    };
  }

  const record = parsed as Record<string, unknown>;
  const requestId =
    typeof record.requestId === "string" ? record.requestId.trim() : "";
  const requestedAt =
    typeof record.requestedAt === "string" ? record.requestedAt : "";
  const recording =
    record.recording && typeof record.recording === "object"
      ? (record.recording as Record<string, unknown>)
      : null;
  const outputPath =
    recording && typeof recording.outputPath === "string"
      ? recording.outputPath.trim()
      : "";

  if (
    record.schemaVersion !== 1 ||
    record.sourceApp !== "vaexcore-studio" ||
    record.targetApp !== "vaexcore-pulse" ||
    !requestId ||
    !requestedAt ||
    !outputPath
  ) {
    return {
      state: "malformed",
      requestId: requestId || null,
      detail: "Studio handoff fixture is missing required fields.",
    };
  }

  if (options.consumedRequestIds.has(requestId)) {
    return {
      state: "already-consumed",
      requestId,
      detail: "Studio handoff was already consumed by Pulse.",
    };
  }

  if (options.exportedRequestIds.has(requestId)) {
    return {
      state: "already-exported",
      requestId,
      detail: "Studio handoff review was already exported.",
    };
  }

  if (options.seenRequestIds.has(requestId)) {
    return {
      state: "duplicate",
      requestId,
      detail: "Studio handoff was already queued for review.",
    };
  }

  const ageMs =
    new Date(options.generatedAt).getTime() - new Date(requestedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > 60 * 60 * 1000) {
    return {
      state: "stale",
      requestId,
      detail: "Studio handoff is too old for automatic intake.",
    };
  }

  options.seenRequestIds.add(requestId);
  return {
    state: "ready",
    requestId,
    detail: "Studio recording handoff is ready for review.",
  };
}
