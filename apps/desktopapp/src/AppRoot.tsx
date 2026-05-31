import {
  lazy,
  startTransition,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  acceptedCandidates,
  buildProfileMatchingSummary,
  buildProjectSummary,
  defaultReviewQueueMode,
  deriveSessionReviewState,
  filterCandidates,
  filterCandidatesByPresentationMode,
  filterCandidatesByReviewMode,
  hasStrongCandidateProfileMatch,
  summarizeReviewQueueState,
  type ReviewQueueMode,
} from "@vaexcore/pulse-domain";
import {
  toEdlExport,
  toJsonCandidateExport,
  toTimestampExport,
} from "@vaexcore/pulse-export";
import {
  isSupportedInput,
  supportedInputExtensions,
} from "@vaexcore/pulse-media";
import { defaultProfileId } from "@vaexcore/pulse-profiles";
import {
  analyzeProjectRequestSchema,
  projectSessionSchema,
  type AnalyzeProjectRequest,
  type ConfidenceBand,
  type ProfilePresentationMode,
  type ProjectSession,
} from "@vaexcore/pulse-shared-types";
import { LayoutShell, VaexcorePulseLogo } from "@vaexcore/pulse-ui";
import { DesktopAside } from "./components/DesktopAside";
import type { MomentPreviewMode } from "./components/MomentPreviewModal";
import { ShellHeader } from "./components/ShellHeader";
import {
  isPulseRuntimeReady,
  usePulseRuntimeStatus,
} from "./hooks/usePulseRuntimeStatus";
import { useProfileMediaLibraryState } from "./hooks/useProfileMediaLibraryState";
import {
  lastSessionIdStorageKey,
  useProjectSessionLifecycle,
} from "./hooks/useProjectSessionLifecycle";
import { useReviewKeyboardShortcuts } from "./hooks/useReviewKeyboardShortcuts";
import { useReviewState } from "./hooks/useReviewState";
import { useSuiteWorkspaceState } from "./hooks/useSuiteWorkspaceState";
import { useThemeSync } from "./hooks/useThemeSync";
import {
  loadSessionResumeState,
  resolveSessionResumeState,
  saveSessionResumeState,
} from "./lib/resumeState";
import { fetchWithLocalApiMessage, localApiTimeouts } from "./lib/localApi";
import { fetchProjectSession } from "./lib/pulseProjectApi";
import { upsertProjectSummary } from "./lib/pulseApiUpserts";
import {
  canImportStudioRecording,
  enqueueStudioRecording,
  fetchLatestStudioRecording,
  markStudioIntakePersistence,
  markStudioRecordingExported,
  markStudioRecordingQueueItem,
  restoreStudioIntakePersistence,
  studioIntakePersistenceSets,
  studioEventSocketUrl,
  studioRecordingImportBlockReason,
  studioRecordingFromMessage,
  studioRecordingQueueKey,
  studioRecordingWarning,
  studioRequestHeaders,
  type StudioRecordingExportHistory,
  type StudioIntakePersistence,
  type StudioIntakeState,
  type StudioIntakeQueueItem,
  type StudioRecordingCandidate,
} from "./lib/studioIntegration";
import {
  buildStudioIntakeFilterCounts,
  filterStudioIntakeRecordings,
  loadStudioExportHistory,
  loadStudioIntakePersistence,
  outputReadinessLabel,
  outputReadinessTone,
  persistStudioExportHistory,
  persistStudioIntakePersistence,
  studioIntakeSourceLabel,
  studioIntakeStateLabel,
  studioIntakeStateTone,
  studioRecordingCompletionLabel,
  studioRecordingSizeLabel,
  studioRecordingVerificationLabel,
  type StudioIntakeFilter,
} from "./lib/studioIntakePresentation";
import {
  buildAnalysisLaunchState,
  buildLabelDrafts,
  buildStartGuide,
  buildSuggestedSessionTitle,
  extractSourceName,
  findAdjacentVisibleCandidateId,
  findFirstPendingCandidateId,
  findNextPendingCandidateId,
  formatSessionReviewState,
  resolveProfile,
} from "./lib/sessionPresentation";
import {
  isPulseRecordingHandoff,
  recordPulseTimelineEvent,
  resolveStudioDiscovery,
  studioPulseSourceEventId,
  type PulseRecordingHandoff,
  type SuiteCommand,
} from "./lib/suitePresentation";
import {
  isSettingsWindow,
  openSettingsWindowFromUi,
} from "./lib/settingsWindowBehavior";
import {
  desktopPages,
  initialDesktopPage,
  type DesktopPage,
} from "./lib/desktopNavigation";
import { isTauriRuntime } from "./lib/tauriRuntime";
import { resolveInitialThemeMode, type ThemeMode } from "./lib/themeMode";

type FilterValue = ConfidenceBand | "ALL";

const MomentPreviewModal = lazy(() =>
  import("./components/MomentPreviewModal").then((module) => ({
    default: module.MomentPreviewModal,
  })),
);
const NewAnalysisPage = lazy(() =>
  import("./components/NewAnalysisPage").then((module) => ({
    default: module.NewAnalysisPage,
  })),
);
const ProjectsBacklogPage = lazy(() =>
  import("./components/ProjectsBacklogPage").then((module) => ({
    default: module.ProjectsBacklogPage,
  })),
);
const ReviewWorkspacePage = lazy(() =>
  import("./components/ReviewWorkspacePage").then((module) => ({
    default: module.ReviewWorkspacePage,
  })),
);
const SettingsWindowApp = lazy(() =>
  import("./components/SettingsWindowApp").then((module) => ({
    default: module.SettingsWindowApp,
  })),
);
const SuiteWorkspacePage = lazy(() =>
  import("./components/SuiteWorkspacePage").then((module) => ({
    default: module.SuiteWorkspacePage,
  })),
);

export default function App() {
  return isSettingsWindow() ? (
    <Suspense fallback={null}>
      <SettingsWindowApp />
    </Suspense>
  ) : (
    <DesktopApp />
  );
}

function DesktopApp() {
  const [activePage, setActivePage] = useState<DesktopPage>(() =>
    initialDesktopPage(),
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolveInitialThemeMode(),
  );
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
  const [selectedMediaPath, setSelectedMediaPath] = useState("");
  const [momentPreviewState, setMomentPreviewState] = useState<{
    candidateId: string;
    mode: MomentPreviewMode;
  } | null>(null);
  const [analysisProfileId, setAnalysisProfileId] = useState(defaultProfileId);
  const [analysisTitle, setAnalysisTitle] = useState("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const deferredSearchValue = useDeferredValue(searchValue);
  const apiBaseUrl =
    import.meta.env.VITE_VAEXCORE_PULSE_API_BASE_URL ?? "http://127.0.0.1:4010";
  const [studioIntake, setStudioIntake] = useState<StudioIntakeState>({
    connection: "checking",
    detail: "Looking for vaexcore studio.",
    apiUrl: null,
    latestRecording: null,
    recordings: [],
  });
  const [studioIntakeFilter, setStudioIntakeFilter] =
    useState<StudioIntakeFilter>("ready");
  const [studioIntakePersistence, setStudioIntakePersistence] =
    useState<StudioIntakePersistence>(() => loadStudioIntakePersistence());
  const [studioExportHistory, setStudioExportHistory] =
    useState<StudioRecordingExportHistory>(() => loadStudioExportHistory());
  const [studioExportStatus, setStudioExportStatus] = useState<string | null>(
    null,
  );
  const [isExportingToStudio, setIsExportingToStudio] = useState(false);
  const [studioExportedCandidateIds, setStudioExportedCandidateIds] = useState<
    Record<string, boolean>
  >({});
  const {
    handleLaunchSuite,
    suiteLaunchStatus,
    suiteRefreshError,
    suiteSession,
    suiteStatus,
    suiteTimeline,
  } = useSuiteWorkspaceState();
  const pulseRuntimeStatus = usePulseRuntimeStatus(apiBaseUrl);
  const isPulseReady = isPulseRuntimeReady(pulseRuntimeStatus);
  const {
    handleOpenNextPendingSession,
    handleOpenProject,
    isLoadingProjects,
    nextPendingSession,
    pendingSessionCount,
    projectSummaries,
    projectsError,
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
    cancellingMediaAlignmentJobIds,
    cancellingMediaIndexJobIds,
    handleAddProfileExample,
    handleCancelMediaAlignmentJob,
    handleCancelMediaIndexJob,
    handleCreateMediaAlignmentJob,
    handleCreateMediaEditPair,
    handleCreateMediaIndexJob,
    handleCreateMediaLibraryAsset,
    handleCreateProfile,
    handleReplaceMediaThumbnailOutputs,
    isAddingProfileExample,
    isCreatingMediaAlignmentJob,
    isCreatingMediaEditPair,
    isCreatingMediaIndexJob,
    isCreatingMediaLibraryAsset,
    isCreatingProfile,
    isLoadingMediaAlignmentJobs,
    isLoadingMediaEditPairs,
    isLoadingMediaIndexJobs,
    isLoadingMediaLibraryAssets,
    isLoadingProfileExamples,
    isLoadingProfiles,
    mediaAlignmentJobs,
    mediaAlignmentMatches,
    mediaEditPairs,
    mediaIndexJobs,
    mediaLibraryAssets,
    profileLibraryError,
    profiles,
    savingThumbnailOutputAssetIds,
    selectedProfileExamples,
    selectedProfileId,
    setSelectedProfileId,
  } = useProfileMediaLibraryState({
    apiBaseUrl,
    isPulseReady,
    onProfileExamplesChanged: handleProfileExamplesChanged,
    setAnalysisProfileId,
  });
  const sessionCandidates = projectSession?.candidates ?? [];
  const normalizedSelectedMediaPath = selectedMediaPath.trim();
  const availableProfiles = profiles;
  const hasPersistedProfiles = availableProfiles.length > 0;
  const hasSavedSessions = projectSummaries.length > 0;
  const hasReferenceMaterial =
    availableProfiles.some((profile) => profile.exampleClips.length > 0) ||
    mediaLibraryAssets.some(
      (asset) =>
        asset.scope === "PROFILE" &&
        (asset.assetType === "CLIP" || asset.assetType === "EDIT"),
    );
  const selectedDraftProfile = resolveProfile(
    availableProfiles,
    analysisProfileId,
  );
  const currentProfile = resolveProfile(
    availableProfiles,
    projectSession?.profileId ?? analysisProfileId,
  );
  const profileMatchingSummary = buildProfileMatchingSummary(currentProfile);
  const analysisLaunchState = buildAnalysisLaunchState(
    normalizedSelectedMediaPath,
    {
      hasPersistedProfiles,
      isLoadingProfiles,
      pulseRuntimeStatus,
    },
  );
  const startGuide = buildStartGuide({
    hasPersistedProfiles,
    hasReferenceMaterial,
    hasSavedSessions,
    hasSelectedVideo: Boolean(normalizedSelectedMediaPath),
  });
  const showStartGuide =
    isPulseReady &&
    (!hasSavedSessions || !hasPersistedProfiles || !hasReferenceMaterial);
  const analysisSourceName = normalizedSelectedMediaPath
    ? extractSourceName(normalizedSelectedMediaPath)
    : null;
  const analysisTitlePreview = analysisTitle.trim()
    ? analysisTitle.trim()
    : normalizedSelectedMediaPath
      ? buildSuggestedSessionTitle(normalizedSelectedMediaPath)
      : "Use the source file name";
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
        context.action === "ACCEPT" || context.action === "REJECT";
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
      if (context.action === "ACCEPT" || context.action === "REJECT") {
        void recordPulseTimelineEvent({
          kind: `pulse.review.${context.action.toLowerCase()}`,
          title:
            context.action === "ACCEPT"
              ? "Pulse moment kept"
              : "Pulse moment skipped",
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

  const searchFilteredCandidates = useMemo(() => {
    return filterCandidates(
      sessionCandidates,
      deferredSearchValue,
      bandFilter,
      decisionsByCandidateId,
    );
  }, [
    bandFilter,
    decisionsByCandidateId,
    deferredSearchValue,
    labelDrafts,
    sessionCandidates,
  ]);
  const presentationFilteredCandidates = useMemo(() => {
    return filterCandidatesByPresentationMode(
      searchFilteredCandidates,
      currentProfile,
      presentationMode,
    );
  }, [currentProfile, presentationMode, searchFilteredCandidates]);
  const queueCandidates = useMemo(() => {
    if (!projectSession) {
      return presentationFilteredCandidates;
    }

    return filterCandidatesByReviewMode(
      presentationFilteredCandidates,
      projectSession,
      reviewQueueMode,
    );
  }, [presentationFilteredCandidates, projectSession, reviewQueueMode]);
  const hasAssessedStrongMatches = useMemo(() => {
    return searchFilteredCandidates.some((candidate) =>
      hasStrongCandidateProfileMatch(candidate, currentProfile),
    );
  }, [currentProfile, searchFilteredCandidates]);
  const isStrongMatchFallback =
    presentationMode === "STRONG_MATCHES" && !hasAssessedStrongMatches;

  const selectedCandidate =
    queueCandidates.find((candidate) => candidate.id === selectedCandidateId) ??
    presentationFilteredCandidates.find(
      (candidate) => candidate.id === selectedCandidateId,
    ) ??
    sessionCandidates.find(
      (candidate) => candidate.id === selectedCandidateId,
    ) ??
    queueCandidates[0] ??
    (reviewQueueMode === "ALL" ? presentationFilteredCandidates[0] : null) ??
    null;
  const selectedCandidateIndex = selectedCandidate
    ? sessionCandidates.findIndex(
        (candidate) => candidate.id === selectedCandidate.id,
      )
    : -1;

  const selectedDecision = selectedCandidate
    ? decisionsByCandidateId[selectedCandidate.id]
    : undefined;
  const previewCandidate = momentPreviewState
    ? (sessionCandidates.find(
        (candidate) => candidate.id === momentPreviewState.candidateId,
      ) ?? null)
    : null;
  const previewDecision = previewCandidate
    ? decisionsByCandidateId[previewCandidate.id]
    : undefined;
  const selectedCandidateVisibleInQueue = selectedCandidate
    ? queueCandidates.some((candidate) => candidate.id === selectedCandidate.id)
    : true;

  const acceptedCount = acceptedCandidates(
    sessionCandidates,
    decisionsByCandidateId,
  ).length;
  const rejectedCount = sessionCandidates.filter(
    (candidate) => decisionsByCandidateId[candidate.id]?.action === "REJECT",
  ).length;
  const reviewedCount = acceptedCount + rejectedCount;
  const pendingReviewCount = Math.max(
    sessionCandidates.length - reviewedCount,
    0,
  );
  const reviewQueueState = useMemo(
    () =>
      projectSession
        ? summarizeReviewQueueState(projectSession, reviewQueueMode)
        : null,
    [projectSession, reviewQueueMode],
  );
  const activeSessionSummary = projectSession
    ? buildProjectSummary(projectSession)
    : null;
  const activeSessionReviewState = activeSessionSummary
    ? deriveSessionReviewState(activeSessionSummary)
    : null;
  const activeSessionReviewStateLabel = activeSessionReviewState
    ? formatSessionReviewState(activeSessionReviewState)
    : null;
  const studioPersistenceSets = useMemo(
    () => studioIntakePersistenceSets(studioIntakePersistence),
    [studioIntakePersistence],
  );
  const filteredStudioIntakeRecordings = useMemo(
    () =>
      filterStudioIntakeRecordings(studioIntake.recordings, studioIntakeFilter),
    [studioIntake.recordings, studioIntakeFilter],
  );
  const studioIntakeFilterCounts = useMemo(
    () => buildStudioIntakeFilterCounts(studioIntake.recordings),
    [studioIntake.recordings],
  );

  const timestampPreview = projectSession
    ? toTimestampExport(
        sessionCandidates,
        Object.values(decisionsByCandidateId),
      )
    : "";

  const jsonPreview = projectSession
    ? toJsonCandidateExport(
        projectSession.mediaSource,
        sessionCandidates,
        Object.values(decisionsByCandidateId),
      )
    : "";
  const edlPreview = projectSession
    ? toEdlExport(
        projectSession.mediaSource,
        sessionCandidates,
        Object.values(decisionsByCandidateId),
      )
    : "";
  const activeStudioRecordingKey = useMemo(() => {
    if (
      !projectSession ||
      !studioIntake.latestRecording ||
      studioIntake.latestRecording.outputPath !==
        projectSession.mediaSource.path
    ) {
      return null;
    }
    return studioRecordingQueueKey(studioIntake.latestRecording);
  }, [projectSession, studioIntake.latestRecording]);
  const activeStudioExportHistory = activeStudioRecordingKey
    ? (studioExportHistory.recordings[activeStudioRecordingKey] ?? null)
    : null;

  useThemeSync(themeMode, setThemeMode);

  useEffect(() => {
    persistStudioIntakePersistence(studioIntakePersistence);
  }, [studioIntakePersistence]);

  useEffect(() => {
    persistStudioExportHistory(studioExportHistory);
  }, [studioExportHistory]);

  useEffect(() => {
    let isSubscribed = true;
    let socket: WebSocket | null = null;

    async function connectStudio() {
      const discovery = await resolveStudioDiscovery();
      if (!isSubscribed) {
        return;
      }

      setStudioIntake((current) => ({
        ...current,
        connection: "checking",
        detail: discovery.detail,
        apiUrl: discovery.apiUrl,
      }));

      try {
        const healthResponse = await fetch(`${discovery.apiUrl}/health`, {
          headers: studioRequestHeaders(discovery),
        });

        if (!healthResponse.ok) {
          throw new Error(
            healthResponse.status === 401 || healthResponse.status === 403
              ? "Studio is reachable but requires an API token."
              : `Studio health returned ${healthResponse.status}.`,
          );
        }

        if (!isSubscribed) {
          return;
        }

        const latestRecording = await fetchLatestStudioRecording(
          discovery,
        ).catch(() => null);

        if (!isSubscribed) {
          return;
        }

        setStudioIntake((current) => ({
          ...current,
          connection: "connected",
          detail: latestRecording
            ? `Found Studio recording ${extractSourceName(latestRecording.outputPath)}.`
            : "Connected to vaexcore studio. Waiting for stopped recordings.",
          apiUrl: discovery.apiUrl,
          latestRecording: latestRecording ?? current.latestRecording,
          recordings: enqueueStudioRecording(
            current.recordings,
            latestRecording,
            {
              source: "history",
              ...studioPersistenceSets,
            },
          ),
        }));

        socket = new WebSocket(studioEventSocketUrl(discovery));
        socket.addEventListener("message", (event) => {
          const nextRecording = studioRecordingFromMessage(event.data);
          if (!nextRecording || !isSubscribed) {
            return;
          }

          setStudioIntake((current) => ({
            ...current,
            connection: "connected",
            detail: `Studio stopped recording ${extractSourceName(nextRecording.outputPath)}.`,
            apiUrl: discovery.apiUrl,
            latestRecording: nextRecording,
            recordings: enqueueStudioRecording(
              current.recordings,
              nextRecording,
              {
                source: "event",
                ...studioPersistenceSets,
              },
            ),
          }));
        });
        socket.addEventListener("close", () => {
          if (!isSubscribed) {
            return;
          }
          setStudioIntake((current) => ({
            ...current,
            connection: current.latestRecording ? "connected" : "unavailable",
            detail: current.latestRecording
              ? "Studio event stream closed; latest stopped recording is still available."
              : "Studio event stream closed.",
          }));
        });
      } catch (error) {
        if (!isSubscribed) {
          return;
        }
        setStudioIntake((current) => ({
          ...current,
          connection: "unavailable",
          detail:
            error instanceof Error
              ? error.message
              : "Studio is not reachable right now.",
          apiUrl: discovery.apiUrl,
        }));
      }
    }

    void connectStudio();

    return () => {
      isSubscribed = false;
      socket?.close();
    };
  }, [studioPersistenceSets]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let isSubscribed = true;

    async function consumeHandoff() {
      try {
        const handoff = await invoke<PulseRecordingHandoff | null>(
          "consume_pulse_recording_handoff",
        );
        if (handoff && isSubscribed) {
          applyPulseRecordingHandoff(handoff);
        }
        const commands = await invoke<SuiteCommand[]>("consume_suite_commands");
        for (const command of commands) {
          if (
            command.command === "open-review" &&
            isPulseRecordingHandoff(command.payload) &&
            isSubscribed
          ) {
            applyPulseRecordingHandoff(command.payload);
          } else if (command.command === "focus-review" && isSubscribed) {
            setActivePage("candidate-review");
          } else if (command.command === "focus-suite" && isSubscribed) {
            setActivePage("suite");
          }
        }
      } catch {
        // Handoff polling is best-effort and should not interrupt review work.
      }
    }

    void consumeHandoff();
    const interval = window.setInterval(() => {
      void consumeHandoff();
    }, 2500);

    return () => {
      isSubscribed = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (activePage === "candidate-review") {
      return;
    }

    setMomentPreviewState(null);
  }, [activePage]);

  useEffect(() => {
    if (!projectSession) {
      return;
    }

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
    onExpandResolution: handleExpandResolution,
    onExpandSetup: handleExpandSetup,
    onOpenMomentPreview: handleOpenMomentPreview,
    onReject: handleReject,
    onSelectNextPending: handleSelectNextPending,
    onSelectNextVisible: handleSelectNextVisible,
    onSelectPreviousVisible: handleSelectPreviousVisible,
    selectedCandidateId: selectedCandidate?.id ?? null,
  });

  async function handlePickMedia() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selection = await open({
        directory: false,
        multiple: false,
        filters: [
          {
            name: "Media",
            extensions: supportedInputExtensions.map((extension) =>
              extension.slice(1),
            ),
          },
        ],
      });

      if (typeof selection === "string" && isSupportedInput(selection)) {
        setSelectedMediaPath(selection);
        setAnalysisError(null);
        if (!analysisTitle.trim()) {
          setAnalysisTitle(buildSuggestedSessionTitle(selection));
        }
        setActivePage("new-analysis");
        return;
      }

      if (typeof selection === "string") {
        setSelectedMediaPath(selection);
        setAnalysisError(
          `Unsupported file type. Try: ${supportedInputExtensions.join(", ")}`,
        );
        setActivePage("new-analysis");
        return;
      }
    } catch {
      setAnalysisError(
        "Could not open the file picker. You can paste a full file path instead.",
      );
    }
  }

  function handleUseStudioRecording(recording: StudioRecordingCandidate) {
    setSelectedMediaPath(recording.outputPath);
    setAnalysisError(null);
    if (!analysisTitle.trim()) {
      setAnalysisTitle(buildSuggestedSessionTitle(recording.outputPath));
    }
    setActivePage("new-analysis");
  }

  function handleImportStudioRecording(item: StudioIntakeQueueItem) {
    if (!canImportStudioRecording(item)) {
      return;
    }

    handleUseStudioRecording(item);
    const key = studioRecordingQueueKey(item);
    setStudioIntakePersistence((current) =>
      markStudioIntakePersistence(current, "consumed", key),
    );
    setStudioIntake((current) => ({
      ...current,
      latestRecording: item,
      detail: `Imported ${extractSourceName(item.outputPath)} into Scan Intake.`,
      recordings: markStudioRecordingQueueItem(
        current.recordings,
        item.queueId,
        "already-consumed",
      ),
    }));
  }

  function handleDismissStudioRecording(item: StudioIntakeQueueItem) {
    const key = studioRecordingQueueKey(item);
    setStudioIntakePersistence((current) =>
      markStudioIntakePersistence(current, "dismissed", key),
    );
    setStudioIntake((current) => ({
      ...current,
      detail: `Hidden ${extractSourceName(item.outputPath)} from active intake.`,
      recordings: markStudioRecordingQueueItem(
        current.recordings,
        item.queueId,
        "dismissed",
      ),
    }));
  }

  function handleRestoreStudioRecording(item: StudioIntakeQueueItem) {
    const key = studioRecordingQueueKey(item);
    setStudioIntakePersistence((current) =>
      restoreStudioIntakePersistence(current, key),
    );
    setStudioIntake((current) => ({
      ...current,
      detail: `Restored ${extractSourceName(item.outputPath)} to intake.`,
      recordings: markStudioRecordingQueueItem(
        current.recordings,
        item.queueId,
        item.verificationState === "missing" ||
          item.verificationState === "empty" ||
          item.verificationState === "unreadable" ||
          item.completionState === "failed"
          ? "unusable"
          : "ready",
      ),
    }));
  }

  async function handleRefreshStudioIntake() {
    setStudioIntake((current) => ({
      ...current,
      connection: "checking",
      detail: "Refreshing Studio recordings.",
    }));

    try {
      const discovery = await resolveStudioDiscovery();
      const latestRecording = await fetchLatestStudioRecording(discovery);
      setStudioIntake((current) => ({
        ...current,
        connection: "connected",
        detail: latestRecording
          ? `Found Studio recording ${extractSourceName(latestRecording.outputPath)}.`
          : "Connected to Studio; no recent recording was available.",
        apiUrl: discovery.apiUrl,
        latestRecording: latestRecording ?? current.latestRecording,
        recordings: enqueueStudioRecording(
          current.recordings,
          latestRecording,
          {
            source: "history",
            ...studioPersistenceSets,
          },
        ),
      }));
    } catch (error) {
      setStudioIntake((current) => ({
        ...current,
        connection: "unavailable",
        detail:
          error instanceof Error ? error.message : "Studio refresh failed.",
      }));
    }
  }

  function applyPulseRecordingHandoff(handoff: PulseRecordingHandoff) {
    const recording: StudioRecordingCandidate = {
      sessionId: handoff.recording.sessionId,
      outputPath: handoff.recording.outputPath,
      profileId: handoff.recording.profileId,
      profileName: handoff.recording.profileName,
      captureMode: handoff.recording.captureMode ?? null,
      captureDetail: handoff.recording.captureDetail ?? null,
      completionState: handoff.recording.completionState ?? null,
      completionDetail: handoff.recording.completionDetail ?? null,
      verificationState: handoff.recording.verificationState ?? null,
      verificationDetail: handoff.recording.verificationDetail ?? null,
      fileSizeBytes: handoff.recording.fileSizeBytes ?? null,
      durationMs: handoff.recording.durationMs ?? null,
      processStatus: handoff.recording.processStatus ?? null,
      stoppedAt: handoff.recording.stoppedAt,
      outputReadiness: handoff.outputReady ?? null,
    };
    const readinessDetail = handoff.outputReady
      ? ` ${outputReadinessLabel(handoff.outputReady)}.`
      : "";

    setStudioIntake((current) => ({
      ...current,
      connection: "connected",
      detail: `${handoff.sourceAppName} queued ${extractSourceName(recording.outputPath)} for manual import.${readinessDetail}`,
      latestRecording: recording,
      recordings: enqueueStudioRecording(current.recordings, recording, {
        source: "handoff",
        requestId: handoff.requestId,
        receivedAt: handoff.requestedAt,
        ...studioPersistenceSets,
      }),
    }));
    setAnalysisError(null);
    setActivePage("new-analysis");
  }

  async function handleExportAcceptedToStudio() {
    if (!projectSession || isExportingToStudio) {
      return;
    }

    const keptCandidates = acceptedCandidates(
      projectSession.candidates,
      decisionsByCandidateId,
    );
    if (keptCandidates.length === 0) {
      setStudioExportStatus("No kept moments are ready to send.");
      return;
    }

    setIsExportingToStudio(true);
    setStudioExportStatus("Sending kept moments to Studio...");
    const exportedAt = new Date().toISOString();

    try {
      const discovery = await resolveStudioDiscovery();
      const recordingSessionId =
        studioIntake.latestRecording?.outputPath ===
        projectSession.mediaSource.path
          ? studioIntake.latestRecording.sessionId
          : null;

      const confirmedSourceEventIds = await Promise.all(
        keptCandidates.map(async (candidate) => {
          const decision = decisionsByCandidateId[candidate.id];
          const segment =
            decision?.adjustedSegment ?? candidate.suggestedSegment;
          const label = decision?.label ?? candidate.editableLabel;
          const sourceEventId = studioPulseSourceEventId(
            projectSession.id,
            candidate.id,
          );
          const headers = new Headers(studioRequestHeaders(discovery));
          headers.set("content-type", "application/json");
          const response = await fetch(`${discovery.apiUrl}/marker/create`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              label: `Pulse keep: ${label}`,
              source_app: "vaexcore-pulse",
              source_event_id: sourceEventId,
              recording_session_id: recordingSessionId,
              media_path: projectSession.mediaSource.path,
              start_seconds: segment.startSeconds,
              end_seconds: segment.endSeconds,
              metadata: {
                contract: "vaexcore.studio.marker.v1",
                schemaVersion: 1,
                exportedAt,
                reviewStatus: "accepted",
                source: {
                  appId: "vaexcore-pulse",
                  appName: "vaexcore pulse",
                  workflow: "accepted-highlight-export",
                },
                pulseSessionId: projectSession.id,
                pulseSessionTitle: projectSession.title,
                candidateId: candidate.id,
                sourceEventId,
                recordingSessionId,
                media: {
                  path: projectSession.mediaSource.path,
                  durationSeconds: projectSession.mediaSource.durationSeconds,
                },
                timestamps: {
                  startSeconds: segment.startSeconds,
                  endSeconds: segment.endSeconds,
                  durationSeconds: segment.endSeconds - segment.startSeconds,
                  adjusted: Boolean(decision?.adjustedSegment),
                },
                confidenceBand: candidate.confidenceBand,
                scoreEstimate: candidate.scoreEstimate,
                reasonCodes: candidate.reasonCodes,
                reviewTags: candidate.reviewTags,
                label,
                transcriptSnippet: candidate.transcriptSnippet,
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`Studio marker create returned ${response.status}`);
          }

          const body = (await response.json().catch(() => null)) as {
            ok?: boolean;
          } | null;
          if (body?.ok !== true) {
            throw new Error(
              "Studio marker create returned an invalid response",
            );
          }

          return sourceEventId;
        }),
      );

      setStudioExportedCandidateIds((current) => ({
        ...current,
        ...Object.fromEntries(
          confirmedSourceEventIds.map((sourceEventId) => [sourceEventId, true]),
        ),
      }));
      setStudioExportStatus(
        `Confirmed ${confirmedSourceEventIds.length} kept moments in Studio.`,
      );
      const exportedRecordingKey =
        studioIntake.latestRecording?.outputPath ===
        projectSession.mediaSource.path
          ? studioRecordingQueueKey(studioIntake.latestRecording)
          : null;
      if (exportedRecordingKey) {
        setStudioIntakePersistence((current) =>
          markStudioIntakePersistence(
            current,
            "exported",
            exportedRecordingKey,
          ),
        );
        setStudioExportHistory((current) =>
          markStudioRecordingExported(current, exportedRecordingKey, {
            exportedAt,
            formats: [
              ...(timestampPreview ? (["timestamps"] as const) : []),
              ...(jsonPreview ? (["json"] as const) : []),
              ...(edlPreview ? (["edl"] as const) : []),
            ],
            acceptedCount: keptCandidates.length,
            pulseSessionId: projectSession.id,
            pulseSessionTitle: projectSession.title,
          }),
        );
      }
      setStudioIntake((current) => ({
        ...current,
        connection: "connected",
        detail: "Studio accepted the latest kept moments.",
        apiUrl: discovery.apiUrl,
        recordings: exportedRecordingKey
          ? current.recordings.map((item) =>
              studioRecordingQueueKey(item) === exportedRecordingKey
                ? {
                    ...item,
                    state: "already-exported",
                    detail:
                      "Studio recording already has exported review results.",
                  }
                : item,
            )
          : current.recordings,
      }));
    } catch (error) {
      setStudioExportStatus(
        error instanceof Error
          ? `Studio export failed: ${error.message}`
          : "Studio export failed.",
      );
    } finally {
      setIsExportingToStudio(false);
    }
  }

  async function handleProfileExamplesChanged(profileId: string) {
    if (projectSession?.profileId !== profileId) {
      return;
    }

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
    startTransition(() => {
      setSearchValue(nextValue);
    });
  }

  function handleReviewQueueModeChange(nextMode: ReviewQueueMode) {
    startTransition(() => {
      setReviewQueueMode(nextMode);
    });
  }

  function handleSelectCandidate(candidateId: string) {
    startTransition(() => {
      setSelectedCandidateId(candidateId);
    });
  }

  function handleLabelChange(nextValue: string) {
    if (!selectedCandidate) {
      return;
    }

    clearError();
    setLabelDrafts((current) => ({
      ...current,
      [selectedCandidate.id]: nextValue,
    }));
  }

  function handleSaveLabel() {
    if (!selectedCandidate) {
      return;
    }

    void upsertDecision(selectedCandidate, "RELABEL", {
      label: labelDrafts[selectedCandidate.id],
    });
  }

  function handleAccept() {
    if (!selectedCandidate) {
      return;
    }

    void upsertDecision(selectedCandidate, "ACCEPT", {
      label: labelDrafts[selectedCandidate.id],
    });
  }

  function handleReject() {
    if (!selectedCandidate) {
      return;
    }

    void upsertDecision(selectedCandidate, "REJECT", {
      label: labelDrafts[selectedCandidate.id],
    });
  }

  function handleExpandSetup() {
    if (!selectedCandidate) {
      return;
    }

    const currentSegment =
      decisionsByCandidateId[selectedCandidate.id]?.adjustedSegment ??
      selectedCandidate.suggestedSegment;

    void upsertDecision(selectedCandidate, "RETIME", {
      adjustedSegment: {
        startSeconds: Math.max(0, currentSegment.startSeconds - 2),
        endSeconds: currentSegment.endSeconds,
      },
      label: labelDrafts[selectedCandidate.id],
    });
  }

  function handleExpandResolution() {
    if (!selectedCandidate || !projectSession) {
      return;
    }

    const currentSegment =
      decisionsByCandidateId[selectedCandidate.id]?.adjustedSegment ??
      selectedCandidate.suggestedSegment;

    void upsertDecision(selectedCandidate, "RETIME", {
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

  function handleOpenMomentPreview(
    candidateId: string | null,
    mode: MomentPreviewMode = "SUGGESTED_SEGMENT",
  ) {
    if (!candidateId) {
      return;
    }

    setSelectedCandidateId(candidateId);
    setMomentPreviewState({
      candidateId,
      mode,
    });
  }

  function handleCloseMomentPreview() {
    setMomentPreviewState(null);
  }

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

  async function handleAnalyze() {
    if (!analysisLaunchState.canAnalyze) {
      setAnalysisError(analysisLaunchState.detail);
      return;
    }

    const normalizedSourcePath = normalizedSelectedMediaPath;

    const request = analyzeProjectRequestSchema.parse({
      sourcePath: normalizedSourcePath,
      profileId: analysisProfileId,
      sessionTitle: analysisTitle.trim() || undefined,
    }) satisfies AnalyzeProjectRequest;

    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const response = await fetchWithLocalApiMessage(
        `${apiBaseUrl}/api/projects/analyze`,
        apiBaseUrl,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
        },
        "Unable to start scan.",
        localApiTimeouts.analysis,
      );

      const payload = (await response.json().catch(() => null)) as
        | {
            message?: string;
          }
        | ProjectSession
        | null;

      if (!response.ok) {
        throw new Error(
          payload && "message" in payload && payload.message
            ? payload.message
            : "Scan request failed",
        );
      }

      const nextSession = projectSessionSchema.parse(payload);
      applyProjectSession(nextSession, {
        rememberRealSession: true,
      });
      setSelectedMediaPath(normalizedSourcePath);
      setProjectSummaries((current) =>
        upsertProjectSummary(current, buildProjectSummary(nextSession)),
      );
      void recordPulseTimelineEvent({
        kind: "pulse.session.scanned",
        title: "Pulse scan ready",
        detail: `${nextSession.title} has ${nextSession.candidates.length} suggested moment${nextSession.candidates.length === 1 ? "" : "s"}.`,
        metadata: {
          pulseSessionId: nextSession.id,
          sourcePath: nextSession.mediaSource.path,
          candidateCount: nextSession.candidates.length,
          profileId: nextSession.profileId,
        },
      });
      setProjectsError(null);
      setActivePage("candidate-review");
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "Something went wrong while starting the scan.",
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleSelectNextPending() {
    if (!projectSession) {
      return;
    }

    const nextPendingCandidateId =
      findNextPendingCandidateId(projectSession, selectedCandidateId) ??
      findFirstPendingCandidateId(projectSession);

    if (!nextPendingCandidateId) {
      return;
    }

    setSelectedCandidateId(nextPendingCandidateId);
  }

  function handleSelectPreviousVisible() {
    const previousCandidateId = findAdjacentVisibleCandidateId(
      queueCandidates,
      selectedCandidateId,
      -1,
    );

    if (!previousCandidateId) {
      return;
    }

    setSelectedCandidateId(previousCandidateId);
  }

  function handleSelectNextVisible() {
    const nextCandidateId = findAdjacentVisibleCandidateId(
      queueCandidates,
      selectedCandidateId,
      1,
    );

    if (!nextCandidateId) {
      return;
    }

    setSelectedCandidateId(nextCandidateId);
  }

  function handleReturnToProjects() {
    setActivePage("projects");
  }

  function renderDesktopPage() {
    if (activePage === "suite") {
      return (
        <SuiteWorkspacePage
          onLaunchSuite={() => {
            void handleLaunchSuite();
          }}
          suiteLaunchStatus={suiteLaunchStatus}
          suiteRefreshError={suiteRefreshError}
          suiteSession={suiteSession}
          suiteStatus={suiteStatus}
          suiteTimeline={suiteTimeline}
        />
      );
    }

    if (activePage === "projects") {
      return (
        <ProjectsBacklogPage
          activeSessionId={projectSession?.id ?? null}
          availableProfiles={availableProfiles}
          isLoadingProjects={isLoadingProjects}
          nextPendingSession={nextPendingSession}
          onOpenNextPendingSession={() => {
            void handleOpenNextPendingSession();
          }}
          onOpenProject={(sessionId) => {
            void handleOpenProject(sessionId);
          }}
          onScanAnotherVideo={() => setActivePage("new-analysis")}
          pendingSessionCount={pendingSessionCount}
          projectSummaries={projectSummaries}
          projectsError={projectsError}
        />
      );
    }

    if (activePage === "new-analysis") {
      return (
        <NewAnalysisPage
          activeSessionReviewStateLabel={activeSessionReviewStateLabel}
          analysisError={analysisError}
          analysisLaunchState={analysisLaunchState}
          analysisProfileId={analysisProfileId}
          analysisSourceName={analysisSourceName}
          analysisTitle={analysisTitle}
          analysisTitlePreview={analysisTitlePreview}
          availableProfiles={availableProfiles}
          filteredStudioIntakeRecordings={filteredStudioIntakeRecordings}
          hasPersistedProfiles={hasPersistedProfiles}
          isAnalyzing={isAnalyzing}
          isLoadingProfiles={isLoadingProfiles}
          normalizedSelectedMediaPath={normalizedSelectedMediaPath}
          onAnalyze={() => {
            void handleAnalyze();
          }}
          onDismissStudioRecording={handleDismissStudioRecording}
          onPickMedia={() => {
            void handlePickMedia();
          }}
          onProfileChange={(profileId) => {
            setAnalysisProfileId(profileId);
            setAnalysisError(null);
          }}
          onRefreshStudioIntake={() => {
            void handleRefreshStudioIntake();
          }}
          onRestoreStudioRecording={handleRestoreStudioRecording}
          onSelectedMediaPathChange={(mediaPath) => {
            setSelectedMediaPath(mediaPath);
            setAnalysisError(null);
          }}
          onSetUpProfile={() => openSettingsWindowFromUi("profile-setup")}
          onStudioIntakeFilterChange={setStudioIntakeFilter}
          onStudioRecordingImport={handleImportStudioRecording}
          onTitleChange={(title) => {
            setAnalysisTitle(title);
            setAnalysisError(null);
          }}
          projectSession={projectSession}
          selectedDraftProfile={selectedDraftProfile}
          selectedMediaPath={selectedMediaPath}
          showStartGuide={showStartGuide}
          startGuide={startGuide}
          studioExportHistory={studioExportHistory}
          studioIntake={studioIntake}
          studioIntakeFilter={studioIntakeFilter}
          studioIntakeFilterCounts={studioIntakeFilterCounts}
        />
      );
    }

    return (
      <ReviewWorkspacePage
        acceptedCount={acceptedCount}
        activeSessionReviewState={activeSessionReviewState}
        activeSessionReviewStateLabel={activeSessionReviewStateLabel}
        bandFilter={bandFilter}
        currentProfile={currentProfile}
        decisionsByCandidateId={decisionsByCandidateId}
        edlPreview={edlPreview}
        isCurrentCandidateSentToStudio={Boolean(
          projectSession &&
          selectedCandidate &&
          studioExportedCandidateIds[
            studioPulseSourceEventId(projectSession.id, selectedCandidate.id)
          ],
        )}
        isExportingToStudio={isExportingToStudio}
        isSavingReview={isSavingReview}
        isStrongMatchFallback={isStrongMatchFallback}
        jsonPreview={jsonPreview}
        labelDraft={
          selectedCandidate ? (labelDrafts[selectedCandidate.id] ?? "") : ""
        }
        nextPendingSession={nextPendingSession}
        onAccept={handleAccept}
        onBandFilterChange={setBandFilter}
        onExportAcceptedToStudio={() => {
          void handleExportAcceptedToStudio();
        }}
        onExpandResolution={handleExpandResolution}
        onExpandSetup={handleExpandSetup}
        onLabelChange={handleLabelChange}
        onOpenMomentPreview={handleOpenMomentPreview}
        onOpenNextPendingSession={() => {
          void handleOpenNextPendingSession();
        }}
        onPresentationModeChange={setPresentationMode}
        onReject={handleReject}
        onReturnToProjects={handleReturnToProjects}
        onReviewQueueModeChange={handleReviewQueueModeChange}
        onSaveLabel={handleSaveLabel}
        onSearchChange={handleSearchChange}
        onSelectCandidate={handleSelectCandidate}
        onSelectNextPending={handleSelectNextPending}
        onSelectNextVisible={handleSelectNextVisible}
        onSelectPreviousVisible={handleSelectPreviousVisible}
        pendingReviewCount={pendingReviewCount}
        presentationMode={presentationMode}
        profileMatchingSummary={profileMatchingSummary}
        projectSession={projectSession}
        queueCandidates={queueCandidates}
        rejectedCount={rejectedCount}
        reviewError={reviewError}
        reviewQueueMode={reviewQueueMode}
        reviewQueueState={reviewQueueState}
        reviewedCount={reviewedCount}
        searchFilteredCandidateCount={searchFilteredCandidates.length}
        searchValue={searchValue}
        selectedCandidate={selectedCandidate}
        selectedCandidateIndex={selectedCandidateIndex}
        selectedCandidateVisibleInQueue={selectedCandidateVisibleInQueue}
        selectedDecision={selectedDecision}
        sessionCandidates={sessionCandidates}
        studioExportStatus={studioExportStatus}
        studioRecordingExportHistory={activeStudioExportHistory}
        timestampPreview={timestampPreview}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <LayoutShell
        activeId={activePage}
        appName="vaexcore pulse"
        aside={
          <DesktopAside
            acceptedCount={acceptedCount}
            activePage={activePage}
            nextPendingSession={nextPendingSession}
            pendingReviewCount={pendingReviewCount}
            pendingSessionCount={pendingSessionCount}
            projectSummaries={projectSummaries}
            rejectedCount={rejectedCount}
            selectedCandidateTranscriptSnippet={
              selectedCandidate?.transcriptSnippet ?? null
            }
            selectedMediaPath={selectedMediaPath}
            sessionCandidateCount={sessionCandidates.length}
            suiteSession={suiteSession}
            suiteStatus={suiteStatus}
          />
        }
        brandMark={<VaexcorePulseLogo />}
        navItems={desktopPages}
        onSelect={(pageId) => {
          setActivePage(pageId as DesktopPage);
        }}
        sidebarActions={
          <button
            aria-label="Open Settings"
            className="settings-icon-button"
            onClick={() => openSettingsWindowFromUi()}
            title="Open Settings"
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="18"
              viewBox="0 0 24 24"
              width="18"
            >
              <path
                d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.04.04a1.95 1.95 0 0 1-2.76 2.76l-.04-.04a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.96 1.46v.12a1.95 1.95 0 0 1-3.9 0v-.07a1.6 1.6 0 0 0-1.05-1.5 1.6 1.6 0 0 0-1.77.32l-.04.04a1.95 1.95 0 0 1-2.76-2.76l.04-.04A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.46-.96h-.12a1.95 1.95 0 0 1 0-3.9h.07a1.6 1.6 0 0 0 1.5-1.05 1.6 1.6 0 0 0-.32-1.77l-.04-.04a1.95 1.95 0 0 1 2.76-2.76l.04.04a1.6 1.6 0 0 0 1.77.32h.01a1.6 1.6 0 0 0 .96-1.46v-.12a1.95 1.95 0 0 1 3.9 0v.07a1.6 1.6 0 0 0 .96 1.46 1.6 1.6 0 0 0 1.77-.32l.04-.04a1.95 1.95 0 0 1 2.76 2.76l-.04.04a1.6 1.6 0 0 0-.32 1.77v.01a1.6 1.6 0 0 0 1.46.96h.12a1.95 1.95 0 0 1 0 3.9h-.07a1.6 1.6 0 0 0-1.5 1.05Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        }
        subtitle={
          activePage === "suite"
            ? "Watch the local suite session, shared timeline, and connected app presence."
            : "Scan long videos, review likely moments quickly, and build references from your own edits."
        }
        title={activePage === "suite" ? "Suite Workspace" : "Review Workspace"}
      >
        {activePage === "suite" ? null : (
          <ShellHeader
            activeSessionStateLabel={
              activeSessionReviewStateLabel
                ? activeSessionReviewStateLabel
                : normalizedSelectedMediaPath
                  ? "Video staged for scanning"
                  : "Choose a video or reopen a saved session."
            }
            acceptedCount={acceptedCount}
            currentProfileLabel={currentProfile.name}
            currentSessionLabel={projectSession?.title ?? "No session loaded"}
            onPickMedia={handlePickMedia}
            onLaunchSuite={() => {
              void handleLaunchSuite();
            }}
            pendingCount={pendingReviewCount}
            rejectedCount={rejectedCount}
            selectedMediaPath={selectedMediaPath || "No video selected yet."}
            suiteLaunchStatus={suiteLaunchStatus}
            totalCount={sessionCandidates.length}
          />
        )}
        <Suspense
          fallback={
            <section className="utility-panel glass-panel">
              <p className="queue-summary-copy">Loading workspace...</p>
            </section>
          }
        >
          {renderDesktopPage()}
          <MomentPreviewModal
            apiBaseUrl={apiBaseUrl}
            candidate={previewCandidate}
            decision={previewDecision}
            initialMode={momentPreviewState?.mode ?? "SUGGESTED_SEGMENT"}
            isOpen={
              activePage === "candidate-review" && previewCandidate !== null
            }
            mediaDurationSeconds={
              projectSession?.mediaSource.durationSeconds ?? 0
            }
            mediaPath={projectSession?.mediaSource.path ?? selectedMediaPath}
            onClose={handleCloseMomentPreview}
          />
        </Suspense>
      </LayoutShell>
    </div>
  );
}
