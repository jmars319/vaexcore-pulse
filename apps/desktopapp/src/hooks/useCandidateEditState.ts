import { useState, type Dispatch, type SetStateAction } from "react";
import { buildProjectSummary } from "@vaexcore/pulse-domain";
import type {
  CandidateEditRequest,
  CandidateWindow,
  ProjectSession,
  ProjectSessionSummary,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";
import { submitCandidateEdit } from "../lib/pulseProjectApi";
import { upsertProjectSummary } from "../lib/pulseApiUpserts";
import { findAdjacentVisibleCandidateId } from "../lib/sessionPresentation";

type UseCandidateEditStateOptions = {
  apiBaseUrl: string;
  applyProjectSession: (
    nextSession: ProjectSession,
    options?: {
      preferredCandidateId?: string | null;
      preserveSelection?: boolean;
      preserveFilters?: boolean;
      rememberRealSession?: boolean;
      restoreResumeState?: boolean;
    },
  ) => void;
  labelDrafts: Record<string, string>;
  projectSession: ProjectSession | null;
  queueCandidates: CandidateWindow[];
  selectedCandidate: CandidateWindow | null;
  selectedCandidateId: string | null;
  selectedDecision: ReviewDecision | undefined;
  setProjectSummaries: Dispatch<SetStateAction<ProjectSessionSummary[]>>;
};

export function useCandidateEditState({
  apiBaseUrl,
  applyProjectSession,
  labelDrafts,
  projectSession,
  queueCandidates,
  selectedCandidate,
  selectedCandidateId,
  selectedDecision,
  setProjectSummaries,
}: UseCandidateEditStateOptions) {
  const [candidateEditError, setCandidateEditError] = useState<string | null>(
    null,
  );
  const [isSavingCandidateEdit, setIsSavingCandidateEdit] = useState(false);

  async function applyCandidateEdit(
    input: Omit<CandidateEditRequest, "sessionId" | "timestamp">,
    options: {
      preferredCandidateId?: string | null;
      preserveSelection?: boolean;
    } = {},
  ) {
    if (!projectSession) return;
    setIsSavingCandidateEdit(true);
    setCandidateEditError(null);
    try {
      const nextSession = await submitCandidateEdit(apiBaseUrl, {
        ...input,
        sessionId: projectSession.id,
        timestamp: new Date().toISOString(),
      });
      applyProjectSession(nextSession, {
        preferredCandidateId:
          options.preferredCandidateId ?? selectedCandidateId,
        preserveSelection: options.preserveSelection ?? true,
        preserveFilters: true,
        rememberRealSession: true,
      });
      setProjectSummaries((current) =>
        upsertProjectSummary(current, buildProjectSummary(nextSession)),
      );
    } catch (error) {
      setCandidateEditError(
        error instanceof Error
          ? error.message
          : "Something went wrong while updating the candidate.",
      );
    } finally {
      setIsSavingCandidateEdit(false);
    }
  }

  function handleCreateManualCandidate() {
    if (!selectedCandidate) return;
    const activeSegment =
      selectedDecision?.adjustedSegment ?? selectedCandidate.suggestedSegment;
    void applyCandidateEdit(
      {
        action: "CREATE",
        label: `${labelDrafts[selectedCandidate.id] || selectedCandidate.editableLabel} copy`,
        transcriptSnippet: selectedCandidate.transcriptSnippet,
        candidateWindow: {
          startSeconds: activeSegment.startSeconds,
          endSeconds: activeSegment.endSeconds,
        },
        suggestedSegment: {
          ...selectedCandidate.suggestedSegment,
          startSeconds: activeSegment.startSeconds,
          endSeconds: activeSegment.endSeconds,
        },
      },
      {
        preserveSelection: false,
      },
    );
  }

  function handleSplitCandidate() {
    if (!selectedCandidate) return;
    const splitSeconds =
      (selectedCandidate.candidateWindow.startSeconds +
        selectedCandidate.candidateWindow.endSeconds) /
      2;
    void applyCandidateEdit({
      action: "SPLIT",
      candidateId: selectedCandidate.id,
      splitSeconds,
    });
  }

  function handleMergeWithNextVisible() {
    if (!selectedCandidate) return;
    const targetCandidateId =
      findAdjacentVisibleCandidateId(
        queueCandidates,
        selectedCandidate.id,
        1,
      ) ??
      findAdjacentVisibleCandidateId(queueCandidates, selectedCandidate.id, -1);
    if (!targetCandidateId) {
      setCandidateEditError(
        "No adjacent visible candidate is available to merge.",
      );
      return;
    }
    void applyCandidateEdit({
      action: "MERGE",
      candidateId: selectedCandidate.id,
      targetCandidateId,
    });
  }

  function handleRankCandidate(rankDelta: number) {
    if (!selectedCandidate) return;
    void applyCandidateEdit({
      action: "RANK",
      candidateId: selectedCandidate.id,
      rankDelta,
    });
  }

  function handleCorrectTranscriptChunk(
    transcriptChunkId: string,
    transcriptText: string,
  ) {
    void applyCandidateEdit({
      action: "TRANSCRIPT_CORRECTION",
      transcriptChunkId,
      transcriptText,
    });
  }

  return {
    candidateEditError,
    handleCorrectTranscriptChunk,
    handleCreateManualCandidate,
    handleMergeWithNextVisible,
    handleRankCandidate,
    handleSplitCandidate,
    isSavingCandidateEdit,
  };
}
