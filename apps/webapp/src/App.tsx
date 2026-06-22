import { startTransition, useEffect, useMemo, useState } from "react";
import {
  deriveSessionReviewState,
  reviewedCandidateCount,
} from "@vaexcore/pulse-domain";
import {
  clipProfileSchema,
  projectSessionSummarySchema,
  type ClipProfile,
  type ProjectSessionSummary,
} from "@vaexcore/pulse-shared-types";
import { LayoutShell, VaexcorePulseLogo } from "@vaexcore/pulse-ui";

type WebPage =
  | "dashboard"
  | "projects"
  | "candidate-history"
  | "profiles"
  | "settings";

const navItems: Array<{ id: WebPage; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "projects", label: "Projects" },
  { id: "candidate-history", label: "Review History" },
  { id: "profiles", label: "Profiles" },
  { id: "settings", label: "Settings" },
];

/* Web shell boundary */
export default function App() {
  const [activePage, setActivePage] = useState<WebPage>("dashboard");
  const [sessionSummaries, setSessionSummaries] = useState<
    ProjectSessionSummary[]
  >([]);
  const [profiles, setProfiles] = useState<ClipProfile[]>([]);
  const [apiStatus, setApiStatus] = useState("offline");
  const [isLoadingSummaries, setIsLoadingSummaries] = useState(true);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const apiBaseUrl =
    import.meta.env.VITE_VAEXCORE_PULSE_API_BASE_URL ?? "http://127.0.0.1:4010";

  /* API health boundary */
  useEffect(() => {
    const controller = new AbortController();

    fetch(`${apiBaseUrl}/health`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        startTransition(() => {
          setApiStatus(payload.status ?? "online");
        });
      })
      .catch(() => {
        startTransition(() => {
          setApiStatus("offline");
        });
      });

    return () => controller.abort();
  }, [apiBaseUrl]);

  /* Profile load boundary */
  useEffect(() => {
    const controller = new AbortController();

    async function loadProfiles() {
      setIsLoadingProfiles(true);

      try {
        const response = await fetch(`${apiBaseUrl}/api/profiles`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              message?: string;
            }
          | ClipProfile[]
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "message" in payload && payload.message
              ? payload.message
              : "Profile list load failed",
          );
        }

        const nextProfiles = clipProfileSchema.array().parse(payload);
        startTransition(() => {
          setProfiles(nextProfiles);
          setProfileError(null);
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        startTransition(() => {
          setProfiles([]);
          setProfileError(
            error instanceof Error ? error.message : "Unable to load profiles",
          );
        });
      } finally {
        if (!controller.signal.aborted) {
          startTransition(() => {
            setIsLoadingProfiles(false);
          });
        }
      }
    }

    void loadProfiles();

    return () => controller.abort();
  }, [apiBaseUrl]);

  /* Session load boundary */
  useEffect(() => {
    const controller = new AbortController();

    async function loadSessionSummaries() {
      setIsLoadingSummaries(true);

      try {
        const response = await fetch(`${apiBaseUrl}/api/projects`, {
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              message?: string;
            }
          | ProjectSessionSummary[]
          | null;

        if (!response.ok) {
          throw new Error(
            payload && "message" in payload && payload.message
              ? payload.message
              : "Project list load failed",
          );
        }

        const summaries = projectSessionSummarySchema.array().parse(payload);
        startTransition(() => {
          setSessionSummaries(summaries);
          setSummaryError(null);
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        startTransition(() => {
          setSummaryError(
            error instanceof Error ? error.message : "Unable to load sessions",
          );
          setSessionSummaries([]);
        });
      } finally {
        if (!controller.signal.aborted) {
          startTransition(() => {
            setIsLoadingSummaries(false);
          });
        }
      }
    }

    void loadSessionSummaries();

    return () => controller.abort();
  }, [apiBaseUrl]);

  /* Session stats boundary */
  const sessionStats = useMemo(() => {
    const reviewedSessions = sessionSummaries.filter(
      (summary) => deriveSessionReviewState(summary) === "REVIEWED",
    ).length;
    const inProgressSessions = sessionSummaries.filter(
      (summary) => deriveSessionReviewState(summary) === "IN_PROGRESS",
    ).length;
    const pendingSessions = sessionSummaries.filter(
      (summary) => deriveSessionReviewState(summary) === "PENDING",
    ).length;
    const acceptedCandidates = sessionSummaries.reduce(
      (total, summary) => total + summary.acceptedCount,
      0,
    );

    return {
      reviewedSessions,
      inProgressSessions,
      pendingSessions,
      acceptedCandidates,
    };
  }, [sessionSummaries]);

  /* Summary card boundary */
  function renderSummaryCard(summary: ProjectSessionSummary) {
    const sessionReviewState = deriveSessionReviewState(summary);

    return (
      <article className="web-panel web-summary-card" key={summary.sessionId}>
        <div className="web-panel-row">
          <span className="web-label">Project session</span>
          <span
            className={`web-state-pill ${sessionReviewState.toLowerCase().replace("_", "-")}`}
          >
            {formatSessionReviewState(sessionReviewState)}
          </span>
        </div>
        <h2>{summary.sessionTitle}</h2>
        <p>{summary.sourceName}</p>
        <p>{summary.sourcePath}</p>
        <div className="web-summary-progress">
          <div className="web-summary-meter">
            <div
              className="web-summary-fill"
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
          {summary.acceptedCount} accepted • {summary.rejectedCount} rejected •{" "}
          {summary.pendingCount} pending
        </p>
        <p>Updated {formatSummaryTimestamp(summary.updatedAt)}</p>
      </article>
    );
  }

  function renderPage() {
    if (activePage === "projects") {
      if (isLoadingSummaries) {
        return (
          <section className="web-grid">
            <article className="web-panel">
              <span className="web-label">Projects</span>
              <h2>Loading sessions...</h2>
            </article>
          </section>
        );
      }

      if (summaryError) {
        return (
          <section className="web-grid">
            <article className="web-panel">
              <span className="web-label">Projects</span>
              <h2>Sessions unavailable</h2>
              <p>{summaryError}</p>
            </article>
          </section>
        );
      }

      if (sessionSummaries.length === 0) {
        return (
          <section className="web-grid">
            <article className="web-panel">
              <span className="web-label">Projects</span>
              <h2>No sessions yet</h2>
              <p>
                Start a scan in the desktop app. Finished sessions will appear
                here.
              </p>
            </article>
          </section>
        );
      }

      return (
        <section className="web-grid">
          {sessionSummaries.map(renderSummaryCard)}
        </section>
      );
    }

    if (activePage === "candidate-history") {
      return (
        <section className="web-grid">
          <article className="web-panel">
            <span className="web-label">Review history</span>
            <h2>Review on desktop</h2>
            <p>
              Use the desktop app for full session review. This page will show
              review history when it is ready.
            </p>
            <p>
              Sessions available: {sessionSummaries.length} • status:{" "}
              {apiStatus}
            </p>
          </article>
        </section>
      );
    }

    if (activePage === "profiles") {
      if (isLoadingProfiles) {
        return (
          <section className="web-grid">
            <article className="web-panel">
              <span className="web-label">Profiles</span>
              <h2>Loading profiles...</h2>
            </article>
          </section>
        );
      }

      if (profileError) {
        return (
          <section className="web-grid">
            <article className="web-panel">
              <span className="web-label">Profiles</span>
              <h2>Profiles unavailable</h2>
              <p>{profileError}</p>
            </article>
          </section>
        );
      }

      if (profiles.length === 0) {
        return (
          <section className="web-grid">
            <article className="web-panel">
              <span className="web-label">Profiles</span>
              <h2>No profiles yet</h2>
              <p>
                Create a profile in the desktop app. It will appear here when
                sync is available.
              </p>
            </article>
          </section>
        );
      }

      return (
        <section className="web-grid">
          {profiles.map((profile) => (
            <article className="web-panel" key={profile.id}>
              <span className="web-label">{profile.mode}</span>
              <h2>{profile.label}</h2>
              <p>{profile.description}</p>
              <p>
                {Object.keys(profile.signalWeights).length} profile settings
              </p>
            </article>
          ))}
        </section>
      );
    }

    if (activePage === "settings") {
      return (
        <section className="web-grid">
          <article className="web-panel">
            <span className="web-label">Connection</span>
            <p>API status: {apiStatus}</p>
            <p>Sessions come from the desktop app.</p>
          </article>
          <article className="web-panel">
            <span className="web-label">Profiles</span>
            <p>Review and setup still happen in the desktop app.</p>
            <p>Saved profiles appear here when they are available.</p>
          </article>
        </section>
      );
    }

    const latestSession = sessionSummaries[0] ?? null;

    return (
      <section className="web-grid">
        <article className="web-panel">
          <span className="web-label">Dashboard</span>
          <h2>Backlog companion</h2>
          <p>
            Check session progress here. Use the desktop app when you are ready
            to review.
          </p>
          <p>API status: {apiStatus}</p>
        </article>
        <article className="web-panel">
          <span className="web-label">Backlog totals</span>
          <h2>{sessionSummaries.length} sessions</h2>
          <p>
            {sessionStats.inProgressSessions} in progress •{" "}
            {sessionStats.reviewedSessions} reviewed •{" "}
            {sessionStats.pendingSessions} not started
          </p>
          <p>{sessionStats.acceptedCandidates} accepted moments so far</p>
          <p>{profiles.length} profiles available</p>
        </article>
        <article className="web-panel">
          <span className="web-label">Latest session</span>
          {latestSession ? (
            <>
              <h2>{latestSession.sessionTitle}</h2>
              <p>{latestSession.sourceName}</p>
              <p>
                {formatSessionReviewState(
                  deriveSessionReviewState(latestSession),
                )}
                {" • "}
                {latestSession.pendingCount} pending
              </p>
            </>
          ) : (
            <>
              <h2>No sessions yet</h2>
              <p>Start a scan in the desktop app to fill this dashboard.</p>
            </>
          )}
        </article>
        {summaryError ? (
          <article className="web-panel">
            <span className="web-label">Load state</span>
            <h2>Summary list unavailable</h2>
            <p>{summaryError}</p>
          </article>
        ) : null}
      </section>
    );
  }

  return (
    <div className="web-shell">
      <LayoutShell
        activeId={activePage}
        appName="vaexcore pulse"
        aside={
          <div className="web-aside">
            <article className="web-panel">
              <span className="web-label">Companion</span>
              <p>{sessionSummaries.length} sessions loaded</p>
              <p>
                {sessionSummaries[0]
                  ? `Latest update ${formatSummaryTimestamp(sessionSummaries[0].updatedAt)}`
                  : "Desktop scans will fill this list."}
              </p>
            </article>
          </div>
        }
        brandMark={<VaexcorePulseLogo />}
        navItems={navItems}
        onSelect={(pageId) => setActivePage(pageId as WebPage)}
        subtitle="Desktop-first companion for project browsing, profile inspection, and lightweight status review."
        title="Web Companion"
      >
        {renderPage()}
      </LayoutShell>
    </div>
  );
}

function formatSessionReviewState(
  sessionReviewState: ReturnType<typeof deriveSessionReviewState>,
): string {
  if (sessionReviewState === "REVIEWED") {
    return "Reviewed";
  }

  if (sessionReviewState === "IN_PROGRESS") {
    return "In progress";
  }

  return "Pending";
}

function formatSessionCompletion(summary: ProjectSessionSummary): number {
  if (summary.candidateCount === 0) {
    return 0;
  }

  return Math.round(
    (reviewedCandidateCount(summary) / summary.candidateCount) * 100,
  );
}

function formatSummaryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
