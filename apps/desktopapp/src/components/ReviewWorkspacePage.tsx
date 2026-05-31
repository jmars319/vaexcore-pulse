import type {
  summarizeReviewQueueState,
  ReviewQueueMode,
} from "@vaexcore/pulse-domain";
import type {
  CandidateWindow,
  ConfidenceBand,
  ContentProfile,
  ProfileMatchingSummary,
  ProfilePresentationMode,
  ProjectSession,
  ProjectSessionSummary,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";
import { CandidateDetail } from "./CandidateDetail";
import { CandidateQueue } from "./CandidateQueue";
import { CandidateTimeline } from "./CandidateTimeline";
import type { MomentPreviewMode } from "./MomentPreviewModal";
import { SessionOverview } from "./SessionOverview";

type SessionReviewState = "PENDING" | "IN_PROGRESS" | "REVIEWED";

type ReviewWorkspacePageProps = {
  acceptedCount: number;
  activeSessionReviewState: SessionReviewState | null;
  activeSessionReviewStateLabel: string | null;
  bandFilter: ConfidenceBand | "ALL";
  currentProfile: ContentProfile;
  decisionsByCandidateId: Record<string, ReviewDecision>;
  edlPreview: string;
  isCurrentCandidateSentToStudio: boolean;
  isExportingToStudio: boolean;
  isSavingReview: boolean;
  isStrongMatchFallback: boolean;
  jsonPreview: string;
  labelDraft: string;
  nextPendingSession: ProjectSessionSummary | null;
  onAccept: () => void;
  onBandFilterChange: (value: ConfidenceBand | "ALL") => void;
  onExportAcceptedToStudio: () => void;
  onExpandResolution: () => void;
  onExpandSetup: () => void;
  onLabelChange: (value: string) => void;
  onOpenMomentPreview: (
    candidateId: string | null,
    mode?: MomentPreviewMode,
  ) => void;
  onOpenNextPendingSession: () => void;
  onPresentationModeChange: (value: ProfilePresentationMode) => void;
  onReject: () => void;
  onReturnToProjects: () => void;
  onReviewQueueModeChange: (value: ReviewQueueMode) => void;
  onSaveLabel: () => void;
  onSearchChange: (value: string) => void;
  onSelectCandidate: (candidateId: string) => void;
  onSelectNextPending: () => void;
  onSelectNextVisible: () => void;
  onSelectPreviousVisible: () => void;
  pendingReviewCount: number;
  presentationMode: ProfilePresentationMode;
  profileMatchingSummary: ProfileMatchingSummary;
  projectSession: ProjectSession | null;
  queueCandidates: CandidateWindow[];
  rejectedCount: number;
  reviewError: string | null;
  reviewQueueMode: ReviewQueueMode;
  reviewQueueState: ReturnType<typeof summarizeReviewQueueState> | null;
  reviewedCount: number;
  searchFilteredCandidateCount: number;
  searchValue: string;
  selectedCandidate: CandidateWindow | null;
  selectedCandidateIndex: number;
  selectedCandidateVisibleInQueue: boolean;
  selectedDecision: ReviewDecision | undefined;
  sessionCandidates: CandidateWindow[];
  studioExportStatus: string | null;
  studioRecordingExportHistory: {
    exportedAt: string;
    formats: string[];
    acceptedCount: number;
    pulseSessionId: string;
    pulseSessionTitle: string;
  } | null;
  timestampPreview: string;
};

export function ReviewWorkspacePage({
  acceptedCount,
  activeSessionReviewState,
  activeSessionReviewStateLabel,
  bandFilter,
  currentProfile,
  decisionsByCandidateId,
  edlPreview,
  isCurrentCandidateSentToStudio,
  isExportingToStudio,
  isSavingReview,
  isStrongMatchFallback,
  jsonPreview,
  labelDraft,
  nextPendingSession,
  onAccept,
  onBandFilterChange,
  onExportAcceptedToStudio,
  onExpandResolution,
  onExpandSetup,
  onLabelChange,
  onOpenMomentPreview,
  onOpenNextPendingSession,
  onPresentationModeChange,
  onReject,
  onReturnToProjects,
  onReviewQueueModeChange,
  onSaveLabel,
  onSearchChange,
  onSelectCandidate,
  onSelectNextPending,
  onSelectNextVisible,
  onSelectPreviousVisible,
  pendingReviewCount,
  presentationMode,
  profileMatchingSummary,
  projectSession,
  queueCandidates,
  rejectedCount,
  reviewError,
  reviewQueueMode,
  reviewQueueState,
  reviewedCount,
  searchFilteredCandidateCount,
  searchValue,
  selectedCandidate,
  selectedCandidateIndex,
  selectedCandidateVisibleInQueue,
  selectedDecision,
  sessionCandidates,
  studioExportStatus,
  studioRecordingExportHistory,
  timestampPreview,
}: ReviewWorkspacePageProps) {
  return (
    <section className="desktop-review-stack">
      {projectSession && activeSessionReviewState ? (
        <SessionOverview
          acceptedCount={acceptedCount}
          pendingCount={pendingReviewCount}
          profile={currentProfile}
          profileMatchingSummary={profileMatchingSummary}
          rejectedCount={rejectedCount}
          reviewStateLabel={activeSessionReviewStateLabel ?? "Pending"}
          reviewStateTone={activeSessionReviewState}
          selectedCandidateIndex={selectedCandidateIndex}
          session={projectSession}
        />
      ) : null}
      {reviewQueueState ? (
        <div className="review-queue-state-strip">
          <div>
            <span className="detail-label">Review queue</span>
            <strong>{reviewQueueState.visibleCount} visible moments</strong>
            <p>{reviewQueueState.detail}</p>
          </div>
          <span className="queue-count">
            {reviewQueueState.mode === "ONLY_PENDING"
              ? `${reviewQueueState.hiddenReviewedCount} hidden`
              : `${reviewQueueState.totalCount} total`}
          </span>
        </div>
      ) : null}
      <details className="utility-block internal-details review-timeline-details">
        <summary className="internal-details-summary">
          <span>Video map</span>
          <span className="queue-count">Optional</span>
        </summary>
        <CandidateTimeline
          candidates={sessionCandidates}
          decisionsByCandidateId={decisionsByCandidateId}
          durationSeconds={projectSession?.mediaSource.durationSeconds ?? 0}
          onSelectCandidate={onSelectCandidate}
          selectedCandidateId={selectedCandidate?.id ?? null}
        />
      </details>
      <div className="desktop-review-grid">
        <CandidateQueue
          bandFilter={bandFilter}
          candidates={queueCandidates}
          decisionsByCandidateId={decisionsByCandidateId}
          isStrongMatchFallback={isStrongMatchFallback}
          matchingCandidateCount={searchFilteredCandidateCount}
          onSelectNextPending={onSelectNextPending}
          onBandFilterChange={onBandFilterChange}
          onPresentationModeChange={onPresentationModeChange}
          onPreviewCandidate={(candidateId) => onOpenMomentPreview(candidateId)}
          onReviewQueueModeChange={onReviewQueueModeChange}
          onSearchChange={onSearchChange}
          onSelectCandidate={onSelectCandidate}
          pendingCount={pendingReviewCount}
          profile={currentProfile}
          profileMatchingSummary={profileMatchingSummary}
          presentationMode={presentationMode}
          reviewQueueMode={reviewQueueMode}
          reviewedCount={reviewedCount}
          searchValue={searchValue}
          selectedCandidateVisibleInQueue={selectedCandidateVisibleInQueue}
          selectedCandidateId={selectedCandidate?.id ?? null}
          totalCandidateCount={sessionCandidates.length}
        />

        <CandidateDetail
          candidate={selectedCandidate}
          candidateCount={sessionCandidates.length}
          candidateIndex={Math.max(selectedCandidateIndex, 0)}
          canPreview={Boolean(projectSession?.mediaSource.path)}
          canExportAcceptedToStudio={Boolean(
            projectSession && acceptedCount > 0,
          )}
          decision={selectedDecision}
          edlPreview={edlPreview}
          exportPreview={timestampPreview}
          isCurrentCandidateSentToStudio={isCurrentCandidateSentToStudio}
          onPreviewDetectedMoment={() =>
            onOpenMomentPreview(
              selectedCandidate?.id ?? null,
              "DETECTED_MOMENT",
            )
          }
          onPreviewSuggestedSegment={() =>
            onOpenMomentPreview(selectedCandidate?.id ?? null)
          }
          profileMatchingSummary={profileMatchingSummary}
          selectedCandidateVisibleInQueue={selectedCandidateVisibleInQueue}
          transcript={projectSession?.transcript ?? []}
          pendingCount={pendingReviewCount}
          nextPendingSession={nextPendingSession}
          labelDraft={labelDraft}
          onAccept={onAccept}
          onExportAcceptedToStudio={onExportAcceptedToStudio}
          onExpandResolution={onExpandResolution}
          onExpandSetup={onExpandSetup}
          isExportingToStudio={isExportingToStudio}
          isSavingReview={isSavingReview}
          onLabelChange={onLabelChange}
          onOpenNextPendingSession={onOpenNextPendingSession}
          onSelectNextVisible={onSelectNextVisible}
          onSelectPreviousVisible={onSelectPreviousVisible}
          onReject={onReject}
          onSaveLabel={onSaveLabel}
          onSelectNextPending={onSelectNextPending}
          onReturnToProjects={onReturnToProjects}
          profile={currentProfile}
          jsonPreview={jsonPreview}
          reviewError={reviewError}
          studioRecordingExportHistory={studioRecordingExportHistory}
          studioExportStatus={studioExportStatus}
          visibleCandidateCount={queueCandidates.length}
        />
      </div>
    </section>
  );
}
