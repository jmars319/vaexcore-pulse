import type { PulseBatchExportPackage } from "@vaexcore/pulse-export";
import type { ProjectSessionSummary } from "@vaexcore/pulse-shared-types";

type StudioRecordingExportHistory = {
  exportedAt: string;
  formats: string[];
  acceptedCount: number;
  pulseSessionId: string;
  pulseSessionTitle: string;
};

type ReviewCompletionPanelProps = {
  batchExportPackage: PulseBatchExportPackage | null;
  canExportAcceptedToStudio: boolean;
  copyFeedback: string | null;
  edlPreview: string;
  exportPreview: string;
  isCurrentCandidateSentToStudio: boolean;
  isExportingToStudio: boolean;
  jsonPreview: string;
  nextPendingSession: ProjectSessionSummary | null;
  onCopyExport: (
    format: "timestamps" | "json" | "edl",
    value: string,
  ) => Promise<void> | void;
  onCopyBatchExportPackage: () => Promise<void> | void;
  onExportAcceptedToStudio: () => void;
  onOpenNextPendingSession: () => void;
  onReturnToProjects: () => void;
  pendingCount: number;
  studioExportStatus: string | null;
  studioRecordingExportHistory: StudioRecordingExportHistory | null;
};

export function ReviewCompletionPanel({
  batchExportPackage,
  canExportAcceptedToStudio,
  copyFeedback,
  edlPreview,
  exportPreview,
  isCurrentCandidateSentToStudio,
  isExportingToStudio,
  jsonPreview,
  nextPendingSession,
  onCopyExport,
  onCopyBatchExportPackage,
  onExportAcceptedToStudio,
  onOpenNextPendingSession,
  onReturnToProjects,
  pendingCount,
  studioExportStatus,
  studioRecordingExportHistory,
}: ReviewCompletionPanelProps) {
  if (pendingCount !== 0) {
    return null;
  }

  return (
    <section className="completion-panel">
      <div className="section-title-row">
        <h3>Session review complete</h3>
        <span className="session-state-pill reviewed">Complete</span>
      </div>
      <p className="review-status-copy">
        Every moment in this session now has a decision.
      </p>
      {exportPreview ? (
        <details className="internal-details completion-export-details">
          <summary className="internal-details-summary">
            <span>Export kept moments</span>
            <span className="queue-count">Ready</span>
          </summary>
          <div className="action-row">
            <button
              className="button-secondary"
              onClick={() => {
                void onCopyExport("timestamps", exportPreview);
              }}
              type="button"
            >
              Copy timestamps
            </button>
            {jsonPreview ? (
              <button
                className="button-secondary"
                onClick={() => {
                  void onCopyExport("json", jsonPreview);
                }}
                type="button"
              >
                Copy JSON
              </button>
            ) : null}
            {edlPreview ? (
              <button
                className="button-secondary"
                onClick={() => {
                  void onCopyExport("edl", edlPreview);
                }}
                type="button"
              >
                Copy EDL
              </button>
            ) : null}
            {batchExportPackage ? (
              <button
                className="button-secondary"
                onClick={() => {
                  void onCopyBatchExportPackage();
                }}
                type="button"
              >
                Copy export package
              </button>
            ) : null}
            <button
              className="button-secondary"
              disabled={!canExportAcceptedToStudio || isExportingToStudio}
              onClick={onExportAcceptedToStudio}
              type="button"
            >
              {isExportingToStudio ? "Sending to Studio" : "Send to Studio"}
            </button>
          </div>
          {copyFeedback ? (
            <p className="review-status-copy">{copyFeedback}</p>
          ) : null}
          {studioExportStatus ? (
            <p className="review-status-copy">{studioExportStatus}</p>
          ) : null}
          {studioRecordingExportHistory ? (
            <p className="review-status-copy">
              Last Studio export: {studioRecordingExportHistory.acceptedCount}{" "}
              kept moments as {studioRecordingExportHistory.formats.join(", ")}{" "}
              on{" "}
              {new Date(
                studioRecordingExportHistory.exportedAt,
              ).toLocaleString()}
              . Use the copy buttons above to re-export the current accepted
              set.
            </p>
          ) : null}
          {isCurrentCandidateSentToStudio ? (
            <p className="review-status-copy">
              This selected moment is confirmed in Studio.
            </p>
          ) : null}
          {batchExportPackage ? (
            <div className="export-package-summary">
              <span className="detail-label">Batch package</span>
              <p>
                {batchExportPackage.fileCount} files for{" "}
                {batchExportPackage.acceptedMomentCount} kept moments.
              </p>
              <ul>
                {batchExportPackage.files.map((file) => (
                  <li key={file.fileName}>
                    {file.fileName} - {file.description}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <details className="internal-details nested-export-details">
            <summary className="internal-details-summary">
              <span>Timestamp preview</span>
              <span className="queue-count">Optional</span>
            </summary>
            <pre>{exportPreview}</pre>
          </details>
          {jsonPreview ? (
            <details className="internal-details nested-export-details">
              <summary className="internal-details-summary">
                <span>JSON preview</span>
                <span className="queue-count">Optional</span>
              </summary>
              <pre>{jsonPreview}</pre>
            </details>
          ) : null}
          {edlPreview ? (
            <details className="internal-details nested-export-details">
              <summary className="internal-details-summary">
                <span>EDL preview</span>
                <span className="queue-count">Optional</span>
              </summary>
              <pre>{edlPreview}</pre>
            </details>
          ) : null}
        </details>
      ) : (
        <p className="review-status-copy">
          No kept moments yet to export from this session.
        </p>
      )}
      <div className="action-row">
        {nextPendingSession ? (
          <button
            className="button-primary"
            onClick={onOpenNextPendingSession}
            type="button"
          >
            Continue with next session
          </button>
        ) : null}
        <button
          className="button-secondary"
          onClick={onReturnToProjects}
          type="button"
        >
          Return to backlog
        </button>
      </div>
      <p className="review-status-copy">
        {nextPendingSession
          ? `${nextPendingSession.sessionTitle} • ${nextPendingSession.pendingCount} undecided`
          : "All saved review sessions are currently fully reviewed."}
      </p>
    </section>
  );
}
