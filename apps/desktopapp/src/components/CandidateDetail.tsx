import { useState } from "react";
import type {
  CandidateWindow,
  ContentProfile,
  ProfileMatchingSummary,
  ProjectSessionSummary,
  ReviewDecision,
  TranscriptChunk,
} from "@vaexcore/pulse-shared-types";
import {
  describeCandidatePlainly,
  resolveCandidateProfileMatch,
} from "@vaexcore/pulse-domain";
import {
  CandidateDecisionPanel,
  CandidateDetailEmptyState,
  CandidateDetailHeader,
  CandidateOverviewCards,
  CandidatePreviewPanel,
} from "./CandidateDetailSections";
import {
  CandidateAdjustmentPanel,
  CandidateContextDetails,
  CandidateProfileFitPanel,
  CandidateScoreBreakdown,
} from "./CandidateDetailInsightSections";
import { ReviewCompletionPanel } from "./ReviewCompletionPanel";

type CandidateDetailProps = {
  candidate: CandidateWindow | null;
  decision: ReviewDecision | undefined;
  profile: ContentProfile;
  transcript: TranscriptChunk[];
  exportPreview: string;
  edlPreview: string;
  jsonPreview: string;
  candidateIndex: number;
  candidateCount: number;
  pendingCount: number;
  nextPendingSession: ProjectSessionSummary | null;
  profileMatchingSummary: ProfileMatchingSummary;
  selectedCandidateVisibleInQueue: boolean;
  visibleCandidateCount: number;
  canPreview: boolean;
  canExportAcceptedToStudio: boolean;
  onAccept: () => void;
  onCorrectTranscriptChunk: (chunkId: string, text: string) => void;
  onCreateManualCandidate: () => void;
  onDefer: () => void;
  onReject: () => void;
  onExportAcceptedToStudio: () => void;
  onExpandSetup: () => void;
  onExpandResolution: () => void;
  onPreviewDetectedMoment: () => void;
  onPreviewSuggestedSegment: () => void;
  onMergeWithNextVisible: () => void;
  onRankCandidate: (rankDelta: number) => void;
  onOpenNextPendingSession: () => void;
  onSelectPreviousVisible: () => void;
  onSelectNextVisible: () => void;
  onSelectNextPending: () => void;
  onSplitCandidate: () => void;
  onLabelChange: (value: string) => void;
  labelDraft: string;
  onSaveLabel: () => void;
  onReturnToProjects: () => void;
  isCurrentCandidateSentToStudio: boolean;
  isExportingToStudio: boolean;
  isSavingReview: boolean;
  reviewError: string | null;
  studioRecordingExportHistory: {
    exportedAt: string;
    formats: string[];
    acceptedCount: number;
    pulseSessionId: string;
    pulseSessionTitle: string;
  } | null;
  studioExportStatus: string | null;
};

export function CandidateDetail({
  candidate,
  decision,
  profile,
  transcript,
  exportPreview,
  edlPreview,
  jsonPreview,
  candidateIndex,
  candidateCount,
  pendingCount,
  nextPendingSession,
  profileMatchingSummary,
  selectedCandidateVisibleInQueue,
  visibleCandidateCount,
  canPreview,
  canExportAcceptedToStudio,
  onAccept,
  onCorrectTranscriptChunk,
  onCreateManualCandidate,
  onDefer,
  onReject,
  onExportAcceptedToStudio,
  onExpandSetup,
  onExpandResolution,
  onPreviewDetectedMoment,
  onPreviewSuggestedSegment,
  onMergeWithNextVisible,
  onRankCandidate,
  onOpenNextPendingSession,
  onSelectPreviousVisible,
  onSelectNextVisible,
  onSelectNextPending,
  onSplitCandidate,
  onLabelChange,
  labelDraft,
  onSaveLabel,
  onReturnToProjects,
  isCurrentCandidateSentToStudio,
  isExportingToStudio,
  isSavingReview,
  reviewError,
  studioRecordingExportHistory,
  studioExportStatus,
}: CandidateDetailProps) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  if (!candidate) {
    return <CandidateDetailEmptyState candidateCount={candidateCount} />;
  }

  const activeSegment = decision?.adjustedSegment ?? candidate.suggestedSegment;
  const profileMatch = resolveCandidateProfileMatch(candidate, profile);
  const plainDescription = describeCandidatePlainly(candidate);

  async function handleCopyExport(
    format: "timestamps" | "json" | "edl",
    value: string,
  ) {
    if (!value) {
      setCopyFeedback(`No ${format} export is ready yet.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(
        format === "timestamps"
          ? "Copied timestamps."
          : format === "edl"
            ? "Copied EDL."
            : "Copied JSON export.",
      );
    } catch {
      setCopyFeedback("Copy failed on this machine.");
    }
  }

  return (
    <section className="detail-panel glass-panel">
      <CandidateDetailHeader
        candidate={candidate}
        candidateCount={candidateCount}
        candidateIndex={candidateIndex}
        decision={decision}
        pendingCount={pendingCount}
        selectedCandidateVisibleInQueue={selectedCandidateVisibleInQueue}
      />
      <CandidateOverviewCards
        activeSegment={activeSegment}
        candidate={candidate}
        plainDescription={plainDescription}
      />
      <CandidatePreviewPanel
        canPreview={canPreview}
        onPreviewDetectedMoment={onPreviewDetectedMoment}
        onPreviewSuggestedSegment={onPreviewSuggestedSegment}
      />
      <CandidateDecisionPanel
        decision={decision}
        isSavingReview={isSavingReview}
        labelDraft={labelDraft}
        onAccept={onAccept}
        onDefer={onDefer}
        onExpandSetup={onExpandSetup}
        onLabelChange={onLabelChange}
        onReject={onReject}
        onSaveLabel={onSaveLabel}
        onSelectNextPending={onSelectNextPending}
        onSelectNextVisible={onSelectNextVisible}
        onSelectPreviousVisible={onSelectPreviousVisible}
        pendingCount={pendingCount}
        reviewError={reviewError}
        visibleCandidateCount={visibleCandidateCount}
      />
      <CandidateContextDetails
        candidate={candidate}
        onCorrectTranscriptChunk={onCorrectTranscriptChunk}
        profile={profile}
        profileMatch={profileMatch}
        profileMatchingSummary={profileMatchingSummary}
        transcript={transcript}
      />
      <CandidateScoreBreakdown candidate={candidate} />
      <CandidateProfileFitPanel profileMatch={profileMatch} />

      <ReviewCompletionPanel
        canExportAcceptedToStudio={canExportAcceptedToStudio}
        copyFeedback={copyFeedback}
        edlPreview={edlPreview}
        exportPreview={exportPreview}
        isCurrentCandidateSentToStudio={isCurrentCandidateSentToStudio}
        isExportingToStudio={isExportingToStudio}
        jsonPreview={jsonPreview}
        nextPendingSession={nextPendingSession}
        onCopyExport={handleCopyExport}
        onExportAcceptedToStudio={onExportAcceptedToStudio}
        onOpenNextPendingSession={onOpenNextPendingSession}
        onReturnToProjects={onReturnToProjects}
        pendingCount={pendingCount}
        studioExportStatus={studioExportStatus}
        studioRecordingExportHistory={studioRecordingExportHistory}
      />

      <CandidateAdjustmentPanel
        isSavingReview={isSavingReview}
        labelDraft={labelDraft}
        onCreateManualCandidate={onCreateManualCandidate}
        onExpandResolution={onExpandResolution}
        onExpandSetup={onExpandSetup}
        onLabelChange={onLabelChange}
        onMergeWithNextVisible={onMergeWithNextVisible}
        onRankCandidate={onRankCandidate}
        onReturnToProjects={onReturnToProjects}
        onSaveLabel={onSaveLabel}
        onSplitCandidate={onSplitCandidate}
        pendingCount={pendingCount}
      />
    </section>
  );
}
