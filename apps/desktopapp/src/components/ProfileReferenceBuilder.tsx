import type {
  ClipProfile,
  ExampleClipSourceType,
} from "@vaexcore/pulse-shared-types";
import type { useProfileWorkspaceDerivedState } from "../hooks/useProfileWorkspaceDerivedState";
import type { useProfileWorkspaceForms } from "../hooks/useProfileWorkspaceForms";
import {
  localOnlySourceTypeOptions,
  sourceTypeOptions,
} from "../lib/profileWorkspacePresentation";

type ProfileReferenceBuilderProps = {
  derived: ReturnType<typeof useProfileWorkspaceDerivedState>;
  forms: ReturnType<typeof useProfileWorkspaceForms>;
  isAddingExample: boolean;
  isCreatingMediaAsset: boolean;
  selectedProfile: ClipProfile | null;
};

export function ProfileReferenceBuilder({
  derived,
  forms,
  isAddingExample,
  isCreatingMediaAsset,
  selectedProfile,
}: ProfileReferenceBuilderProps) {
  return (
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
                forms.setSourceType(event.target.value as ExampleClipSourceType)
              }
              value={forms.sourceType}
            >
              {sourceTypeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <small className="analysis-field-note">
              {derived.selectedSourceType?.hint}
            </small>
          </label>

          <label className="search-block">
            <span className="input-label">
              {forms.sourceType === "LOCAL_FILE_PATH" ||
              forms.sourceType === "LOCAL_FILE_UPLOAD"
                ? "Local path or file"
                : "Source URL"}
            </span>
            <input
              className="search-input"
              disabled={!selectedProfile || isAddingExample}
              onChange={(event) => forms.setSourceValue(event.target.value)}
              placeholder={
                forms.sourceType === "TWITCH_CLIP_URL"
                  ? "https://clips.twitch.tv/..."
                  : forms.sourceType === "YOUTUBE_SHORT_URL"
                    ? "https://www.youtube.com/shorts/..."
                    : "/Users/you/Clips/example.mp4"
              }
              type="text"
              value={forms.sourceValue}
            />
          </label>

          {derived.usesLocalFilePicker ? (
            <div className="action-row">
              <button
                className="button-secondary"
                disabled={!selectedProfile || isAddingExample}
                onClick={() => {
                  void forms.handlePickLocalExample(forms.sourceType);
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
                onChange={(event) => forms.setExampleTitle(event.target.value)}
                placeholder="Dry payoff example"
                type="text"
                value={forms.exampleTitle}
              />
            </label>

            <label className="search-block">
              <span className="input-label">Optional rationale</span>
              <input
                className="search-input"
                disabled={!selectedProfile || isAddingExample}
                onChange={(event) => forms.setExampleNote(event.target.value)}
                placeholder="Why this example matters"
                type="text"
                value={forms.exampleNote}
              />
            </label>
          </div>

          <div className="action-row">
            <button
              className="button-primary"
              disabled={
                !selectedProfile || isAddingExample || !forms.sourceValue.trim()
              }
              onClick={() => {
                void forms.handleAddExample();
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
            <p>Use a finished edit to show Pulse what made the final cut.</p>
          </div>
        </div>

        <div className="analysis-form">
          <label className="search-block">
            <span className="input-label">Source type</span>
            <select
              className="search-input"
              disabled={!selectedProfile || isCreatingMediaAsset}
              onChange={(event) =>
                forms.setProfileEditSourceType(
                  event.target.value as ExampleClipSourceType,
                )
              }
              value={forms.profileEditSourceType}
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
                forms.setProfileEditSourceValue(event.target.value)
              }
              placeholder="/Users/you/Exports/session-edit.mp4"
              type="text"
              value={forms.profileEditSourceValue}
            />
          </label>

          {derived.usesLocalProfileEditPicker ? (
            <div className="action-row">
              <button
                className="button-secondary"
                disabled={!selectedProfile || isCreatingMediaAsset}
                onClick={() => {
                  void forms.handlePickProfileEdit(forms.profileEditSourceType);
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
                  forms.setProfileEditTitle(event.target.value)
                }
                placeholder="March 12 final cut"
                type="text"
                value={forms.profileEditTitle}
              />
            </label>

            <label className="search-block">
              <span className="input-label">Optional note</span>
              <input
                className="search-input"
                disabled={!selectedProfile || isCreatingMediaAsset}
                onChange={(event) =>
                  forms.setProfileEditNote(event.target.value)
                }
                placeholder="What should Pulse learn from this edit?"
                type="text"
                value={forms.profileEditNote}
              />
            </label>
          </div>

          <div className="action-row">
            <button
              className="button-primary"
              disabled={
                !selectedProfile ||
                isCreatingMediaAsset ||
                !forms.profileEditSourceValue.trim()
              }
              onClick={() => {
                void forms.handleCreateProfileEdit();
              }}
              type="button"
            >
              {isCreatingMediaAsset ? "Saving edit..." : "Save finished edit"}
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
