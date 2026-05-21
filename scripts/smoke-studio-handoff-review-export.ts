import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { makeReviewDecision } from "@vaexcore/pulse-domain";
import {
  toEdlExport,
  toJsonCandidateExport,
  toTimestampExport,
} from "@vaexcore/pulse-export";
import { projectSessionSchema } from "@vaexcore/pulse-shared-types";
import { createMockProjectSession } from "@vaexcore/pulse-shared-types/testing";
import {
  canImportStudioRecording,
  enqueueStudioRecording,
  markStudioIntakePersistence,
  parseStudioIntakePersistence,
  restoreStudioIntakePersistence,
  serializeStudioIntakePersistence,
  studioIntakePersistenceSets,
  studioRecordingFromHistoryEntry,
  studioRecordingFromMessage,
  studioRecordingQueueKey,
} from "../apps/desktopapp/src/lib/studioIntegration.ts";

const generatedAt = "2026-05-21T03:20:00.000Z";
const handoffFileIndex = process.argv.indexOf("--handoff");
const externalHandoff =
  handoffFileIndex >= 0 && process.argv[handoffFileIndex + 1]
    ? JSON.parse(readFileSync(process.argv[handoffFileIndex + 1], "utf8"))
    : null;
const validHandoff = externalHandoff ?? {
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
};

type HandoffFixtureState =
  | "ready"
  | "stale"
  | "malformed"
  | "duplicate"
  | "already-consumed"
  | "already-exported";

type HandoffClassification = {
  state: HandoffFixtureState;
  requestId: string | null;
  detail: string;
};

const seenRequestIds = new Set<string>();
const consumedRequestIds = new Set<string>(["studio-handoff-smoke-consumed"]);
const exportedRequestIds = new Set<string>(["studio-handoff-smoke-exported"]);

assert.deepEqual(
  classifyHandoffFixture(JSON.stringify(validHandoff), {
    seenRequestIds,
    consumedRequestIds,
    exportedRequestIds,
    generatedAt,
  }),
  {
    state: "ready",
    requestId: validHandoff.requestId,
    detail: "Studio recording handoff is ready for review.",
  },
);

assert.equal(
  classifyHandoffFixture(JSON.stringify(validHandoff), {
    seenRequestIds,
    consumedRequestIds,
    exportedRequestIds,
    generatedAt,
  }).state,
  "duplicate",
);

assert.equal(
  classifyHandoffFixture(
    JSON.stringify({
      ...validHandoff,
      requestId: "studio-handoff-smoke-stale",
      requestedAt: "2026-05-20T02:40:00.000Z",
    }),
    {
      seenRequestIds,
      consumedRequestIds,
      exportedRequestIds,
      generatedAt,
    },
  ).state,
  "stale",
);

assert.equal(
  classifyHandoffFixture("{bad-json", {
    seenRequestIds,
    consumedRequestIds,
    exportedRequestIds,
    generatedAt,
  }).state,
  "malformed",
);

assert.equal(
  classifyHandoffFixture(
    JSON.stringify({
      ...validHandoff,
      requestId: "studio-handoff-smoke-consumed",
    }),
    {
      seenRequestIds,
      consumedRequestIds,
      exportedRequestIds,
      generatedAt,
    },
  ).state,
  "already-consumed",
);

assert.equal(
  classifyHandoffFixture(
    JSON.stringify({
      ...validHandoff,
      requestId: "studio-handoff-smoke-exported",
    }),
    {
      seenRequestIds,
      consumedRequestIds,
      exportedRequestIds,
      generatedAt,
    },
  ).state,
  "already-exported",
);

const studioRecording = studioRecordingFromMessage(
  JSON.stringify({
    type: "recording.stopped",
    timestamp: validHandoff.recording.stoppedAt,
    payload: {
      session_id: validHandoff.recording.sessionId,
      output_path: validHandoff.recording.outputPath,
      profile_id: validHandoff.recording.profileId,
      profile_name: validHandoff.recording.profileName,
      capture_mode: validHandoff.recording.captureMode,
      capture_detail: validHandoff.recording.captureDetail,
      completion_state: validHandoff.recording.completionState,
      completion_detail: validHandoff.recording.completionDetail,
      verification_state: validHandoff.recording.verificationState,
      verification_detail: validHandoff.recording.verificationDetail,
      file_size_bytes: validHandoff.recording.fileSizeBytes,
      duration_ms: validHandoff.recording.durationMs,
      process_status: validHandoff.recording.processStatus,
    },
  }),
);
assert.equal(studioRecording?.sessionId, validHandoff.recording.sessionId);
assert.equal(studioRecording?.outputPath, validHandoff.recording.outputPath);
assert.equal(studioRecording?.profileId, validHandoff.recording.profileId);
assert.equal(
  studioRecording?.captureDetail,
  validHandoff.recording.captureDetail,
);
assert.equal(studioRecording?.verificationState, "verified");

const historyRecording = studioRecordingFromHistoryEntry({
  session_id: validHandoff.recording.sessionId,
  output_path: validHandoff.recording.outputPath,
  profile_id: validHandoff.recording.profileId,
  profile_name: validHandoff.recording.profileName,
  capture_mode: validHandoff.recording.captureMode,
  capture_detail: validHandoff.recording.captureDetail,
  completion_state: validHandoff.recording.completionState,
  completion_detail: validHandoff.recording.completionDetail,
  verification_state: validHandoff.recording.verificationState,
  verification_detail: validHandoff.recording.verificationDetail,
  file_size_bytes: validHandoff.recording.fileSizeBytes,
  duration_ms: validHandoff.recording.durationMs,
  process_status: validHandoff.recording.processStatus,
  stopped_at: validHandoff.recording.stoppedAt,
  output_readiness: validHandoff.outputReady,
});
assert.equal(
  historyRecording?.outputReadiness?.detail,
  validHandoff.outputReady.detail,
);

const intakeQueue = enqueueStudioRecording([], historyRecording, {
  source: "history",
  receivedAt: generatedAt,
});
assert.equal(intakeQueue[0]?.state, "ready");
assert.equal(intakeQueue[0]?.captureMode, "display");
assert.equal(intakeQueue[0]?.completionState, "completed");
assert.equal(intakeQueue[0]?.verificationState, "verified");
assert.equal(canImportStudioRecording(intakeQueue[0]), true);
assert.equal(
  enqueueStudioRecording(intakeQueue, historyRecording, {
    source: "history",
    receivedAt: generatedAt,
  })[0]?.state,
  "duplicate",
);
assert.equal(
  enqueueStudioRecording([], historyRecording, {
    source: "handoff",
    requestId: validHandoff.requestId,
    receivedAt: "2026-05-22T04:00:00.000Z",
  })[0]?.state,
  "stale",
);

const unusableRecording = studioRecordingFromHistoryEntry({
  ...validHandoff.recording,
  outputPath: validHandoff.recording.outputPath,
  output_path: validHandoff.recording.outputPath,
  session_id: "rec_unusable",
  profile_id: validHandoff.recording.profileId,
  profile_name: validHandoff.recording.profileName,
  verification_state: "missing",
  completion_state: "failed",
  stopped_at: validHandoff.recording.stoppedAt,
});
const unusableQueue = enqueueStudioRecording([], unusableRecording, {
  source: "history",
  receivedAt: generatedAt,
});
assert.equal(unusableQueue[0]?.state, "unusable");
assert.equal(canImportStudioRecording(unusableQueue[0]), false);

const persistenceKey = studioRecordingQueueKey(historyRecording);
let persistence = parseStudioIntakePersistence(null);
persistence = markStudioIntakePersistence(
  persistence,
  "dismissed",
  persistenceKey,
  generatedAt,
);
const restoredPersistence = restoreStudioIntakePersistence(
  persistence,
  persistenceKey,
);
assert.equal(
  studioIntakePersistenceSets(persistence).dismissedKeys.has(persistenceKey),
  true,
);
assert.equal(
  studioIntakePersistenceSets(restoredPersistence).dismissedKeys.has(
    persistenceKey,
  ),
  false,
);
assert.deepEqual(
  parseStudioIntakePersistence(serializeStudioIntakePersistence(persistence)),
  persistence,
);

const baseSession = createMockProjectSession();
const acceptedDecision = makeReviewDecision(
  "session_studio_handoff_smoke",
  "candidate_001",
  "ACCEPT",
  {
    id: "decision_accept_studio_handoff",
    createdAt: generatedAt,
    label: "Studio accepted opening moment",
    adjustedSegment: {
      startSeconds: 320,
      endSeconds: 342,
    },
  },
);
const rejectedDecision = makeReviewDecision(
  "session_studio_handoff_smoke",
  "candidate_002",
  "REJECT",
  {
    id: "decision_reject_studio_handoff",
    createdAt: generatedAt,
    notes: "Not enough payoff for this rehearsal.",
  },
);

const reviewSession = projectSessionSchema.parse({
  ...baseSession,
  id: "session_studio_handoff_smoke",
  title: "Studio Source-Aware Recording Review",
  mediaSource: {
    ...baseSession.mediaSource,
    id: "media_studio_handoff_smoke",
    path: validHandoff.recording.outputPath,
    fileName: basename(validHandoff.recording.outputPath),
    format: extname(validHandoff.recording.outputPath).replace(".", ""),
    ingestNotes: [
      "Studio recording handoff fixture consumed by Pulse.",
      "Real AI/STT quality is out of scope for this rehearsal.",
    ],
  },
  reviewDecisions: [acceptedDecision, rejectedDecision],
  createdAt: generatedAt,
  updatedAt: generatedAt,
});

const timestampExport = toTimestampExport(
  reviewSession.candidates,
  reviewSession.reviewDecisions,
);
assert.match(
  timestampExport,
  /00:05:20 - 00:05:42  Studio accepted opening moment/,
);
assert.doesNotMatch(timestampExport, /candidate_002|Not enough payoff/);

const jsonExport = JSON.parse(
  toJsonCandidateExport(
    reviewSession.mediaSource,
    reviewSession.candidates,
    reviewSession.reviewDecisions,
  ),
) as {
  mediaSource: { path: string };
  acceptedMoments: Array<{
    candidateId: string;
    label: string;
    reviewDecisionId: string;
  }>;
};
assert.equal(jsonExport.mediaSource.path, validHandoff.recording.outputPath);
assert.equal(jsonExport.acceptedMoments.length, 1);
assert.equal(jsonExport.acceptedMoments[0]?.candidateId, "candidate_001");
assert.equal(
  jsonExport.acceptedMoments[0]?.reviewDecisionId,
  "decision_accept_studio_handoff",
);

const edlExport = toEdlExport(
  reviewSession.mediaSource,
  reviewSession.candidates,
  reviewSession.reviewDecisions,
);
assert.match(
  edlExport,
  new RegExp(
    `TITLE: vaexcore pulse - ${escapeRegExp(basename(validHandoff.recording.outputPath))}`,
  ),
);
assert.match(edlExport, /\* COMMENT: Studio accepted opening moment/);
assert.doesNotMatch(edlExport, /\* NO ACCEPTED MOMENTS/);
assert.doesNotMatch(edlExport, /candidate_002|Not enough payoff/);

const alreadyExportedCandidateIds = new Set(["candidate_001"]);
const acceptedDecisionIds = reviewSession.reviewDecisions
  .filter((decision) => decision.action === "ACCEPT")
  .map((decision) => decision.candidateId);
assert.deepEqual(acceptedDecisionIds, ["candidate_001"]);
assert.deepEqual(
  acceptedDecisionIds.filter((candidateId) =>
    alreadyExportedCandidateIds.has(candidateId),
  ),
  ["candidate_001"],
);
assert.deepEqual(
  acceptedDecisionIds.filter(
    (candidateId) => !alreadyExportedCandidateIds.has(candidateId),
  ),
  [],
);

console.log("pulse studio handoff review export smoke passed");

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classifyHandoffFixture(
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
