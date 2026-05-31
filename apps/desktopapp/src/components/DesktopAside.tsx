import type { ProjectSessionSummary } from "@vaexcore/pulse-shared-types";
import { TranscriptSnippetBlock } from "@vaexcore/pulse-ui";
import type { DesktopPage } from "../lib/desktopNavigation";
import type { SuiteAppStatus, SuiteSession } from "../lib/suitePresentation";

type DesktopAsideProps = {
  acceptedCount: number;
  activePage: DesktopPage;
  nextPendingSession: ProjectSessionSummary | null;
  pendingReviewCount: number;
  pendingSessionCount: number;
  projectSummaries: ProjectSessionSummary[];
  rejectedCount: number;
  selectedCandidateTranscriptSnippet: string | null;
  selectedMediaPath: string;
  sessionCandidateCount: number;
  suiteSession: SuiteSession | null;
  suiteStatus: SuiteAppStatus[];
};

export function DesktopAside({
  acceptedCount,
  activePage,
  nextPendingSession,
  pendingReviewCount,
  pendingSessionCount,
  projectSummaries,
  rejectedCount,
  selectedCandidateTranscriptSnippet,
  selectedMediaPath,
  sessionCandidateCount,
  suiteSession,
  suiteStatus,
}: DesktopAsideProps) {
  if (activePage === "new-analysis") {
    return (
      <div className="desktop-aside-stack">
        <article className="utility-block">
          <span className="detail-label">Before you scan</span>
          <p>Choose one local video file.</p>
          <p>Pick the profile closest to what you want to keep.</p>
          <p>Give the session a name only if the file name is not enough.</p>
        </article>
        <article className="utility-block">
          <span className="detail-label">Why profiles matter</span>
          <p>
            A profile is a small set of examples. It helps Pulse find moments
            that feel like your previous keeps.
          </p>
          <p>Short clips and finished edits are both useful examples.</p>
        </article>
      </div>
    );
  }

  if (activePage === "suite") {
    const readyApps = suiteStatus.filter(
      (app) => app.installed && app.running && app.reachable && !app.stale,
    ).length;
    return (
      <div className="desktop-aside-stack">
        <article className="utility-block">
          <span className="detail-label">Suite snapshot</span>
          <p>
            {readyApps} of {suiteStatus.length || 3} apps ready
          </p>
          <p>
            {suiteSession
              ? `${suiteSession.title} is the active shared session.`
              : "Open Studio to create the shared suite session."}
          </p>
        </article>
        <article className="utility-block">
          <span className="detail-label">Pulse role</span>
          <p>
            Pulse receives Studio recordings, scans video, and sends kept
            moments back to Studio.
          </p>
        </article>
      </div>
    );
  }

  if (activePage === "projects") {
    return (
      <div className="desktop-aside-stack">
        <article className="utility-block">
          <span className="detail-label">Backlog snapshot</span>
          <p>
            {projectSummaries.length} saved session
            {projectSummaries.length === 1 ? "" : "s"} total
          </p>
          <p>
            {pendingSessionCount} session
            {pendingSessionCount === 1 ? "" : "s"} still need review
          </p>
        </article>
        <article className="utility-block">
          <span className="detail-label">Next up</span>
          <p>
            {nextPendingSession
              ? `${nextPendingSession.sessionTitle} • ${nextPendingSession.pendingCount} undecided`
              : "Nothing is waiting right now."}
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="desktop-aside-stack">
      <article className="utility-block">
        <span className="detail-label">Current video</span>
        <p>{selectedMediaPath || "No video selected yet."}</p>
        <p>
          {sessionCandidateCount} suggested moment
          {sessionCandidateCount === 1 ? "" : "s"} • {acceptedCount} kept
        </p>
        <p>
          {pendingReviewCount} undecided • {rejectedCount} skipped
        </p>
      </article>
      <article className="utility-block">
        <span className="detail-label">Keyboard shortcuts</span>
        <ul className="plain-list review-shortcut-list">
          <li>
            <strong>K</strong>
            <span>Keep the current moment</span>
          </li>
          <li>
            <strong>X</strong>
            <span>Skip the current moment</span>
          </li>
          <li>
            <strong>N</strong>
            <span>Jump to the next undecided moment</span>
          </li>
          <li>
            <strong>V</strong>
            <span>Open the selected moment in the video player</span>
          </li>
          <li>
            <strong>J / L</strong>
            <span>Move to the previous or next visible moment</span>
          </li>
          <li>
            <strong>[ / ]</strong>
            <span>Lengthen the clip start or ending by 2 seconds</span>
          </li>
          <li>
            <strong>/</strong>
            <span>Focus the queue search box</span>
          </li>
        </ul>
      </article>
      <TranscriptSnippetBlock
        heading="Current transcript focus"
        text={
          selectedCandidateTranscriptSnippet ??
          "Select a moment to inspect its transcript context."
        }
      />
      {pendingReviewCount === 0 ? (
        <article className="utility-block">
          <span className="detail-label">Export</span>
          <p>Export actions are available in the session completion card.</p>
        </article>
      ) : null}
    </div>
  );
}
