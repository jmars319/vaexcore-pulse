import { extractSourceName } from "../lib/sessionPresentation";
import {
  studioRecordingImportBlockReason,
  studioRecordingQueueKey,
  studioRecordingWarning,
  type StudioIntakeQueueItem,
  type StudioIntakeState,
  type StudioRecordingExportHistory,
} from "../lib/studioIntegration";
import {
  outputReadinessLabel,
  outputReadinessTone,
  studioIntakeSourceLabel,
  studioIntakeStateLabel,
  studioIntakeStateTone,
  studioRecordingCompletionLabel,
  studioRecordingSizeLabel,
  studioRecordingVerificationLabel,
  type StudioIntakeFilter,
} from "../lib/studioIntakePresentation";

type StudioIntakePanelProps = {
  filteredStudioIntakeRecordings: StudioIntakeQueueItem[];
  isAnalyzing: boolean;
  onDismissStudioRecording: (recording: StudioIntakeQueueItem) => void;
  onRefreshStudioIntake: () => void;
  onRestoreStudioRecording: (recording: StudioIntakeQueueItem) => void;
  onStudioIntakeFilterChange: (filter: StudioIntakeFilter) => void;
  onStudioRecordingImport: (recording: StudioIntakeQueueItem) => void;
  studioExportHistory: StudioRecordingExportHistory;
  studioIntake: StudioIntakeState;
  studioIntakeFilter: StudioIntakeFilter;
  studioIntakeFilterCounts: Record<StudioIntakeFilter, number>;
};

const studioIntakeFilters: Array<[StudioIntakeFilter, string]> = [
  ["ready", "Ready"],
  ["needs-attention", "Needs attention"],
  ["imported", "Imported"],
  ["exported", "Exported"],
  ["hidden", "Hidden"],
];

export function StudioIntakePanel({
  filteredStudioIntakeRecordings,
  isAnalyzing,
  onDismissStudioRecording,
  onRefreshStudioIntake,
  onRestoreStudioRecording,
  onStudioIntakeFilterChange,
  onStudioRecordingImport,
  studioExportHistory,
  studioIntake,
  studioIntakeFilter,
  studioIntakeFilterCounts,
}: StudioIntakePanelProps) {
  return (
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
            studioIntake.connection === "connected" ? "ready" : "blocked"
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
        {studioIntakeFilters.map(([filter, label]) => (
          <button
            className={
              studioIntakeFilter === filter
                ? "button-primary"
                : "button-secondary"
            }
            key={filter}
            onClick={() => onStudioIntakeFilterChange(filter)}
            type="button"
          >
            {label} ({studioIntakeFilterCounts[filter]})
          </button>
        ))}
        <button
          className="button-secondary"
          onClick={onRefreshStudioIntake}
          type="button"
        >
          Refresh from Studio
        </button>
      </div>
      {studioIntake.recordings.length > 0 ? (
        <div className="studio-intake-queue" data-testid="studio-intake-queue">
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
              <div className="studio-recording-card" key={recording.queueId}>
                <div className="studio-intake-card-header">
                  <div>
                    <span className="detail-label">
                      {studioIntakeSourceLabel(recording.source)}
                    </span>
                    <strong>{extractSourceName(recording.outputPath)}</strong>
                  </div>
                  <span
                    className={`analysis-readiness-pill ${studioIntakeStateTone(
                      recording.state,
                    )}`}
                  >
                    {studioIntakeStateLabel(recording.state)}
                  </span>
                </div>
                <p className="analysis-summary-path">{recording.outputPath}</p>
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
                  <p className="review-status-copy">{importBlockReason}</p>
                ) : null}
                {exportHistory ? (
                  <p className="review-status-copy">
                    Exported {exportHistory.acceptedCount} kept moments as{" "}
                    {exportHistory.formats.join(", ")} on{" "}
                    {new Date(exportHistory.exportedAt).toLocaleString()}.
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
                    onClick={() => onStudioRecordingImport(recording)}
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
                      onClick={() => onRestoreStudioRecording(recording)}
                      type="button"
                    >
                      Restore
                    </button>
                  ) : (
                    <button
                      className="button-secondary"
                      onClick={() => onDismissStudioRecording(recording)}
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
          Stop a Studio recording and Pulse will offer it here for the next
          scan. Import stays manual so the active review session does not change
          unexpectedly.
        </p>
      )}
    </article>
  );
}
