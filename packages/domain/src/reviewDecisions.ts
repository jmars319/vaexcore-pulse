import type {
  CandidateDecisionMap,
  CandidateWindow,
  ReviewAction,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";

export function acceptedCandidates(
  candidates: CandidateWindow[],
  decisionsByCandidateId: CandidateDecisionMap,
): CandidateWindow[] {
  return candidates.filter(
    (candidate) => decisionsByCandidateId[candidate.id]?.action === "ACCEPT",
  );
}

export function makeReviewDecision(
  projectSessionId: string,
  candidateId: string,
  action: ReviewAction,
  overrides: Partial<ReviewDecision> = {},
): ReviewDecision {
  return {
    id: `${projectSessionId}:${candidateId}:${action}:${Date.now()}`,
    projectSessionId,
    candidateId,
    action,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
