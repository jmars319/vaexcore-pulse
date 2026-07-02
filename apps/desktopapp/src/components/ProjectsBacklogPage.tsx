import { useMemo } from "react";
import {
  analysisCoverageTone,
  deriveSessionReviewState,
  reviewedCandidateCount,
} from "@vaexcore/pulse-domain";
import type {
  ClipProfile,
  ProjectSessionSearchResult,
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
  isSearchingProjects: boolean;
  nextPendingSession: ProjectSessionSummary | null;
  onOpenNextPendingSession: () => void;
  onOpenProject: (sessionId: string) => void;
  onSearchChange: (value: string) => void;
  onScanAnotherVideo: () => void;
  pendingSessionCount: number;
  projectSearchError: string | null;
  projectSearchResults: ProjectSessionSearchResult[];
  projectSearchValue: string;
  projectSummaries: ProjectSessionSummary[];
  projectsError: string | null;
};

export function ProjectsBacklogPage({
  activeSessionId,
  availableProfiles,
  isLoadingProjects,
  isSearchingProjects,
  nextPendingSession,
  onOpenNextPendingSession,
  onOpenProject,
  onSearchChange,
  pendingSessionCount,
  projectSearchError,
  projectSearchResults,
  projectSearchValue,
  projectSummaries,
  projectsError,
  onScanAnotherVideo,
}: ProjectsBacklogPageProps) {
  const normalizedSearchValue = projectSearchValue.trim();
  const isSearchActive = normalizedSearchValue.length >= 2;
  const searchResultBySessionId = useMemo(
    () =>
      new Map(projectSearchResults.map((result) => [result.sessionId, result])),
    [projectSearchResults],
  );
  const displayedSummaries = useMemo(() => {
    if (!isSearchActive) return projectSummaries;
    const summaryBySessionId = new Map(
      projectSummaries.map((summary) => [summary.sessionId, summary]),
    );
    return projectSearchResults
      .map((result) => summaryBySessionId.get(result.sessionId))
      .filter((summary): summary is ProjectSessionSummary => Boolean(summary));
  }, [isSearchActive, projectSearchResults, projectSummaries]);
  const groupedSummaries = useMemo(
    () => groupProjectSummaries(displayedSummaries, availableProfiles),
    [availableProfiles, displayedSummaries],
  );

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
        <article className="utility-block backlog-search-card">
          <div className="panel-header">
            <div>
              <span className="detail-label">Library search</span>
              <h2>Find saved sessions, decisions, transcripts, and exports</h2>
              <p>
                Search across session titles, media paths, transcript text,
                candidate labels, review tags, decisions, notes, and accepted
                export labels.
              </p>
            </div>
            <span className="queue-count">
              {isSearchingProjects
                ? "Searching"
                : `${displayedSummaries.length} shown`}
            </span>
          </div>
          <label className="field-stack">
            <span>Search library</span>
            <input
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="reaction, intro, approved, transcript text..."
              type="search"
              value={projectSearchValue}
            />
          </label>
          {projectSearchError ? (
            <p className="analysis-error">{projectSearchError}</p>
          ) : null}
          {isSearchActive &&
          !isSearchingProjects &&
          displayedSummaries.length === 0 ? (
            <p className="review-status-copy">
              No saved sessions matched "{normalizedSearchValue}".
            </p>
          ) : null}
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
      {groupedSummaries.map((group) => (
        <div className="project-summary-group" key={group.profileId}>
          <div className="panel-header">
            <div>
              <span className="detail-label">Profile group</span>
              <h2>{group.profileName}</h2>
            </div>
            <span className="queue-count">
              {group.summaries.length} session
              {group.summaries.length === 1 ? "" : "s"}
            </span>
          </div>
          {group.summaries.map((summary) => {
            const profile = resolveProfile(
              availableProfiles,
              summary.profileId,
            );
            const searchResult = searchResultBySessionId.get(summary.sessionId);
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
                    {reviewedCandidateCount(summary)} of{" "}
                    {summary.candidateCount} reviewed
                  </p>
                </div>
                <p>
                  {summary.candidateCount} moments • {summary.acceptedCount}{" "}
                  kept • {summary.rejectedCount} skipped •{" "}
                  {summary.pendingCount} undecided
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
                {searchResult ? (
                  <div className="project-summary-search-hit">
                    <span className="detail-label">
                      Matched {searchResult.matchedFields.join(", ")}
                    </span>
                    {searchResult.snippets.map((snippet, index) => (
                      <p key={`${summary.sessionId}-snippet-${index}`}>
                        {snippet}
                      </p>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function groupProjectSummaries(
  summaries: ProjectSessionSummary[],
  profiles: ClipProfile[],
) {
  const groups = new Map<
    string,
    {
      profileId: string;
      profileName: string;
      summaries: ProjectSessionSummary[];
    }
  >();

  for (const summary of summaries) {
    const profile = resolveProfile(profiles, summary.profileId);
    const group = groups.get(summary.profileId) ?? {
      profileId: summary.profileId,
      profileName: profile.name,
      summaries: [],
    };
    group.summaries.push(summary);
    groups.set(summary.profileId, group);
  }

  return [...groups.values()];
}
