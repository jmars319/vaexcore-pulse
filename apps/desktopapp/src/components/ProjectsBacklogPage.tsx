import {
  analysisCoverageTone,
  deriveSessionReviewState,
  reviewedCandidateCount,
} from "@vaexcore/pulse-domain";
import type {
  ClipProfile,
  ProjectSessionSummary,
} from "@vaexcore/pulse-shared-types";
import {
  buildProjectCoverageCopy,
  buildSessionOpenLabel,
  formatSessionCompletion,
  formatSessionReviewState,
  formatSummaryTimestamp,
  resolveProfile,
} from "../lib/sessionPresentation";

type ProjectsBacklogPageProps = {
  activeSessionId: string | null;
  availableProfiles: ClipProfile[];
  isLoadingProjects: boolean;
  nextPendingSession: ProjectSessionSummary | null;
  onOpenNextPendingSession: () => void;
  onOpenProject: (sessionId: string) => void;
  onScanAnotherVideo: () => void;
  pendingSessionCount: number;
  projectSummaries: ProjectSessionSummary[];
  projectsError: string | null;
};

export function ProjectsBacklogPage({
  activeSessionId,
  availableProfiles,
  isLoadingProjects,
  nextPendingSession,
  onOpenNextPendingSession,
  onOpenProject,
  pendingSessionCount,
  projectSummaries,
  projectsError,
  onScanAnotherVideo,
}: ProjectsBacklogPageProps) {
  return (
    <section className="desktop-placeholder-grid">
      {isLoadingProjects ? (
        <article className="utility-block">
          <span className="detail-label">Backlog</span>
          <h2>Loading saved review sessions...</h2>
        </article>
      ) : null}
      {projectsError ? (
        <article className="utility-block">
          <span className="detail-label">Backlog</span>
          <p className="analysis-error">{projectsError}</p>
        </article>
      ) : null}
      {!isLoadingProjects && !projectsError && projectSummaries.length === 0 ? (
        <article className="utility-block">
          <span className="detail-label">Backlog</span>
          <h2>No saved review sessions yet</h2>
          <p>Scan a video to create your first review session.</p>
        </article>
      ) : null}
      {!isLoadingProjects && !projectsError && projectSummaries.length > 0 ? (
        <article className="utility-block backlog-shortcut-card">
          <div className="panel-header">
            <div>
              <span className="detail-label">Backlog</span>
              <h2>
                {nextPendingSession
                  ? "Continue the next session that still needs decisions"
                  : "Your backlog is clear"}
              </h2>
              <p>
                {nextPendingSession
                  ? `${pendingSessionCount} saved session${pendingSessionCount === 1 ? "" : "s"} still have undecided moments.`
                  : "Every saved session currently has decisions for all suggested moments."}
              </p>
            </div>
            <span className="queue-count">{pendingSessionCount} open</span>
          </div>
          <div className="action-row">
            {nextPendingSession ? (
              <button
                className="button-primary"
                onClick={onOpenNextPendingSession}
                type="button"
              >
                Continue next session
              </button>
            ) : (
              <button
                className="button-secondary"
                onClick={onScanAnotherVideo}
                type="button"
              >
                Scan another video
              </button>
            )}
          </div>
          <p className="project-summary-cta">
            {nextPendingSession
              ? `${nextPendingSession.sessionTitle} • ${nextPendingSession.pendingCount} undecided • updated ${formatSummaryTimestamp(nextPendingSession.updatedAt)}`
              : "Use Start to add the next review session."}
          </p>
        </article>
      ) : null}
      {projectSummaries.map((summary) => {
        const profile = resolveProfile(availableProfiles, summary.profileId);
        const sessionReviewState = deriveSessionReviewState(summary);
        const isActiveSession = summary.sessionId === activeSessionId;
        const isNextPendingSession =
          summary.sessionId === nextPendingSession?.sessionId;
        return (
          <button
            className={
              isActiveSession
                ? "project-summary-card utility-block active"
                : "project-summary-card utility-block"
            }
            key={summary.sessionId}
            onClick={() => onOpenProject(summary.sessionId)}
            type="button"
          >
            <div className="project-summary-top">
              <span className="detail-label">Saved session</span>
              <div className="project-summary-badges">
                <span
                  className={`session-state-pill ${sessionReviewState.toLowerCase().replace("_", "-")}`}
                >
                  {formatSessionReviewState(sessionReviewState)}
                </span>
                {isNextPendingSession ? (
                  <span className="session-state-pill next-target">
                    Next up
                  </span>
                ) : null}
                {isActiveSession ? (
                  <span className="session-state-pill active-session">
                    Loaded
                  </span>
                ) : null}
              </div>
            </div>
            <h2>{summary.sessionTitle}</h2>
            <p>{summary.sourceName}</p>
            <p>{summary.sourcePath}</p>
            <div className="project-summary-progress">
              <div className="project-summary-meter">
                <div
                  className="project-summary-fill"
                  style={{
                    width: `${formatSessionCompletion(summary)}%`,
                  }}
                />
              </div>
              <p>
                {reviewedCandidateCount(summary)} of {summary.candidateCount}{" "}
                reviewed
              </p>
            </div>
            <p>
              {summary.candidateCount} moments • {summary.acceptedCount} kept •{" "}
              {summary.rejectedCount} skipped • {summary.pendingCount} undecided
            </p>
            <p
              className={`project-summary-coverage ${analysisCoverageTone(summary.analysisCoverage)}`}
            >
              {buildProjectCoverageCopy(summary)}
            </p>
            <p>
              Profile {profile.name} • updated{" "}
              {formatSummaryTimestamp(summary.updatedAt)}
            </p>
            <p className="project-summary-cta">
              {buildSessionOpenLabel(summary)}
            </p>
          </button>
        );
      })}
    </section>
  );
}
