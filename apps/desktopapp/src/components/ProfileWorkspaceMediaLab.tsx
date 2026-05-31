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
import { MediaComparisonsSection } from "./MediaComparisonsSection";
import {
  describeBackgroundActivity,
  formatAlignmentJobStatus,
  formatAssetType,
  formatIndexJobStatus,
  formatIndexSummary,
} from "../lib/profileWorkspacePresentation";

type BackgroundActivityItem =
  | { kind: "INDEX"; updatedAt: number; job: MediaIndexJob }
  | { kind: "ALIGNMENT"; updatedAt: number; job: MediaAlignmentJob };

type ProfileWorkspaceMediaLabProps = {
  activeAlignmentJobCount: number;
  activeIndexJobCount: number;
  cancellingMediaAlignmentJobIds: Record<string, boolean>;
  editAssetOptions: MediaLibraryAsset[];
  handleCreateMediaPair: () => Promise<void> | void;
  isCreatingMediaAlignmentJob: boolean;
  isCreatingMediaIndexJob: boolean;
  isCreatingMediaPair: boolean;
  isLoadingMediaAlignmentJobs: boolean;
  isLoadingMediaIndexJobs: boolean;
  isLoadingMediaPairs: boolean;
  latestAlignmentJobByPairId: Map<string, MediaAlignmentJob>;
  latestIndexJobByAssetId: Map<string, MediaIndexJob>;
  mediaAlignmentMatches: MediaAlignmentMatch[];
  mediaAssetById: Map<string, MediaLibraryAsset>;
  mediaEditPairById: Map<string, MediaEditPair>;
  mediaEditPairs: MediaEditPair[];
  onCancelMediaAlignmentJob: (
    input: CancelMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCreateMediaAlignmentJob: (
    input: CreateMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCreateMediaIndexJob: (input: CreateMediaIndexJobRequest) => Promise<void>;
  pairNote: string;
  pairScope: MediaLibraryAssetScope;
  pairTitle: string;
  recentBackgroundActivity: BackgroundActivityItem[];
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

export function ProfileWorkspaceMediaLab({
  activeAlignmentJobCount,
  activeIndexJobCount,
  cancellingMediaAlignmentJobIds,
  editAssetOptions,
  handleCreateMediaPair,
  isCreatingMediaAlignmentJob,
  isCreatingMediaIndexJob,
  isCreatingMediaPair,
  isLoadingMediaAlignmentJobs,
  isLoadingMediaIndexJobs,
  isLoadingMediaPairs,
  latestAlignmentJobByPairId,
  latestIndexJobByAssetId,
  mediaAlignmentMatches,
  mediaAssetById,
  mediaEditPairById,
  mediaEditPairs,
  onCancelMediaAlignmentJob,
  onCreateMediaAlignmentJob,
  onCreateMediaIndexJob,
  pairNote,
  pairScope,
  pairTitle,
  recentBackgroundActivity,
  selectedEditAssetId,
  selectedProfileId,
  selectedVodAssetId,
  setPairNote,
  setPairScope,
  setPairTitle,
  setSelectedEditAssetId,
  setSelectedVodAssetId,
  vodAssetOptions,
}: ProfileWorkspaceMediaLabProps) {
  return (
    <details className="utility-block internal-details">
      <summary className="internal-details-summary">
        <span>Media lab</span>
        <span className="queue-count">Optional</span>
      </summary>

      <div className="advanced-tools-stack">
        {activeIndexJobCount > 0 || activeAlignmentJobCount > 0 ? (
          <article className="utility-block advanced-activity-banner">
            <div className="panel-header">
              <div>
                <span className="detail-label">Background work</span>
                <h2>Pulse is still working</h2>
                <p>
                  {describeBackgroundActivity(
                    activeIndexJobCount,
                    activeAlignmentJobCount,
                  )}{" "}
                  You can keep adding examples while this finishes.
                </p>
              </div>
              <span className="session-state-pill next-target">
                In progress
              </span>
            </div>
          </article>
        ) : null}

        <details
          className="utility-block internal-details advanced-lab-section"
          open={activeIndexJobCount > 0 || activeAlignmentJobCount > 0}
        >
          <summary className="internal-details-summary">
            <span>Background work</span>
            <span className="queue-count">
              {isLoadingMediaIndexJobs || isLoadingMediaAlignmentJobs
                ? "Refreshing…"
                : `${recentBackgroundActivity.length} jobs`}
            </span>
          </summary>

          <article className="utility-block">
            <div className="panel-header">
              <div>
                <span className="detail-label">Background activity</span>
                <h2>Recent background work</h2>
              </div>
              <span className="queue-count">
                {isLoadingMediaIndexJobs || isLoadingMediaAlignmentJobs
                  ? "Refreshing…"
                  : `${recentBackgroundActivity.length} jobs`}
              </span>
            </div>

            {recentBackgroundActivity.length === 0 ? (
              <p className="queue-summary-copy">
                Nothing is running right now.
              </p>
            ) : null}

            <div className="profile-example-list">
              {recentBackgroundActivity
                .slice(0, 6)
                .map((item) =>
                  item.kind === "INDEX" ? (
                    <IndexActivityCard
                      asset={mediaAssetById.get(item.job.assetId)}
                      job={item.job}
                      key={item.job.id}
                    />
                  ) : (
                    <AlignmentActivityCard
                      job={item.job}
                      key={item.job.id}
                      pair={
                        item.job.pairId
                          ? mediaEditPairById.get(item.job.pairId)
                          : undefined
                      }
                      queryAsset={mediaAssetById.get(item.job.queryAssetId)}
                      sourceAsset={mediaAssetById.get(item.job.sourceAssetId)}
                    />
                  ),
                )}
            </div>
          </article>
        </details>

        <MediaComparisonsSection
          cancellingMediaAlignmentJobIds={cancellingMediaAlignmentJobIds}
          editAssetOptions={editAssetOptions}
          isCreatingMediaAlignmentJob={isCreatingMediaAlignmentJob}
          isCreatingMediaIndexJob={isCreatingMediaIndexJob}
          isCreatingMediaPair={isCreatingMediaPair}
          isLoadingMediaAlignmentJobs={isLoadingMediaAlignmentJobs}
          isLoadingMediaPairs={isLoadingMediaPairs}
          latestAlignmentJobByPairId={latestAlignmentJobByPairId}
          latestIndexJobByAssetId={latestIndexJobByAssetId}
          mediaAlignmentMatches={mediaAlignmentMatches}
          mediaAssetById={mediaAssetById}
          mediaEditPairs={mediaEditPairs}
          onCancelMediaAlignmentJob={onCancelMediaAlignmentJob}
          onCreateMediaAlignmentJob={onCreateMediaAlignmentJob}
          onCreateMediaIndexJob={onCreateMediaIndexJob}
          onCreateMediaPair={handleCreateMediaPair}
          pairNote={pairNote}
          pairScope={pairScope}
          pairTitle={pairTitle}
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
    </details>
  );
}

function IndexActivityCard({
  asset,
  job,
}: {
  asset: MediaLibraryAsset | undefined;
  job: MediaIndexJob;
}) {
  return (
    <article className="profile-example-card">
      <div className="profile-example-top">
        <span className="detail-label">
          {asset ? `${formatAssetType(asset.assetType)} scan` : "Scan"}
        </span>
        <span className="session-state-pill active-session">
          {formatIndexJobStatus(job.status)}
        </span>
      </div>
      <strong>{asset?.title || asset?.sourceValue || job.assetId}</strong>
      <p className="queue-summary-copy">
        {Math.round(job.progress * 100)}% • {job.statusDetail}
      </p>
      {job.result ? (
        <p className="queue-summary-copy">
          Result • {formatIndexSummary(job.result)}
        </p>
      ) : null}
      {job.errorMessage ? (
        <p className="analysis-error">{job.errorMessage}</p>
      ) : null}
    </article>
  );
}

function AlignmentActivityCard({
  job,
  pair,
  queryAsset,
  sourceAsset,
}: {
  job: MediaAlignmentJob;
  pair: MediaEditPair | undefined;
  queryAsset: MediaLibraryAsset | undefined;
  sourceAsset: MediaLibraryAsset | undefined;
}) {
  return (
    <article className="profile-example-card">
      <div className="profile-example-top">
        <span className="detail-label">Video comparison</span>
        <span className="session-state-pill active-session">
          {formatAlignmentJobStatus(job.status)}
        </span>
      </div>
      <strong>
        {pair?.title ||
          `${sourceAsset?.title || sourceAsset?.sourceValue || job.sourceAssetId} -> ${
            queryAsset?.title || queryAsset?.sourceValue || job.queryAssetId
          }`}
      </strong>
      <p className="queue-summary-copy">
        {Math.round(job.progress * 100)}% • {job.statusDetail}
      </p>
      <p className="queue-summary-copy">
        {job.matchCount} possible match{job.matchCount === 1 ? "" : "es"}
      </p>
      {job.errorMessage ? (
        <p className="analysis-error">{job.errorMessage}</p>
      ) : null}
    </article>
  );
}
