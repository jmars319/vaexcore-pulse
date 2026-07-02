import type {
  ContentProfile,
  ProfileMatchingSummary,
  ProjectSession,
} from "@vaexcore/pulse-shared-types";
import {
  analysisCoverageTone,
  formatAnalysisCoverageBand,
  formatAnalysisCoverageFlag,
  summarizeSessionQuality,
} from "@vaexcore/pulse-domain";
import { formatLongTime } from "../lib/format";

type SessionOverviewProps = {
  session: ProjectSession;
  profile: ContentProfile;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  selectedCandidateIndex: number;
  reviewStateLabel: string;
  reviewStateTone: "PENDING" | "IN_PROGRESS" | "REVIEWED";
  profileMatchingSummary: ProfileMatchingSummary;
};

export function SessionOverview({
  session,
  profile,
  acceptedCount,
  rejectedCount,
  pendingCount,
  selectedCandidateIndex,
  reviewStateLabel,
  reviewStateTone,
  profileMatchingSummary,
}: SessionOverviewProps) {
  const candidateCount = session.candidates.length;
  const sessionQualitySummary = summarizeSessionQuality(
    session.analysisCoverage,
    candidateCount,
  );
  const selectedCandidateCopy =
    candidateCount === 0
      ? "No moments found"
      : selectedCandidateIndex >= 0
        ? `Moment ${selectedCandidateIndex + 1} selected`
        : "Review ready";

  return (
    <section className="session-overview-panel glass-panel">
      <div className="session-overview-header">
        <div>
          <p className="eyebrow">Current session</p>
          <h2>{session.title}</h2>
          <p className="session-overview-copy">
            {session.mediaSource.fileName} •{" "}
            {formatLongTime(session.mediaSource.durationSeconds)}
            {" • "}scanned {formatTimestamp(session.updatedAt)}
          </p>
        </div>
        <div className="session-overview-badges">
          <span
            className={`session-state-pill ${reviewStateTone.toLowerCase().replace("_", "-")}`}
          >
            {reviewStateLabel}
          </span>
          <span className="session-state-pill active-session">
            {formatLifecycleStatus(session.status)}
          </span>
        </div>
      </div>

      <div className="session-overview-strip">
        <article className="session-overview-card">
          <span className="detail-label">Review progress</span>
          <strong>
            {candidateCount === 0
              ? "No moments to review"
              : pendingCount === 0
                ? "Everything reviewed"
                : `${pendingCount} still need review`}
          </strong>
          <p>
            {candidateCount === 0
              ? "No clear moments were found in this video."
              : `${acceptedCount} kept • ${rejectedCount} skipped • ${candidateCount} total moments`}
          </p>
        </article>

        <article className="session-overview-card">
          <span className="detail-label">Current focus</span>
          <strong>{selectedCandidateCopy}</strong>
          <p>
            {pendingCount === 0
              ? "Use the completion card below to export or move on."
              : "Keep moving through the queue until the remaining moments have decisions."}
          </p>
        </article>

        <article className="session-overview-card">
          <span className="detail-label">Profile</span>
          <strong>{profile.name}</strong>
          <p>{profileMatchingSummary.note}</p>
          <p>
            {profileMatchingSummary.usableLocalExampleCount} saved example
            {profileMatchingSummary.usableLocalExampleCount === 1 ? "" : "s"}
          </p>
        </article>
      </div>

      <details className="utility-block internal-details session-overview-details">
        <summary className="internal-details-summary">
          <span>More scan details</span>
          <span className="queue-count">Optional</span>
        </summary>

        <div className="session-overview-grid">
          <article className="session-overview-card">
            <span className="detail-label">Video</span>
            <strong>{session.mediaSource.fileName}</strong>
            <p className="session-overview-path">{session.mediaSource.path}</p>
            <p>
              {session.mediaSource.kind.toLowerCase()} •{" "}
              {session.mediaSource.format}
            </p>
          </article>

          <article className="session-overview-card">
            <span className="detail-label">Scanned</span>
            <strong>{formatTimestamp(session.createdAt)}</strong>
            <p>Updated {formatTimestamp(session.updatedAt)}</p>
          </article>

          <article className="session-overview-card">
            <span className="detail-label">Analyzer</span>
            <strong>
              {formatAnalysisProvenanceState(session.analysisProvenance.state)}
            </strong>
            <p>
              {session.analysisProvenance.transcriptSource} transcript •{" "}
              {session.analysisProvenance.audioSignalSource} audio
            </p>
          </article>

          <article
            className={`session-overview-card coverage ${analysisCoverageTone(session.analysisCoverage)}`}
          >
            <div className="section-title-row">
              <span className="detail-label">Scan quality</span>
              <span
                className={`analysis-coverage-pill ${analysisCoverageTone(session.analysisCoverage)}`}
              >
                {formatAnalysisCoverageBand(session.analysisCoverage.band)}
              </span>
            </div>
            <strong>{sessionQualitySummary}</strong>
            <p>{session.analysisCoverage.note}</p>
            {session.analysisCoverage.flags.length > 0 ? (
              <div className="analysis-coverage-flag-row">
                {session.analysisCoverage.flags.map((flag) => (
                  <span className="analysis-coverage-flag" key={flag}>
                    {formatAnalysisCoverageFlag(flag)}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        </div>

        {session.mediaSource.ingestNotes.length > 0 ? (
          <article className="session-overview-alert">
            <span className="detail-label">Scan notes</span>
            <ul className="plain-list session-overview-note-list">
              {session.mediaSource.ingestNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>
        ) : null}

        {session.analysisProvenance.notes.length > 0 ? (
          <article className="session-overview-alert">
            <span className="detail-label">Analyzer provenance</span>
            <ul className="plain-list session-overview-note-list">
              {session.analysisProvenance.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>
        ) : null}
      </details>

      {candidateCount === 0 ? (
        <article className="session-overview-alert empty">
          <span className="detail-label">No strong moments found</span>
          <p>
            Review the scan notes, confirm the input file, or try a different
            reference profile.
          </p>
        </article>
      ) : null}
    </section>
  );
}

function formatAnalysisProvenanceState(
  state: ProjectSession["analysisProvenance"]["state"],
): string {
  if (state === "REAL") {
    return "Real local signals";
  }

  if (state === "MOCK") {
    return "Mock/demo signals";
  }

  if (state === "FAILED") {
    return "Signal analysis failed";
  }

  return "Partial local signals";
}

function formatLifecycleStatus(status: ProjectSession["status"]): string {
  if (status === "REVIEWING") {
    return "Reviewing";
  }

  if (status === "ANALYZING") {
    return "Analyzing";
  }

  if (status === "READY") {
    return "Ready";
  }

  return "Idle";
}

function formatTimestamp(value: string): string {
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
