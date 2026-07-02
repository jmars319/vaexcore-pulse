import { useRef, useState } from "react";
import { buildProjectSummary } from "@vaexcore/pulse-domain";
import { defaultProfileId } from "@vaexcore/pulse-profiles";
import {
  analyzeProjectRequestSchema,
  projectSessionSchema,
  type AnalyzeProjectRequest,
  type ProjectSession,
} from "@vaexcore/pulse-shared-types";
import { DesktopWorkspaceFrame } from "./components/DesktopWorkspaceFrame";
import {
  isPulseRuntimeReady,
  usePulseRuntimeStatus,
} from "./hooks/usePulseRuntimeStatus";
import { useAnalysisFilePickers } from "./hooks/useAnalysisFilePickers";
import { usePulseHandoffPolling } from "./hooks/usePulseHandoffPolling";
import { useProfileMediaLibraryState } from "./hooks/useProfileMediaLibraryState";
import { useReviewWorkspaceController } from "./hooks/useReviewWorkspaceController";
import { useStudioExportController } from "./hooks/useStudioExportController";
import { useStudioIntakeController } from "./hooks/useStudioIntakeController";
import { useSuiteWorkspaceState } from "./hooks/useSuiteWorkspaceState";
import { useThemeSync } from "./hooks/useThemeSync";
import { fetchWithLocalApiMessage, localApiTimeouts } from "./lib/localApi";
import { upsertProjectSummary } from "./lib/pulseApiUpserts";
import type { StudioRecordingCandidate } from "./lib/studioTypes";
import {
  buildAnalysisLaunchState,
  buildStartGuide,
  buildSuggestedSessionTitle,
  extractSourceName,
  resolveProfile,
} from "./lib/sessionPresentation";
import { recordPulseTimelineEvent } from "./lib/suitePresentation";
import { initialDesktopPage, type DesktopPage } from "./lib/desktopNavigation";
import { resolveInitialThemeMode, type ThemeMode } from "./lib/themeMode";

export default function DesktopApp() {
  const [activePage, setActivePage] = useState<DesktopPage>(() =>
    initialDesktopPage(),
  );
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolveInitialThemeMode(),
  );
  const [selectedMediaPath, setSelectedMediaPath] = useState("");
  const [selectedTranscriptPath, setSelectedTranscriptPath] = useState("");
  const [analysisProfileId, setAnalysisProfileId] = useState(defaultProfileId);
  const [analysisTitle, setAnalysisTitle] = useState("");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const apiBaseUrl =
    import.meta.env.VITE_VAEXCORE_PULSE_API_BASE_URL ?? "http://127.0.0.1:4010";
  const suiteController = useSuiteWorkspaceState();
  const pulseRuntimeStatus = usePulseRuntimeStatus(apiBaseUrl);
  const isPulseReady = isPulseRuntimeReady(pulseRuntimeStatus);
  const studioIntakeController = useStudioIntakeController({
    onHandoffQueued: () => {
      setAnalysisError(null);
      setActivePage("new-analysis");
    },
    onRecordingSelected: handleUseStudioRecording,
  });
  const studioExportController = useStudioExportController(
    studioIntakeController,
  );
  usePulseHandoffPolling({
    onFocusReview: () => setActivePage("candidate-review"),
    onFocusSuite: () => setActivePage("suite"),
    onRecordingHandoff: studioIntakeController.handlePulseRecordingHandoff,
  });
  const handleProfileExamplesChangedRef = useRef<
    (profileId: string) => Promise<void>
  >(async () => {});
  const profileMediaState = useProfileMediaLibraryState({
    apiBaseUrl,
    isPulseReady,
    onProfileExamplesChanged: (profileId) =>
      handleProfileExamplesChangedRef.current(profileId),
    setAnalysisProfileId,
  });
  const {
    isLoadingProfiles,
    mediaLibraryAssets,
    profiles,
    setSelectedProfileId,
  } = profileMediaState;
  const normalizedSelectedMediaPath = selectedMediaPath.trim();
  const availableProfiles = profiles;
  const reviewController = useReviewWorkspaceController({
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
  });
  handleProfileExamplesChangedRef.current =
    reviewController.handleProfileExamplesChanged;
  const {
    applyProjectSession,
    projectSummaries,
    setProjectSummaries,
    setProjectsError,
  } = reviewController;
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
  const { handlePickMedia, handlePickTranscript } = useAnalysisFilePickers({
    analysisTitle,
    setActivePage,
    setAnalysisError,
    setAnalysisTitle,
    setSelectedMediaPath,
    setSelectedTranscriptPath,
  });

  useThemeSync(themeMode, setThemeMode);

  function handleUseStudioRecording(recording: StudioRecordingCandidate) {
    setSelectedMediaPath(recording.outputPath);
    setSelectedTranscriptPath("");
    setAnalysisError(null);
    if (!analysisTitle.trim()) {
      setAnalysisTitle(buildSuggestedSessionTitle(recording.outputPath));
    }
    setActivePage("new-analysis");
  }

  async function handleAnalyze() {
    if (!analysisLaunchState.canAnalyze) {
      setAnalysisError(analysisLaunchState.detail);
      return;
    }

    const normalizedSourcePath = normalizedSelectedMediaPath;
    const normalizedTranscriptPath = selectedTranscriptPath.trim();

    const request = analyzeProjectRequestSchema.parse({
      sourcePath: normalizedSourcePath,
      profileId: analysisProfileId,
      sessionTitle: analysisTitle.trim() || undefined,
      transcriptPath: normalizedTranscriptPath || undefined,
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

  function handleReturnToProjects() {
    setActivePage("projects");
  }

  return (
    <div className="app-shell">
      <div className="background-orb background-orb-left" />
      <div className="background-orb background-orb-right" />

      <DesktopWorkspaceFrame
        activePage={activePage}
        analysisError={analysisError}
        analysisLaunchState={analysisLaunchState}
        analysisProfileId={analysisProfileId}
        analysisSourceName={analysisSourceName}
        analysisTitle={analysisTitle}
        analysisTitlePreview={analysisTitlePreview}
        apiBaseUrl={apiBaseUrl}
        availableProfiles={availableProfiles}
        hasPersistedProfiles={hasPersistedProfiles}
        isAnalyzing={isAnalyzing}
        isLoadingProfiles={isLoadingProfiles}
        normalizedSelectedMediaPath={normalizedSelectedMediaPath}
        onAnalyze={() => {
          void handleAnalyze();
        }}
        onPickMedia={() => {
          void handlePickMedia();
        }}
        onPickTranscript={() => {
          void handlePickTranscript();
        }}
        onProfileChange={(profileId) => {
          setAnalysisProfileId(profileId);
          setAnalysisError(null);
        }}
        onReturnToProjects={handleReturnToProjects}
        onScanAnotherVideo={() => setActivePage("new-analysis")}
        onSelectedMediaPathChange={(mediaPath) => {
          setSelectedMediaPath(mediaPath);
          setAnalysisError(null);
        }}
        onSelectedTranscriptPathChange={(transcriptPath) => {
          setSelectedTranscriptPath(transcriptPath);
          setAnalysisError(null);
        }}
        onSelectPage={setActivePage}
        onTitleChange={(title) => {
          setAnalysisTitle(title);
          setAnalysisError(null);
        }}
        review={reviewController}
        selectedDraftProfile={selectedDraftProfile}
        selectedMediaPath={selectedMediaPath}
        selectedTranscriptPath={selectedTranscriptPath}
        showStartGuide={showStartGuide}
        startGuide={startGuide}
        studioExport={studioExportController}
        studioIntake={studioIntakeController}
        suite={suiteController}
      />
    </div>
  );
}
