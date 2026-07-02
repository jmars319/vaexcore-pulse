import type { Dispatch, SetStateAction } from "react";
import type {
  CandidateWindow,
  ProjectSession,
  ReviewAction,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";

type ReviewDecisionOverrides = Pick<
  ReviewDecision,
  "label" | "adjustedSegment" | "notes"
>;

type UseReviewDecisionActionsOptions = {
  clearError: () => void;
  decisionsByCandidateId: Record<string, ReviewDecision>;
  labelDrafts: Record<string, string>;
  projectSession: ProjectSession | null;
  selectedCandidate: CandidateWindow | null;
  setLabelDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  upsertDecision: (
    candidate: CandidateWindow,
    action: ReviewAction,
    overrides?: ReviewDecisionOverrides,
  ) => void;
};

export function useReviewDecisionActions({
  clearError,
  decisionsByCandidateId,
  labelDrafts,
  projectSession,
  selectedCandidate,
  setLabelDrafts,
  upsertDecision,
}: UseReviewDecisionActionsOptions) {
  function handleLabelChange(nextValue: string) {
    if (!selectedCandidate) return;
    clearError();
    setLabelDrafts((current) => ({
      ...current,
      [selectedCandidate.id]: nextValue,
    }));
  }

  function handleSaveLabel() {
    if (!selectedCandidate) return;
    upsertDecision(selectedCandidate, "RELABEL", {
      label: labelDrafts[selectedCandidate.id],
    });
  }

  function handleAccept() {
    if (!selectedCandidate) return;
    upsertDecision(selectedCandidate, "ACCEPT", {
      label: labelDrafts[selectedCandidate.id],
    });
  }

  function handleReject() {
    if (!selectedCandidate) return;
    upsertDecision(selectedCandidate, "REJECT", {
      label: labelDrafts[selectedCandidate.id],
    });
  }

  function handleDefer() {
    if (!selectedCandidate) return;
    upsertDecision(selectedCandidate, "DEFER", {
      label: labelDrafts[selectedCandidate.id],
      notes: "Deferred for later operator review.",
    });
  }

  function handleExpandSetup() {
    if (!selectedCandidate) return;
    const currentSegment =
      decisionsByCandidateId[selectedCandidate.id]?.adjustedSegment ??
      selectedCandidate.suggestedSegment;
    upsertDecision(selectedCandidate, "RETIME", {
      adjustedSegment: {
        startSeconds: Math.max(0, currentSegment.startSeconds - 2),
        endSeconds: currentSegment.endSeconds,
      },
      label: labelDrafts[selectedCandidate.id],
    });
  }

  function handleExpandResolution() {
    if (!selectedCandidate || !projectSession) return;
    const currentSegment =
      decisionsByCandidateId[selectedCandidate.id]?.adjustedSegment ??
      selectedCandidate.suggestedSegment;
    upsertDecision(selectedCandidate, "RETIME", {
      adjustedSegment: {
        startSeconds: currentSegment.startSeconds,
        endSeconds: Math.min(
          projectSession.mediaSource.durationSeconds,
          currentSegment.endSeconds + 2,
        ),
      },
      label: labelDrafts[selectedCandidate.id],
    });
  }

  return {
    handleAccept,
    handleDefer,
    handleExpandResolution,
    handleExpandSetup,
    handleLabelChange,
    handleReject,
    handleSaveLabel,
  };
}
