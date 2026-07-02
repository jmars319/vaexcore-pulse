import { lazy } from "react";
import type {
  summarizeReviewQueueState,
  ReviewQueueMode,
} from "@vaexcore/pulse-domain";
import type {
  CandidateWindow,
  ClipProfile,
  ConfidenceBand,
  ContentProfile,
  ProfileMatchingSummary,
  ProfilePresentationMode,
  ProjectSession,
  ProjectSessionSearchResult,
  ProjectSessionSummary,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";
import type { DesktopPage } from "../lib/desktopNavigation";
import type { MomentPreviewMode } from "./MomentPreviewModal";
import type { StudioIntakeFilter } from "../lib/studioIntakePresentation";
import type {
  StudioIntakeQueueItem,
  StudioIntakeState,
  StudioRecordingExportHistory,
} from "../lib/studioTypes";
import type {
  buildAnalysisLaunchState,
  buildStartGuide,
} from "../lib/sessionPresentation";
import type {
  SuiteAppStatus,
  SuiteSession,
  SuiteTimelineItem,
} from "../lib/suitePresentation";

type SessionReviewState = "PENDING" | "IN_PROGRESS" | "REVIEWED";

const NewAnalysisPage = lazy(() =>
  import("./NewAnalysisPage").then((module) => ({
    default: module.NewAnalysisPage,
  })),
);
const ProjectsBacklogPage = lazy(() =>
  import("./ProjectsBacklogPage").then((module) => ({
    default: module.ProjectsBacklogPage,
  })),
);
const ReviewWorkspacePage = lazy(() =>
  import("./ReviewWorkspacePage").then((module) => ({
    default: module.ReviewWorkspacePage,
  })),
);
const SuiteWorkspacePage = lazy(() =>
  import("./SuiteWorkspacePage").then((module) => ({
    default: module.SuiteWorkspacePage,
  })),
);

export type DesktopRouteRendererProps = {
  acceptedCount: number;
  activePage: DesktopPage;
  activeSessionReviewState: SessionReviewState | null;
  activeSessionReviewStateLabel: string | null;
  analysisError: string | null;
  analysisLaunchState: ReturnType<typeof buildAnalysisLaunchState>;
  analysisProfileId: string;
  analysisSourceName: string | null;
  analysisTitle: string;
  analysisTitlePreview: string;
  availableProfiles: ClipProfile[];
  bandFilter: ConfidenceBand | "ALL";
  currentProfile: ContentProfile;
  decisionsByCandidateId: Record<string, ReviewDecision>;
  edlPreview: string;
  filteredStudioIntakeRecordings: StudioIntakeQueueItem[];
  hasPersistedProfiles: boolean;
  isAnalyzing: boolean;
  isCurrentCandidateSentToStudio: boolean;
  isExportingToStudio: boolean;
  isLoadingProfiles: boolean;
  isLoadingProjects: boolean;
  isSearchingProjects: boolean;
  isSavingCandidateEdit: boolean;
  isSavingReview: boolean;
  isStrongMatchFallback: boolean;
  jsonPreview: string;
  labelDraft: string;
  nextPendingSession: ProjectSessionSummary | null;
  normalizedSelectedMediaPath: string;
  onAccept: () => void;
  onAnalyze: () => void;
  onBandFilterChange: (value: ConfidenceBand | "ALL") => void;
  onCorrectTranscriptChunk: (chunkId: string, text: string) => void;
  onCreateManualCandidate: () => void;
  onDefer: () => void;
  onDismissStudioRecording: (recording: StudioIntakeQueueItem) => void;
  onExportAcceptedToStudio: () => void;
  onExpandResolution: () => void;
  onExpandSetup: () => void;
  onLabelChange: (value: string) => void;
  onLaunchSuite: () => void;
  onOpenMomentPreview: (
    candidateId: string | null,
    mode?: MomentPreviewMode,
  ) => void;
  onOpenNextPendingSession: () => void;
  onOpenProject: (sessionId: string) => void;
  onPickMedia: () => void;
  onPickTranscript: () => void;
  onPresentationModeChange: (value: ProfilePresentationMode) => void;
  onProfileChange: (profileId: string) => void;
  onRefreshStudioIntake: () => void;
  onReject: () => void;
  onMergeWithNextVisible: () => void;
  onRankCandidate: (rankDelta: number) => void;
  onRestoreStudioRecording: (recording: StudioIntakeQueueItem) => void;
  onReturnToProjects: () => void;
  onReviewQueueModeChange: (value: ReviewQueueMode) => void;
  onSaveLabel: () => void;
  onScanAnotherVideo: () => void;
  onSearchChange: (value: string) => void;
  onProjectSearchChange: (value: string) => void;
  onSelectCandidate: (candidateId: string) => void;
  onSelectNextPending: () => void;
  onSelectNextVisible: () => void;
  onSelectPreviousVisible: () => void;
  onSplitCandidate: () => void;
  onSelectedMediaPathChange: (mediaPath: string) => void;
  onSelectedTranscriptPathChange: (transcriptPath: string) => void;
  onSetUpProfile: () => void;
  onStudioIntakeFilterChange: (filter: StudioIntakeFilter) => void;
  onStudioRecordingImport: (recording: StudioIntakeQueueItem) => void;
  onTitleChange: (title: string) => void;
  pendingReviewCount: number;
  pendingSessionCount: number;
  presentationMode: ProfilePresentationMode;
  projectSearchError: string | null;
  projectSearchResults: ProjectSessionSearchResult[];
  projectSearchValue: string;
  profileMatchingSummary: ProfileMatchingSummary;
  projectSession: ProjectSession | null;
  projectSummaries: ProjectSessionSummary[];
  projectsError: string | null;
  queueCandidates: CandidateWindow[];
  rejectedCount: number;
  candidateEditError: string | null;
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
  selectedDraftProfile: ClipProfile;
  selectedMediaPath: string;
  selectedTranscriptPath: string;
  sessionCandidates: CandidateWindow[];
  showStartGuide: boolean;
  startGuide: ReturnType<typeof buildStartGuide>;
  studioExportHistory: StudioRecordingExportHistory;
  studioExportStatus: string | null;
  studioIntake: StudioIntakeState;
  studioIntakeFilter: StudioIntakeFilter;
  studioIntakeFilterCounts: Record<StudioIntakeFilter, number>;
  studioRecordingExportHistory: {
    exportedAt: string;
    formats: string[];
    acceptedCount: number;
    pulseSessionId: string;
    pulseSessionTitle: string;
  } | null;
  suiteLaunchStatus: string | null;
  suiteRefreshError: string | null;
  suiteSession: SuiteSession | null;
  suiteStatus: SuiteAppStatus[];
  suiteTimeline: SuiteTimelineItem[];
  timestampPreview: string;
};

export function DesktopRouteRenderer(props: DesktopRouteRendererProps) {
  if (props.activePage === "suite") {
    return (
      <SuiteWorkspacePage
        onLaunchSuite={props.onLaunchSuite}
        suiteLaunchStatus={props.suiteLaunchStatus}
        suiteRefreshError={props.suiteRefreshError}
        suiteSession={props.suiteSession}
        suiteStatus={props.suiteStatus}
        suiteTimeline={props.suiteTimeline}
      />
    );
  }

  if (props.activePage === "projects") {
    return (
      <ProjectsBacklogPage
        activeSessionId={props.projectSession?.id ?? null}
        availableProfiles={props.availableProfiles}
        isLoadingProjects={props.isLoadingProjects}
        isSearchingProjects={props.isSearchingProjects}
        nextPendingSession={props.nextPendingSession}
        onOpenNextPendingSession={props.onOpenNextPendingSession}
        onOpenProject={props.onOpenProject}
        onSearchChange={props.onProjectSearchChange}
        onScanAnotherVideo={props.onScanAnotherVideo}
        pendingSessionCount={props.pendingSessionCount}
        projectSearchError={props.projectSearchError}
        projectSearchResults={props.projectSearchResults}
        projectSearchValue={props.projectSearchValue}
        projectSummaries={props.projectSummaries}
        projectsError={props.projectsError}
      />
    );
  }

  if (props.activePage === "new-analysis") {
    return (
      <NewAnalysisPage
        activeSessionReviewStateLabel={props.activeSessionReviewStateLabel}
        analysisError={props.analysisError}
        analysisLaunchState={props.analysisLaunchState}
        analysisProfileId={props.analysisProfileId}
        analysisSourceName={props.analysisSourceName}
        analysisTitle={props.analysisTitle}
        analysisTitlePreview={props.analysisTitlePreview}
        availableProfiles={props.availableProfiles}
        filteredStudioIntakeRecordings={props.filteredStudioIntakeRecordings}
        hasPersistedProfiles={props.hasPersistedProfiles}
        isAnalyzing={props.isAnalyzing}
        isLoadingProfiles={props.isLoadingProfiles}
        normalizedSelectedMediaPath={props.normalizedSelectedMediaPath}
        onAnalyze={props.onAnalyze}
        onDismissStudioRecording={props.onDismissStudioRecording}
        onPickMedia={props.onPickMedia}
        onPickTranscript={props.onPickTranscript}
        onProfileChange={props.onProfileChange}
        onRefreshStudioIntake={props.onRefreshStudioIntake}
        onRestoreStudioRecording={props.onRestoreStudioRecording}
        onSelectedMediaPathChange={props.onSelectedMediaPathChange}
        onSelectedTranscriptPathChange={props.onSelectedTranscriptPathChange}
        onSetUpProfile={props.onSetUpProfile}
        onStudioIntakeFilterChange={props.onStudioIntakeFilterChange}
        onStudioRecordingImport={props.onStudioRecordingImport}
        onTitleChange={props.onTitleChange}
        projectSession={props.projectSession}
        selectedDraftProfile={props.selectedDraftProfile}
        selectedMediaPath={props.selectedMediaPath}
        selectedTranscriptPath={props.selectedTranscriptPath}
        showStartGuide={props.showStartGuide}
        startGuide={props.startGuide}
        studioExportHistory={props.studioExportHistory}
        studioIntake={props.studioIntake}
        studioIntakeFilter={props.studioIntakeFilter}
        studioIntakeFilterCounts={props.studioIntakeFilterCounts}
      />
    );
  }

  return (
    <ReviewWorkspacePage
      acceptedCount={props.acceptedCount}
      activeSessionReviewState={props.activeSessionReviewState}
      activeSessionReviewStateLabel={props.activeSessionReviewStateLabel}
      bandFilter={props.bandFilter}
      currentProfile={props.currentProfile}
      decisionsByCandidateId={props.decisionsByCandidateId}
      edlPreview={props.edlPreview}
      isCurrentCandidateSentToStudio={props.isCurrentCandidateSentToStudio}
      isExportingToStudio={props.isExportingToStudio}
      isSavingCandidateEdit={props.isSavingCandidateEdit}
      isSavingReview={props.isSavingReview}
      isStrongMatchFallback={props.isStrongMatchFallback}
      jsonPreview={props.jsonPreview}
      labelDraft={props.labelDraft}
      nextPendingSession={props.nextPendingSession}
      onAccept={props.onAccept}
      onBandFilterChange={props.onBandFilterChange}
      onCorrectTranscriptChunk={props.onCorrectTranscriptChunk}
      onCreateManualCandidate={props.onCreateManualCandidate}
      onDefer={props.onDefer}
      onExportAcceptedToStudio={props.onExportAcceptedToStudio}
      onExpandResolution={props.onExpandResolution}
      onExpandSetup={props.onExpandSetup}
      onLabelChange={props.onLabelChange}
      onOpenMomentPreview={props.onOpenMomentPreview}
      onOpenNextPendingSession={props.onOpenNextPendingSession}
      onPresentationModeChange={props.onPresentationModeChange}
      onReject={props.onReject}
      onMergeWithNextVisible={props.onMergeWithNextVisible}
      onRankCandidate={props.onRankCandidate}
      onReturnToProjects={props.onReturnToProjects}
      onReviewQueueModeChange={props.onReviewQueueModeChange}
      onSaveLabel={props.onSaveLabel}
      onSearchChange={props.onSearchChange}
      onSelectCandidate={props.onSelectCandidate}
      onSelectNextPending={props.onSelectNextPending}
      onSelectNextVisible={props.onSelectNextVisible}
      onSelectPreviousVisible={props.onSelectPreviousVisible}
      onSplitCandidate={props.onSplitCandidate}
      pendingReviewCount={props.pendingReviewCount}
      presentationMode={props.presentationMode}
      profileMatchingSummary={props.profileMatchingSummary}
      projectSession={props.projectSession}
      queueCandidates={props.queueCandidates}
      rejectedCount={props.rejectedCount}
      candidateEditError={props.candidateEditError}
      reviewError={props.reviewError}
      reviewQueueMode={props.reviewQueueMode}
      reviewQueueState={props.reviewQueueState}
      reviewedCount={props.reviewedCount}
      searchFilteredCandidateCount={props.searchFilteredCandidateCount}
      searchValue={props.searchValue}
      selectedCandidate={props.selectedCandidate}
      selectedCandidateIndex={props.selectedCandidateIndex}
      selectedCandidateVisibleInQueue={props.selectedCandidateVisibleInQueue}
      selectedDecision={props.selectedDecision}
      sessionCandidates={props.sessionCandidates}
      studioExportStatus={props.studioExportStatus}
      studioRecordingExportHistory={props.studioRecordingExportHistory}
      timestampPreview={props.timestampPreview}
    />
  );
}
