import type {
  CandidateWindow,
  ProjectSession,
} from "@vaexcore/pulse-shared-types";

export type ReviewQueueMode = "ONLY_PENDING" | "ALL";

export type ReviewQueueStateSummary = {
  mode: ReviewQueueMode;
  totalCount: number;
  pendingCount: number;
  reviewedCount: number;
  visibleCount: number;
  hiddenReviewedCount: number;
  state: "pending" | "complete";
  detail: string;
};

export function isCandidatePending(
  session: Pick<ProjectSession, "reviewDecisions">,
  candidateId: string,
): boolean {
  const latestDecision = session.reviewDecisions.find(
    (decision) => decision.candidateId === candidateId,
  );
  return (
    latestDecision?.action !== "ACCEPT" && latestDecision?.action !== "REJECT"
  );
}

export function defaultReviewQueueMode(
  session: Pick<ProjectSession, "candidates" | "reviewDecisions">,
): ReviewQueueMode {
  const pendingCount = session.candidates.filter((candidate) =>
    isCandidatePending(session, candidate.id),
  ).length;

  return pendingCount === 0 ? "ALL" : "ONLY_PENDING";
}

export function filterCandidatesByReviewMode(
  candidates: CandidateWindow[],
  session: Pick<ProjectSession, "reviewDecisions">,
  reviewQueueMode: ReviewQueueMode,
): CandidateWindow[] {
  if (reviewQueueMode === "ALL") {
    return candidates;
  }

  return candidates.filter((candidate) =>
    isCandidatePending(session, candidate.id),
  );
}

export function summarizeReviewQueueState(
  session: Pick<ProjectSession, "candidates" | "reviewDecisions">,
  reviewQueueMode: ReviewQueueMode,
): ReviewQueueStateSummary {
  const pendingCount = session.candidates.filter((candidate) =>
    isCandidatePending(session, candidate.id),
  ).length;
  const totalCount = session.candidates.length;
  const reviewedCount = Math.max(totalCount - pendingCount, 0);
  const visibleCount = reviewQueueMode === "ALL" ? totalCount : pendingCount;
  const hiddenReviewedCount =
    reviewQueueMode === "ONLY_PENDING" ? reviewedCount : 0;
  const pendingMomentCopy =
    pendingCount === 1
      ? "1 undecided moment remains"
      : `${pendingCount} undecided moments remain`;
  const reviewedMomentCopy =
    reviewedCount === 1
      ? "1 already decided"
      : `${reviewedCount} already decided`;
  const completedMomentCopy =
    totalCount === 1
      ? "1 reviewed moment is available"
      : `${totalCount} reviewed moments are available`;

  return {
    mode: reviewQueueMode,
    totalCount,
    pendingCount,
    reviewedCount,
    visibleCount,
    hiddenReviewedCount,
    state: pendingCount === 0 ? "complete" : "pending",
    detail:
      pendingCount === 0
        ? `${completedMomentCopy} for final export.`
        : `${pendingMomentCopy}; ${reviewedMomentCopy}.`,
  };
}
