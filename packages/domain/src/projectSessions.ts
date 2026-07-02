import type {
  CandidateWindow,
  ProjectSession,
  ProjectSessionSummary,
  TranscriptChunk,
} from "@vaexcore/pulse-shared-types";
import { isCandidatePending } from "./reviewQueue";

export type CandidateTranscriptContext = {
  before: TranscriptChunk[];
  inside: TranscriptChunk[];
  after: TranscriptChunk[];
};

export function buildCandidateTranscriptContext(
  transcript: TranscriptChunk[],
  candidate: CandidateWindow,
  options: {
    sideCount?: number;
  } = {},
): CandidateTranscriptContext {
  const sideCount = options.sideCount ?? 2;
  const sortedTranscript = [...transcript].sort(
    (left, right) => left.startSeconds - right.startSeconds,
  );
  const before = sortedTranscript
    .filter(
      (chunk) => chunk.endSeconds <= candidate.candidateWindow.startSeconds,
    )
    .slice(-sideCount);
  const inside = sortedTranscript.filter(
    (chunk) =>
      chunk.startSeconds < candidate.candidateWindow.endSeconds &&
      chunk.endSeconds > candidate.candidateWindow.startSeconds,
  );
  const after = sortedTranscript
    .filter(
      (chunk) => chunk.startSeconds >= candidate.candidateWindow.endSeconds,
    )
    .slice(0, sideCount);

  return {
    before,
    inside,
    after,
  };
}

export function buildProjectSummary(
  session: ProjectSession,
): ProjectSessionSummary {
  const acceptedCount = session.reviewDecisions.filter(
    (decision) => decision.action === "ACCEPT",
  ).length;
  const rejectedCount = session.reviewDecisions.filter(
    (decision) => decision.action === "REJECT",
  ).length;
  const deferredCount = session.reviewDecisions.filter(
    (decision) => decision.action === "DEFER",
  ).length;
  const pendingCount = session.candidates.filter((candidate) =>
    isCandidatePending(session, candidate.id),
  ).length;

  return {
    sessionId: session.id,
    sessionTitle: session.title,
    sourcePath: session.mediaSource.path,
    sourceName: session.mediaSource.fileName,
    status: session.status,
    analysisCoverage: session.analysisCoverage,
    profileId: session.profileId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    candidateCount: session.candidates.length,
    acceptedCount,
    rejectedCount,
    deferredCount,
    pendingCount,
  };
}

export function reviewedCandidateCount(summary: ProjectSessionSummary): number {
  return (
    summary.acceptedCount + summary.rejectedCount + (summary.deferredCount ?? 0)
  );
}

export function deriveSessionReviewState(
  summary: ProjectSessionSummary,
): "PENDING" | "IN_PROGRESS" | "REVIEWED" {
  const reviewedCount = reviewedCandidateCount(summary);
  if (reviewedCount === 0) {
    return "PENDING";
  }

  if (summary.pendingCount === 0) {
    return "REVIEWED";
  }

  return "IN_PROGRESS";
}

export function findNextPendingSessionSummary(
  summaries: ProjectSessionSummary[],
  options: {
    excludeSessionIds?: string[];
    preferInProgress?: boolean;
  } = {},
): ProjectSessionSummary | null {
  const excludedSessionIds = new Set(options.excludeSessionIds ?? []);
  const pendingSummaries = summaries.filter(
    (summary) =>
      summary.pendingCount > 0 && !excludedSessionIds.has(summary.sessionId),
  );

  if (pendingSummaries.length === 0) {
    return null;
  }

  if (options.preferInProgress !== false) {
    const inProgressSummary = pendingSummaries.find(
      (summary) => deriveSessionReviewState(summary) === "IN_PROGRESS",
    );
    if (inProgressSummary) {
      return inProgressSummary;
    }
  }

  return pendingSummaries[0];
}
