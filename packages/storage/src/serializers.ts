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
      pendingCount: Math.max(
        session.candidates.length - acceptedCount - rejectedCount,
        0,
      ),
    }),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
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
