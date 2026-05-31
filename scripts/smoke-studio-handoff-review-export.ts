import assert from "node:assert/strict";
import {
  canImportStudioRecording,
  enqueueStudioRecording,
  markStudioRecordingExported,
  markStudioIntakePersistence,
  parseStudioExportHistory,
  parseStudioIntakePersistence,
  restoreStudioIntakePersistence,
  serializeStudioExportHistory,
  serializeStudioIntakePersistence,
  studioIntakePersistenceSets,
  studioRecordingImportBlockReason,
  studioRecordingFromHistoryEntry,
  studioRecordingFromMessage,
  studioRecordingQueueKey,
  studioRecordingWarning,
} from "../apps/desktopapp/src/lib/studioIntegration.ts";
import {
  classifyHandoffFixture,
  generatedAt,
  loadHandoffFixture,
} from "./smoke-support/studioHandoffFixtures.ts";
import { assertReviewExports } from "./smoke-support/studioReviewExportAssertions.ts";

const validHandoff = loadHandoffFixture(process.argv);

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
assert.equal(intakeQueue[0]?.captureMode, validHandoff.recording.captureMode);
assert.equal(
  intakeQueue[0]?.completionState,
  validHandoff.recording.completionState,
);
assert.equal(
  intakeQueue[0]?.verificationState,
  validHandoff.recording.verificationState,
);
assert.equal(canImportStudioRecording(intakeQueue[0]), true);
assert.equal(studioRecordingWarning(intakeQueue[0]), null);
assert.equal(
  enqueueStudioRecording(intakeQueue, historyRecording, {
    source: "history",
    receivedAt: generatedAt,
  })[0]?.state,
  "duplicate",
);
const staleQueueReceivedAt = new Date(
  new Date(validHandoff.recording.stoppedAt).getTime() + 25 * 60 * 60 * 1000,
).toISOString();
assert.equal(
  enqueueStudioRecording([], historyRecording, {
    source: "handoff",
    requestId: validHandoff.requestId,
    receivedAt: staleQueueReceivedAt,
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
assert.equal(
  studioRecordingImportBlockReason(unusableQueue[0]),
  "Studio marked this recording as failed.",
);

const basicVerifiedQueue = enqueueStudioRecording(
  [],
  {
    ...historyRecording!,
    verificationState: "basic_verified",
    verificationDetail: "File exists and has bytes; ffprobe is unavailable.",
  },
  {
    source: "history",
    receivedAt: generatedAt,
  },
);
assert.equal(canImportStudioRecording(basicVerifiedQueue[0]), true);
assert.match(studioRecordingWarning(basicVerifiedQueue[0]) ?? "", /basic/i);

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

const exportHistory = markStudioRecordingExported(
  parseStudioExportHistory(null),
  persistenceKey,
  {
    exportedAt: generatedAt,
    formats: ["timestamps", "json", "edl"],
    acceptedCount: 1,
    pulseSessionId: "session_studio_handoff_smoke",
    pulseSessionTitle: "Studio Source-Aware Recording Review",
  },
);
assert.deepEqual(
  parseStudioExportHistory(serializeStudioExportHistory(exportHistory)),
  exportHistory,
);
assert.equal(exportHistory.recordings[persistenceKey]?.acceptedCount, 1);

assertReviewExports({ generatedAt, validHandoff });

console.log("pulse studio handoff review export smoke passed");
