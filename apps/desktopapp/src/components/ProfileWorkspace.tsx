import type {
  AddExampleClipRequest,
  CancelMediaAlignmentJobRequest,
  ClipProfile,
  CancelMediaIndexJobRequest,
  CreateClipProfileRequest,
  CreateMediaAlignmentJobRequest,
  CreateMediaEditPairRequest,
  CreateMediaIndexJobRequest,
  CreateMediaLibraryAssetRequest,
  ExampleClip,
  ExampleReferenceKind,
  ExampleClipSourceType,
  MediaAlignmentJob,
  MediaAlignmentMatch,
  MediaEditPair,
  MediaIndexJob,
  MediaLibraryAsset,
  MediaLibraryAssetType,
  ReplaceMediaThumbnailOutputsRequest,
} from "@vaexcore/pulse-shared-types";
import { useProfileWorkspaceDerivedState } from "../hooks/useProfileWorkspaceDerivedState";
import { useProfileWorkspaceForms } from "../hooks/useProfileWorkspaceForms";
import { ProfileWorkspaceMediaLab } from "./ProfileWorkspaceMediaLab";
import { ProfileWorkspaceSidebar } from "./ProfileWorkspaceSidebar";
import {
  buildAssetAnalysisActionLabel,
  describeAssetPrimaryStatus,
  describeBackgroundActivity,
  formatAlignmentJobStatus,
  formatAssetScope,
  formatAssetType,
  formatAudioFingerprintMethod,
  formatClockDuration,
  formatIndexJobStatus,
  formatIndexSummary,
  formatReferenceKind,
  formatReferenceSummaryLabel,
  formatSourceType,
  formatStatus,
  formatTimestamp,
  formatTopReasons,
  formatTranscriptAnchors,
  localOnlySourceTypeOptions,
  sourceTypeOptions,
  toLocalImageSrc,
} from "../lib/profileWorkspacePresentation";

type ProfileWorkspaceProps = {
  profiles: ClipProfile[];
  selectedProfileId: string | null;
  selectedProfile: ClipProfile | null;
  examples: ExampleClip[];
  libraryAssets: MediaLibraryAsset[];
  mediaIndexJobs: MediaIndexJob[];
  mediaAlignmentJobs: MediaAlignmentJob[];
  mediaAlignmentMatches: MediaAlignmentMatch[];
  mediaEditPairs: MediaEditPair[];
  cancellingMediaIndexJobIds: Record<string, boolean>;
  cancellingMediaAlignmentJobIds: Record<string, boolean>;
  savingThumbnailOutputAssetIds: Record<string, boolean>;
  isLoadingProfiles: boolean;
  isLoadingExamples: boolean;
  isLoadingLibraryAssets: boolean;
  isLoadingMediaIndexJobs: boolean;
  isLoadingMediaAlignmentJobs: boolean;
  isLoadingMediaPairs: boolean;
  isCreatingProfile: boolean;
  isAddingExample: boolean;
  isCreatingMediaAsset: boolean;
  isCreatingMediaIndexJob: boolean;
  isCreatingMediaAlignmentJob: boolean;
  isCreatingMediaPair: boolean;
  error: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (input: CreateClipProfileRequest) => Promise<void>;
  onAddExample: (
    profileId: string,
    input: AddExampleClipRequest,
  ) => Promise<void>;
  onCreateMediaAsset: (input: CreateMediaLibraryAssetRequest) => Promise<void>;
  onCreateMediaIndexJob: (input: CreateMediaIndexJobRequest) => Promise<void>;
  onReplaceThumbnailOutputs: (
    assetId: string,
    input: ReplaceMediaThumbnailOutputsRequest,
  ) => Promise<void>;
  onCreateMediaAlignmentJob: (
    input: CreateMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCancelMediaIndexJob: (input: CancelMediaIndexJobRequest) => Promise<void>;
  onCancelMediaAlignmentJob: (
    input: CancelMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCreateMediaPair: (input: CreateMediaEditPairRequest) => Promise<void>;
};

export function ProfileWorkspace({
  profiles,
  selectedProfileId,
  selectedProfile,
  examples,
  libraryAssets,
  mediaIndexJobs,
  mediaAlignmentJobs,
  mediaAlignmentMatches,
  mediaEditPairs,
  cancellingMediaIndexJobIds,
  cancellingMediaAlignmentJobIds,
  savingThumbnailOutputAssetIds,
  isLoadingProfiles,
  isLoadingExamples,
  isLoadingLibraryAssets,
  isLoadingMediaIndexJobs,
  isLoadingMediaAlignmentJobs,
  isLoadingMediaPairs,
  isCreatingProfile,
  isAddingExample,
  isCreatingMediaAsset,
  isCreatingMediaIndexJob,
  isCreatingMediaAlignmentJob,
  isCreatingMediaPair,
  error,
  onSelectProfile,
  onCreateProfile,
  onAddExample,
  onCreateMediaAsset,
  onCreateMediaIndexJob,
  onReplaceThumbnailOutputs,
  onCreateMediaAlignmentJob,
  onCancelMediaIndexJob,
  onCancelMediaAlignmentJob,
  onCreateMediaPair,
}: ProfileWorkspaceProps) {
  const {
    assetNote,
    assetScope,
    assetSourceType,
    assetSourceValue,
    assetTitle,
    assetType,
    exampleNote,
    exampleTitle,
    handleAddExample,
    handleCreateMediaAsset,
    handleCreateMediaPair,
    handleCreateProfile,
    handleCreateProfileEdit,
    handlePickLocalExample,
    handlePickMediaLibraryAsset,
    handlePickProfileEdit,
    pairNote,
    pairScope,
    pairTitle,
    profileDescription,
    profileEditNote,
    profileEditSourceType,
    profileEditSourceValue,
    profileEditTitle,
    profileName,
    selectedEditAssetId,
    selectedVodAssetId,
    setAssetNote,
    setAssetScope,
    setAssetSourceType,
    setAssetSourceValue,
    setAssetTitle,
    setAssetType,
    setExampleNote,
    setExampleTitle,
    setPairNote,
    setPairScope,
    setPairTitle,
    setProfileDescription,
    setProfileEditNote,
    setProfileEditSourceType,
    setProfileEditSourceValue,
    setProfileEditTitle,
    setProfileName,
    setSelectedEditAssetId,
    setSelectedVodAssetId,
    setSourceType,
    setSourceValue,
    sourceType,
    sourceValue,
  } = useProfileWorkspaceForms({
    onAddExample,
    onCreateMediaAsset,
    onCreateMediaPair,
    onCreateProfile,
    selectedProfileId,
  });

  const {
    activeAlignmentJobCount,
    activeIndexJobCount,
    availableAssetSourceTypes,
    editAssetOptions,
    globalClipCount,
    latestAlignmentJobByPairId,
    latestIndexJobByAssetId,
    mediaAssetById,
    mediaEditPairById,
    recentBackgroundActivity,
    selectedAssetSourceType,
    selectedProfileClipReferenceCount,
    selectedProfileEditReferenceCount,
    selectedProfileReferenceCount,
    selectedProfileUsableReferenceCount,
    selectedSourceType,
    usesLocalAssetPicker,
    usesLocalFilePicker,
    usesLocalProfileEditPicker,
    visibleExamples,
    vodAssetOptions,
  } = useProfileWorkspaceDerivedState({
    assetSourceType,
    assetType,
    examples,
    isLoadingExamples,
    libraryAssets,
    mediaAlignmentJobs,
    mediaEditPairs,
    mediaIndexJobs,
    profileEditSourceType,
    selectedProfile,
    sourceType,
  });

  return (
    <section className="profile-library-layout">
      <ProfileWorkspaceSidebar
        isCreatingProfile={isCreatingProfile}
        isLoadingProfiles={isLoadingProfiles}
        onCreateProfile={handleCreateProfile}
        onSelectProfile={onSelectProfile}
        profileDescription={profileDescription}
        profileName={profileName}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        setProfileDescription={setProfileDescription}
        setProfileName={setProfileName}
      />

      <div className="profile-detail-stack">
        <article className="utility-block">
          {selectedProfile ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="detail-label">Selected profile</span>
                  <h2>{selectedProfile.name}</h2>
                  <p>
                    {selectedProfile.description ||
                      "No description yet. Add a few examples to make this profile more useful."}
                  </p>
                </div>
                <div className="profile-summary-badges">
                  <span className="session-state-pill active-session">
                    {selectedProfile.state}
                  </span>
                  <span className="session-state-pill next-target">
                    {selectedProfile.source === "SYSTEM" ? "System" : "User"}
                  </span>
                </div>
              </div>

              <div className="analysis-summary-grid analysis-summary-grid-compact">
                <article className="analysis-summary-card">
                  <span className="detail-label">Saved examples</span>
                  <strong>{selectedProfileReferenceCount} total</strong>
                  <p>
                    Add clips and finished edits that feel like the moments you
                    want to keep.
                  </p>
                </article>
                <article className="analysis-summary-card">
                  <span className="detail-label">Example mix</span>
                  <strong>
                    {selectedProfileClipReferenceCount} clips •{" "}
                    {selectedProfileEditReferenceCount} edits
                  </strong>
                  <p>
                    Clips capture quick moments. Finished edits show what made
                    the final cut.
                  </p>
                </article>
                <article className="analysis-summary-card">
                  <span className="detail-label">Ready examples</span>
                  <strong>
                    {selectedProfileUsableReferenceCount} ready examples
                  </strong>
                  <p>Use clips or finished edits to improve future scans.</p>
                </article>
                <article className="analysis-summary-card">
                  <span className="detail-label">Last updated</span>
                  <strong>{formatTimestamp(selectedProfile.updatedAt)}</strong>
                  <p>Created {formatTimestamp(selectedProfile.createdAt)}</p>
                </article>
              </div>
            </>
          ) : (
            <>
              <span className="detail-label">Selected profile</span>
              <h2>No profile selected</h2>
              <p>
                Create a profile or choose one from the library to start adding
                examples.
              </p>
            </>
          )}
        </article>

        {error ? <p className="analysis-error">{error}</p> : null}

        <article className="utility-block">
          <div className="panel-header">
            <div>
              <span className="detail-label">Start here</span>
              <h2>Build this profile with real examples</h2>
              <p>
                Start with a few clips. Add a finished edit if you have one.
              </p>
            </div>
          </div>

          {selectedProfile ? (
            <ol className="plain-list ordered reference-step-list">
              <li>
                Add a few short clips that capture the kinds of moments you want
                more of.
              </li>
              <li>
                Add one finished edit to show Pulse what usually makes the final
                cut.
              </li>
              <li>
                Use the media library later only if you need to save more files.
              </li>
            </ol>
          ) : (
            <p className="queue-summary-copy">
              Choose or create a profile first. Then add clips and edited videos
              as examples.
            </p>
          )}
        </article>

        <div className="reference-primary-grid">
          <article className="utility-block">
            <div className="panel-header">
              <div>
                <span className="detail-label">Add reusable clip</span>
                <h2>Add reusable clips</h2>
                <p>Use short clips that feel like moments you would keep.</p>
              </div>
            </div>

            <div className="analysis-form">
              <label className="search-block">
                <span className="input-label">Source type</span>
                <select
                  className="search-input"
                  disabled={!selectedProfile || isAddingExample}
                  onChange={(event) =>
                    setSourceType(event.target.value as ExampleClipSourceType)
                  }
                  value={sourceType}
                >
                  {sourceTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small className="analysis-field-note">
                  {selectedSourceType?.hint}
                </small>
              </label>

              <label className="search-block">
                <span className="input-label">
                  {sourceType === "LOCAL_FILE_PATH" ||
                  sourceType === "LOCAL_FILE_UPLOAD"
                    ? "Local path or file"
                    : "Source URL"}
                </span>
                <input
                  className="search-input"
                  disabled={!selectedProfile || isAddingExample}
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

              {usesLocalFilePicker ? (
                <div className="action-row">
                  <button
                    className="button-secondary"
                    disabled={!selectedProfile || isAddingExample}
                    onClick={() => {
                      void handlePickLocalExample(sourceType);
                    }}
                    type="button"
                  >
                    Choose local clip
                  </button>
                </div>
              ) : null}

              <div className="analysis-inline-grid">
                <label className="search-block">
                  <span className="input-label">Optional title</span>
                  <input
                    className="search-input"
                    disabled={!selectedProfile || isAddingExample}
                    onChange={(event) => setExampleTitle(event.target.value)}
                    placeholder="Dry payoff example"
                    type="text"
                    value={exampleTitle}
                  />
                </label>

                <label className="search-block">
                  <span className="input-label">Optional rationale</span>
                  <input
                    className="search-input"
                    disabled={!selectedProfile || isAddingExample}
                    onChange={(event) => setExampleNote(event.target.value)}
                    placeholder="Why this example matters"
                    type="text"
                    value={exampleNote}
                  />
                </label>
              </div>

              <div className="action-row">
                <button
                  className="button-primary"
                  disabled={
                    !selectedProfile || isAddingExample || !sourceValue.trim()
                  }
                  onClick={() => {
                    void handleAddExample();
                  }}
                  type="button"
                >
                  {isAddingExample ? "Saving example..." : "Save clip example"}
                </button>
              </div>
            </div>
          </article>

          <article className="utility-block">
            <div className="panel-header">
              <div>
                <span className="detail-label">Add edited video</span>
                <h2>Add one finished edit</h2>
                <p>
                  Use a finished edit to show Pulse what made the final cut.
                </p>
              </div>
            </div>

            <div className="analysis-form">
              <label className="search-block">
                <span className="input-label">Source type</span>
                <select
                  className="search-input"
                  disabled={!selectedProfile || isCreatingMediaAsset}
                  onChange={(event) =>
                    setProfileEditSourceType(
                      event.target.value as ExampleClipSourceType,
                    )
                  }
                  value={profileEditSourceType}
                >
                  {localOnlySourceTypeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <small className="analysis-field-note">
                  Choose a file or paste the full path to the finished edit.
                </small>
              </label>

              <label className="search-block">
                <span className="input-label">Edited video file</span>
                <input
                  className="search-input"
                  disabled={!selectedProfile || isCreatingMediaAsset}
                  onChange={(event) =>
                    setProfileEditSourceValue(event.target.value)
                  }
                  placeholder="/Users/you/Exports/session-edit.mp4"
                  type="text"
                  value={profileEditSourceValue}
                />
              </label>

              {usesLocalProfileEditPicker ? (
                <div className="action-row">
                  <button
                    className="button-secondary"
                    disabled={!selectedProfile || isCreatingMediaAsset}
                    onClick={() => {
                      void handlePickProfileEdit(profileEditSourceType);
                    }}
                    type="button"
                  >
                    Choose edited video
                  </button>
                </div>
              ) : null}

              <div className="analysis-inline-grid">
                <label className="search-block">
                  <span className="input-label">Optional title</span>
                  <input
                    className="search-input"
                    disabled={!selectedProfile || isCreatingMediaAsset}
                    onChange={(event) =>
                      setProfileEditTitle(event.target.value)
                    }
                    placeholder="March 12 final cut"
                    type="text"
                    value={profileEditTitle}
                  />
                </label>

                <label className="search-block">
                  <span className="input-label">Optional note</span>
                  <input
                    className="search-input"
                    disabled={!selectedProfile || isCreatingMediaAsset}
                    onChange={(event) => setProfileEditNote(event.target.value)}
                    placeholder="What should Pulse learn from this edit?"
                    type="text"
                    value={profileEditNote}
                  />
                </label>
              </div>

              <div className="action-row">
                <button
                  className="button-primary"
                  disabled={
                    !selectedProfile ||
                    isCreatingMediaAsset ||
                    !profileEditSourceValue.trim()
                  }
                  onClick={() => {
                    void handleCreateProfileEdit();
                  }}
                  type="button"
                >
                  {isCreatingMediaAsset
                    ? "Saving edit..."
                    : "Save finished edit"}
                </button>
              </div>
            </div>
          </article>
        </div>

        <article className="utility-block">
          <div className="panel-header">
            <div>
              <span className="detail-label">Saved examples</span>
              <h2>Examples in this profile</h2>
            </div>
            {isLoadingExamples ? (
              <span className="queue-count">Refreshing…</span>
            ) : null}
          </div>

          {selectedProfile && visibleExamples.length === 0 ? (
            <p className="queue-summary-copy">
              No saved examples yet for this profile.
            </p>
          ) : null}

          <div className="profile-example-list">
            {visibleExamples.map((example) => (
              <article className="profile-example-card" key={example.id}>
                <div className="profile-example-top">
                  <span className="detail-label">
                    {formatReferenceKind(
                      example.referenceKind,
                      example.sourceType,
                    )}
                  </span>
                  <span className="session-state-pill active-session">
                    {formatStatus(example.status)}
                  </span>
                </div>
                <strong>{example.title || "Untitled example"}</strong>
                <p className="profile-example-source">{example.sourceValue}</p>
                {example.note ? <p>{example.note}</p> : null}
                {example.statusDetail ? (
                  <p className="queue-summary-copy">{example.statusDetail}</p>
                ) : null}
                {example.featureSummary ? (
                  <p className="queue-summary-copy">
                    {formatReferenceSummaryLabel(example.referenceKind)} •
                    duration{" "}
                    {Math.round(example.featureSummary.durationSeconds)}s
                    {example.featureSummary.transcriptAnchorTerms.length > 0
                      ? ` • anchors ${formatTranscriptAnchors(example.featureSummary.transcriptAnchorTerms)}`
                      : ""}{" "}
                    • top clues{" "}
                    {formatTopReasons(example.featureSummary.topReasonCodes)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </article>

        <ProfileWorkspaceMediaLab
          activeAlignmentJobCount={activeAlignmentJobCount}
          activeIndexJobCount={activeIndexJobCount}
          cancellingMediaAlignmentJobIds={cancellingMediaAlignmentJobIds}
          editAssetOptions={editAssetOptions}
          handleCreateMediaPair={handleCreateMediaPair}
          isCreatingMediaAlignmentJob={isCreatingMediaAlignmentJob}
          isCreatingMediaIndexJob={isCreatingMediaIndexJob}
          isCreatingMediaPair={isCreatingMediaPair}
          isLoadingMediaAlignmentJobs={isLoadingMediaAlignmentJobs}
          isLoadingMediaIndexJobs={isLoadingMediaIndexJobs}
          isLoadingMediaPairs={isLoadingMediaPairs}
          latestAlignmentJobByPairId={latestAlignmentJobByPairId}
          latestIndexJobByAssetId={latestIndexJobByAssetId}
          mediaAlignmentMatches={mediaAlignmentMatches}
          mediaAssetById={mediaAssetById}
          mediaEditPairById={mediaEditPairById}
          mediaEditPairs={mediaEditPairs}
          onCancelMediaAlignmentJob={onCancelMediaAlignmentJob}
          onCreateMediaAlignmentJob={onCreateMediaAlignmentJob}
          onCreateMediaIndexJob={onCreateMediaIndexJob}
          pairNote={pairNote}
          pairScope={pairScope}
          pairTitle={pairTitle}
          recentBackgroundActivity={recentBackgroundActivity}
          selectedEditAssetId={selectedEditAssetId}
          selectedProfileId={selectedProfileId}
          selectedVodAssetId={selectedVodAssetId}
          setPairNote={setPairNote}
          setPairScope={setPairScope}
          setPairTitle={setPairTitle}
          setSelectedEditAssetId={setSelectedEditAssetId}
          setSelectedVodAssetId={setSelectedVodAssetId}
          vodAssetOptions={vodAssetOptions}
        />
      </div>
    </section>
  );
}
