import type {
  buildAnalysisLaunchState,
  buildStartGuide,
} from "../lib/sessionPresentation";
import {
  isSupportedInput,
  supportedInputExtensions,
} from "@vaexcore/pulse-media";
import type { ClipProfile, ProjectSession } from "@vaexcore/pulse-shared-types";
import { StudioIntakePanel } from "./StudioIntakePanel";
import type {
  StudioIntakeQueueItem,
  StudioIntakeState,
  StudioRecordingExportHistory,
} from "../lib/studioIntegration";
import type { StudioIntakeFilter } from "../lib/studioIntakePresentation";

type NewAnalysisPageProps = {
  activeSessionReviewStateLabel: string | null;
  analysisError: string | null;
  analysisLaunchState: ReturnType<typeof buildAnalysisLaunchState>;
  analysisProfileId: string;
  analysisSourceName: string | null;
  analysisTitle: string;
  analysisTitlePreview: string;
  availableProfiles: ClipProfile[];
  filteredStudioIntakeRecordings: StudioIntakeQueueItem[];
  hasPersistedProfiles: boolean;
  isAnalyzing: boolean;
  isLoadingProfiles: boolean;
  normalizedSelectedMediaPath: string;
  onAnalyze: () => void;
  onDismissStudioRecording: (recording: StudioIntakeQueueItem) => void;
  onPickMedia: () => void;
  onPickTranscript: () => void;
  onProfileChange: (profileId: string) => void;
  onRefreshStudioIntake: () => void;
  onRestoreStudioRecording: (recording: StudioIntakeQueueItem) => void;
  onSelectedMediaPathChange: (mediaPath: string) => void;
  onSelectedTranscriptPathChange: (transcriptPath: string) => void;
  onSetUpProfile: () => void;
  onStudioIntakeFilterChange: (filter: StudioIntakeFilter) => void;
  onStudioRecordingImport: (recording: StudioIntakeQueueItem) => void;
  onTitleChange: (title: string) => void;
  projectSession: ProjectSession | null;
  selectedDraftProfile: ClipProfile;
  selectedMediaPath: string;
  selectedTranscriptPath: string;
  showStartGuide: boolean;
  startGuide: ReturnType<typeof buildStartGuide>;
  studioExportHistory: StudioRecordingExportHistory;
  studioIntake: StudioIntakeState;
  studioIntakeFilter: StudioIntakeFilter;
  studioIntakeFilterCounts: Record<StudioIntakeFilter, number>;
};

export function NewAnalysisPage({
  activeSessionReviewStateLabel,
  analysisError,
  analysisLaunchState,
  analysisProfileId,
  analysisSourceName,
  analysisTitle,
  analysisTitlePreview,
  availableProfiles,
  filteredStudioIntakeRecordings,
  hasPersistedProfiles,
  isAnalyzing,
  isLoadingProfiles,
  normalizedSelectedMediaPath,
  onAnalyze,
  onDismissStudioRecording,
  onPickMedia,
  onPickTranscript,
  onProfileChange,
  onRefreshStudioIntake,
  onRestoreStudioRecording,
  onSelectedMediaPathChange,
  onSelectedTranscriptPathChange,
  onSetUpProfile,
  onStudioIntakeFilterChange,
  onStudioRecordingImport,
  onTitleChange,
  projectSession,
  selectedDraftProfile,
  selectedMediaPath,
  selectedTranscriptPath,
  showStartGuide,
  startGuide,
  studioExportHistory,
  studioIntake,
  studioIntakeFilter,
  studioIntakeFilterCounts,
}: NewAnalysisPageProps) {
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
              onClick={onPickMedia}
              type="button"
            >
              Choose video
            </button>
            <button
              className="button-secondary"
              onClick={onSetUpProfile}
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
              onChange={(event) =>
                onSelectedMediaPathChange(event.target.value)
              }
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

          <label className="search-block">
            <span className="input-label">Transcript file</span>
            <div className="analysis-file-control">
              <input
                className="search-input"
                disabled={isAnalyzing}
                onChange={(event) =>
                  onSelectedTranscriptPathChange(event.target.value)
                }
                placeholder="/Users/you/Videos/session-2026-03-25.srt"
                type="text"
                value={selectedTranscriptPath}
              />
              <button
                className="button-secondary"
                disabled={isAnalyzing}
                onClick={onPickTranscript}
                type="button"
              >
                Choose transcript
              </button>
            </div>
            <small className="analysis-field-note">
              Optional SRT, VTT, timestamped text, plain text, or JSON. Imported
              transcript text is saved with the review session.
            </small>
          </label>

          <div className="analysis-inline-grid">
            <label className="search-block">
              <span className="input-label">Profile</span>
              <select
                className="search-input"
                disabled={isAnalyzing || !hasPersistedProfiles}
                onChange={(event) => onProfileChange(event.target.value)}
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
                onChange={(event) => onTitleChange(event.target.value)}
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
            <article className="analysis-summary-card">
              <span className="detail-label">Transcript</span>
              <strong>
                {selectedTranscriptPath.trim()
                  ? "Imported transcript"
                  : "Auto/local transcript"}
              </strong>
              <p className="analysis-summary-path">
                {selectedTranscriptPath.trim() ||
                  "Pulse will use local sidecars, local providers, or deterministic local anchors."}
              </p>
            </article>
          </div>

          <div className="analysis-primary-actions">
            <button
              className="button-primary"
              disabled={isAnalyzing || !analysisLaunchState.canAnalyze}
              onClick={onAnalyze}
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

        <StudioIntakePanel
          filteredStudioIntakeRecordings={filteredStudioIntakeRecordings}
          isAnalyzing={isAnalyzing}
          onDismissStudioRecording={onDismissStudioRecording}
          onRefreshStudioIntake={onRefreshStudioIntake}
          onRestoreStudioRecording={onRestoreStudioRecording}
          onStudioIntakeFilterChange={onStudioIntakeFilterChange}
          onStudioRecordingImport={onStudioRecordingImport}
          studioExportHistory={studioExportHistory}
          studioIntake={studioIntake}
          studioIntakeFilter={studioIntakeFilter}
          studioIntakeFilterCounts={studioIntakeFilterCounts}
        />

        {showStartGuide ? (
          <article className="utility-block analysis-onboarding-card">
            <div className="panel-header">
              <div>
                <span className="detail-label">{startGuide.statusLabel}</span>
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
                      onSetUpProfile();
                      return;
                    }

                    if (startGuide.ctaAction === "pick-media") {
                      onPickMedia();
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
