import { lazy, Suspense, useMemo } from "react";
import type { ClipProfile } from "@vaexcore/pulse-shared-types";
import { DesktopRouteRenderer } from "./DesktopRouteRenderer";
import { DesktopShellLayout } from "./DesktopShellLayout";
import { openSettingsWindowFromUi } from "../lib/settingsWindowBehavior";
import { studioRecordingQueueKey } from "../lib/studioIntakeQueue";
import {
  buildAnalysisLaunchState,
  buildStartGuide,
} from "../lib/sessionPresentation";
import { studioPulseSourceEventId } from "../lib/suitePresentation";
import type { DesktopPage } from "../lib/desktopNavigation";
import type { useReviewWorkspaceController } from "../hooks/useReviewWorkspaceController";
import type { useStudioExportController } from "../hooks/useStudioExportController";
import type { useStudioIntakeController } from "../hooks/useStudioIntakeController";
import type { useSuiteWorkspaceState } from "../hooks/useSuiteWorkspaceState";

const MomentPreviewModal = lazy(() =>
  import("./MomentPreviewModal").then((module) => ({
    default: module.MomentPreviewModal,
  })),
);

type ReviewController = ReturnType<typeof useReviewWorkspaceController>;
type StudioExportController = ReturnType<typeof useStudioExportController>;
type StudioIntakeController = ReturnType<typeof useStudioIntakeController>;
type SuiteWorkspaceState = ReturnType<typeof useSuiteWorkspaceState>;

type DesktopWorkspaceFrameProps = {
  activePage: DesktopPage;
  analysisError: string | null;
  analysisLaunchState: ReturnType<typeof buildAnalysisLaunchState>;
  analysisProfileId: string;
  analysisSourceName: string | null;
  analysisTitle: string;
  analysisTitlePreview: string;
  apiBaseUrl: string;
  availableProfiles: ClipProfile[];
  hasPersistedProfiles: boolean;
  isAnalyzing: boolean;
  isLoadingProfiles: boolean;
  normalizedSelectedMediaPath: string;
  onAnalyze: () => void;
  onPickMedia: () => void;
  onProfileChange: (profileId: string) => void;
  onReturnToProjects: () => void;
  onScanAnotherVideo: () => void;
  onSelectedMediaPathChange: (mediaPath: string) => void;
  onSelectPage: (page: DesktopPage) => void;
  onTitleChange: (title: string) => void;
  review: ReviewController;
  selectedDraftProfile: ClipProfile;
  selectedMediaPath: string;
  showStartGuide: boolean;
  startGuide: ReturnType<typeof buildStartGuide>;
  studioExport: StudioExportController;
  studioIntake: StudioIntakeController;
  suite: SuiteWorkspaceState;
};

export function DesktopWorkspaceFrame({
  activePage,
  analysisError,
  analysisLaunchState,
  analysisProfileId,
  analysisSourceName,
  analysisTitle,
  analysisTitlePreview,
  apiBaseUrl,
  availableProfiles,
  hasPersistedProfiles,
  isAnalyzing,
  isLoadingProfiles,
  normalizedSelectedMediaPath,
  onAnalyze,
  onPickMedia,
  onProfileChange,
  onReturnToProjects,
  onScanAnotherVideo,
  onSelectedMediaPathChange,
  onSelectPage,
  onTitleChange,
  review,
  selectedDraftProfile,
  selectedMediaPath,
  showStartGuide,
  startGuide,
  studioExport,
  studioIntake,
  suite,
}: DesktopWorkspaceFrameProps) {
  const activeStudioRecordingKey = useMemo(() => {
    if (
      !review.projectSession ||
      !studioIntake.studioIntake.latestRecording ||
      studioIntake.studioIntake.latestRecording.outputPath !==
        review.projectSession.mediaSource.path
    ) {
      return null;
    }
    return studioRecordingQueueKey(studioIntake.studioIntake.latestRecording);
  }, [review.projectSession, studioIntake.studioIntake.latestRecording]);
  const activeStudioExportHistory = activeStudioRecordingKey
    ? (studioIntake.studioExportHistory.recordings[activeStudioRecordingKey] ??
      null)
    : null;
  const isCurrentCandidateSentToStudio = Boolean(
    review.projectSession &&
    review.selectedCandidate &&
    studioExport.studioExportedCandidateIds[
      studioPulseSourceEventId(
        review.projectSession.id,
        review.selectedCandidate.id,
      )
    ],
  );

  return (
    <DesktopShellLayout
      acceptedCount={review.acceptedCount}
      activePage={activePage}
      activeSessionReviewStateLabel={review.activeSessionReviewStateLabel}
      currentProfileLabel={review.currentProfile.name}
      currentSessionLabel={review.projectSession?.title ?? "No session loaded"}
      nextPendingSession={review.nextPendingSession}
      onLaunchSuite={() => {
        void suite.handleLaunchSuite();
      }}
      onPickMedia={onPickMedia}
      onSelectPage={onSelectPage}
      pendingReviewCount={review.pendingReviewCount}
      pendingSessionCount={review.pendingSessionCount}
      projectSummaries={review.projectSummaries}
      rejectedCount={review.rejectedCount}
      selectedCandidateTranscriptSnippet={
        review.selectedCandidate?.transcriptSnippet ?? null
      }
      selectedMediaPath={selectedMediaPath}
      sessionCandidateCount={review.sessionCandidates.length}
      suiteLaunchStatus={suite.suiteLaunchStatus}
      suiteSession={suite.suiteSession}
      suiteStatus={suite.suiteStatus}
    >
      <Suspense
        fallback={
          <section className="utility-panel glass-panel">
            <p className="queue-summary-copy">Loading workspace...</p>
          </section>
        }
      >
        <DesktopRouteRenderer
          acceptedCount={review.acceptedCount}
          activePage={activePage}
          activeSessionReviewState={review.activeSessionReviewState}
          activeSessionReviewStateLabel={review.activeSessionReviewStateLabel}
          activeSessionReviewStateLabelText={
            review.activeSessionReviewStateLabel
          }
          analysisError={analysisError}
          analysisLaunchState={analysisLaunchState}
          analysisProfileId={analysisProfileId}
          analysisSourceName={analysisSourceName}
          analysisTitle={analysisTitle}
          analysisTitlePreview={analysisTitlePreview}
          availableProfiles={availableProfiles}
          bandFilter={review.bandFilter}
          currentProfile={review.currentProfile}
          decisionsByCandidateId={review.decisionsByCandidateId}
          edlPreview={review.edlPreview}
          filteredStudioIntakeRecordings={
            studioIntake.filteredStudioIntakeRecordings
          }
          hasPersistedProfiles={hasPersistedProfiles}
          isAnalyzing={isAnalyzing}
          isCurrentCandidateSentToStudio={isCurrentCandidateSentToStudio}
          isExportingToStudio={studioExport.isExportingToStudio}
          isLoadingProfiles={isLoadingProfiles}
          isLoadingProjects={review.isLoadingProjects}
          isSavingReview={review.isSavingReview}
          isStrongMatchFallback={review.isStrongMatchFallback}
          jsonPreview={review.jsonPreview}
          labelDraft={
            review.selectedCandidate
              ? (review.labelDrafts[review.selectedCandidate.id] ?? "")
              : ""
          }
          nextPendingSession={review.nextPendingSession}
          normalizedSelectedMediaPath={normalizedSelectedMediaPath}
          onAccept={review.handleAccept}
          onAnalyze={onAnalyze}
          onBandFilterChange={review.setBandFilter}
          onDismissStudioRecording={studioIntake.handleDismissStudioRecording}
          onExportAcceptedToStudio={() => {
            void studioExport.handleExportAcceptedToStudio({
              decisionsByCandidateId: review.decisionsByCandidateId,
              edlPreview: review.edlPreview,
              jsonPreview: review.jsonPreview,
              projectSession: review.projectSession,
              timestampPreview: review.timestampPreview,
            });
          }}
          onExpandResolution={review.handleExpandResolution}
          onExpandSetup={review.handleExpandSetup}
          onLabelChange={review.handleLabelChange}
          onLaunchSuite={() => {
            void suite.handleLaunchSuite();
          }}
          onOpenMomentPreview={review.handleOpenMomentPreview}
          onOpenNextPendingSession={() => {
            void review.handleOpenNextPendingSession();
          }}
          onOpenProject={(sessionId) => {
            void review.handleOpenProject(sessionId);
          }}
          onPickMedia={onPickMedia}
          onPresentationModeChange={review.setPresentationMode}
          onProfileChange={onProfileChange}
          onRefreshStudioIntake={() => {
            void studioIntake.handleRefreshStudioIntake();
          }}
          onReject={review.handleReject}
          onRestoreStudioRecording={studioIntake.handleRestoreStudioRecording}
          onReturnToProjects={onReturnToProjects}
          onReviewQueueModeChange={review.handleReviewQueueModeChange}
          onSaveLabel={review.handleSaveLabel}
          onScanAnotherVideo={onScanAnotherVideo}
          onSearchChange={review.handleSearchChange}
          onSelectCandidate={review.handleSelectCandidate}
          onSelectNextPending={review.handleSelectNextPending}
          onSelectNextVisible={review.handleSelectNextVisible}
          onSelectPreviousVisible={review.handleSelectPreviousVisible}
          onSelectedMediaPathChange={onSelectedMediaPathChange}
          onSetUpProfile={() => openSettingsWindowFromUi("profile-setup")}
          onStudioIntakeFilterChange={studioIntake.setStudioIntakeFilter}
          onStudioRecordingImport={studioIntake.handleImportStudioRecording}
          onTitleChange={onTitleChange}
          pendingReviewCount={review.pendingReviewCount}
          pendingSessionCount={review.pendingSessionCount}
          presentationMode={review.presentationMode}
          profileMatchingSummary={review.profileMatchingSummary}
          projectSession={review.projectSession}
          projectSummaries={review.projectSummaries}
          projectsError={review.projectsError}
          queueCandidates={review.queueCandidates}
          rejectedCount={review.rejectedCount}
          reviewError={review.reviewError}
          reviewQueueMode={review.reviewQueueMode}
          reviewQueueState={review.reviewQueueState}
          reviewedCount={review.reviewedCount}
          searchFilteredCandidateCount={review.searchFilteredCandidates.length}
          searchValue={review.searchValue}
          selectedCandidate={review.selectedCandidate}
          selectedCandidateIndex={review.selectedCandidateIndex}
          selectedCandidateVisibleInQueue={
            review.selectedCandidateVisibleInQueue
          }
          selectedDecision={review.selectedDecision}
          selectedDraftProfile={selectedDraftProfile}
          selectedMediaPath={selectedMediaPath}
          sessionCandidates={review.sessionCandidates}
          showStartGuide={showStartGuide}
          startGuide={startGuide}
          studioExportHistory={studioIntake.studioExportHistory}
          studioExportStatus={studioExport.studioExportStatus}
          studioIntake={studioIntake.studioIntake}
          studioIntakeFilter={studioIntake.studioIntakeFilter}
          studioIntakeFilterCounts={studioIntake.studioIntakeFilterCounts}
          studioRecordingExportHistory={activeStudioExportHistory}
          suiteLaunchStatus={suite.suiteLaunchStatus}
          suiteRefreshError={suite.suiteRefreshError}
          suiteSession={suite.suiteSession}
          suiteStatus={suite.suiteStatus}
          suiteTimeline={suite.suiteTimeline}
          timestampPreview={review.timestampPreview}
        />
        <MomentPreviewModal
          apiBaseUrl={apiBaseUrl}
          candidate={review.previewCandidate}
          decision={review.previewDecision}
          initialMode={review.momentPreviewState?.mode ?? "SUGGESTED_SEGMENT"}
          isOpen={
            activePage === "candidate-review" &&
            review.previewCandidate !== null
          }
          mediaDurationSeconds={
            review.projectSession?.mediaSource.durationSeconds ?? 0
          }
          mediaPath={
            review.projectSession?.mediaSource.path ?? selectedMediaPath
          }
          onClose={review.handleCloseMomentPreview}
        />
      </Suspense>
    </DesktopShellLayout>
  );
}
