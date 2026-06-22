import type { ExampleClipSourceType } from "@vaexcore/pulse-shared-types";
import {
  localProfileSourceTypeOptions,
  profileSourceTypeOptions,
  useProfileSetupSettings,
} from "../hooks/useProfileSetupSettings";
import { extractSourceName } from "../lib/sessionPresentation";
import {
  formatProfileSourceType,
  formatStatus,
} from "../lib/settingsWindowBehavior";

/* Profile setup boundary */
export function ProfileSetupSettingsSection() {
  const {
    canPickClipFile,
    canPickEditFile,
    editNote,
    editSourceType,
    editSourceValue,
    editTitle,
    exampleNote,
    exampleTitle,
    handleAddEditedVideo,
    handleAddExample,
    handleCreateProfile,
    handlePickLocalMedia,
    isAddingEditedVideo,
    isAddingProfileExample,
    isClipFilePicker,
    isCreatingProfile,
    isEditFilePicker,
    isLoadingProfileExamples,
    isLoadingProfiles,
    isPulseReady,
    profileDescription,
    profileLibraryError,
    profileName,
    profileSetupNotice,
    profiles,
    selectedEditSourceType,
    selectedProfile,
    selectedProfileId,
    selectedSourceType,
    setEditNote,
    setEditSourceType,
    setEditSourceValue,
    setEditTitle,
    setExampleNote,
    setExampleTitle,
    setProfileDescription,
    setProfileName,
    setSelectedProfileId,
    setSourceType,
    setSourceValue,
    sourceType,
    sourceValue,
    startupCopy,
    visibleExamples,
  } = useProfileSetupSettings();

  if (!isPulseReady) {
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

      {/* Profile selection boundary */}
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

      {/* Profile creation boundary */}
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

      {/* Clip example boundary */}
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

      {/* Edit example boundary */}
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

      {/* Saved example boundary */}
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
