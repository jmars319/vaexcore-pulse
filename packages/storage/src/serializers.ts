import type {
  ProjectSession,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";

export interface SessionStorageAdapter {
  saveSession(session: ProjectSession): Promise<void>;
  saveReviewDecision(decision: ReviewDecision): Promise<void>;
}

export function serializeSessionSnapshot(
  session: ProjectSession,
): Record<string, string> {
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
    isPendingReviewAction(
      session.reviewDecisions.find(
        (decision) => decision.candidateId === candidate.id,
      )?.action,
    ),
  ).length;

  return {
    id: session.id,
    title: session.title,
    mediaPath: session.mediaSource.path,
    profileId: session.profileId,
    settingsJson: JSON.stringify(session.settings),
    summaryJson: JSON.stringify({
      status: session.status,
      analysisCoverage: session.analysisCoverage,
      candidateCount: session.candidates.length,
      acceptedCount,
      rejectedCount,
      deferredCount,
      pendingCount,
    }),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function isPendingReviewAction(action: ReviewDecision["action"] | undefined) {
  return action !== "ACCEPT" && action !== "REJECT" && action !== "DEFER";
}

export function serializeReviewDecision(
  decision: ReviewDecision,
): Record<string, string | null> {
  return {
    id: decision.id,
    projectSessionId: decision.projectSessionId,
    candidateId: decision.candidateId,
    action: decision.action,
    label: decision.label ?? null,
    adjustedSegmentJson: decision.adjustedSegment
      ? JSON.stringify(decision.adjustedSegment)
      : null,
    notes: decision.notes ?? null,
    createdAt: decision.createdAt,
  };
}
