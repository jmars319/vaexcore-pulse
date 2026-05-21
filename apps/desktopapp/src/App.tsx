import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  acceptedCandidates,
  analysisCoverageTone,
  buildProfileMatchingSummary,
  buildProjectSummary,
  summarizeSessionQuality,
  defaultReviewQueueMode,
  deriveSessionReviewState,
  filterCandidates,
  filterCandidatesByPresentationMode,
  filterCandidatesByReviewMode,
  findNextPendingSessionSummary,
  hasStrongCandidateProfileMatch,
  isCandidatePending,
  reviewedCandidateCount,
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
  addExampleClipRequestSchema,
  analyzeProjectRequestSchema,
  cancelMediaAlignmentJobRequestSchema,
  cancelMediaIndexJobRequestSchema,
  clipProfileSchema,
  createMediaAlignmentJobRequestSchema,
  createMediaEditPairRequestSchema,
  createMediaIndexJobRequestSchema,
  createMediaLibraryAssetRequestSchema,
  createClipProfileRequestSchema,
  exampleClipSchema,
  mediaAlignmentJobSchema,
  mediaAlignmentMatchSchema,
  mediaEditPairSchema,
  mediaIndexJobSchema,
  mediaLibraryAssetSchema,
  projectSessionSchema,
  projectSessionSummarySchema,
  replaceMediaThumbnailOutputsRequestSchema,
  type AddExampleClipRequest,
  type AnalyzeProjectRequest,
  type CancelMediaAlignmentJobRequest,
  type CancelMediaIndexJobRequest,
  type ClipProfile,
  type ConfidenceBand,
  type CreateMediaAlignmentJobRequest,
  type CreateMediaEditPairRequest,
  type CreateMediaIndexJobRequest,
  type CreateMediaLibraryAssetRequest,
  type CreateClipProfileRequest,
  type ExampleClip,
  type ExampleClipSourceType,
  type MediaAlignmentJob,
  type MediaAlignmentMatch,
  type MediaEditPair,
  type MediaIndexJob,
  type MediaLibraryAsset,
  type ProfilePresentationMode,
  type ProjectSession,
  type ProjectSessionSummary,
  type ReplaceMediaThumbnailOutputsRequest,
} from "@vaexcore/pulse-shared-types";
import {
  LayoutShell,
  TranscriptSnippetBlock,
  VaexcorePulseLogo,
} from "@vaexcore/pulse-ui";
import { CandidateDetail } from "./components/CandidateDetail";
import { CandidateQueue } from "./components/CandidateQueue";
import {
  MomentPreviewModal,
  type MomentPreviewMode,
} from "./components/MomentPreviewModal";
import { SessionOverview } from "./components/SessionOverview";
import { CandidateTimeline } from "./components/CandidateTimeline";
import { ProfileWorkspace } from "./components/ProfileWorkspace";
import { ShellHeader } from "./components/ShellHeader";
import { useReviewState } from "./hooks/useReviewState";
import {
  loadSessionResumeState,
  resolveSessionResumeState,
  saveSessionResumeState,
} from "./lib/resumeState";
import { fetchWithLocalApiMessage, localApiTimeouts } from "./lib/localApi";
import {
  canImportStudioRecording,
  enqueueStudioRecording,
  fetchLatestStudioRecording,
  markStudioIntakePersistence,
  markStudioRecordingExported,
  markStudioRecordingQueueItem,
  parseStudioExportHistory,
  parseStudioIntakePersistence,
  restoreStudioIntakePersistence,
  serializeStudioExportHistory,
  serializeStudioIntakePersistence,
  STUDIO_EXPORT_HISTORY_STORAGE_KEY,
  STUDIO_INTAKE_STORAGE_KEY,
  studioIntakePersistenceSets,
  studioEventSocketUrl,
  studioRecordingImportBlockReason,
  studioRecordingFromMessage,
  studioRecordingQueueKey,
  studioRecordingWarning,
  studioRequestHeaders,
  type StudioRecordingExportHistory,
  type StudioIntakePersistence,
  type StudioDiscovery,
  type StudioIntakeState,
  type StudioIntakeQueueItem,
  type StudioOutputReadiness,
  type StudioRecordingCandidate,
} from "./lib/studioIntegration";

type FilterValue = ConfidenceBand | "ALL";
type DesktopPage = "projects" | "new-analysis" | "candidate-review" | "suite";
type AnalysisReadiness = {
  canAnalyze: boolean;
  statusLabel: string;
  headline: string;
  detail: string;
  tone: "ready" | "blocked";
};
type SuiteLaunchResult = {
  appName: string;
  ok: boolean;
  detail: string;
};
type SuiteAppStatus = {
  appId: string;
  appName: string;
  launchName: string;
  bundleIdentifier: string;
  installed: boolean;
  running: boolean;
  reachable: boolean;
  stale: boolean;
  discoveryFile: string;
  pid: number | null;
  apiUrl: string | null;
  healthUrl: string | null;
  updatedAt: string | null;
  capabilities: string[];
  suiteSessionId: string | null;
  activity: string | null;
  activityDetail: string | null;
  localRuntime: SuiteLocalRuntime | null;
  detail: string;
};
type SuiteLocalRuntime = {
  contractVersion: 1;
  mode: "local-first";
  state: "ready" | "degraded" | "blocked";
  appStorageDir: string;
  suiteDir: string;
  secureStorage: string;
  secretStorageState: string;
  durableStorage: string[];
  networkPolicy: "localhost-only";
  dependencies: SuiteLocalRuntimeDependency[];
};
type SuiteLocalRuntimeDependency = {
  name: string;
  kind: string;
  state: string;
  detail: string;
};
type SuiteSession = {
  schemaVersion: number;
  sessionId: string;
  title: string;
  status: string;
  ownerApp: string;
  createdAt: string;
  updatedAt: string;
};
type SuiteTimelineEvent = {
  schemaVersion: number;
  eventId: string;
  sourceApp: string;
  sourceAppName: string;
  kind: string;
  title: string;
  detail: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};
type SuiteTimelineItem = {
  id: string;
  kind: "presence" | "recording" | "review" | "event";
  title: string;
  detail: string;
  timestamp: string;
  source: string;
};
type PulseRecordingHandoff = {
  schemaVersion: number;
  requestId: string;
  sourceApp: string;
  sourceAppName: string;
  targetApp: string;
  requestedAt: string;
  recording: {
    sessionId: string;
    outputPath: string;
    profileId: string | null;
    profileName: string | null;
    captureMode?: string | null;
    captureDetail?: string | null;
    completionState?: StudioRecordingCandidate["completionState"];
    completionDetail?: string | null;
    verificationState?: StudioRecordingCandidate["verificationState"];
    verificationDetail?: string | null;
    fileSizeBytes?: number | null;
    durationMs?: number | null;
    processStatus?: string | null;
    stoppedAt: string;
  };
  outputReady?: StudioOutputReadiness | null;
};
type StudioIntakeFilter =
  | "ready"
  | "needs-attention"
  | "imported"
  | "exported"
  | "hidden";
type SuiteCommand = {
  schemaVersion: number;
  commandId: string;
  sourceApp: string;
  sourceAppName: string;
  targetApp: string;
  command: string;
  requestedAt: string;
  payload: unknown;
};
type StartGuide = {
  statusLabel: string;
  headline: string;
  detail: string;
  steps: string[];
  ctaLabel: string | null;
  ctaAction: "profile-setup" | "pick-media" | null;
};
type ThemeMode = "dark" | "light";
type SettingsSectionId = "profile-setup" | "appearance" | "window-behavior";
type PulseRuntimeStatus = "checking" | "starting" | "ready" | "slow";

function isPulseRecordingHandoff(
  value: unknown,
): value is PulseRecordingHandoff {
  if (!value || typeof value !== "object") {
    return false;
  }
  const recording = (value as { recording?: unknown }).recording;
  if (!recording || typeof recording !== "object") {
    return false;
  }
  return typeof (recording as { outputPath?: unknown }).outputPath === "string";
}

function outputReadinessLabel(readiness: StudioOutputReadiness): string {
  if (readiness.ready) {
    return "Output ready";
  }

  if (readiness.state === "degraded") {
    return "Output degraded";
  }

  if (readiness.state === "not_applicable") {
    return "Output pending";
  }

  return "Output blocked";
}

function outputReadinessTone(
  readiness: StudioOutputReadiness,
): "ready" | "blocked" {
  return readiness.ready ? "ready" : "blocked";
}

function studioIntakeStateLabel(state: StudioIntakeQueueItem["state"]): string {
  switch (state) {
    case "ready":
      return "Ready";
    case "stale":
      return "Stale";
    case "malformed":
      return "Malformed";
    case "unusable":
      return "Needs attention";
    case "duplicate":
      return "Duplicate";
    case "already-consumed":
      return "Imported";
    case "already-exported":
      return "Exported";
    case "dismissed":
      return "Hidden";
  }
}

function studioIntakeStateTone(
  state: StudioIntakeQueueItem["state"],
): "ready" | "blocked" {
  return state === "ready" || state === "already-consumed"
    ? "ready"
    : "blocked";
}

function studioRecordingVerificationLabel(
  recording: StudioRecordingCandidate,
): string {
  switch (recording.verificationState) {
    case "verified":
      return "Verified";
    case "basic_verified":
      return "Basic verified";
    case "missing":
      return "Missing";
    case "empty":
      return "Empty";
    case "unreadable":
      return "Unreadable";
    case "skipped":
      return "Skipped";
    default:
      return "Unverified";
  }
}

function studioRecordingCompletionLabel(
  recording: StudioRecordingCandidate,
): string {
  switch (recording.completionState) {
    case "completed":
      return "Completed";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "skipped":
      return "Skipped";
    case "unknown":
      return "Unknown";
    default:
      return "Legacy";
  }
}

function studioRecordingSizeLabel(recording: StudioRecordingCandidate): string {
  const size =
    typeof recording.fileSizeBytes === "number"
      ? formatByteCount(recording.fileSizeBytes)
      : "size unknown";
  const duration =
    typeof recording.durationMs === "number"
      ? `${(recording.durationMs / 1000).toFixed(1)} sec`
      : "duration unknown";
  return `${size}, ${duration}`;
}

function filterStudioIntakeRecordings(
  recordings: StudioIntakeQueueItem[],
  filter: StudioIntakeFilter,
): StudioIntakeQueueItem[] {
  return recordings.filter((recording) => {
    switch (filter) {
      case "ready":
        return recording.state === "ready";
      case "needs-attention":
        return (
          recording.state === "stale" ||
          recording.state === "malformed" ||
          recording.state === "unusable" ||
          recording.state === "duplicate"
        );
      case "imported":
        return recording.state === "already-consumed";
      case "exported":
        return recording.state === "already-exported";
      case "hidden":
        return recording.state === "dismissed";
    }
  });
}

function buildStudioIntakeFilterCounts(
  recordings: StudioIntakeQueueItem[],
): Record<StudioIntakeFilter, number> {
  return {
    ready: filterStudioIntakeRecordings(recordings, "ready").length,
    "needs-attention": filterStudioIntakeRecordings(
      recordings,
      "needs-attention",
    ).length,
    imported: filterStudioIntakeRecordings(recordings, "imported").length,
    exported: filterStudioIntakeRecordings(recordings, "exported").length,
    hidden: filterStudioIntakeRecordings(recordings, "hidden").length,
  };
}

function formatByteCount(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function studioIntakeSourceLabel(
  source: StudioIntakeQueueItem["source"],
): string {
  switch (source) {
    case "history":
      return "Studio history";
    case "event":
      return "Studio event";
    case "handoff":
      return "Studio handoff";
  }
}
type DesktopNavItem = { id: DesktopPage; label: string };
type ProfileLibraryChangedPayload = {
  profileId?: string;
};

const lastSessionIdStorageKey = "vaexcore-pulse.desktop.last-session-id";
const themeModeStorageKey = "vaexcore-pulse.desktop.theme-mode";
const settingsSectionSelectedEvent = "settings-section-selected";
const profileLibraryChangedEvent = "profile-library-changed";
const desktopPages: DesktopNavItem[] = [
  { id: "new-analysis", label: "Scan Intake" },
  { id: "candidate-review", label: "Review" },
  { id: "projects", label: "Backlog" },
  { id: "suite", label: "Suite" },
];
const settingsSections: Array<{
  id: SettingsSectionId;
  label: string;
  detail: string;
}> = [
  {
    id: "profile-setup",
    label: "Profile Setup",
    detail: "Profiles and examples that guide future scans.",
  },
  {
    id: "appearance",
    label: "Appearance",
    detail: "Light or dark mode.",
  },
  {
    id: "window-behavior",
    label: "Window Behavior",
    detail: "What happens when you close or quit.",
  },
];

export default function App() {
  return isSettingsWindow() ? <SettingsWindowApp /> : <DesktopApp />;
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
  const [projectSummaries, setProjectSummaries] = useState<
    ProjectSessionSummary[]
  >([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ClipProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] =
    useState<string>(defaultProfileId);
  const [selectedProfileExamples, setSelectedProfileExamples] = useState<
    ExampleClip[]
  >([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isLoadingProfileExamples, setIsLoadingProfileExamples] =
    useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isAddingProfileExample, setIsAddingProfileExample] = useState(false);
  const [mediaLibraryAssets, setMediaLibraryAssets] = useState<
    MediaLibraryAsset[]
  >([]);
  const [mediaEditPairs, setMediaEditPairs] = useState<MediaEditPair[]>([]);
  const [mediaIndexJobs, setMediaIndexJobs] = useState<MediaIndexJob[]>([]);
  const [mediaAlignmentJobs, setMediaAlignmentJobs] = useState<
    MediaAlignmentJob[]
  >([]);
  const [mediaAlignmentMatches, setMediaAlignmentMatches] = useState<
    MediaAlignmentMatch[]
  >([]);
  const [isLoadingMediaLibraryAssets, setIsLoadingMediaLibraryAssets] =
    useState(false);
  const [isLoadingMediaEditPairs, setIsLoadingMediaEditPairs] = useState(false);
  const [isLoadingMediaIndexJobs, setIsLoadingMediaIndexJobs] = useState(false);
  const [isLoadingMediaAlignmentJobs, setIsLoadingMediaAlignmentJobs] =
    useState(false);
  const [isCreatingMediaLibraryAsset, setIsCreatingMediaLibraryAsset] =
    useState(false);
  const [isCreatingMediaEditPair, setIsCreatingMediaEditPair] = useState(false);
  const [isCreatingMediaIndexJob, setIsCreatingMediaIndexJob] = useState(false);
  const [isCreatingMediaAlignmentJob, setIsCreatingMediaAlignmentJob] =
    useState(false);
  const [cancellingMediaIndexJobIds, setCancellingMediaIndexJobIds] = useState<
    Record<string, boolean>
  >({});
  const [cancellingMediaAlignmentJobIds, setCancellingMediaAlignmentJobIds] =
    useState<Record<string, boolean>>({});
  const [savingThumbnailOutputAssetIds, setSavingThumbnailOutputAssetIds] =
    useState<Record<string, boolean>>({});
  const [profileLibraryError, setProfileLibraryError] = useState<string | null>(
    null,
  );

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
  const [suiteLaunchStatus, setSuiteLaunchStatus] = useState<string | null>(
    null,
  );
  const [suiteStatus, setSuiteStatus] = useState<SuiteAppStatus[]>([]);
  const [suiteSession, setSuiteSession] = useState<SuiteSession | null>(null);
  const [suiteTimelineEvents, setSuiteTimelineEvents] = useState<
    SuiteTimelineEvent[]
  >([]);
  const [suiteRefreshError, setSuiteRefreshError] = useState<string | null>(
    null,
  );
  const pulseRuntimeStatus = usePulseRuntimeStatus(apiBaseUrl);
  const isPulseReady = isPulseRuntimeReady(pulseRuntimeStatus);
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
  const pendingSessionCount = projectSummaries.filter(
    (summary) => summary.pendingCount > 0,
  ).length;
  const nextPendingSession =
    findNextPendingSessionSummary(projectSummaries, {
      excludeSessionIds: projectSession ? [projectSession.id] : [],
    }) ?? findNextPendingSessionSummary(projectSummaries);
  const suiteTimeline = useMemo(
    () => buildSuiteTimeline(suiteStatus, suiteTimelineEvents),
    [suiteStatus, suiteTimelineEvents],
  );
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

  useEffect(() => {
    persistThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    persistStudioIntakePersistence(studioIntakePersistence);
  }, [studioIntakePersistence]);

  useEffect(() => {
    persistStudioExportHistory(studioExportHistory);
  }, [studioExportHistory]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let isSubscribed = true;

    async function refresh() {
      try {
        const [nextStatus, nextSession, nextTimeline] = await Promise.all([
          invoke<SuiteAppStatus[]>("suite_status"),
          invoke<SuiteSession | null>("suite_session"),
          invoke<SuiteTimelineEvent[]>("suite_timeline", { limit: 50 }),
        ]);
        if (!isSubscribed) {
          return;
        }
        setSuiteStatus(nextStatus);
        setSuiteSession(nextSession);
        setSuiteTimelineEvents(nextTimeline);
        setSuiteRefreshError(null);
      } catch (error) {
        if (isSubscribed) {
          setSuiteRefreshError(
            error instanceof Error
              ? error.message
              : "Unable to refresh suite status.",
          );
        }
      }
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      isSubscribed = false;
      window.clearInterval(interval);
    };
  }, []);

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
    let isSubscribed = true;
    let unlistenTheme: (() => void) | undefined;

    function handleStorage(event: StorageEvent) {
      if (
        event.key === themeModeStorageKey &&
        isThemeMode(event.newValue) &&
        event.newValue !== themeMode
      ) {
        setThemeMode(event.newValue);
      }
    }

    window.addEventListener("storage", handleStorage);

    if (isTauriRuntime()) {
      void listen<ThemeMode>("theme-mode-changed", (event) => {
        if (isThemeMode(event.payload)) {
          setThemeMode(event.payload);
        }
      }).then((unlisten) => {
        if (!isSubscribed) {
          unlisten();
          return;
        }

        unlistenTheme = unlisten;
      });
    }

    return () => {
      isSubscribed = false;
      window.removeEventListener("storage", handleStorage);
      unlistenTheme?.();
    };
  }, [themeMode]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingProjects(false);
      setProjectsError(null);
      return;
    }

    let isCancelled = false;

    async function loadProjectSummaries() {
      setIsLoadingProjects(true);
      try {
        const summaries = await fetchProjectSummaries(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setProjectSummaries(summaries);
        setProjectsError(null);
        setActivePage((current) => {
          if (current !== "new-analysis") {
            return current;
          }

          if (window.localStorage.getItem(lastSessionIdStorageKey)) {
            return current;
          }

          return summaries.length > 0 ? "projects" : current;
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProjectsError(
          error instanceof Error
            ? `Unable to load saved sessions: ${error.message}`
            : "Unable to load saved sessions",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingProjects(false);
        }
      }
    }

    void loadProjectSummaries();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingProfiles(false);
      setProfileLibraryError(null);
      return;
    }

    let isCancelled = false;

    async function loadProfiles() {
      setIsLoadingProfiles(true);
      try {
        const nextProfiles = await fetchProfiles(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setProfiles(nextProfiles);
        setProfileLibraryError(null);
        setSelectedProfileId((current) =>
          nextProfiles.some((profile) => profile.id === current)
            ? current
            : (nextProfiles[0]?.id ?? defaultProfileId),
        );
        setAnalysisProfileId((current) =>
          nextProfiles.some((profile) => profile.id === current)
            ? current
            : (nextProfiles[0]?.id ?? defaultProfileId),
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load clip profiles: ${error.message}`
            : "Unable to load clip profiles",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingProfiles(false);
        }
      }
    }

    void loadProfiles();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady]);

  useEffect(() => {
    if (!isTauriRuntime() || !isPulseReady) {
      return;
    }

    let isSubscribed = true;
    let unlistenProfileLibrary: (() => void) | undefined;

    async function refreshProfilesFromSettings(preferredProfileId?: string) {
      try {
        const [nextProfiles, nextAssets] = await Promise.all([
          fetchProfiles(apiBaseUrl),
          fetchMediaLibraryAssets(apiBaseUrl),
        ]);
        if (!isSubscribed) {
          return;
        }

        const targetProfileId = preferredProfileId ?? selectedProfileId;
        const nextSelectedProfileId = nextProfiles.some(
          (profile) => profile.id === targetProfileId,
        )
          ? targetProfileId
          : (nextProfiles[0]?.id ?? defaultProfileId);
        const shouldLoadExamples = nextProfiles.some(
          (profile) => profile.id === nextSelectedProfileId,
        );
        const nextExamples = shouldLoadExamples
          ? await fetchProfileExamples(apiBaseUrl, nextSelectedProfileId)
          : [];

        if (!isSubscribed) {
          return;
        }

        setProfiles(
          shouldLoadExamples
            ? nextProfiles.map((profile) =>
                profile.id === nextSelectedProfileId
                  ? { ...profile, exampleClips: nextExamples }
                  : profile,
              )
            : nextProfiles,
        );
        setMediaLibraryAssets(nextAssets);
        setSelectedProfileId(nextSelectedProfileId);
        setSelectedProfileExamples(nextExamples);
        setAnalysisProfileId((current) => {
          if (
            preferredProfileId &&
            nextProfiles.some((profile) => profile.id === preferredProfileId)
          ) {
            return preferredProfileId;
          }

          return nextProfiles.some((profile) => profile.id === current)
            ? current
            : nextSelectedProfileId;
        });
        setProfileLibraryError(null);
      } catch (error) {
        if (!isSubscribed) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to refresh profile setup: ${error.message}`
            : "Unable to refresh profile setup",
        );
      }
    }

    void listen<ProfileLibraryChangedPayload>(
      profileLibraryChangedEvent,
      (event) => {
        void refreshProfilesFromSettings(event.payload?.profileId);
      },
    ).then((unlisten) => {
      if (!isSubscribed) {
        unlisten();
        return;
      }

      unlistenProfileLibrary = unlisten;
    });

    return () => {
      isSubscribed = false;
      unlistenProfileLibrary?.();
    };
  }, [apiBaseUrl, isPulseReady, selectedProfileId]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingMediaLibraryAssets(false);
      return;
    }

    let isCancelled = false;

    async function loadMediaLibraryAssets() {
      setIsLoadingMediaLibraryAssets(true);
      try {
        const nextAssets = await fetchMediaLibraryAssets(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaLibraryAssets(nextAssets);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load saved media: ${error.message}`
            : "Unable to load saved media",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaLibraryAssets(false);
        }
      }
    }

    void loadMediaLibraryAssets();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingMediaEditPairs(false);
      return;
    }

    let isCancelled = false;

    async function loadMediaEditPairs() {
      setIsLoadingMediaEditPairs(true);
      try {
        const nextPairs = await fetchMediaEditPairs(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaEditPairs(nextPairs);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load video comparisons: ${error.message}`
            : "Unable to load video comparisons",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaEditPairs(false);
        }
      }
    }

    void loadMediaEditPairs();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingMediaIndexJobs(false);
      return;
    }

    let isCancelled = false;

    async function loadMediaIndexJobs() {
      setIsLoadingMediaIndexJobs(true);
      try {
        const nextJobs = await fetchMediaIndexJobs(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaIndexJobs(nextJobs);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load background activity: ${error.message}`
            : "Unable to load background activity",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaIndexJobs(false);
        }
      }
    }

    void loadMediaIndexJobs();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady]);

  useEffect(() => {
    if (!isPulseReady) {
      return;
    }

    const hasActiveIndexJobs = mediaIndexJobs.some(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );
    if (!hasActiveIndexJobs) {
      return;
    }

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      async function refreshIndexState() {
        try {
          const [nextJobs, nextAssets, nextPairs] = await Promise.all([
            fetchMediaIndexJobs(apiBaseUrl),
            fetchMediaLibraryAssets(apiBaseUrl),
            fetchMediaEditPairs(apiBaseUrl),
          ]);
          if (isCancelled) {
            return;
          }

          setMediaIndexJobs(nextJobs);
          setMediaLibraryAssets(nextAssets);
          setMediaEditPairs(nextPairs);
        } catch {
          // Keep the current UI state; the explicit refresh/load effects surface errors.
        }
      }

      void refreshIndexState();
    }, 2000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiBaseUrl, isPulseReady, mediaIndexJobs]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingMediaAlignmentJobs(false);
      return;
    }

    let isCancelled = false;

    async function loadMediaAlignmentState() {
      setIsLoadingMediaAlignmentJobs(true);
      try {
        const [nextJobs, nextMatches] = await Promise.all([
          fetchMediaAlignmentJobs(apiBaseUrl),
          fetchMediaAlignmentMatches(apiBaseUrl),
        ]);
        if (isCancelled) {
          return;
        }

        setMediaAlignmentJobs(nextJobs);
        setMediaAlignmentMatches(nextMatches);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load video comparisons: ${error.message}`
            : "Unable to load video comparisons",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaAlignmentJobs(false);
        }
      }
    }

    void loadMediaAlignmentState();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady]);

  useEffect(() => {
    if (!isPulseReady) {
      return;
    }

    const hasActiveAlignmentJobs = mediaAlignmentJobs.some(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );
    if (!hasActiveAlignmentJobs) {
      return;
    }

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      async function refreshAlignmentState() {
        try {
          const [nextJobs, nextMatches, nextPairs] = await Promise.all([
            fetchMediaAlignmentJobs(apiBaseUrl),
            fetchMediaAlignmentMatches(apiBaseUrl),
            fetchMediaEditPairs(apiBaseUrl),
          ]);
          if (isCancelled) {
            return;
          }

          setMediaAlignmentJobs(nextJobs);
          setMediaAlignmentMatches(nextMatches);
          setMediaEditPairs(nextPairs);
        } catch {
          // Keep current state; explicit load effects surface persistent failures.
        }
      }

      void refreshAlignmentState();
    }, 2000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiBaseUrl, isPulseReady, mediaAlignmentJobs]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingProfileExamples(false);
      return;
    }

    const profileId = selectedProfileId;
    if (!profileId) {
      setSelectedProfileExamples([]);
      return;
    }
    const profileIdForLoad: string = profileId;
    const selectedProfileIdForLoad: string = profileId;

    let isCancelled = false;

    async function loadExamples() {
      setIsLoadingProfileExamples(true);
      try {
        const examples = await fetchProfileExamples(
          apiBaseUrl,
          selectedProfileIdForLoad,
        );
        if (isCancelled) {
          return;
        }

        setSelectedProfileExamples(examples);
        setProfiles((current) =>
          current.map((profile) =>
            profile.id === selectedProfileIdForLoad
              ? { ...profile, exampleClips: examples }
              : profile,
          ),
        );
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load example clips: ${error.message}`
            : "Unable to load example clips",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingProfileExamples(false);
        }
      }
    }

    void loadExamples();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, selectedProfileId]);

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

  useEffect(() => {
    if (!isPulseReady) {
      return;
    }

    const lastSessionId = window.localStorage.getItem(lastSessionIdStorageKey);
    if (!lastSessionId) {
      return;
    }
    const sessionIdToRestore = lastSessionId;

    let isCancelled = false;

    async function restoreLastSession() {
      try {
        const nextSession = await fetchProjectSession(
          apiBaseUrl,
          sessionIdToRestore,
        );
        if (isCancelled) {
          return;
        }

        applyProjectSession(nextSession, {
          restoreResumeState: true,
          rememberRealSession: true,
        });
        setProjectSummaries((current) =>
          upsertProjectSummary(current, buildProjectSummary(nextSession)),
        );
        setAnalysisError(null);
        setActivePage("candidate-review");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setAnalysisError(
          error instanceof Error
            ? `Unable to restore the last session: ${error.message}`
            : "Unable to restore the last session",
        );
      }
    }

    void restoreLastSession();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady]);

  useEffect(() => {
    if (activePage !== "candidate-review") {
      return;
    }

    function handleReviewKeydown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "/") {
        const searchInput = document.getElementById(
          "review-search-input",
        ) as HTMLInputElement | null;
        if (!searchInput) {
          return;
        }

        event.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      const normalizedKey = event.key.toLowerCase();
      if (normalizedKey === "k") {
        event.preventDefault();
        handleAccept();
        return;
      }

      if (normalizedKey === "x") {
        event.preventDefault();
        handleReject();
        return;
      }

      if (normalizedKey === "v") {
        event.preventDefault();
        handleOpenMomentPreview(selectedCandidate?.id ?? null);
        return;
      }

      if (normalizedKey === "n") {
        event.preventDefault();
        handleSelectNextPending();
        return;
      }

      if (normalizedKey === "j") {
        event.preventDefault();
        handleSelectPreviousVisible();
        return;
      }

      if (normalizedKey === "l") {
        event.preventDefault();
        handleSelectNextVisible();
        return;
      }

      if (event.key === "[") {
        event.preventDefault();
        handleExpandSetup();
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        handleExpandResolution();
      }
    }

    window.addEventListener("keydown", handleReviewKeydown);
    return () => {
      window.removeEventListener("keydown", handleReviewKeydown);
    };
  }, [
    activePage,
    handleAccept,
    handleExpandResolution,
    handleExpandSetup,
    handleOpenMomentPreview,
    handleReject,
    handleSelectNextPending,
    handleSelectNextVisible,
    handleSelectPreviousVisible,
    selectedCandidate?.id,
  ]);

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

  async function handleCreateProfile(input: CreateClipProfileRequest) {
    const request = createClipProfileRequestSchema.parse(input);
    setIsCreatingProfile(true);
    setProfileLibraryError(null);

    try {
      const createdProfile = await createProfile(apiBaseUrl, request);
      setProfiles((current) =>
        upsertProfile(current, {
          ...createdProfile,
          exampleClips: createdProfile.exampleClips ?? [],
        }),
      );
      setSelectedProfileId(createdProfile.id);
      setSelectedProfileExamples(createdProfile.exampleClips ?? []);
      setAnalysisProfileId(createdProfile.id);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating the profile.",
      );
      throw error;
    } finally {
      setIsCreatingProfile(false);
    }
  }

  async function handleAddProfileExample(
    profileId: string,
    input: AddExampleClipRequest,
  ) {
    const request = addExampleClipRequestSchema.parse(input);
    setIsAddingProfileExample(true);
    setProfileLibraryError(null);

    try {
      const createdExample = await createProfileExample(
        apiBaseUrl,
        profileId,
        request,
      );
      const nextExamples = [
        createdExample,
        ...selectedProfileExamples.filter(
          (example) => example.id !== createdExample.id,
        ),
      ];
      setSelectedProfileExamples(nextExamples);
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === profileId
            ? {
                ...profile,
                exampleClips: nextExamples,
                updatedAt: createdExample.updatedAt,
              }
            : profile,
        ),
      );
      if (projectSession?.profileId === profileId) {
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
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the clip.",
      );
      throw error;
    } finally {
      setIsAddingProfileExample(false);
    }
  }

  async function handleCreateMediaLibraryAsset(
    input: CreateMediaLibraryAssetRequest,
  ) {
    const request = createMediaLibraryAssetRequestSchema.parse(input);
    setIsCreatingMediaLibraryAsset(true);
    setProfileLibraryError(null);

    try {
      const createdAsset = await createMediaLibraryAssetEntry(
        apiBaseUrl,
        request,
      );
      setMediaLibraryAssets((current) =>
        upsertMediaLibraryAsset(current, createdAsset),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the media reference.",
      );
      throw error;
    } finally {
      setIsCreatingMediaLibraryAsset(false);
    }
  }

  async function handleCreateMediaEditPair(input: CreateMediaEditPairRequest) {
    const request = createMediaEditPairRequestSchema.parse(input);
    setIsCreatingMediaEditPair(true);
    setProfileLibraryError(null);

    try {
      const createdPair = await createMediaEditPairEntry(apiBaseUrl, request);
      setMediaEditPairs((current) => upsertMediaEditPair(current, createdPair));
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the video comparison.",
      );
      throw error;
    } finally {
      setIsCreatingMediaEditPair(false);
    }
  }

  async function handleCreateMediaIndexJob(input: CreateMediaIndexJobRequest) {
    const request = createMediaIndexJobRequestSchema.parse(input);
    setIsCreatingMediaIndexJob(true);
    setProfileLibraryError(null);

    try {
      const createdJob = await createMediaIndexJobEntry(apiBaseUrl, request);
      setMediaIndexJobs((current) => upsertMediaIndexJob(current, createdJob));
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while starting the scan.",
      );
      throw error;
    } finally {
      setIsCreatingMediaIndexJob(false);
    }
  }

  async function handleReplaceMediaThumbnailOutputs(
    assetId: string,
    input: ReplaceMediaThumbnailOutputsRequest,
  ) {
    const request = replaceMediaThumbnailOutputsRequestSchema.parse(input);
    setSavingThumbnailOutputAssetIds((current) => ({
      ...current,
      [assetId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const updatedAsset = await replaceMediaThumbnailOutputsEntry(
        apiBaseUrl,
        assetId,
        request,
      );
      setMediaLibraryAssets((current) =>
        upsertMediaLibraryAsset(current, updatedAsset),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while updating thumbnail picks.",
      );
      throw error;
    } finally {
      setSavingThumbnailOutputAssetIds((current) => {
        const { [assetId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
  }

  async function handleCancelMediaIndexJob(input: CancelMediaIndexJobRequest) {
    const request = cancelMediaIndexJobRequestSchema.parse(input);
    setCancellingMediaIndexJobIds((current) => ({
      ...current,
      [request.jobId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const cancelledJob = await cancelMediaIndexJobEntry(apiBaseUrl, request);
      setMediaIndexJobs((current) =>
        upsertMediaIndexJob(current, cancelledJob),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while cancelling the scan.",
      );
      throw error;
    } finally {
      setCancellingMediaIndexJobIds((current) => {
        const { [request.jobId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
  }

  async function handleCreateMediaAlignmentJob(
    input: CreateMediaAlignmentJobRequest,
  ) {
    const request = createMediaAlignmentJobRequestSchema.parse(input);
    setIsCreatingMediaAlignmentJob(true);
    setProfileLibraryError(null);

    try {
      const createdJob = await createMediaAlignmentJobEntry(
        apiBaseUrl,
        request,
      );
      setMediaAlignmentJobs((current) =>
        upsertMediaAlignmentJob(current, createdJob),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while starting the video comparison.",
      );
      throw error;
    } finally {
      setIsCreatingMediaAlignmentJob(false);
    }
  }

  async function handleCancelMediaAlignmentJob(
    input: CancelMediaAlignmentJobRequest,
  ) {
    const request = cancelMediaAlignmentJobRequestSchema.parse(input);
    setCancellingMediaAlignmentJobIds((current) => ({
      ...current,
      [request.jobId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const cancelledJob = await cancelMediaAlignmentJobEntry(
        apiBaseUrl,
        request,
      );
      setMediaAlignmentJobs((current) =>
        upsertMediaAlignmentJob(current, cancelledJob),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while cancelling the comparison job.",
      );
      throw error;
    } finally {
      setCancellingMediaAlignmentJobIds((current) => {
        const { [request.jobId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
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

  async function handleOpenProject(sessionId: string) {
    setProjectsError(null);

    try {
      const nextSession = await fetchProjectSession(apiBaseUrl, sessionId);
      applyProjectSession(nextSession, {
        restoreResumeState: true,
        rememberRealSession: true,
      });
      setProjectSummaries((current) =>
        upsertProjectSummary(current, buildProjectSummary(nextSession)),
      );
      setActivePage("candidate-review");
    } catch (error) {
      setProjectsError(
        error instanceof Error
          ? error.message
          : "Something went wrong while opening the session.",
      );
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

  async function handleLaunchSuite() {
    setSuiteLaunchStatus("Opening vaexcore apps...");

    if (!isTauriRuntime()) {
      setSuiteLaunchStatus("Launch Suite is available in the desktop app.");
      return;
    }

    try {
      const results = await invoke<SuiteLaunchResult[]>(
        "launch_vaexcore_suite",
      );
      const failed = results.filter((result) => !result.ok);

      setSuiteLaunchStatus(
        failed.length > 0
          ? formatSuiteLaunchFailure(failed)
          : "Launch requested for Studio, Pulse, and Console.",
      );
      const [nextStatus, nextSession, nextTimeline] = await Promise.all([
        invoke<SuiteAppStatus[]>("suite_status"),
        invoke<SuiteSession | null>("suite_session"),
        invoke<SuiteTimelineEvent[]>("suite_timeline", { limit: 50 }),
      ]);
      setSuiteStatus(nextStatus);
      setSuiteSession(nextSession);
      setSuiteTimelineEvents(nextTimeline);
    } catch (error) {
      setSuiteLaunchStatus(
        error instanceof Error
          ? error.message
          : "Unable to launch the vaexcore suite.",
      );
    }
  }

  async function handleOpenNextPendingSession() {
    if (!nextPendingSession) {
      setProjectsError(null);
      setActivePage("projects");
      return;
    }

    await handleOpenProject(nextPendingSession.sessionId);
  }

  function renderDesktopPage() {
    if (activePage === "suite") {
      return (
        <section className="suite-dashboard-grid">
          <article className="utility-block suite-session-panel">
            <div>
              <span className="detail-label">Suite session</span>
              <h2>{suiteSession?.title ?? "No active suite session"}</h2>
              <p>
                {suiteSession
                  ? `Session ${suiteSession.sessionId}`
                  : "Studio creates the shared local session used by Studio, Pulse, and Console."}
              </p>
            </div>
            <button
              className="button-primary"
              onClick={() => {
                void handleLaunchSuite();
              }}
              type="button"
            >
              Launch Suite
            </button>
            {suiteLaunchStatus ? (
              <p className="suite-launch-status">{suiteLaunchStatus}</p>
            ) : null}
            {suiteRefreshError ? (
              <p className="analysis-error">{suiteRefreshError}</p>
            ) : null}
          </article>

          <article className="utility-block suite-panel-wide">
            <div className="panel-header compact-panel-header">
              <div>
                <span className="detail-label">Suite presence</span>
                <h2>Studio, Pulse, and Console</h2>
              </div>
              <span className="queue-count">{suiteStatus.length} apps</span>
            </div>
            {suiteStatus.length === 0 ? (
              <p>No suite heartbeat has been published yet.</p>
            ) : (
              <div className="suite-status-list">
                {suiteStatus.map((app) => (
                  <div className="suite-status-row" key={app.appId}>
                    <div>
                      <strong>{app.appName}</strong>
                      <span>{app.activityDetail ?? app.detail}</span>
                      <code>{app.healthUrl ?? app.discoveryFile}</code>
                    </div>
                    <span
                      className={`session-state-pill ${suiteStatusTone(app)}`}
                    >
                      {suiteStatusLabel(app)}
                    </span>
                    <span className="session-state-pill active-session">
                      {app.suiteSessionId ? "In session" : "No session"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="utility-block suite-panel-wide">
            <div className="panel-header compact-panel-header">
              <div>
                <span className="detail-label">Shared timeline</span>
                <h2>Recent suite activity</h2>
              </div>
            </div>
            {suiteTimeline.length === 0 ? (
              <p>No shared suite activity yet.</p>
            ) : (
              <div className="suite-timeline-list">
                {suiteTimeline.map((item) => (
                  <div className="suite-timeline-row" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <span
                      className={`session-state-pill ${timelineTone(item.kind)}`}
                    >
                      {item.source}
                    </span>
                    <span className="session-state-pill">
                      {formatSuiteTimestamp(item.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      );
    }

    if (activePage === "projects") {
      return (
        <section className="desktop-placeholder-grid">
          {isLoadingProjects ? (
            <article className="utility-block">
              <span className="detail-label">Backlog</span>
              <h2>Loading saved review sessions...</h2>
            </article>
          ) : null}
          {projectsError ? (
            <article className="utility-block">
              <span className="detail-label">Backlog</span>
              <p className="analysis-error">{projectsError}</p>
            </article>
          ) : null}
          {!isLoadingProjects &&
          !projectsError &&
          projectSummaries.length === 0 ? (
            <article className="utility-block">
              <span className="detail-label">Backlog</span>
              <h2>No saved review sessions yet</h2>
              <p>Scan a video to create your first review session.</p>
            </article>
          ) : null}
          {!isLoadingProjects &&
          !projectsError &&
          projectSummaries.length > 0 ? (
            <article className="utility-block backlog-shortcut-card">
              <div className="panel-header">
                <div>
                  <span className="detail-label">Backlog</span>
                  <h2>
                    {nextPendingSession
                      ? "Continue the next session that still needs decisions"
                      : "Your backlog is clear"}
                  </h2>
                  <p>
                    {nextPendingSession
                      ? `${pendingSessionCount} saved session${pendingSessionCount === 1 ? "" : "s"} still have undecided moments.`
                      : "Every saved session currently has decisions for all suggested moments."}
                  </p>
                </div>
                <span className="queue-count">{pendingSessionCount} open</span>
              </div>
              <div className="action-row">
                {nextPendingSession ? (
                  <button
                    className="button-primary"
                    onClick={() => {
                      void handleOpenNextPendingSession();
                    }}
                    type="button"
                  >
                    Continue next session
                  </button>
                ) : (
                  <button
                    className="button-secondary"
                    onClick={() => setActivePage("new-analysis")}
                    type="button"
                  >
                    Scan another video
                  </button>
                )}
              </div>
              <p className="project-summary-cta">
                {nextPendingSession
                  ? `${nextPendingSession.sessionTitle} • ${nextPendingSession.pendingCount} undecided • updated ${formatSummaryTimestamp(nextPendingSession.updatedAt)}`
                  : "Use Start to add the next review session."}
              </p>
            </article>
          ) : null}
          {projectSummaries.map((summary) => {
            const profile = resolveProfile(
              availableProfiles,
              summary.profileId,
            );
            const sessionReviewState = deriveSessionReviewState(summary);
            const isActiveSession = summary.sessionId === projectSession?.id;
            const isNextPendingSession =
              summary.sessionId === nextPendingSession?.sessionId;
            return (
              <button
                className={
                  isActiveSession
                    ? "project-summary-card utility-block active"
                    : "project-summary-card utility-block"
                }
                key={summary.sessionId}
                onClick={() => {
                  void handleOpenProject(summary.sessionId);
                }}
                type="button"
              >
                <div className="project-summary-top">
                  <span className="detail-label">Saved session</span>
                  <div className="project-summary-badges">
                    <span
                      className={`session-state-pill ${sessionReviewState.toLowerCase().replace("_", "-")}`}
                    >
                      {formatSessionReviewState(sessionReviewState)}
                    </span>
                    {isNextPendingSession ? (
                      <span className="session-state-pill next-target">
                        Next up
                      </span>
                    ) : null}
                    {isActiveSession ? (
                      <span className="session-state-pill active-session">
                        Loaded
                      </span>
                    ) : null}
                  </div>
                </div>
                <h2>{summary.sessionTitle}</h2>
                <p>{summary.sourceName}</p>
                <p>{summary.sourcePath}</p>
                <div className="project-summary-progress">
                  <div className="project-summary-meter">
                    <div
                      className="project-summary-fill"
                      style={{
                        width: `${formatSessionCompletion(summary)}%`,
                      }}
                    />
                  </div>
                  <p>
                    {reviewedCandidateCount(summary)} of{" "}
                    {summary.candidateCount} reviewed
                  </p>
                </div>
                <p>
                  {summary.candidateCount} moments • {summary.acceptedCount}{" "}
                  kept • {summary.rejectedCount} skipped •{" "}
                  {summary.pendingCount} undecided
                </p>
                <p
                  className={`project-summary-coverage ${analysisCoverageTone(summary.analysisCoverage)}`}
                >
                  {buildProjectCoverageCopy(summary)}
                </p>
                <p>
                  Profile {profile.name} • updated{" "}
                  {formatSummaryTimestamp(summary.updatedAt)}
                </p>
                <p className="project-summary-cta">
                  {buildSessionOpenLabel(summary)}
                </p>
              </button>
            );
          })}
        </section>
      );
    }

    if (activePage === "new-analysis") {
      return (
        <section className="analysis-launch-layout">
          <article className="utility-block analysis-primary-card">
            <div className="panel-header analysis-primary-header">
              <div>
                <span className="detail-label">Start</span>
                <h2>Scan a video</h2>
                <p>Choose a video, pick a profile, and start a review queue.</p>
              </div>
              <div className="analysis-header-actions">
                <button
                  className="button-secondary"
                  disabled={isAnalyzing}
                  onClick={() => {
                    void handlePickMedia();
                  }}
                  type="button"
                >
                  Choose video
                </button>
                <button
                  className="button-secondary"
                  onClick={() => openSettingsWindowFromUi("profile-setup")}
                  type="button"
                >
                  Set up profile
                </button>
              </div>
            </div>

            <div className="analysis-form">
              <label className="search-block">
                <span className="input-label">Video file</span>
                <input
                  className="search-input"
                  disabled={isAnalyzing}
                  onChange={(event) => {
                    setSelectedMediaPath(event.target.value);
                    setAnalysisError(null);
                  }}
                  placeholder="/Users/you/Videos/session-2026-03-25.mkv"
                  type="text"
                  value={selectedMediaPath}
                />
                <small
                  className={
                    analysisLaunchState.canAnalyze
                      ? "analysis-field-note ready"
                      : "analysis-field-note"
                  }
                >
                  {normalizedSelectedMediaPath
                    ? isSupportedInput(normalizedSelectedMediaPath)
                      ? `Ready: ${analysisSourceName}`
                      : `Unsupported file type. Try: ${supportedInputExtensions.join(", ")}`
                    : `Supported inputs: ${supportedInputExtensions.join(", ")}`}
                </small>
              </label>

              <div className="analysis-inline-grid">
                <label className="search-block">
                  <span className="input-label">Profile</span>
                  <select
                    className="search-input"
                    disabled={isAnalyzing || !hasPersistedProfiles}
                    onChange={(event) => {
                      setAnalysisProfileId(event.target.value);
                      setAnalysisError(null);
                    }}
                    value={hasPersistedProfiles ? analysisProfileId : ""}
                  >
                    {hasPersistedProfiles ? (
                      availableProfiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))
                    ) : (
                      <option value="">
                        {isLoadingProfiles
                          ? "Loading saved profiles..."
                          : "No saved profiles yet"}
                      </option>
                    )}
                  </select>
                  <small className="analysis-field-note">
                    {hasPersistedProfiles
                      ? "Profiles help Pulse find the kinds of moments you usually keep."
                      : isLoadingProfiles
                        ? "Loading saved profiles."
                        : "Create a profile first."}
                  </small>
                </label>

                <label className="search-block">
                  <span className="input-label">Session name</span>
                  <input
                    className="search-input"
                    disabled={isAnalyzing}
                    onChange={(event) => {
                      setAnalysisTitle(event.target.value);
                      setAnalysisError(null);
                    }}
                    placeholder="Optional: Backlog pass 01"
                    type="text"
                    value={analysisTitle}
                  />
                  <small className="analysis-field-note">
                    Leave this blank if the file name is already good enough.
                  </small>
                </label>
              </div>

              <div className="analysis-summary-grid analysis-summary-grid-compact">
                <article className="analysis-summary-card">
                  <span className="detail-label">Video</span>
                  <strong>{analysisSourceName ?? "No video chosen"}</strong>
                  <p className="analysis-summary-path">
                    {normalizedSelectedMediaPath ||
                      "Choose a video file or use the file picker."}
                  </p>
                </article>
                <article className="analysis-summary-card">
                  <span className="detail-label">Profile</span>
                  <strong>{selectedDraftProfile.name}</strong>
                  <p>{selectedDraftProfile.description}</p>
                </article>
                <article className="analysis-summary-card">
                  <span className="detail-label">Session name</span>
                  <strong>{analysisTitlePreview}</strong>
                  <p>
                    {analysisTitle.trim()
                      ? "Using your custom name."
                      : "Using the file name by default."}
                  </p>
                </article>
              </div>

              <div className="analysis-primary-actions">
                <button
                  className="button-primary"
                  disabled={isAnalyzing || !analysisLaunchState.canAnalyze}
                  onClick={() => {
                    void handleAnalyze();
                  }}
                  type="button"
                >
                  {isAnalyzing ? "Scanning video..." : "Scan video"}
                </button>
                <p className="analysis-support-copy">
                  Review opens when the scan finishes.
                </p>
              </div>

              {analysisError ? (
                <p className="analysis-error">{analysisError}</p>
              ) : null}
            </div>
          </article>

          <div className="analysis-secondary-stack">
            <article
              className={`analysis-readiness-card ${analysisLaunchState.tone}`}
            >
              <div className="analysis-readiness-header">
                <div>
                  <span className="detail-label">Scan status</span>
                  <strong>{analysisLaunchState.headline}</strong>
                  <p className="analysis-readiness-copy">
                    {analysisLaunchState.detail}
                  </p>
                </div>
                <span
                  className={`analysis-readiness-pill ${analysisLaunchState.tone}`}
                >
                  {analysisLaunchState.statusLabel}
                </span>
              </div>
            </article>

            <article className="utility-block">
              <div className="panel-header compact-panel-header">
                <div>
                  <span className="detail-label">Studio intake</span>
                  <h2>
                    {studioIntake.connection === "connected"
                      ? "Studio connected"
                      : studioIntake.connection === "checking"
                        ? "Checking Studio"
                        : "Studio not connected"}
                  </h2>
                  <p>{studioIntake.detail}</p>
                </div>
                <span
                  className={`analysis-readiness-pill ${
                    studioIntake.connection === "connected"
                      ? "ready"
                      : "blocked"
                  }`}
                >
                  {studioIntake.connection === "connected"
                    ? "Connected"
                    : studioIntake.connection === "checking"
                      ? "Checking"
                      : "Offline"}
                </span>
              </div>
              <div className="action-row">
                {(
                  [
                    ["ready", "Ready"],
                    ["needs-attention", "Needs attention"],
                    ["imported", "Imported"],
                    ["exported", "Exported"],
                    ["hidden", "Hidden"],
                  ] as Array<[StudioIntakeFilter, string]>
                ).map(([filter, label]) => (
                  <button
                    className={
                      studioIntakeFilter === filter
                        ? "button-primary"
                        : "button-secondary"
                    }
                    key={filter}
                    onClick={() => setStudioIntakeFilter(filter)}
                    type="button"
                  >
                    {label} ({studioIntakeFilterCounts[filter]})
                  </button>
                ))}
                <button
                  className="button-secondary"
                  onClick={() => {
                    void handleRefreshStudioIntake();
                  }}
                  type="button"
                >
                  Refresh from Studio
                </button>
              </div>
              {studioIntake.recordings.length > 0 ? (
                <div
                  className="studio-intake-queue"
                  data-testid="studio-intake-queue"
                >
                  {filteredStudioIntakeRecordings.length === 0 ? (
                    <p>No Studio recordings match this filter.</p>
                  ) : null}
                  {filteredStudioIntakeRecordings.map((recording) => {
                    const importBlockReason =
                      studioRecordingImportBlockReason(recording);
                    const warning = studioRecordingWarning(recording);
                    const exportHistory =
                      studioExportHistory.recordings[
                        studioRecordingQueueKey(recording)
                      ] ?? null;

                    return (
                      <div
                        className="studio-recording-card"
                        key={recording.queueId}
                      >
                        <div className="studio-intake-card-header">
                          <div>
                            <span className="detail-label">
                              {studioIntakeSourceLabel(recording.source)}
                            </span>
                            <strong>
                              {extractSourceName(recording.outputPath)}
                            </strong>
                          </div>
                          <span
                            className={`analysis-readiness-pill ${studioIntakeStateTone(
                              recording.state,
                            )}`}
                          >
                            {studioIntakeStateLabel(recording.state)}
                          </span>
                        </div>
                        <p className="analysis-summary-path">
                          {recording.outputPath}
                        </p>
                        <p>{recording.detail}</p>
                        {recording.captureDetail ? (
                          <p>{recording.captureDetail}</p>
                        ) : null}
                        <div className="studio-output-readiness">
                          <span
                            className={`analysis-readiness-pill ${studioIntakeStateTone(
                              recording.state,
                            )}`}
                          >
                            {studioRecordingCompletionLabel(recording)}
                          </span>
                          <span
                            className={`analysis-readiness-pill ${
                              recording.verificationState === "verified"
                                ? "ready"
                                : "blocked"
                            }`}
                          >
                            {studioRecordingVerificationLabel(recording)}
                          </span>
                          <p>
                            {recording.completionDetail ??
                              recording.verificationDetail ??
                              "Recording verification metadata is not available."}
                          </p>
                          <p>{studioRecordingSizeLabel(recording)}</p>
                        </div>
                        {warning ? (
                          <p className="review-status-copy">{warning}</p>
                        ) : null}
                        {importBlockReason ? (
                          <p className="review-status-copy">
                            {importBlockReason}
                          </p>
                        ) : null}
                        {exportHistory ? (
                          <p className="review-status-copy">
                            Exported {exportHistory.acceptedCount} kept moments
                            as {exportHistory.formats.join(", ")} on{" "}
                            {new Date(
                              exportHistory.exportedAt,
                            ).toLocaleString()}
                            .
                          </p>
                        ) : null}
                        {recording.outputReadiness ? (
                          <div className="studio-output-readiness">
                            <span
                              className={`analysis-readiness-pill ${outputReadinessTone(
                                recording.outputReadiness,
                              )}`}
                            >
                              {outputReadinessLabel(recording.outputReadiness)}
                            </span>
                            <p>{recording.outputReadiness.detail}</p>
                            {recording.outputReadiness.blockers.length > 0 ? (
                              <p>
                                Blocked by{" "}
                                {recording.outputReadiness.blockers.join(", ")}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="action-row">
                          <button
                            className="button-secondary"
                            disabled={isAnalyzing || Boolean(importBlockReason)}
                            onClick={() =>
                              handleImportStudioRecording(recording)
                            }
                            title={
                              importBlockReason ??
                              "Import this Studio recording for review."
                            }
                            type="button"
                          >
                            Import for review
                          </button>
                          {recording.state === "dismissed" ? (
                            <button
                              className="button-secondary"
                              onClick={() =>
                                handleRestoreStudioRecording(recording)
                              }
                              type="button"
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              className="button-secondary"
                              onClick={() =>
                                handleDismissStudioRecording(recording)
                              }
                              type="button"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p>
                  Stop a Studio recording and Pulse will offer it here for the
                  next scan. Import stays manual so the active review session
                  does not change unexpectedly.
                </p>
              )}
            </article>

            {showStartGuide ? (
              <article className="utility-block analysis-onboarding-card">
                <div className="panel-header">
                  <div>
                    <span className="detail-label">
                      {startGuide.statusLabel}
                    </span>
                    <h2>{startGuide.headline}</h2>
                    <p>{startGuide.detail}</p>
                  </div>
                </div>
                <ol className="plain-list ordered analysis-step-list">
                  {startGuide.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {startGuide.ctaLabel ? (
                  <div className="action-row">
                    <button
                      className="button-secondary"
                      onClick={() => {
                        if (startGuide.ctaAction === "profile-setup") {
                          openSettingsWindowFromUi("profile-setup");
                          return;
                        }

                        if (startGuide.ctaAction === "pick-media") {
                          void handlePickMedia();
                        }
                      }}
                      type="button"
                    >
                      {startGuide.ctaLabel}
                    </button>
                  </div>
                ) : null}
              </article>
            ) : null}

            {isAnalyzing ? (
              <article className="analysis-readiness-card ready">
                <div className="analysis-readiness-header">
                  <div>
                    <span className="detail-label">Scan in progress</span>
                    <strong>Scanning this video</strong>
                    <p className="analysis-readiness-copy">
                      Large files can take a bit. Keep this window open; Review
                      opens when the scan finishes.
                    </p>
                  </div>
                  <span className="analysis-readiness-pill ready">Working</span>
                </div>
              </article>
            ) : null}

            <article className="utility-block">
              <span className="detail-label">What happens next</span>
              <ol className="plain-list ordered">
                <li>Pulse scans the video on your Mac.</li>
                <li>It builds a queue of moments worth checking.</li>
                <li>You review each moment and choose what to keep or skip.</li>
              </ol>
              {projectSession ? (
                <p>
                  Loaded session: {projectSession.title} •{" "}
                  {projectSession.candidates.length} moments •{" "}
                  {activeSessionReviewStateLabel ?? "Needs review"}
                </p>
              ) : (
                <p>No saved review session is open yet.</p>
              )}
            </article>
          </div>
        </section>
      );
    }

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
            onSelectCandidate={handleSelectCandidate}
            selectedCandidateId={selectedCandidate?.id ?? null}
          />
        </details>
        <div className="desktop-review-grid">
          <CandidateQueue
            bandFilter={bandFilter}
            candidates={queueCandidates}
            decisionsByCandidateId={decisionsByCandidateId}
            isStrongMatchFallback={isStrongMatchFallback}
            matchingCandidateCount={searchFilteredCandidates.length}
            onSelectNextPending={handleSelectNextPending}
            onBandFilterChange={setBandFilter}
            onPresentationModeChange={setPresentationMode}
            onPreviewCandidate={(candidateId) =>
              handleOpenMomentPreview(candidateId)
            }
            onReviewQueueModeChange={handleReviewQueueModeChange}
            onSearchChange={handleSearchChange}
            onSelectCandidate={handleSelectCandidate}
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
            isCurrentCandidateSentToStudio={Boolean(
              projectSession &&
              selectedCandidate &&
              studioExportedCandidateIds[
                studioPulseSourceEventId(
                  projectSession.id,
                  selectedCandidate.id,
                )
              ],
            )}
            onPreviewDetectedMoment={() =>
              handleOpenMomentPreview(
                selectedCandidate?.id ?? null,
                "DETECTED_MOMENT",
              )
            }
            onPreviewSuggestedSegment={() =>
              handleOpenMomentPreview(selectedCandidate?.id ?? null)
            }
            profileMatchingSummary={profileMatchingSummary}
            selectedCandidateVisibleInQueue={selectedCandidateVisibleInQueue}
            transcript={projectSession?.transcript ?? []}
            pendingCount={pendingReviewCount}
            nextPendingSession={nextPendingSession}
            labelDraft={
              selectedCandidate ? (labelDrafts[selectedCandidate.id] ?? "") : ""
            }
            onAccept={handleAccept}
            onExportAcceptedToStudio={() => {
              void handleExportAcceptedToStudio();
            }}
            onExpandResolution={handleExpandResolution}
            onExpandSetup={handleExpandSetup}
            isExportingToStudio={isExportingToStudio}
            isSavingReview={isSavingReview}
            onLabelChange={handleLabelChange}
            onOpenNextPendingSession={() => {
              void handleOpenNextPendingSession();
            }}
            onSelectNextVisible={handleSelectNextVisible}
            onSelectPreviousVisible={handleSelectPreviousVisible}
            onReject={handleReject}
            onSaveLabel={handleSaveLabel}
            onSelectNextPending={handleSelectNextPending}
            onReturnToProjects={handleReturnToProjects}
            profile={currentProfile}
            jsonPreview={jsonPreview}
            reviewError={reviewError}
            studioRecordingExportHistory={activeStudioExportHistory}
            studioExportStatus={studioExportStatus}
            visibleCandidateCount={queueCandidates.length}
          />
        </div>
      </section>
    );
  }

  function renderDesktopAside() {
    if (activePage === "new-analysis") {
      return (
        <div className="desktop-aside-stack">
          <article className="utility-block">
            <span className="detail-label">Before you scan</span>
            <p>Choose one local video file.</p>
            <p>Pick the profile closest to what you want to keep.</p>
            <p>Give the session a name only if the file name is not enough.</p>
          </article>
          <article className="utility-block">
            <span className="detail-label">Why profiles matter</span>
            <p>
              A profile is a small set of examples. It helps Pulse find moments
              that feel like your previous keeps.
            </p>
            <p>Short clips and finished edits are both useful examples.</p>
          </article>
        </div>
      );
    }

    if (activePage === "suite") {
      const readyApps = suiteStatus.filter(
        (app) => app.installed && app.running && app.reachable && !app.stale,
      ).length;
      return (
        <div className="desktop-aside-stack">
          <article className="utility-block">
            <span className="detail-label">Suite snapshot</span>
            <p>
              {readyApps} of {suiteStatus.length || 3} apps ready
            </p>
            <p>
              {suiteSession
                ? `${suiteSession.title} is the active shared session.`
                : "Open Studio to create the shared suite session."}
            </p>
          </article>
          <article className="utility-block">
            <span className="detail-label">Pulse role</span>
            <p>
              Pulse receives Studio recordings, scans video, and sends kept
              moments back to Studio.
            </p>
          </article>
        </div>
      );
    }

    if (activePage === "projects") {
      return (
        <div className="desktop-aside-stack">
          <article className="utility-block">
            <span className="detail-label">Backlog snapshot</span>
            <p>
              {projectSummaries.length} saved session
              {projectSummaries.length === 1 ? "" : "s"} total
            </p>
            <p>
              {pendingSessionCount} session
              {pendingSessionCount === 1 ? "" : "s"} still need review
            </p>
          </article>
          <article className="utility-block">
            <span className="detail-label">Next up</span>
            <p>
              {nextPendingSession
                ? `${nextPendingSession.sessionTitle} • ${nextPendingSession.pendingCount} undecided`
                : "Nothing is waiting right now."}
            </p>
          </article>
        </div>
      );
    }

    return (
      <div className="desktop-aside-stack">
        <article className="utility-block">
          <span className="detail-label">Current video</span>
          <p>{selectedMediaPath || "No video selected yet."}</p>
          <p>
            {sessionCandidates.length} suggested moment
            {sessionCandidates.length === 1 ? "" : "s"} • {acceptedCount} kept
          </p>
          <p>
            {pendingReviewCount} undecided • {rejectedCount} skipped
          </p>
        </article>
        <article className="utility-block">
          <span className="detail-label">Keyboard shortcuts</span>
          <ul className="plain-list review-shortcut-list">
            <li>
              <strong>K</strong>
              <span>Keep the current moment</span>
            </li>
            <li>
              <strong>X</strong>
              <span>Skip the current moment</span>
            </li>
            <li>
              <strong>N</strong>
              <span>Jump to the next undecided moment</span>
            </li>
            <li>
              <strong>V</strong>
              <span>Open the selected moment in the video player</span>
            </li>
            <li>
              <strong>J / L</strong>
              <span>Move to the previous or next visible moment</span>
            </li>
            <li>
              <strong>[ / ]</strong>
              <span>Lengthen the clip start or ending by 2 seconds</span>
            </li>
            <li>
              <strong>/</strong>
              <span>Focus the queue search box</span>
            </li>
          </ul>
        </article>
        <TranscriptSnippetBlock
          heading="Current transcript focus"
          text={
            selectedCandidate?.transcriptSnippet ??
            "Select a moment to inspect its transcript context."
          }
        />
        {pendingReviewCount === 0 ? (
          <article className="utility-block">
            <span className="detail-label">Export</span>
            <p>Export actions are available in the session completion card.</p>
          </article>
        ) : null}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <LayoutShell
        activeId={activePage}
        appName="vaexcore pulse"
        aside={renderDesktopAside()}
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
      </LayoutShell>
    </div>
  );
}

function initialDesktopPage(): DesktopPage {
  const requested = new URLSearchParams(window.location.search).get("page");
  return desktopPages.some((page) => page.id === requested)
    ? (requested as DesktopPage)
    : "new-analysis";
}

function SettingsWindowApp() {
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>(() => resolveInitialSettingsSection());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolveInitialThemeMode(),
  );

  useEffect(() => {
    persistThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    scrollSettingsWindowToTop();
  }, [activeSettingsSection]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let isSubscribed = true;
    let unlistenSettingsSection: (() => void) | undefined;

    void listen<SettingsSectionId>(settingsSectionSelectedEvent, (event) => {
      if (isSettingsSectionId(event.payload)) {
        setActiveSettingsSection(event.payload);
        scrollSettingsWindowToTop();
      }
    }).then((unlisten) => {
      if (!isSubscribed) {
        unlisten();
        return;
      }

      unlistenSettingsSection = unlisten;
    });

    return () => {
      isSubscribed = false;
      unlistenSettingsSection?.();
    };
  }, []);

  function handleThemeModeChange(nextThemeMode: ThemeMode) {
    setThemeMode(nextThemeMode);
    persistThemeMode(nextThemeMode);

    if (isTauriRuntime()) {
      void emit("theme-mode-changed", nextThemeMode);
    }
  }

  return (
    <main className="settings-shell">
      <section aria-labelledby="settings-title" className="settings-window">
        <header className="settings-header">
          <div className="settings-brand-mark">
            <VaexcorePulseLogo />
          </div>
          <div>
            <p className="eyebrow">vaexcore pulse</p>
            <h1 id="settings-title">Settings</h1>
          </div>
        </header>

        <div className="settings-layout">
          <nav aria-label="Settings sections" className="settings-section-nav">
            {settingsSections.map((section) => (
              <button
                aria-current={
                  activeSettingsSection === section.id ? "page" : undefined
                }
                className={
                  activeSettingsSection === section.id ? "active" : undefined
                }
                key={section.id}
                onClick={() => setActiveSettingsSection(section.id)}
                type="button"
              >
                <strong>{section.label}</strong>
                <span>{section.detail}</span>
              </button>
            ))}
          </nav>

          <div className="settings-section-panel">
            {activeSettingsSection === "profile-setup" ? (
              <CompactProfileSetupSettingsSection />
            ) : null}

            {activeSettingsSection === "appearance" ? (
              <section className="settings-card">
                <div>
                  <span className="detail-label">Appearance</span>
                  <h2>Color mode</h2>
                  <p>
                    Keep the logo palette in a calmer dark or brighter light
                    workspace.
                  </p>
                </div>
                <div aria-label="Color mode" className="segmented-control">
                  <button
                    aria-pressed={themeMode === "dark"}
                    className={themeMode === "dark" ? "active" : undefined}
                    onClick={() => handleThemeModeChange("dark")}
                    type="button"
                  >
                    Dark
                  </button>
                  <button
                    aria-pressed={themeMode === "light"}
                    className={themeMode === "light" ? "active" : undefined}
                    onClick={() => handleThemeModeChange("light")}
                    type="button"
                  >
                    Light
                  </button>
                </div>
              </section>
            ) : null}

            {activeSettingsSection === "window-behavior" ? (
              <section className="settings-card">
                <span className="detail-label">Window behavior</span>
                <h2>Close window vs quit app</h2>
                <ul className="settings-note-list">
                  <li>
                    <strong>Close Main Window</strong>
                    <span>
                      Hides the workspace. Pulse stays open from the menu.
                    </span>
                  </li>
                  <li>
                    <strong>Quit vaexcore pulse</strong>
                    <span>
                      Closes Pulse and stops scans or background work.
                    </span>
                  </li>
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

const profileSourceTypeOptions: Array<{
  id: ExampleClipSourceType;
  label: string;
  hint: string;
}> = [
  {
    id: "LOCAL_FILE_UPLOAD",
    label: "Choose clip file",
    hint: "Choose a short clip from this Mac.",
  },
  {
    id: "LOCAL_FILE_PATH",
    label: "Paste file path",
    hint: "Paste the full path to a short clip on this Mac.",
  },
  {
    id: "TWITCH_CLIP_URL",
    label: "Twitch clip link",
    hint: "Paste a Twitch clip link.",
  },
  {
    id: "YOUTUBE_SHORT_URL",
    label: "YouTube Short link",
    hint: "Paste a YouTube Short link.",
  },
];

const localProfileSourceTypeOptions = profileSourceTypeOptions.filter(
  (option) =>
    option.id === "LOCAL_FILE_PATH" || option.id === "LOCAL_FILE_UPLOAD",
);

function CompactProfileSetupSettingsSection() {
  const apiBaseUrl =
    import.meta.env.VITE_VAEXCORE_PULSE_API_BASE_URL ?? "http://127.0.0.1:4010";
  const pulseRuntimeStatus = usePulseRuntimeStatus(apiBaseUrl);
  const isPulseReady = isPulseRuntimeReady(pulseRuntimeStatus);
  const [profiles, setProfiles] = useState<ClipProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [selectedProfileExamples, setSelectedProfileExamples] = useState<
    ExampleClip[]
  >([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isLoadingProfileExamples, setIsLoadingProfileExamples] =
    useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isAddingProfileExample, setIsAddingProfileExample] = useState(false);
  const [isAddingEditedVideo, setIsAddingEditedVideo] = useState(false);
  const [profileLibraryError, setProfileLibraryError] = useState<string | null>(
    null,
  );
  const [profileSetupNotice, setProfileSetupNotice] = useState<string | null>(
    null,
  );
  const [profileLoadRetryCount, setProfileLoadRetryCount] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [sourceType, setSourceType] =
    useState<ExampleClipSourceType>("LOCAL_FILE_UPLOAD");
  const [sourceValue, setSourceValue] = useState("");
  const [exampleTitle, setExampleTitle] = useState("");
  const [exampleNote, setExampleNote] = useState("");
  const [editSourceType, setEditSourceType] =
    useState<ExampleClipSourceType>("LOCAL_FILE_UPLOAD");
  const [editSourceValue, setEditSourceValue] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");

  const selectedProfile = selectedProfileId
    ? (profiles.find((profile) => profile.id === selectedProfileId) ?? null)
    : null;
  const selectedSourceType = profileSourceTypeOptions.find(
    (option) => option.id === sourceType,
  );
  const selectedEditSourceType = localProfileSourceTypeOptions.find(
    (option) => option.id === editSourceType,
  );
  const visibleExamples =
    selectedProfileExamples.length > 0 || isLoadingProfileExamples
      ? selectedProfileExamples
      : (selectedProfile?.exampleClips ?? []);
  const isClipFilePicker = sourceType === "LOCAL_FILE_UPLOAD";
  const isEditFilePicker = editSourceType === "LOCAL_FILE_UPLOAD";
  const canPickClipFile = sourceType === "LOCAL_FILE_PATH" || isClipFilePicker;
  const canPickEditFile =
    editSourceType === "LOCAL_FILE_PATH" || isEditFilePicker;

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingProfiles(false);
      setProfileLibraryError(null);
      return;
    }

    let isCancelled = false;

    async function loadProfiles() {
      setIsLoadingProfiles(true);
      try {
        const nextProfiles = await fetchProfiles(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setProfiles(nextProfiles);
        setSelectedProfileId((current) =>
          current && nextProfiles.some((profile) => profile.id === current)
            ? current
            : (nextProfiles[0]?.id ?? null),
        );
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(formatProfileSetupError(error));
        if (isLocalServiceUnavailableError(error)) {
          window.setTimeout(() => {
            if (!isCancelled) {
              setProfileLoadRetryCount((current) => current + 1);
            }
          }, 2000);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingProfiles(false);
        }
      }
    }

    void loadProfiles();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, profileLoadRetryCount]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingProfileExamples(false);
      return;
    }

    const profileId = selectedProfileId;
    if (!profileId) {
      setSelectedProfileExamples([]);
      return;
    }
    const profileIdForLoad: string = profileId;

    let isCancelled = false;

    async function loadExamples() {
      setIsLoadingProfileExamples(true);
      try {
        const examples = await fetchProfileExamples(
          apiBaseUrl,
          profileIdForLoad,
        );
        if (isCancelled) {
          return;
        }

        setSelectedProfileExamples(examples);
        setProfiles((current) =>
          current.map((profile) =>
            profile.id === profileIdForLoad
              ? { ...profile, exampleClips: examples }
              : profile,
          ),
        );
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(formatProfileSetupError(error));
      } finally {
        if (!isCancelled) {
          setIsLoadingProfileExamples(false);
        }
      }
    }

    void loadExamples();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, selectedProfileId]);

  async function handlePickLocalMedia(
    nextSourceType: ExampleClipSourceType,
    onSelect: (selection: string) => void,
  ) {
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

      if (typeof selection === "string") {
        onSelect(selection);
      }
    } catch {
      if (nextSourceType === "LOCAL_FILE_UPLOAD") {
        onSelect("");
      }
    }
  }

  async function handleCreateProfile() {
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      return;
    }

    setIsCreatingProfile(true);
    setProfileLibraryError(null);
    setProfileSetupNotice(null);

    try {
      const createdProfile = await createProfile(apiBaseUrl, {
        name: trimmedName,
        description: profileDescription.trim() || undefined,
      });
      setProfiles((current) =>
        upsertProfile(current, {
          ...createdProfile,
          exampleClips: createdProfile.exampleClips ?? [],
        }),
      );
      setSelectedProfileId(createdProfile.id);
      setSelectedProfileExamples(createdProfile.exampleClips ?? []);
      setProfileName("");
      setProfileDescription("");
      setProfileSetupNotice("Profile saved.");
      emitProfileSetupChanged(createdProfile.id);
    } catch (error) {
      setProfileLibraryError(formatProfileSetupError(error));
    } finally {
      setIsCreatingProfile(false);
    }
  }

  async function handleAddExample() {
    if (!selectedProfileId || !sourceValue.trim()) {
      return;
    }

    setIsAddingProfileExample(true);
    setProfileLibraryError(null);
    setProfileSetupNotice(null);

    try {
      const createdExample = await createProfileExample(
        apiBaseUrl,
        selectedProfileId,
        {
          sourceType,
          sourceValue: sourceValue.trim(),
          title: exampleTitle.trim() || undefined,
          note: exampleNote.trim() || undefined,
        },
      );
      const nextExamples = [
        createdExample,
        ...selectedProfileExamples.filter(
          (example) => example.id !== createdExample.id,
        ),
      ];
      setSelectedProfileExamples(nextExamples);
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === selectedProfileId
            ? {
                ...profile,
                exampleClips: nextExamples,
                updatedAt: createdExample.updatedAt,
              }
            : profile,
        ),
      );
      setSourceValue("");
      setExampleTitle("");
      setExampleNote("");
      setProfileSetupNotice("Clip reference saved.");
      emitProfileSetupChanged(selectedProfileId);
    } catch (error) {
      setProfileLibraryError(formatProfileSetupError(error));
    } finally {
      setIsAddingProfileExample(false);
    }
  }

  async function handleAddEditedVideo() {
    if (!selectedProfileId || !editSourceValue.trim()) {
      return;
    }

    setIsAddingEditedVideo(true);
    setProfileLibraryError(null);
    setProfileSetupNotice(null);

    try {
      await createMediaLibraryAssetEntry(apiBaseUrl, {
        assetType: "EDIT",
        scope: "PROFILE",
        profileId: selectedProfileId,
        sourceType: editSourceType,
        sourceValue: editSourceValue.trim(),
        title: editTitle.trim() || undefined,
        note: editNote.trim() || undefined,
      });
      setEditSourceValue("");
      setEditTitle("");
      setEditNote("");
      setProfileSetupNotice("Edited video reference saved.");
      emitProfileSetupChanged(selectedProfileId);
    } catch (error) {
      setProfileLibraryError(formatProfileSetupError(error));
    } finally {
      setIsAddingEditedVideo(false);
    }
  }

  if (!isPulseReady) {
    const startupCopy = buildPulseStartupCopy(pulseRuntimeStatus);
    return (
      <div className="settings-profile-setup">
        <section className="settings-card profile-setup-card">
          <span className="detail-label">Starting</span>
          <h2>{startupCopy.headline}</h2>
          <p>{startupCopy.detail}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="settings-profile-setup">
      {profileLibraryError ? (
        <p className="analysis-error">{profileLibraryError}</p>
      ) : null}
      {profileSetupNotice ? (
        <p className="settings-success-note">{profileSetupNotice}</p>
      ) : null}

      <section className="settings-card profile-setup-card">
        <div className="profile-setup-toolbar">
          <div>
            <span className="detail-label">Clip profiles</span>
            <h2>Profile Setup</h2>
            <p>
              Create a profile and add examples that show what you like to keep.
            </p>
          </div>
          <span className="queue-count">
            {isLoadingProfiles ? "Loading..." : `${profiles.length} profiles`}
          </span>
        </div>

        {profiles.length > 0 ? (
          <label className="search-block">
            <span className="input-label">Selected profile</span>
            <select
              className="search-input"
              onChange={(event) => setSelectedProfileId(event.target.value)}
              value={selectedProfileId ?? ""}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="settings-empty-note">
            No saved profiles yet. Create one below.
          </p>
        )}
      </section>

      <section className="settings-card profile-setup-card">
        <span className="detail-label">Create profile</span>
        <div className="settings-compact-grid">
          <label className="search-block">
            <span className="input-label">Name</span>
            <input
              className="search-input"
              disabled={isCreatingProfile}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Dry humor"
              type="text"
              value={profileName}
            />
          </label>
          <label className="search-block">
            <span className="input-label">Description</span>
            <textarea
              className="search-input profile-textarea compact"
              disabled={isCreatingProfile}
              onChange={(event) => setProfileDescription(event.target.value)}
              placeholder="Describe moments you like to keep."
              value={profileDescription}
            />
          </label>
        </div>
        <div className="action-row">
          <button
            className="button-primary"
            disabled={isCreatingProfile || !profileName.trim()}
            onClick={() => {
              void handleCreateProfile();
            }}
            type="button"
          >
            {isCreatingProfile ? "Saving profile..." : "Create profile"}
          </button>
        </div>
      </section>

      <section className="settings-card profile-setup-card">
        <div className="profile-setup-toolbar">
          <div>
            <span className="detail-label">Reusable clips</span>
            <h2>Add clip examples</h2>
            <p>Use short clips that feel like moments you would keep.</p>
          </div>
          {selectedProfile ? (
            <span className="queue-count">{selectedProfile.name}</span>
          ) : null}
        </div>

        {selectedProfile ? (
          <div className="analysis-form">
            <label className="search-block">
              <span className="input-label">Add from</span>
              <select
                className="search-input"
                disabled={isAddingProfileExample}
                onChange={(event) =>
                  setSourceType(event.target.value as ExampleClipSourceType)
                }
                value={sourceType}
              >
                {profileSourceTypeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small className="analysis-field-note">
                {selectedSourceType?.hint}
              </small>
            </label>

            {isClipFilePicker ? (
              <div className="settings-file-choice">
                <span className="input-label">Clip file</span>
                <div className="settings-file-value">
                  {sourceValue
                    ? extractSourceName(sourceValue)
                    : "No clip file chosen yet."}
                </div>
                {sourceValue ? (
                  <small className="analysis-field-note">{sourceValue}</small>
                ) : null}
                <button
                  className="button-secondary"
                  disabled={isAddingProfileExample}
                  onClick={() => {
                    void handlePickLocalMedia(sourceType, setSourceValue);
                  }}
                  type="button"
                >
                  Choose clip file
                </button>
              </div>
            ) : (
              <label className="search-block">
                <span className="input-label">
                  {sourceType === "LOCAL_FILE_PATH" ? "Clip path" : "Clip link"}
                </span>
                <input
                  className="search-input"
                  disabled={isAddingProfileExample}
                  onChange={(event) => setSourceValue(event.target.value)}
                  placeholder={
                    sourceType === "TWITCH_CLIP_URL"
                      ? "https://clips.twitch.tv/..."
                      : sourceType === "YOUTUBE_SHORT_URL"
                        ? "https://www.youtube.com/shorts/..."
                        : "/Users/you/Clips/example.mp4"
                  }
                  type="text"
                  value={sourceValue}
                />
              </label>
            )}

            {sourceType === "LOCAL_FILE_PATH" && canPickClipFile ? (
              <div className="action-row">
                <button
                  className="button-secondary"
                  disabled={isAddingProfileExample}
                  onClick={() => {
                    void handlePickLocalMedia(sourceType, setSourceValue);
                  }}
                  type="button"
                >
                  Choose clip file
                </button>
              </div>
            ) : null}

            <div className="settings-compact-grid two-column">
              <label className="search-block">
                <span className="input-label">Optional title</span>
                <input
                  className="search-input"
                  disabled={isAddingProfileExample}
                  onChange={(event) => setExampleTitle(event.target.value)}
                  placeholder="Dry payoff example"
                  type="text"
                  value={exampleTitle}
                />
              </label>
              <label className="search-block">
                <span className="input-label">Optional note</span>
                <input
                  className="search-input"
                  disabled={isAddingProfileExample}
                  onChange={(event) => setExampleNote(event.target.value)}
                  placeholder="What should Pulse notice here?"
                  type="text"
                  value={exampleNote}
                />
              </label>
            </div>

            <div className="action-row">
              <button
                className="button-primary"
                disabled={isAddingProfileExample || !sourceValue.trim()}
                onClick={() => {
                  void handleAddExample();
                }}
                type="button"
              >
                {isAddingProfileExample
                  ? "Saving example..."
                  : "Save clip example"}
              </button>
            </div>
          </div>
        ) : (
          <p className="settings-empty-note">
            Create or select a profile before adding examples.
          </p>
        )}
      </section>

      <details className="settings-card profile-setup-card internal-details">
        <summary className="internal-details-summary">
          <span>Finished edit example</span>
          <span className="queue-count">Optional</span>
        </summary>
        <div className="analysis-form settings-details-body">
          <label className="search-block">
            <span className="input-label">Add from</span>
            <select
              className="search-input"
              disabled={!selectedProfile || isAddingEditedVideo}
              onChange={(event) =>
                setEditSourceType(event.target.value as ExampleClipSourceType)
              }
              value={editSourceType}
            >
              {localProfileSourceTypeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <small className="analysis-field-note">
              {selectedEditSourceType?.hint}
            </small>
          </label>

          {isEditFilePicker ? (
            <div className="settings-file-choice">
              <span className="input-label">Edited video file</span>
              <div className="settings-file-value">
                {editSourceValue
                  ? extractSourceName(editSourceValue)
                  : "No edited video chosen yet."}
              </div>
              {editSourceValue ? (
                <small className="analysis-field-note">{editSourceValue}</small>
              ) : null}
              <button
                className="button-secondary"
                disabled={!selectedProfile || isAddingEditedVideo}
                onClick={() => {
                  void handlePickLocalMedia(editSourceType, setEditSourceValue);
                }}
                type="button"
              >
                Choose edited video
              </button>
            </div>
          ) : (
            <label className="search-block">
              <span className="input-label">Edited video path</span>
              <input
                className="search-input"
                disabled={!selectedProfile || isAddingEditedVideo}
                onChange={(event) => setEditSourceValue(event.target.value)}
                placeholder="/Users/you/Exports/session-edit.mp4"
                type="text"
                value={editSourceValue}
              />
            </label>
          )}

          {editSourceType === "LOCAL_FILE_PATH" && canPickEditFile ? (
            <div className="action-row">
              <button
                className="button-secondary"
                disabled={!selectedProfile || isAddingEditedVideo}
                onClick={() => {
                  void handlePickLocalMedia(editSourceType, setEditSourceValue);
                }}
                type="button"
              >
                Choose edited video
              </button>
            </div>
          ) : null}

          <div className="settings-compact-grid two-column">
            <label className="search-block">
              <span className="input-label">Optional title</span>
              <input
                className="search-input"
                disabled={!selectedProfile || isAddingEditedVideo}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder="March 12 final cut"
                type="text"
                value={editTitle}
              />
            </label>
            <label className="search-block">
              <span className="input-label">Optional note</span>
              <input
                className="search-input"
                disabled={!selectedProfile || isAddingEditedVideo}
                onChange={(event) => setEditNote(event.target.value)}
                placeholder="What should Pulse learn from this edit?"
                type="text"
                value={editNote}
              />
            </label>
          </div>

          <div className="action-row">
            <button
              className="button-primary"
              disabled={
                !selectedProfile || isAddingEditedVideo || !editSourceValue
              }
              onClick={() => {
                void handleAddEditedVideo();
              }}
              type="button"
            >
              {isAddingEditedVideo ? "Saving edit..." : "Save finished edit"}
            </button>
          </div>
        </div>
      </details>

      <section className="settings-card profile-setup-card">
        <div className="profile-setup-toolbar">
          <div>
            <span className="detail-label">Profile examples</span>
            <h2>Saved examples</h2>
          </div>
          {isLoadingProfileExamples ? (
            <span className="queue-count">Refreshing...</span>
          ) : null}
        </div>

        {visibleExamples.length > 0 ? (
          <div className="profile-reference-list">
            {visibleExamples.map((example) => (
              <article className="profile-example-card" key={example.id}>
                <div className="profile-example-top">
                  <span className="detail-label">
                    {formatProfileSourceType(example.sourceType)}
                  </span>
                  <span className="session-state-pill active-session">
                    {formatStatus(example.status)}
                  </span>
                </div>
                <strong>{example.title || "Untitled example"}</strong>
                <p className="profile-example-source">{example.sourceValue}</p>
                {example.note ? <p>{example.note}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="settings-empty-note">
            {selectedProfile
              ? "No saved examples yet."
              : "Select a profile to see its saved examples."}
          </p>
        )}
      </section>
    </div>
  );
}

function ProfileSetupSettingsSection() {
  const apiBaseUrl =
    import.meta.env.VITE_VAEXCORE_PULSE_API_BASE_URL ?? "http://127.0.0.1:4010";
  const [profiles, setProfiles] = useState<ClipProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [selectedProfileExamples, setSelectedProfileExamples] = useState<
    ExampleClip[]
  >([]);
  const [mediaLibraryAssets, setMediaLibraryAssets] = useState<
    MediaLibraryAsset[]
  >([]);
  const [mediaEditPairs, setMediaEditPairs] = useState<MediaEditPair[]>([]);
  const [mediaIndexJobs, setMediaIndexJobs] = useState<MediaIndexJob[]>([]);
  const [mediaAlignmentJobs, setMediaAlignmentJobs] = useState<
    MediaAlignmentJob[]
  >([]);
  const [mediaAlignmentMatches, setMediaAlignmentMatches] = useState<
    MediaAlignmentMatch[]
  >([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isLoadingProfileExamples, setIsLoadingProfileExamples] =
    useState(false);
  const [isLoadingMediaLibraryAssets, setIsLoadingMediaLibraryAssets] =
    useState(false);
  const [isLoadingMediaEditPairs, setIsLoadingMediaEditPairs] = useState(false);
  const [isLoadingMediaIndexJobs, setIsLoadingMediaIndexJobs] = useState(false);
  const [isLoadingMediaAlignmentJobs, setIsLoadingMediaAlignmentJobs] =
    useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isAddingProfileExample, setIsAddingProfileExample] = useState(false);
  const [isCreatingMediaLibraryAsset, setIsCreatingMediaLibraryAsset] =
    useState(false);
  const [isCreatingMediaEditPair, setIsCreatingMediaEditPair] = useState(false);
  const [isCreatingMediaIndexJob, setIsCreatingMediaIndexJob] = useState(false);
  const [isCreatingMediaAlignmentJob, setIsCreatingMediaAlignmentJob] =
    useState(false);
  const [cancellingMediaIndexJobIds, setCancellingMediaIndexJobIds] = useState<
    Record<string, boolean>
  >({});
  const [cancellingMediaAlignmentJobIds, setCancellingMediaAlignmentJobIds] =
    useState<Record<string, boolean>>({});
  const [savingThumbnailOutputAssetIds, setSavingThumbnailOutputAssetIds] =
    useState<Record<string, boolean>>({});
  const [profileLibraryError, setProfileLibraryError] = useState<string | null>(
    null,
  );

  const selectedProfile = selectedProfileId
    ? (profiles.find((profile) => profile.id === selectedProfileId) ?? null)
    : null;

  useEffect(() => {
    let isCancelled = false;

    async function loadProfiles() {
      setIsLoadingProfiles(true);
      try {
        const nextProfiles = await fetchProfiles(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setProfiles(nextProfiles);
        setSelectedProfileId((current) =>
          current && nextProfiles.some((profile) => profile.id === current)
            ? current
            : (nextProfiles[0]?.id ?? null),
        );
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load clip profiles: ${error.message}`
            : "Unable to load clip profiles",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingProfiles(false);
        }
      }
    }

    void loadProfiles();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    let isCancelled = false;

    async function loadMediaLibraryAssets() {
      setIsLoadingMediaLibraryAssets(true);
      try {
        const nextAssets = await fetchMediaLibraryAssets(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaLibraryAssets(nextAssets);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load saved media: ${error.message}`
            : "Unable to load saved media",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaLibraryAssets(false);
        }
      }
    }

    void loadMediaLibraryAssets();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    let isCancelled = false;

    async function loadMediaEditPairs() {
      setIsLoadingMediaEditPairs(true);
      try {
        const nextPairs = await fetchMediaEditPairs(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaEditPairs(nextPairs);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load video comparisons: ${error.message}`
            : "Unable to load video comparisons",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaEditPairs(false);
        }
      }
    }

    void loadMediaEditPairs();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    let isCancelled = false;

    async function loadMediaIndexJobs() {
      setIsLoadingMediaIndexJobs(true);
      try {
        const nextJobs = await fetchMediaIndexJobs(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaIndexJobs(nextJobs);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load background activity: ${error.message}`
            : "Unable to load background activity",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaIndexJobs(false);
        }
      }
    }

    void loadMediaIndexJobs();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    const hasActiveIndexJobs = mediaIndexJobs.some(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );
    if (!hasActiveIndexJobs) {
      return;
    }

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      async function refreshIndexState() {
        try {
          const [nextJobs, nextAssets, nextPairs] = await Promise.all([
            fetchMediaIndexJobs(apiBaseUrl),
            fetchMediaLibraryAssets(apiBaseUrl),
            fetchMediaEditPairs(apiBaseUrl),
          ]);
          if (isCancelled) {
            return;
          }

          setMediaIndexJobs(nextJobs);
          setMediaLibraryAssets(nextAssets);
          setMediaEditPairs(nextPairs);
          emitProfileSetupChanged(selectedProfileId ?? undefined);
        } catch {
          // Keep current state; explicit load effects surface persistent failures.
        }
      }

      void refreshIndexState();
    }, 2000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiBaseUrl, mediaIndexJobs, selectedProfileId]);

  useEffect(() => {
    let isCancelled = false;

    async function loadMediaAlignmentState() {
      setIsLoadingMediaAlignmentJobs(true);
      try {
        const [nextJobs, nextMatches] = await Promise.all([
          fetchMediaAlignmentJobs(apiBaseUrl),
          fetchMediaAlignmentMatches(apiBaseUrl),
        ]);
        if (isCancelled) {
          return;
        }

        setMediaAlignmentJobs(nextJobs);
        setMediaAlignmentMatches(nextMatches);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load video comparisons: ${error.message}`
            : "Unable to load video comparisons",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaAlignmentJobs(false);
        }
      }
    }

    void loadMediaAlignmentState();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    const hasActiveAlignmentJobs = mediaAlignmentJobs.some(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );
    if (!hasActiveAlignmentJobs) {
      return;
    }

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      async function refreshAlignmentState() {
        try {
          const [nextJobs, nextMatches, nextPairs] = await Promise.all([
            fetchMediaAlignmentJobs(apiBaseUrl),
            fetchMediaAlignmentMatches(apiBaseUrl),
            fetchMediaEditPairs(apiBaseUrl),
          ]);
          if (isCancelled) {
            return;
          }

          setMediaAlignmentJobs(nextJobs);
          setMediaAlignmentMatches(nextMatches);
          setMediaEditPairs(nextPairs);
          emitProfileSetupChanged(selectedProfileId ?? undefined);
        } catch {
          // Keep current state; explicit load effects surface persistent failures.
        }
      }

      void refreshAlignmentState();
    }, 2000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiBaseUrl, mediaAlignmentJobs, selectedProfileId]);

  useEffect(() => {
    const profileId = selectedProfileId;
    if (!profileId) {
      setSelectedProfileExamples([]);
      return;
    }
    const selectedProfileIdForSettingsLoad: string = profileId;

    let isCancelled = false;

    async function loadExamples() {
      setIsLoadingProfileExamples(true);
      try {
        const examples = await fetchProfileExamples(
          apiBaseUrl,
          selectedProfileIdForSettingsLoad,
        );
        if (isCancelled) {
          return;
        }

        setSelectedProfileExamples(examples);
        setProfiles((current) =>
          current.map((profile) =>
            profile.id === selectedProfileIdForSettingsLoad
              ? { ...profile, exampleClips: examples }
              : profile,
          ),
        );
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load example clips: ${error.message}`
            : "Unable to load example clips",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingProfileExamples(false);
        }
      }
    }

    void loadExamples();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, selectedProfileId]);

  async function handleCreateProfile(input: CreateClipProfileRequest) {
    const request = createClipProfileRequestSchema.parse(input);
    setIsCreatingProfile(true);
    setProfileLibraryError(null);

    try {
      const createdProfile = await createProfile(apiBaseUrl, request);
      setProfiles((current) =>
        upsertProfile(current, {
          ...createdProfile,
          exampleClips: createdProfile.exampleClips ?? [],
        }),
      );
      setSelectedProfileId(createdProfile.id);
      setSelectedProfileExamples(createdProfile.exampleClips ?? []);
      emitProfileSetupChanged(createdProfile.id);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating the profile.",
      );
      throw error;
    } finally {
      setIsCreatingProfile(false);
    }
  }

  async function handleAddProfileExample(
    profileId: string,
    input: AddExampleClipRequest,
  ) {
    const request = addExampleClipRequestSchema.parse(input);
    setIsAddingProfileExample(true);
    setProfileLibraryError(null);

    try {
      const createdExample = await createProfileExample(
        apiBaseUrl,
        profileId,
        request,
      );
      const nextExamples = [
        createdExample,
        ...selectedProfileExamples.filter(
          (example) => example.id !== createdExample.id,
        ),
      ];
      setSelectedProfileExamples(nextExamples);
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === profileId
            ? {
                ...profile,
                exampleClips: nextExamples,
                updatedAt: createdExample.updatedAt,
              }
            : profile,
        ),
      );
      emitProfileSetupChanged(profileId);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the clip.",
      );
      throw error;
    } finally {
      setIsAddingProfileExample(false);
    }
  }

  async function handleCreateMediaLibraryAsset(
    input: CreateMediaLibraryAssetRequest,
  ) {
    const request = createMediaLibraryAssetRequestSchema.parse(input);
    setIsCreatingMediaLibraryAsset(true);
    setProfileLibraryError(null);

    try {
      const createdAsset = await createMediaLibraryAssetEntry(
        apiBaseUrl,
        request,
      );
      setMediaLibraryAssets((current) =>
        upsertMediaLibraryAsset(current, createdAsset),
      );
      emitProfileSetupChanged(createdAsset.profileId);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the media reference.",
      );
      throw error;
    } finally {
      setIsCreatingMediaLibraryAsset(false);
    }
  }

  async function handleCreateMediaEditPair(input: CreateMediaEditPairRequest) {
    const request = createMediaEditPairRequestSchema.parse(input);
    setIsCreatingMediaEditPair(true);
    setProfileLibraryError(null);

    try {
      const createdPair = await createMediaEditPairEntry(apiBaseUrl, request);
      setMediaEditPairs((current) => upsertMediaEditPair(current, createdPair));
      emitProfileSetupChanged(createdPair.profileId);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the video comparison.",
      );
      throw error;
    } finally {
      setIsCreatingMediaEditPair(false);
    }
  }

  async function handleCreateMediaIndexJob(input: CreateMediaIndexJobRequest) {
    const request = createMediaIndexJobRequestSchema.parse(input);
    setIsCreatingMediaIndexJob(true);
    setProfileLibraryError(null);

    try {
      const createdJob = await createMediaIndexJobEntry(apiBaseUrl, request);
      setMediaIndexJobs((current) => upsertMediaIndexJob(current, createdJob));
      emitProfileSetupChanged(selectedProfileId ?? undefined);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while starting the scan.",
      );
      throw error;
    } finally {
      setIsCreatingMediaIndexJob(false);
    }
  }

  async function handleReplaceMediaThumbnailOutputs(
    assetId: string,
    input: ReplaceMediaThumbnailOutputsRequest,
  ) {
    const request = replaceMediaThumbnailOutputsRequestSchema.parse(input);
    setSavingThumbnailOutputAssetIds((current) => ({
      ...current,
      [assetId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const updatedAsset = await replaceMediaThumbnailOutputsEntry(
        apiBaseUrl,
        assetId,
        request,
      );
      setMediaLibraryAssets((current) =>
        upsertMediaLibraryAsset(current, updatedAsset),
      );
      emitProfileSetupChanged(updatedAsset.profileId);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while updating thumbnail picks.",
      );
      throw error;
    } finally {
      setSavingThumbnailOutputAssetIds((current) => {
        const { [assetId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
  }

  async function handleCancelMediaIndexJob(input: CancelMediaIndexJobRequest) {
    const request = cancelMediaIndexJobRequestSchema.parse(input);
    setCancellingMediaIndexJobIds((current) => ({
      ...current,
      [request.jobId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const cancelledJob = await cancelMediaIndexJobEntry(apiBaseUrl, request);
      setMediaIndexJobs((current) =>
        upsertMediaIndexJob(current, cancelledJob),
      );
      emitProfileSetupChanged(selectedProfileId ?? undefined);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while cancelling the scan.",
      );
      throw error;
    } finally {
      setCancellingMediaIndexJobIds((current) => {
        const { [request.jobId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
  }

  async function handleCreateMediaAlignmentJob(
    input: CreateMediaAlignmentJobRequest,
  ) {
    const request = createMediaAlignmentJobRequestSchema.parse(input);
    setIsCreatingMediaAlignmentJob(true);
    setProfileLibraryError(null);

    try {
      const createdJob = await createMediaAlignmentJobEntry(
        apiBaseUrl,
        request,
      );
      setMediaAlignmentJobs((current) =>
        upsertMediaAlignmentJob(current, createdJob),
      );
      emitProfileSetupChanged(selectedProfileId ?? undefined);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while starting the video comparison.",
      );
      throw error;
    } finally {
      setIsCreatingMediaAlignmentJob(false);
    }
  }

  async function handleCancelMediaAlignmentJob(
    input: CancelMediaAlignmentJobRequest,
  ) {
    const request = cancelMediaAlignmentJobRequestSchema.parse(input);
    setCancellingMediaAlignmentJobIds((current) => ({
      ...current,
      [request.jobId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const cancelledJob = await cancelMediaAlignmentJobEntry(
        apiBaseUrl,
        request,
      );
      setMediaAlignmentJobs((current) =>
        upsertMediaAlignmentJob(current, cancelledJob),
      );
      emitProfileSetupChanged(selectedProfileId ?? undefined);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while cancelling the comparison job.",
      );
      throw error;
    } finally {
      setCancellingMediaAlignmentJobIds((current) => {
        const { [request.jobId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
  }

  return (
    <div className="settings-profile-workspace">
      <ProfileWorkspace
        cancellingMediaAlignmentJobIds={cancellingMediaAlignmentJobIds}
        cancellingMediaIndexJobIds={cancellingMediaIndexJobIds}
        error={profileLibraryError}
        examples={selectedProfileExamples}
        isAddingExample={isAddingProfileExample}
        isCreatingMediaAlignmentJob={isCreatingMediaAlignmentJob}
        isCreatingMediaAsset={isCreatingMediaLibraryAsset}
        isCreatingMediaIndexJob={isCreatingMediaIndexJob}
        isCreatingMediaPair={isCreatingMediaEditPair}
        isCreatingProfile={isCreatingProfile}
        isLoadingExamples={isLoadingProfileExamples}
        isLoadingLibraryAssets={isLoadingMediaLibraryAssets}
        isLoadingMediaAlignmentJobs={isLoadingMediaAlignmentJobs}
        isLoadingMediaIndexJobs={isLoadingMediaIndexJobs}
        isLoadingMediaPairs={isLoadingMediaEditPairs}
        isLoadingProfiles={isLoadingProfiles}
        libraryAssets={mediaLibraryAssets}
        mediaAlignmentJobs={mediaAlignmentJobs}
        mediaAlignmentMatches={mediaAlignmentMatches}
        mediaEditPairs={mediaEditPairs}
        mediaIndexJobs={mediaIndexJobs}
        onAddExample={handleAddProfileExample}
        onCancelMediaAlignmentJob={handleCancelMediaAlignmentJob}
        onCancelMediaIndexJob={handleCancelMediaIndexJob}
        onCreateMediaAlignmentJob={handleCreateMediaAlignmentJob}
        onCreateMediaAsset={handleCreateMediaLibraryAsset}
        onCreateMediaIndexJob={handleCreateMediaIndexJob}
        onCreateMediaPair={handleCreateMediaEditPair}
        onCreateProfile={handleCreateProfile}
        onReplaceThumbnailOutputs={handleReplaceMediaThumbnailOutputs}
        onSelectProfile={setSelectedProfileId}
        profiles={profiles}
        savingThumbnailOutputAssetIds={savingThumbnailOutputAssetIds}
        selectedProfile={selectedProfile}
        selectedProfileId={selectedProfileId}
      />
    </div>
  );
}

function isSettingsWindow(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    new URLSearchParams(window.location.search).get("window") === "settings"
  );
}

function scrollSettingsWindowToTop(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    document
      .querySelector(".settings-shell")
      ?.scrollTo({ top: 0, behavior: "auto" });
  });
}

function openSettingsWindowFromUi(section?: SettingsSectionId): void {
  if (!isTauriRuntime()) {
    const sectionQuery = section
      ? `&section=${encodeURIComponent(section)}`
      : "";
    const settingsUrl = `${window.location.origin}${window.location.pathname}?window=settings${sectionQuery}`;
    window.open(settingsUrl, "vaexcore-pulse-settings", "width=760,height=660");
    return;
  }

  void invoke("open_settings_window", { section: section ?? null }).catch(
    (error) => {
      console.error("Unable to open settings window", error);
    },
  );
}

function emitProfileSetupChanged(profileId?: string): void {
  if (!isTauriRuntime()) {
    return;
  }

  void emit(profileLibraryChangedEvent, { profileId }).catch((error) => {
    console.error("Unable to notify profile setup changes", error);
  });
}

function resolveInitialSettingsSection(): SettingsSectionId {
  if (typeof window === "undefined") {
    return "profile-setup";
  }

  const section = new URLSearchParams(window.location.search).get("section");
  return isSettingsSectionId(section) ? section : "profile-setup";
}

function isSettingsSectionId(value: unknown): value is SettingsSectionId {
  return (
    value === "profile-setup" ||
    value === "appearance" ||
    value === "window-behavior"
  );
}

function formatProfileSetupError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Profile setup is unavailable right now.";
  }

  if (isLocalServiceUnavailableError(error)) {
    return "Profile setup is still starting. This should clear in a few seconds.";
  }

  return error.message;
}

function isLocalServiceUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("could not reach its local service") ||
      error.message.includes("Pulse is still starting") ||
      error.message.includes("Pulse did not finish starting") ||
      error.message.includes("Failed to fetch"))
  );
}

function formatProfileSourceType(sourceType: ExampleClipSourceType): string {
  if (sourceType === "TWITCH_CLIP_URL") {
    return "Twitch clip";
  }

  if (sourceType === "YOUTUBE_SHORT_URL") {
    return "YouTube Short";
  }

  if (sourceType === "LOCAL_FILE_UPLOAD") {
    return "Local file";
  }

  return "Local path";
}

function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean(
      (window as Window & { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__,
    )
  );
}

function formatSuiteLaunchFailure(results: SuiteLaunchResult[]): string {
  const appNames = results.map((result) => result.appName).join(", ");
  return `Could not launch ${appNames}. Install the app bundles in Applications, then try again.`;
}

async function recordPulseTimelineEvent(input: {
  kind: string;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
}) {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invoke<void>("append_suite_timeline", { input });
  } catch {
    // Suite timeline writes are best-effort and should not interrupt review.
  }
}

function buildSuiteTimeline(
  suiteStatus: SuiteAppStatus[],
  events: SuiteTimelineEvent[],
): SuiteTimelineItem[] {
  const persistedItems = events.map((event) => ({
    id: `event-${event.eventId}`,
    kind: suiteTimelineItemKind(event.kind),
    title: event.title,
    detail: event.detail,
    timestamp: event.createdAt,
    source: event.sourceAppName,
  }));
  const presenceItems = suiteStatus
    .filter((app) => app.updatedAt)
    .map((app) => ({
      id: `presence-${app.appId}-${app.updatedAt}`,
      kind: "presence" as const,
      title: app.activity ?? app.appName,
      detail: app.activityDetail ?? app.detail,
      timestamp: app.updatedAt ?? new Date().toISOString(),
      source: app.appName,
    }));

  return [...persistedItems, ...presenceItems]
    .sort(
      (left, right) =>
        suiteTimestampMs(right.timestamp) - suiteTimestampMs(left.timestamp),
    )
    .slice(0, 18);
}

function suiteTimelineItemKind(kind: string): SuiteTimelineItem["kind"] {
  if (kind.includes("recording")) return "recording";
  if (kind.includes("review") || kind.includes("pulse.session"))
    return "review";
  if (kind.includes("presence") || kind.includes("session")) return "presence";
  return "event";
}

function suiteTimestampMs(value: string): number {
  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatSuiteTimestamp(value: string): string {
  const timestamp = suiteTimestampMs(value);
  if (!timestamp) return value;
  return new Date(timestamp).toLocaleTimeString();
}

function suiteStatusTone(app: SuiteAppStatus): string {
  if (!app.installed) return "pending";
  if (!app.running) return "pending";
  if (app.stale || !app.reachable) return "in-progress";
  return "reviewed";
}

function suiteStatusLabel(app: SuiteAppStatus): string {
  if (!app.installed) return "Missing";
  if (!app.running) return "Offline";
  if (app.stale) return "Stale";
  if (!app.reachable) return "Starting";
  return "Ready";
}

function timelineTone(kind: SuiteTimelineItem["kind"]): string {
  if (kind === "presence") return "reviewed";
  if (kind === "recording") return "in-progress";
  if (kind === "review") return "active-session";
  return "pending";
}

function studioPulseSourceEventId(
  sessionId: string,
  candidateId: string,
): string {
  return `vaexcore-pulse:session:${sessionId}:candidate:${candidateId}:accepted`;
}

async function resolveStudioDiscovery(): Promise<StudioDiscovery> {
  if (isTauriRuntime()) {
    try {
      return await invoke<StudioDiscovery>("studio_api_discovery");
    } catch {
      // Fall through to the browser/dev defaults below.
    }
  }

  const apiUrl =
    import.meta.env.VITE_VAEXCORE_STUDIO_API_URL ?? "http://127.0.0.1:51287";
  const wsUrl =
    import.meta.env.VITE_VAEXCORE_STUDIO_WS_URL ??
    `${apiUrl.replace(/^http/, "ws").replace(/\/+$/, "")}/events`;
  const token = import.meta.env.VITE_VAEXCORE_STUDIO_API_TOKEN ?? null;

  return {
    apiUrl,
    wsUrl,
    token,
    discovered: false,
    source: "default",
    detail: "Using the default Studio localhost URL.",
  };
}

function usePulseRuntimeStatus(apiBaseUrl: string): PulseRuntimeStatus {
  const [status, setStatus] = useState<PulseRuntimeStatus>("checking");

  useEffect(() => {
    let isCancelled = false;
    let attemptCount = 0;
    let intervalId: number | undefined;

    async function checkRuntime() {
      attemptCount += 1;
      const isReady = await checkPulseHealth(apiBaseUrl);
      if (isCancelled) {
        return;
      }

      if (isReady) {
        setStatus("ready");
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
        return;
      }

      setStatus(
        attemptCount > 10 ? "slow" : attemptCount > 1 ? "starting" : "checking",
      );
    }

    void checkRuntime();
    intervalId = window.setInterval(() => {
      void checkRuntime();
    }, 1000);

    return () => {
      isCancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [apiBaseUrl]);

  return status;
}

async function checkPulseHealth(
  apiBaseUrl: string,
  timeoutMs = 1200,
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isPulseRuntimeReady(status: PulseRuntimeStatus): boolean {
  return status === "ready";
}

function buildPulseStartupCopy(status: PulseRuntimeStatus): {
  headline: string;
  detail: string;
  statusLabel: string;
} {
  if (status === "slow") {
    return {
      detail:
        "Pulse is taking longer than usual. Keep this window open; it will continue trying.",
      headline: "Pulse is still starting",
      statusLabel: "Starting",
    };
  }

  return {
    detail:
      "This usually takes a few seconds. You can choose a video while Pulse gets ready.",
    headline: status === "checking" ? "Checking Pulse" : "Pulse is starting",
    statusLabel: status === "checking" ? "Checking" : "Starting",
  };
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

function persistThemeMode(themeMode: ThemeMode) {
  applyThemeMode(themeMode);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(themeModeStorageKey, themeMode);
  }
}

function applyThemeMode(themeMode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = themeMode;
  document.documentElement.style.colorScheme = themeMode;
}

function resolveInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  const savedThemeMode = window.localStorage.getItem(themeModeStorageKey);
  return savedThemeMode === "light" ? "light" : "dark";
}

function loadStudioIntakePersistence(): StudioIntakePersistence {
  if (typeof window === "undefined") {
    return parseStudioIntakePersistence(null);
  }
  return parseStudioIntakePersistence(
    window.localStorage.getItem(STUDIO_INTAKE_STORAGE_KEY),
  );
}

function persistStudioIntakePersistence(persistence: StudioIntakePersistence) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    STUDIO_INTAKE_STORAGE_KEY,
    serializeStudioIntakePersistence(persistence),
  );
}

function loadStudioExportHistory(): StudioRecordingExportHistory {
  if (typeof window === "undefined") {
    return parseStudioExportHistory(null);
  }
  return parseStudioExportHistory(
    window.localStorage.getItem(STUDIO_EXPORT_HISTORY_STORAGE_KEY),
  );
}

function persistStudioExportHistory(history: StudioRecordingExportHistory) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    STUDIO_EXPORT_HISTORY_STORAGE_KEY,
    serializeStudioExportHistory(history),
  );
}

function buildSuggestedSessionTitle(sourcePath: string): string {
  return extractSourceName(sourcePath).replace(/\.[^.]+$/, "");
}

function extractSourceName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).pop() ?? sourcePath;
}

function buildAnalysisLaunchState(
  sourcePath: string,
  options: {
    hasPersistedProfiles: boolean;
    isLoadingProfiles: boolean;
    pulseRuntimeStatus: PulseRuntimeStatus;
  },
): AnalysisReadiness {
  if (!isPulseRuntimeReady(options.pulseRuntimeStatus)) {
    const copy = buildPulseStartupCopy(options.pulseRuntimeStatus);
    return {
      canAnalyze: false,
      detail: copy.detail,
      headline: copy.headline,
      statusLabel: copy.statusLabel,
      tone: "blocked",
    };
  }

  if (options.isLoadingProfiles) {
    return {
      canAnalyze: false,
      detail: "Waiting for your saved profiles.",
      headline: "Loading profiles",
      statusLabel: "Checking profiles",
      tone: "blocked",
    };
  }

  if (!options.hasPersistedProfiles) {
    return {
      canAnalyze: false,
      detail: "Create a profile first so Pulse knows what to look for.",
      headline: "No profile yet",
      statusLabel: "Profile required",
      tone: "blocked",
    };
  }

  if (!sourcePath) {
    return {
      canAnalyze: false,
      detail: "Choose a supported local video before starting.",
      headline: "Choose a video",
      statusLabel: "Video required",
      tone: "blocked",
    };
  }

  if (!isSupportedInput(sourcePath)) {
    return {
      canAnalyze: false,
      detail: `Unsupported file type. Try: ${supportedInputExtensions.join(", ")}`,
      headline: "Unsupported file type",
      statusLabel: "File type issue",
      tone: "blocked",
    };
  }

  return {
    canAnalyze: true,
    detail: "Pulse can scan this video now. Review opens when it finishes.",
    headline: "Ready to scan",
    statusLabel: "Ready",
    tone: "ready",
  };
}

function buildLabelDrafts(session: ProjectSession): Record<string, string> {
  const decisionLabelsByCandidateId = Object.fromEntries(
    session.reviewDecisions
      .filter((decision) => Boolean(decision.label))
      .map((decision) => [decision.candidateId, decision.label as string]),
  );

  return Object.fromEntries(
    session.candidates.map((candidate) => [
      candidate.id,
      decisionLabelsByCandidateId[candidate.id] ?? candidate.editableLabel,
    ]),
  );
}

async function fetchProfiles(apiBaseUrl: string): Promise<ClipProfile[]> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/profiles`,
    apiBaseUrl,
    undefined,
    "Unable to load clip profiles.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | ClipProfile[]
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Profile list load failed",
    );
  }

  return clipProfileSchema.array().parse(payload);
}

async function fetchProfileExamples(
  apiBaseUrl: string,
  profileId: string,
): Promise<ExampleClip[]> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/profiles/${encodeURIComponent(profileId)}/examples`,
    apiBaseUrl,
    undefined,
    "Unable to load profile examples.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | ExampleClip[]
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Profile example list load failed",
    );
  }

  return exampleClipSchema.array().parse(payload);
}

async function createProfile(
  apiBaseUrl: string,
  input: CreateClipProfileRequest,
): Promise<ClipProfile> {
  const request = createClipProfileRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/profiles`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Unable to create clip profile.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | ClipProfile
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Profile create failed",
    );
  }

  return clipProfileSchema.parse(payload);
}

async function createProfileExample(
  apiBaseUrl: string,
  profileId: string,
  input: AddExampleClipRequest,
): Promise<ExampleClip> {
  const request = addExampleClipRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/profiles/${encodeURIComponent(profileId)}/examples`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Unable to save example clip reference.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | ExampleClip
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Profile example create failed",
    );
  }

  return exampleClipSchema.parse(payload);
}

async function fetchMediaLibraryAssets(
  apiBaseUrl: string,
): Promise<MediaLibraryAsset[]> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/assets`,
    apiBaseUrl,
    undefined,
    "Unable to load saved media.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaLibraryAsset[]
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Saved media could not be loaded",
    );
  }

  return mediaLibraryAssetSchema.array().parse(payload);
}

async function createMediaLibraryAssetEntry(
  apiBaseUrl: string,
  input: CreateMediaLibraryAssetRequest,
): Promise<MediaLibraryAsset> {
  const request = createMediaLibraryAssetRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/assets`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Unable to save media.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaLibraryAsset
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Saved media could not be created",
    );
  }

  return mediaLibraryAssetSchema.parse(payload);
}

async function replaceMediaThumbnailOutputsEntry(
  apiBaseUrl: string,
  assetId: string,
  input: ReplaceMediaThumbnailOutputsRequest,
): Promise<MediaLibraryAsset> {
  const request = replaceMediaThumbnailOutputsRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/assets/${encodeURIComponent(assetId)}/thumbnail-outputs`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Unable to update chosen thumbnails.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaLibraryAsset
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Thumbnail update failed",
    );
  }

  return mediaLibraryAssetSchema.parse(payload);
}

async function fetchMediaEditPairs(
  apiBaseUrl: string,
): Promise<MediaEditPair[]> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/pairs`,
    apiBaseUrl,
    undefined,
    "Unable to load video comparisons.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaEditPair[]
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Video comparisons could not be loaded",
    );
  }

  return mediaEditPairSchema.array().parse(payload);
}

async function createMediaEditPairEntry(
  apiBaseUrl: string,
  input: CreateMediaEditPairRequest,
): Promise<MediaEditPair> {
  const request = createMediaEditPairRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/pairs`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Unable to save video comparison.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaEditPair
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Video comparison could not be created",
    );
  }

  return mediaEditPairSchema.parse(payload);
}

async function fetchMediaIndexJobs(
  apiBaseUrl: string,
): Promise<MediaIndexJob[]> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/index-jobs`,
    apiBaseUrl,
    undefined,
    "Unable to load background activity.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaIndexJob[]
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Background activity could not be loaded",
    );
  }

  return mediaIndexJobSchema.array().parse(payload);
}

async function createMediaIndexJobEntry(
  apiBaseUrl: string,
  input: CreateMediaIndexJobRequest,
): Promise<MediaIndexJob> {
  const request = createMediaIndexJobRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/assets/${encodeURIComponent(request.assetId)}/index-jobs`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    },
    "Unable to start scan.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaIndexJob
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Scan could not be started",
    );
  }

  return mediaIndexJobSchema.parse(payload);
}

async function cancelMediaIndexJobEntry(
  apiBaseUrl: string,
  input: CancelMediaIndexJobRequest,
): Promise<MediaIndexJob> {
  const request = cancelMediaIndexJobRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/index-jobs/${encodeURIComponent(request.jobId)}/cancel`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    },
    "Unable to cancel scan.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaIndexJob
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Scan could not be cancelled",
    );
  }

  return mediaIndexJobSchema.parse(payload);
}

async function fetchMediaAlignmentJobs(
  apiBaseUrl: string,
): Promise<MediaAlignmentJob[]> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/alignment-jobs`,
    apiBaseUrl,
    undefined,
    "Unable to load video comparisons.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaAlignmentJob[]
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Video comparisons could not be loaded",
    );
  }

  return mediaAlignmentJobSchema.array().parse(payload);
}

async function fetchMediaAlignmentMatches(
  apiBaseUrl: string,
): Promise<MediaAlignmentMatch[]> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/alignment-matches`,
    apiBaseUrl,
    undefined,
    "Unable to load comparison matches.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaAlignmentMatch[]
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Comparison matches could not be loaded",
    );
  }

  return mediaAlignmentMatchSchema.array().parse(payload);
}

async function createMediaAlignmentJobEntry(
  apiBaseUrl: string,
  input: CreateMediaAlignmentJobRequest,
): Promise<MediaAlignmentJob> {
  const request = createMediaAlignmentJobRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    request.pairId
      ? `${apiBaseUrl}/api/library/pairs/${encodeURIComponent(request.pairId)}/alignment-jobs`
      : `${apiBaseUrl}/api/library/alignment-jobs`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
    "Unable to start video comparison.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaAlignmentJob
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Video comparison could not be started",
    );
  }

  return mediaAlignmentJobSchema.parse(payload);
}

async function cancelMediaAlignmentJobEntry(
  apiBaseUrl: string,
  input: CancelMediaAlignmentJobRequest,
): Promise<MediaAlignmentJob> {
  const request = cancelMediaAlignmentJobRequestSchema.parse(input);
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/library/alignment-jobs/${encodeURIComponent(request.jobId)}/cancel`,
    apiBaseUrl,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
    },
    "Unable to cancel video comparison.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | MediaAlignmentJob
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Video comparison could not be cancelled",
    );
  }

  return mediaAlignmentJobSchema.parse(payload);
}

async function fetchProjectSession(
  apiBaseUrl: string,
  sessionId: string,
): Promise<ProjectSession> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/projects/${encodeURIComponent(sessionId)}`,
    apiBaseUrl,
    undefined,
    "Unable to load the local session.",
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
        : "Session load failed",
    );
  }

  return projectSessionSchema.parse(payload);
}

async function fetchProjectSummaries(
  apiBaseUrl: string,
): Promise<ProjectSessionSummary[]> {
  const response = await fetchWithLocalApiMessage(
    `${apiBaseUrl}/api/projects`,
    apiBaseUrl,
    undefined,
    "Unable to load saved sessions.",
  );
  const payload = (await response.json().catch(() => null)) as
    | {
        message?: string;
      }
    | ProjectSessionSummary[]
    | null;

  if (!response.ok) {
    throw new Error(
      payload && "message" in payload && payload.message
        ? payload.message
        : "Project list load failed",
    );
  }

  return projectSessionSummarySchema.array().parse(payload);
}

function upsertProjectSummary(
  current: ProjectSessionSummary[],
  nextSummary: ProjectSessionSummary,
): ProjectSessionSummary[] {
  const merged = [
    nextSummary,
    ...current.filter((summary) => summary.sessionId !== nextSummary.sessionId),
  ];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function upsertProfile(
  current: ClipProfile[],
  nextProfile: ClipProfile,
): ClipProfile[] {
  const merged = [
    nextProfile,
    ...current.filter((profile) => profile.id !== nextProfile.id),
  ];

  return merged.sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "SYSTEM" ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function upsertMediaLibraryAsset(
  current: MediaLibraryAsset[],
  nextAsset: MediaLibraryAsset,
): MediaLibraryAsset[] {
  const merged = [
    nextAsset,
    ...current.filter((asset) => asset.id !== nextAsset.id),
  ];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function upsertMediaEditPair(
  current: MediaEditPair[],
  nextPair: MediaEditPair,
): MediaEditPair[] {
  const merged = [
    nextPair,
    ...current.filter((pair) => pair.id !== nextPair.id),
  ];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function upsertMediaIndexJob(
  current: MediaIndexJob[],
  nextJob: MediaIndexJob,
): MediaIndexJob[] {
  const merged = [nextJob, ...current.filter((job) => job.id !== nextJob.id)];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function upsertMediaAlignmentJob(
  current: MediaAlignmentJob[],
  nextJob: MediaAlignmentJob,
): MediaAlignmentJob[] {
  const merged = [nextJob, ...current.filter((job) => job.id !== nextJob.id)];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function formatSessionReviewState(
  sessionReviewState: ReturnType<typeof deriveSessionReviewState>,
): string {
  if (sessionReviewState === "REVIEWED") {
    return "Reviewed";
  }

  if (sessionReviewState === "IN_PROGRESS") {
    return "In progress";
  }

  return "Pending";
}

function buildSessionOpenLabel(summary: ProjectSessionSummary): string {
  const sessionReviewState = deriveSessionReviewState(summary);
  if (sessionReviewState === "REVIEWED") {
    return "Open session";
  }

  if (sessionReviewState === "IN_PROGRESS") {
    return "Continue review";
  }

  return "Start reviewing";
}

function resolveProfile(
  profiles: ClipProfile[],
  profileId: string,
): ClipProfile {
  return (
    profiles.find((profile) => profile.id === profileId) ?? {
      id: profileId,
      name: "Profile unavailable",
      label: profileId,
      description: "This profile is not available right now.",
      createdAt: "",
      updatedAt: "",
      state: "ACTIVE",
      source: "USER",
      mode: "EXAMPLE_DRIVEN",
      signalWeights: {},
      exampleClips: [],
    }
  );
}

function formatSessionCompletion(summary: ProjectSessionSummary): number {
  if (summary.candidateCount === 0) {
    return 0;
  }

  return Math.round(
    (reviewedCandidateCount(summary) / summary.candidateCount) * 100,
  );
}

function buildProjectCoverageCopy(summary: ProjectSessionSummary): string {
  return summarizeSessionQuality(
    summary.analysisCoverage,
    summary.candidateCount,
  );
}

function findFirstPendingCandidateId(session: ProjectSession): string | null {
  return (
    session.candidates.find((candidate) =>
      isCandidatePending(session, candidate.id),
    )?.id ?? null
  );
}

function findNextPendingCandidateId(
  session: ProjectSession,
  currentCandidateId: string | null,
): string | null {
  return findNextCandidateId(session, currentCandidateId, (candidateId) =>
    isCandidatePending(session, candidateId),
  );
}

function findNextCandidateId(
  session: ProjectSession,
  currentCandidateId: string | null,
  predicate?: (candidateId: string) => boolean,
): string | null {
  if (session.candidates.length === 0) {
    return null;
  }

  const startIndex = currentCandidateId
    ? session.candidates.findIndex(
        (candidate) => candidate.id === currentCandidateId,
      )
    : -1;

  for (let offset = 1; offset <= session.candidates.length; offset += 1) {
    const candidate =
      session.candidates[
        (Math.max(startIndex, -1) + offset) % session.candidates.length
      ];
    if (!predicate || predicate(candidate.id)) {
      return candidate.id;
    }
  }

  return null;
}

function findAdjacentVisibleCandidateId(
  candidates: Array<{
    id: string;
  }>,
  currentCandidateId: string | null,
  direction: -1 | 1,
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const currentIndex = currentCandidateId
    ? candidates.findIndex((candidate) => candidate.id === currentCandidateId)
    : -1;

  if (currentIndex === -1) {
    return direction === 1
      ? (candidates[0]?.id ?? null)
      : (candidates[candidates.length - 1]?.id ?? null);
  }

  const nextIndex =
    (currentIndex + direction + candidates.length) % candidates.length;
  return candidates[nextIndex]?.id ?? null;
}

function formatSummaryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildStartGuide(input: {
  hasPersistedProfiles: boolean;
  hasReferenceMaterial: boolean;
  hasSavedSessions: boolean;
  hasSelectedVideo: boolean;
}): StartGuide {
  if (!input.hasPersistedProfiles) {
    return {
      statusLabel: "First setup",
      headline: "Create your first profile",
      detail: "A profile tells Pulse what kinds of moments you like to keep.",
      steps: [
        "Open Profile Setup.",
        "Create one profile.",
        "Add a few clips or one finished edit.",
      ],
      ctaLabel: "Set up profile",
      ctaAction: "profile-setup",
    };
  }

  if (!input.hasReferenceMaterial) {
    return {
      statusLabel: input.hasSavedSessions ? "Reference refresh" : "First setup",
      headline: "Add a few examples",
      detail: "Examples help Pulse make better suggestions.",
      steps: [
        "Add 2-3 short clips that feel like moments you would keep.",
        "Add one finished edit if you have one.",
        "Scan a longer video and review the suggestions.",
      ],
      ctaLabel: "Add examples",
      ctaAction: "profile-setup",
    };
  }

  if (!input.hasSelectedVideo) {
    return {
      statusLabel: input.hasSavedSessions ? "Next scan" : "Ready",
      headline: input.hasSavedSessions
        ? "Choose the next video to scan"
        : "Pick the first video you want to scan",
      detail: "Choose a file and Pulse will build a review queue.",
      steps: [
        "Choose one local video file.",
        "Confirm the profile you want to use.",
        "Start the scan.",
      ],
      ctaLabel: "Choose video",
      ctaAction: "pick-media",
    };
  }

  return {
    statusLabel: input.hasSavedSessions ? "Ready" : "First scan",
    headline: input.hasSavedSessions
      ? "This scan is ready to run"
      : "You are ready for the first scan",
    detail:
      "Start with one video, then review each suggested moment and choose what to keep.",
    steps: [
      "Start the scan.",
      "Review the suggested moments.",
      "Keep adding examples as your profile improves.",
    ],
    ctaLabel: null,
    ctaAction: null,
  };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}
