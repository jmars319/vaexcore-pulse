import {
  startTransition,
  useDeferredValue,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  buildProfileMatchingSummary,
  buildProjectSummary,
  defaultReviewQueueMode,
  type ReviewQueueMode,
} from "@vaexcore/pulse-domain";
import type {
  ClipProfile,
  ConfidenceBand,
  ProfilePresentationMode,
  ProjectSession,
} from "@vaexcore/pulse-shared-types";
import {
  buildLabelDrafts,
  findAdjacentVisibleCandidateId,
  findFirstPendingCandidateId,
  findNextPendingCandidateId,
  resolveProfile,
} from "../lib/sessionPresentation";
import {
  loadSessionResumeState,
  resolveSessionResumeState,
  saveSessionResumeState,
} from "../lib/resumeState";
import { fetchProjectSession } from "../lib/pulseProjectApi";
import { upsertProjectSummary } from "../lib/pulseApiUpserts";
import {
  recordPulseTimelineEvent,
  studioPulseSourceEventId,
} from "../lib/suitePresentation";
import { useReviewKeyboardShortcuts } from "./useReviewKeyboardShortcuts";
import { useReviewState } from "./useReviewState";
import { useReviewWorkspaceDerivedState } from "./useReviewWorkspaceDerivedState";
import {
  lastSessionIdStorageKey,
  useProjectSessionLifecycle,
} from "./useProjectSessionLifecycle";
import { useCandidateEditState } from "./useCandidateEditState";
import { useReviewDecisionActions } from "./useReviewDecisionActions";
import type { DesktopPage } from "../lib/desktopNavigation";
import type { MomentPreviewMode } from "../components/MomentPreviewModal";

type FilterValue = ConfidenceBand | "ALL";

type UseReviewWorkspaceControllerOptions = {
  activePage: DesktopPage;
  analysisProfileId: string;
  apiBaseUrl: string;
  availableProfiles: ClipProfile[];
  isPulseReady: boolean;
  setActivePage: Dispatch<SetStateAction<DesktopPage>>;
  setAnalysisError: Dispatch<SetStateAction<string | null>>;
  setAnalysisProfileId: (profileId: string) => void;
  setAnalysisTitle: (title: string) => void;
  setSelectedMediaPath: (path: string) => void;
  setSelectedProfileId: (profileId: string) => void;
};

/* Review workspace boundary */
export function useReviewWorkspaceController({
  activePage,
  analysisProfileId,
  apiBaseUrl,
  availableProfiles,
  isPulseReady,
  setActivePage,
  setAnalysisError,
  setAnalysisProfileId,
  setAnalysisTitle,
  setSelectedMediaPath,
  setSelectedProfileId,
}: UseReviewWorkspaceControllerOptions) {
  const [projectSession, setProjectSession] = useState<ProjectSession | null>(
    null,
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(
    null,
  );
  const [searchValue, setSearchValue] = useState("");
  const [bandFilter, setBandFilter] = useState<FilterValue>("ALL");
  const [reviewQueueMode, setReviewQueueMode] =
    useState<ReviewQueueMode>("ONLY_PENDING");
  const [presentationMode, setPresentationMode] =
    useState<ProfilePresentationMode>("ALL_CANDIDATES");
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [momentPreviewState, setMomentPreviewState] = useState<{
    candidateId: string;
    mode: MomentPreviewMode;
  } | null>(null);

  const deferredSearchValue = useDeferredValue(searchValue);
  const sessionCandidates = projectSession?.candidates ?? [];
  const currentProfile = resolveProfile(
    availableProfiles,
    projectSession?.profileId ?? analysisProfileId,
  );
  const profileMatchingSummary = buildProfileMatchingSummary(currentProfile);
  const {
    handleOpenNextPendingSession,
    handleOpenProject,
    isLoadingProjects,
    isSearchingProjects,
    nextPendingSession,
    pendingSessionCount,
    projectSearchError,
    projectSearchResults,
    projectSearchValue,
    projectSummaries,
    projectsError,
    setProjectSearchValue,
    setProjectSummaries,
    setProjectsError,
  } = useProjectSessionLifecycle({
    apiBaseUrl,
    applyProjectSession,
    currentSessionId: projectSession?.id ?? null,
    isPulseReady,
    setActivePage,
    setAnalysisError,
  });
  const {
    decisionsByCandidateId,
    upsertDecision,
    reviewError,
    isSavingReview,
    clearError,
  } = useReviewState({
    apiBaseUrl,
    projectSession,
    onProjectSessionChange: (nextSession, context) => {
      const shouldAutoAdvance =
        context.action === "ACCEPT" ||
        context.action === "REJECT" ||
        context.action === "DEFER";
      const preferredCandidateId = shouldAutoAdvance
        ? (findNextPendingCandidateId(nextSession, context.candidateId) ??
          findFirstPendingCandidateId(nextSession) ??
          context.candidateId)
        : context.candidateId;

      applyProjectSession(nextSession, {
        preferredCandidateId,
        preserveSelection: !shouldAutoAdvance,
        preserveFilters: true,
        rememberRealSession: true,
      });
      setProjectSummaries((current) =>
        upsertProjectSummary(current, buildProjectSummary(nextSession)),
      );
      if (
        context.action === "ACCEPT" ||
        context.action === "REJECT" ||
        context.action === "DEFER"
      ) {
        void recordPulseTimelineEvent({
          kind: `pulse.review.${context.action.toLowerCase()}`,
          title:
            context.action === "ACCEPT"
              ? "Pulse moment kept"
              : context.action === "REJECT"
                ? "Pulse moment skipped"
                : "Pulse moment deferred",
          detail: `${nextSession.title} updated from Review.`,
          metadata: {
            pulseSessionId: nextSession.id,
            candidateId: context.candidateId,
            action: context.action,
          },
        });
      }
    },
  });

  const {
    acceptedCount,
    activeSessionReviewState,
    activeSessionReviewStateLabel,
    edlPreview,
    isStrongMatchFallback,
    jsonPreview,
    pendingReviewCount,
    previewCandidate,
    previewDecision,
    queueCandidates,
    rejectedCount,
    reviewQueueState,
    reviewedCount,
    searchFilteredCandidates,
    selectedCandidate,
    selectedCandidateIndex,
    selectedCandidateVisibleInQueue,
    selectedDecision,
    timestampPreview,
  } = useReviewWorkspaceDerivedState({
    bandFilter,
    currentProfile,
    decisionsByCandidateId,
    deferredSearchValue,
    momentPreviewState,
    presentationMode,
    projectSession,
    reviewQueueMode,
    selectedCandidateId,
    sessionCandidates,
  });
  const {
    candidateEditError,
    handleCorrectTranscriptChunk,
    handleCreateManualCandidate,
    handleMergeWithNextVisible,
    handleRankCandidate,
    handleSplitCandidate,
    isSavingCandidateEdit,
  } = useCandidateEditState({
    apiBaseUrl,
    applyProjectSession,
    labelDrafts,
    projectSession,
    queueCandidates,
    selectedCandidate,
    selectedCandidateId,
    selectedDecision,
    setProjectSummaries,
  });
  const {
    handleAccept,
    handleDefer,
    handleExpandResolution,
    handleExpandSetup,
    handleLabelChange,
    handleReject,
    handleSaveLabel,
  } = useReviewDecisionActions({
    clearError,
    decisionsByCandidateId,
    labelDrafts,
    projectSession,
    selectedCandidate,
    setLabelDrafts,
    upsertDecision,
  });

  /* Preview lifecycle boundary */
  useEffect(() => {
    if (activePage === "candidate-review") return;
    setMomentPreviewState(null);
  }, [activePage]);

  /* Resume state boundary */
  useEffect(() => {
    if (!projectSession) return;
    const queueIndex = selectedCandidate
      ? queueCandidates.findIndex(
          (candidate) => candidate.id === selectedCandidate.id,
        )
      : -1;
    saveSessionResumeState(projectSession.id, {
      selectedCandidateId: selectedCandidate?.id ?? null,
      reviewQueueMode,
      queueIndex: queueIndex >= 0 ? queueIndex : null,
      updatedAt: new Date().toISOString(),
    });
  }, [projectSession, queueCandidates, reviewQueueMode, selectedCandidate?.id]);

  useReviewKeyboardShortcuts({
    activePage,
    onAccept: handleAccept,
    onDefer: handleDefer,
    onExpandResolution: handleExpandResolution,
    onExpandSetup: handleExpandSetup,
    onOpenMomentPreview: handleOpenMomentPreview,
    onReject: handleReject,
    onSelectNextPending: handleSelectNextPending,
    onSelectNextVisible: handleSelectNextVisible,
    onSelectPreviousVisible: handleSelectPreviousVisible,
    selectedCandidateId: selectedCandidate?.id ?? null,
  });

  /* Session application boundary */
  function applyProjectSession(
    nextSession: ProjectSession,
    options: {
      preferredCandidateId?: string | null;
      preserveSelection?: boolean;
      preserveFilters?: boolean;
      rememberRealSession?: boolean;
      restoreResumeState?: boolean;
    } = {},
  ) {
    const restoredResumeState = options.restoreResumeState
      ? resolveSessionResumeState(
          nextSession,
          loadSessionResumeState(nextSession.id),
        )
      : null;
    const nextDefaultReviewQueueMode =
      restoredResumeState?.reviewQueueMode ??
      defaultReviewQueueMode(nextSession);
    const preferredCandidateId =
      options.preferredCandidateId &&
      nextSession.candidates.some(
        (candidate) => candidate.id === options.preferredCandidateId,
      )
        ? options.preferredCandidateId
        : null;
    const restoredCandidateId =
      restoredResumeState?.selectedCandidateId &&
      nextSession.candidates.some(
        (candidate) => candidate.id === restoredResumeState.selectedCandidateId,
      )
        ? restoredResumeState.selectedCandidateId
        : null;
    const preservedSelectedCandidateId =
      options.preserveSelection &&
      selectedCandidateId &&
      nextSession.candidates.some(
        (candidate) => candidate.id === selectedCandidateId,
      )
        ? selectedCandidateId
        : null;
    const nextSelectedCandidateId =
      preferredCandidateId ??
      preservedSelectedCandidateId ??
      restoredCandidateId ??
      (nextDefaultReviewQueueMode === "ONLY_PENDING"
        ? findFirstPendingCandidateId(nextSession)
        : null) ??
      nextSession.candidates[0]?.id ??
      null;
    const nextReviewQueueMode = options.restoreResumeState
      ? nextDefaultReviewQueueMode
      : projectSession?.id === nextSession.id
        ? nextDefaultReviewQueueMode === "ALL" &&
          reviewQueueMode === "ONLY_PENDING"
          ? "ALL"
          : reviewQueueMode
        : nextDefaultReviewQueueMode;

    setProjectSession(nextSession);
    setReviewQueueMode(nextReviewQueueMode);
    setSelectedCandidateId(nextSelectedCandidateId);
    setLabelDrafts(buildLabelDrafts(nextSession));
    setSelectedMediaPath(nextSession.mediaSource.path);
    setAnalysisProfileId(nextSession.profileId);
    setSelectedProfileId(nextSession.profileId);
    setAnalysisTitle(nextSession.title);
    setMomentPreviewState(null);
    if (!options.preserveFilters) {
      setSearchValue("");
      setBandFilter("ALL");
      setPresentationMode("ALL_CANDIDATES");
    }
    if (options.rememberRealSession) {
      window.localStorage.setItem(lastSessionIdStorageKey, nextSession.id);
    }
  }

  /* Profile refresh boundary */
  async function handleProfileExamplesChanged(profileId: string) {
    if (projectSession?.profileId !== profileId) return;
    const refreshedSession = await fetchProjectSession(
      apiBaseUrl,
      projectSession.id,
    );
    applyProjectSession(refreshedSession, {
      preferredCandidateId: selectedCandidateId,
      preserveSelection: true,
      preserveFilters: true,
      rememberRealSession: true,
    });
    setProjectSummaries((current) =>
      upsertProjectSummary(current, buildProjectSummary(refreshedSession)),
    );
  }

  function handleSearchChange(nextValue: string) {
    startTransition(() => setSearchValue(nextValue));
  }

  function handleReviewQueueModeChange(nextMode: ReviewQueueMode) {
    startTransition(() => setReviewQueueMode(nextMode));
  }

  function handleSelectCandidate(candidateId: string) {
    startTransition(() => setSelectedCandidateId(candidateId));
  }

  function handleOpenMomentPreview(
    candidateId: string | null,
    mode: MomentPreviewMode = "SUGGESTED_SEGMENT",
  ) {
    if (!candidateId) return;
    setSelectedCandidateId(candidateId);
    setMomentPreviewState({ candidateId, mode });
  }

  function handleCloseMomentPreview() {
    setMomentPreviewState(null);
  }

  function handleSelectNextPending() {
    if (!projectSession) return;
    const nextPendingCandidateId =
      findNextPendingCandidateId(projectSession, selectedCandidateId) ??
      findFirstPendingCandidateId(projectSession);
    if (nextPendingCandidateId) setSelectedCandidateId(nextPendingCandidateId);
  }

  function handleSelectPreviousVisible() {
    const previousCandidateId = findAdjacentVisibleCandidateId(
      queueCandidates,
      selectedCandidateId,
      -1,
    );
    if (previousCandidateId) setSelectedCandidateId(previousCandidateId);
  }

  function handleSelectNextVisible() {
    const nextCandidateId = findAdjacentVisibleCandidateId(
      queueCandidates,
      selectedCandidateId,
      1,
    );
    if (nextCandidateId) setSelectedCandidateId(nextCandidateId);
  }

  return {
    acceptedCount,
    activeSessionReviewState,
    activeSessionReviewStateLabel,
    applyProjectSession,
    bandFilter,
    candidateEditError,
    decisionsByCandidateId,
    edlPreview,
    handleAccept,
    handleCorrectTranscriptChunk,
    handleCreateManualCandidate,
    handleDefer,
    handleCloseMomentPreview,
    handleExpandResolution,
    handleExpandSetup,
    handleLabelChange,
    handleMergeWithNextVisible,
    handleOpenNextPendingSession,
    handleOpenMomentPreview,
    handleOpenProject,
    handleProfileExamplesChanged,
    handleReject,
    handleRankCandidate,
    handleReviewQueueModeChange,
    handleSaveLabel,
    handleSearchChange,
    handleSelectCandidate,
    handleSelectNextPending,
    handleSelectNextVisible,
    handleSelectPreviousVisible,
    handleSplitCandidate,
    isSavingReview,
    isSavingCandidateEdit,
    isLoadingProjects,
    isSearchingProjects,
    isStrongMatchFallback,
    jsonPreview,
    labelDrafts,
    momentPreviewState,
    nextPendingSession,
    pendingReviewCount,
    pendingSessionCount,
    presentationMode,
    projectSearchError,
    projectSearchResults,
    projectSearchValue,
    profileMatchingSummary,
    currentProfile,
    previewCandidate,
    previewDecision,
    projectSession,
    projectSummaries,
    projectsError,
    queueCandidates,
    rejectedCount,
    reviewError,
    reviewQueueMode,
    reviewQueueState,
    reviewedCount,
    searchFilteredCandidates,
    searchValue,
    selectedCandidate,
    selectedCandidateIndex,
    selectedCandidateVisibleInQueue,
    selectedDecision,
    selectedCandidateId,
    sessionCandidates,
    setBandFilter,
    setPresentationMode,
    setProjectSearchValue,
    setProjectSummaries,
    setProjectsError,
    timestampPreview,
  };
}
