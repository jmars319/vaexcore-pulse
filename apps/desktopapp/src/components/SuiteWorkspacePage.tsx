import {
  formatSuiteTimestamp,
  suiteStatusLabel,
  suiteStatusTone,
  timelineTone,
  type SuiteAppStatus,
  type SuiteSession,
  type SuiteTimelineItem,
} from "../lib/suitePresentation";

type SuiteWorkspacePageProps = {
  onLaunchSuite: () => void;
  suiteLaunchStatus: string | null;
  suiteRefreshError: string | null;
  suiteSession: SuiteSession | null;
  suiteStatus: SuiteAppStatus[];
  suiteTimeline: SuiteTimelineItem[];
};

export function SuiteWorkspacePage({
  onLaunchSuite,
  suiteLaunchStatus,
  suiteRefreshError,
  suiteSession,
  suiteStatus,
  suiteTimeline,
}: SuiteWorkspacePageProps) {
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
          onClick={onLaunchSuite}
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
                <span className={`session-state-pill ${suiteStatusTone(app)}`}>
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
