import type {
  CancelMediaAlignmentJobRequest,
  CreateMediaAlignmentJobRequest,
  CreateMediaIndexJobRequest,
  MediaAlignmentJob,
  MediaAlignmentMatch,
  MediaEditPair,
  MediaIndexJob,
  MediaLibraryAsset,
  MediaLibraryAssetScope,
} from "@vaexcore/pulse-shared-types";
import {
  describePairAlignmentBlockedAction,
  describePairAlignmentBlockedReason,
  formatAlignmentJobStatus,
  formatAlignmentKind,
  formatAlignmentRange,
  formatDuration,
  formatPairStatus,
  formatRatio,
  mediaAssetHasAudioFingerprint,
} from "../lib/profileWorkspacePresentation";

type MediaComparisonsSectionProps = {
  cancellingMediaAlignmentJobIds: Record<string, boolean>;
  editAssetOptions: MediaLibraryAsset[];
  isCreatingMediaAlignmentJob: boolean;
  isCreatingMediaIndexJob: boolean;
  isCreatingMediaPair: boolean;
  isLoadingMediaAlignmentJobs: boolean;
  isLoadingMediaPairs: boolean;
  latestAlignmentJobByPairId: Map<string, MediaAlignmentJob>;
  latestIndexJobByAssetId: Map<string, MediaIndexJob>;
  mediaAlignmentMatches: MediaAlignmentMatch[];
  mediaAssetById: Map<string, MediaLibraryAsset>;
  mediaEditPairs: MediaEditPair[];
  onCancelMediaAlignmentJob: (
    input: CancelMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCreateMediaAlignmentJob: (
    input: CreateMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCreateMediaIndexJob: (input: CreateMediaIndexJobRequest) => Promise<void>;
  onCreateMediaPair: () => Promise<void> | void;
  pairNote: string;
  pairScope: MediaLibraryAssetScope;
  pairTitle: string;
  selectedEditAssetId: string;
  selectedProfileId: string | null;
  selectedVodAssetId: string;
  setPairNote: (note: string) => void;
  setPairScope: (scope: MediaLibraryAssetScope) => void;
  setPairTitle: (title: string) => void;
  setSelectedEditAssetId: (assetId: string) => void;
  setSelectedVodAssetId: (assetId: string) => void;
  vodAssetOptions: MediaLibraryAsset[];
};

export function MediaComparisonsSection({
  cancellingMediaAlignmentJobIds,
  editAssetOptions,
  isCreatingMediaAlignmentJob,
  isCreatingMediaIndexJob,
  isCreatingMediaPair,
  isLoadingMediaAlignmentJobs,
  isLoadingMediaPairs,
  latestAlignmentJobByPairId,
  latestIndexJobByAssetId,
  mediaAlignmentMatches,
  mediaAssetById,
  mediaEditPairs,
  onCancelMediaAlignmentJob,
  onCreateMediaAlignmentJob,
  onCreateMediaIndexJob,
  onCreateMediaPair,
  pairNote,
  pairScope,
  pairTitle,
  selectedEditAssetId,
  selectedProfileId,
  selectedVodAssetId,
  setPairNote,
  setPairScope,
  setPairTitle,
  setSelectedEditAssetId,
  setSelectedVodAssetId,
  vodAssetOptions,
}: MediaComparisonsSectionProps) {
  return (
    <details className="utility-block internal-details advanced-lab-section">
      <summary className="internal-details-summary">
        <span>Video comparisons</span>
        <span className="queue-count">
          {isLoadingMediaPairs || isLoadingMediaAlignmentJobs
            ? "Refreshing…"
            : `${mediaEditPairs.length} saved`}
        </span>
      </summary>

      <article className="utility-block">
        <div className="panel-header">
          <div>
            <span className="detail-label">Video comparison</span>
            <h2>Compare a full video to its edit</h2>
            <p>
              Use this when you want Pulse to compare a full video with the
              finished edit.
            </p>
          </div>
        </div>

        <div className="analysis-form">
          <div className="analysis-inline-grid">
            <label className="search-block">
              <span className="input-label">Full video</span>
              <select
                className="search-input"
                disabled={isCreatingMediaPair || vodAssetOptions.length === 0}
                onChange={(event) => setSelectedVodAssetId(event.target.value)}
                value={selectedVodAssetId}
              >
                <option value="">
                  {vodAssetOptions.length === 0
                    ? "No full videos yet"
                    : "Choose full video"}
                </option>
                {vodAssetOptions.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title || asset.sourceValue}
                  </option>
                ))}
              </select>
            </label>

            <label className="search-block">
              <span className="input-label">Edited video</span>
              <select
                className="search-input"
                disabled={isCreatingMediaPair || editAssetOptions.length === 0}
                onChange={(event) => setSelectedEditAssetId(event.target.value)}
                value={selectedEditAssetId}
              >
                <option value="">
                  {editAssetOptions.length === 0
                    ? "No edits yet"
                    : "Choose edited video"}
                </option>
                {editAssetOptions.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.title || asset.sourceValue}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="analysis-inline-grid">
            <label className="search-block">
              <span className="input-label">Save for</span>
              <select
                className="search-input"
                disabled={isCreatingMediaPair}
                onChange={(event) =>
                  setPairScope(event.target.value as MediaLibraryAssetScope)
                }
                value={pairScope}
              >
                <option value="GLOBAL">Global</option>
                <option value="PROFILE">Selected profile</option>
              </select>
            </label>

            <label className="search-block">
              <span className="input-label">Optional title</span>
              <input
                className="search-input"
                disabled={isCreatingMediaPair}
                onChange={(event) => setPairTitle(event.target.value)}
                placeholder="March 12 comparison"
                type="text"
                value={pairTitle}
              />
            </label>
          </div>

          <label className="search-block">
            <span className="input-label">Optional note</span>
            <input
              className="search-input"
              disabled={isCreatingMediaPair}
              onChange={(event) => setPairNote(event.target.value)}
              placeholder="What should Pulse learn from this comparison?"
              type="text"
              value={pairNote}
            />
          </label>

          <div className="action-row">
            <button
              className="button-primary"
              disabled={
                isCreatingMediaPair ||
                !selectedVodAssetId ||
                !selectedEditAssetId ||
                (pairScope === "PROFILE" && !selectedProfileId)
              }
              onClick={() => {
                void onCreateMediaPair();
              }}
              type="button"
            >
              {isCreatingMediaPair
                ? "Saving comparison..."
                : "Save video comparison"}
            </button>
          </div>
        </div>
      </article>

      <article className="utility-block">
        <div className="panel-header">
          <div>
            <span className="detail-label">Saved comparisons</span>
            <h2>Comparison history</h2>
          </div>
          <span className="queue-count">
            {isLoadingMediaPairs || isLoadingMediaAlignmentJobs
              ? "Refreshing…"
              : `${mediaEditPairs.length} saved`}
          </span>
        </div>

        {mediaEditPairs.length === 0 ? (
          <p className="queue-summary-copy">No saved comparisons yet.</p>
        ) : null}

        <div className="profile-example-list">
          {mediaEditPairs.map((pair) => (
            <MediaComparisonCard
              cancellingMediaAlignmentJobIds={cancellingMediaAlignmentJobIds}
              isCreatingMediaAlignmentJob={isCreatingMediaAlignmentJob}
              isCreatingMediaIndexJob={isCreatingMediaIndexJob}
              key={pair.id}
              latestAlignmentJob={latestAlignmentJobByPairId.get(pair.id)}
              latestIndexJobByAssetId={latestIndexJobByAssetId}
              mediaAssetById={mediaAssetById}
              onCancelMediaAlignmentJob={onCancelMediaAlignmentJob}
              onCreateMediaAlignmentJob={onCreateMediaAlignmentJob}
              onCreateMediaIndexJob={onCreateMediaIndexJob}
              pair={pair}
              pairMatches={mediaAlignmentMatches.filter(
                (match) => match.pairId === pair.id,
              )}
            />
          ))}
        </div>
      </article>
    </details>
  );
}

type MediaComparisonCardProps = {
  cancellingMediaAlignmentJobIds: Record<string, boolean>;
  isCreatingMediaAlignmentJob: boolean;
  isCreatingMediaIndexJob: boolean;
  latestAlignmentJob: MediaAlignmentJob | undefined;
  latestIndexJobByAssetId: Map<string, MediaIndexJob>;
  mediaAssetById: Map<string, MediaLibraryAsset>;
  onCancelMediaAlignmentJob: (
    input: CancelMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCreateMediaAlignmentJob: (
    input: CreateMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCreateMediaIndexJob: (input: CreateMediaIndexJobRequest) => Promise<void>;
  pair: MediaEditPair;
  pairMatches: MediaAlignmentMatch[];
};

function MediaComparisonCard({
  cancellingMediaAlignmentJobIds,
  isCreatingMediaAlignmentJob,
  isCreatingMediaIndexJob,
  latestAlignmentJob,
  latestIndexJobByAssetId,
  mediaAssetById,
  onCancelMediaAlignmentJob,
  onCreateMediaAlignmentJob,
  onCreateMediaIndexJob,
  pair,
  pairMatches,
}: MediaComparisonCardProps) {
  const hasActiveAlignmentJob =
    latestAlignmentJob?.status === "QUEUED" ||
    latestAlignmentJob?.status === "RUNNING";
  const sourceAsset = mediaAssetById.get(pair.vodAssetId);
  const editAsset = mediaAssetById.get(pair.editAssetId);
  const sourceAssetHasAudioFingerprint =
    mediaAssetHasAudioFingerprint(sourceAsset);
  const editAssetHasAudioFingerprint = mediaAssetHasAudioFingerprint(editAsset);
  const sourceIndexJob = latestIndexJobByAssetId.get(pair.vodAssetId);
  const editIndexJob = latestIndexJobByAssetId.get(pair.editAssetId);
  const sourceIndexInFlight =
    sourceIndexJob?.status === "QUEUED" || sourceIndexJob?.status === "RUNNING";
  const editIndexInFlight =
    editIndexJob?.status === "QUEUED" || editIndexJob?.status === "RUNNING";
  const pairAlignmentBlockedReason = describePairAlignmentBlockedReason(
    sourceAsset,
    editAsset,
  );
  const pairAlignmentButtonLabel = pairAlignmentBlockedReason
    ? describePairAlignmentBlockedAction(
        sourceAssetHasAudioFingerprint,
        editAssetHasAudioFingerprint,
      )
    : "Compare edit to full video";

  return (
    <article className="profile-example-card">
      <div className="profile-example-top">
        <span className="detail-label">Video comparison</span>
        <span className="session-state-pill active-session">
          {formatPairStatus(pair.status)}
        </span>
      </div>
      <strong>{pair.title || "Untitled comparison"}</strong>
      <p className="queue-summary-copy">
        Full video {pair.vodAssetId} • edit {pair.editAssetId}
      </p>
      {pair.note ? <p>{pair.note}</p> : null}
      <p className="queue-summary-copy">{pair.statusDetail}</p>
      {pair.keepRatio !== undefined ? (
        <p className="queue-summary-copy">
          Source {formatDuration(pair.sourceDurationSeconds)} • edit{" "}
          {formatDuration(pair.editDurationSeconds)} • keep ratio{" "}
          {formatRatio(pair.keepRatio)} • compression{" "}
          {pair.compressionRatio?.toFixed(2)}x
        </p>
      ) : null}
      {latestAlignmentJob ? (
        <p className="queue-summary-copy">
          Latest comparison:{" "}
          {formatAlignmentJobStatus(latestAlignmentJob.status)}
          {" • "}
          {Math.round(latestAlignmentJob.progress * 100)}%{" • "}
          {latestAlignmentJob.statusDetail}
          {latestAlignmentJob.errorMessage
            ? ` • ${latestAlignmentJob.errorMessage}`
            : ""}
        </p>
      ) : null}
      {pairAlignmentBlockedReason ? (
        <p className="queue-summary-copy">
          Needs setup • {pairAlignmentBlockedReason}
        </p>
      ) : null}
      {pairMatches.length > 0 ? (
        <div className="profile-example-list">
          {pairMatches.slice(0, 3).map((match) => (
            <article className="profile-example-card" key={match.id}>
              <div className="profile-example-top">
                <span className="detail-label">Possible match</span>
                <span className="session-state-pill next-target">
                  {formatRatio(match.confidenceScore)} confidence
                </span>
              </div>
              <p className="queue-summary-copy">
                Full video {formatDuration(match.sourceRange.startSeconds)}-
                {formatDuration(match.sourceRange.endSeconds)}
                {" • "}Edit {formatDuration(match.queryRange.startSeconds)}-
                {formatDuration(match.queryRange.endSeconds)}
                {" • "}score {formatRatio(match.score)}
              </p>
              <p>{match.note}</p>
            </article>
          ))}
        </div>
      ) : null}
      {pair.alignmentSegments.length > 0 ? (
        <div className="profile-example-list">
          {pair.alignmentSegments.map((segment) => (
            <article className="profile-example-card" key={segment.id}>
              <div className="profile-example-top">
                <span className="detail-label">
                  {formatAlignmentKind(segment.kind)}
                </span>
                <span className="session-state-pill next-target">
                  {formatRatio(segment.confidenceScore)} confidence
                </span>
              </div>
              <p className="queue-summary-copy">
                {formatAlignmentRange("Full video", segment.sourceRange)}
                {" • "}
                {formatAlignmentRange("Edit", segment.editRange)}
              </p>
              <p>{segment.note}</p>
            </article>
          ))}
        </div>
      ) : null}
      <div className="action-row">
        {!sourceAssetHasAudioFingerprint && sourceAsset ? (
          <button
            className="button-secondary"
            disabled={isCreatingMediaIndexJob || sourceIndexInFlight}
            onClick={() => {
              void onCreateMediaIndexJob({
                assetId: sourceAsset.id,
              });
            }}
            type="button"
          >
            {sourceIndexInFlight ? "Scanning full video..." : "Scan full video"}
          </button>
        ) : null}
        {!editAssetHasAudioFingerprint && editAsset ? (
          <button
            className="button-secondary"
            disabled={isCreatingMediaIndexJob || editIndexInFlight}
            onClick={() => {
              void onCreateMediaIndexJob({
                assetId: editAsset.id,
              });
            }}
            type="button"
          >
            {editIndexInFlight ? "Scanning edit..." : "Scan edited video"}
          </button>
        ) : null}
        <button
          className="button-secondary"
          disabled={
            isCreatingMediaAlignmentJob ||
            hasActiveAlignmentJob ||
            Boolean(pairAlignmentBlockedReason)
          }
          onClick={() => {
            void onCreateMediaAlignmentJob({
              pairId: pair.id,
            });
          }}
          type="button"
        >
          {hasActiveAlignmentJob ? "Comparing..." : pairAlignmentButtonLabel}
        </button>
        {hasActiveAlignmentJob && latestAlignmentJob ? (
          <button
            className="button-secondary"
            disabled={Boolean(
              cancellingMediaAlignmentJobIds[latestAlignmentJob.id],
            )}
            onClick={() => {
              void onCancelMediaAlignmentJob({
                jobId: latestAlignmentJob.id,
              });
            }}
            type="button"
          >
            {cancellingMediaAlignmentJobIds[latestAlignmentJob.id]
              ? "Cancelling..."
              : "Cancel comparison"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
