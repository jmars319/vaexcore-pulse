import type {
  CandidateWindow,
  ContentProfile,
  ProfileMatchingSummary,
  ReviewDecision,
  TranscriptChunk,
} from "@vaexcore/pulse-shared-types";
import {
  describeReasonCodePlainly,
  resolveCandidateProfileMatch,
} from "@vaexcore/pulse-domain";
import { percentage } from "../lib/format";
import { TranscriptContextPeek } from "./TranscriptContextPeek";

type CandidateProfileMatch = ReturnType<typeof resolveCandidateProfileMatch>;

export function CandidateContextDetails({
  candidate,
  profile,
  profileMatch,
  profileMatchingSummary,
  transcript,
}: {
  candidate: CandidateWindow;
  profile: ContentProfile;
  profileMatch: CandidateProfileMatch;
  profileMatchingSummary: ProfileMatchingSummary;
  transcript: TranscriptChunk[];
}) {
  return (
    <details className="utility-block internal-details">
      <summary className="internal-details-summary">
        <span>Context and reference details</span>
        <span className="queue-count">Optional</span>
      </summary>

      <article className="detail-card review-context-card">
        <span className="detail-label">Reference context</span>
        <strong>{profile.name}</strong>
        <p>{profileMatch.note}</p>
        <p>
          Profile fit {formatProfileMatchStatus(profileMatch.status)} •{" "}
          {profileMatchingSummary.usableLocalExampleCount} saved example
          {profileMatchingSummary.usableLocalExampleCount === 1 ? "" : "s"}{" "}
          ready • {profileMatchingSummary.referenceOnlyExampleCount} link-only
          example
          {profileMatchingSummary.referenceOnlyExampleCount === 1 ? "" : "s"}
        </p>
        {profileMatch.similarityScore !== undefined ? (
          <p>
            Similarity {percentage(profileMatch.similarityScore)} • compared
            with {profileMatch.comparedExampleCount} example
            {profileMatch.comparedExampleCount === 1 ? "" : "s"}
          </p>
        ) : null}
      </article>

      <TranscriptContextPeek candidate={candidate} transcript={transcript} />
    </details>
  );
}

export function CandidateScoreBreakdown({
  candidate,
}: {
  candidate: CandidateWindow;
}) {
  return (
    <details className="breakdown-panel internal-details">
      <summary className="internal-details-summary">
        <span>More suggestion detail</span>
        <span className="score-pill">
          {percentage(candidate.scoreEstimate)}
        </span>
      </summary>

      <div className="analysis-coverage-flag-row">
        {candidate.reasonCodes.map((reasonCode) => (
          <span className="analysis-coverage-flag" key={reasonCode}>
            {describeReasonCodePlainly(reasonCode)}
          </span>
        ))}
      </div>

      <div className="breakdown-list">
        {candidate.scoreBreakdown.map((item) => (
          <article
            className="breakdown-item"
            key={`${candidate.id}-${item.reasonCode}`}
          >
            <div className="breakdown-copy">
              <strong>{item.label}</strong>
              <span>{describeReasonCodePlainly(item.reasonCode)}</span>
            </div>
            <div className="breakdown-meter">
              <div
                className={
                  item.direction === "NEGATIVE"
                    ? "breakdown-fill negative"
                    : "breakdown-fill"
                }
                style={{
                  width: `${Math.min(Math.abs(item.contribution) * 100, 100)}%`,
                }}
              />
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

export function CandidateProfileFitPanel({
  profileMatch,
}: {
  profileMatch: CandidateProfileMatch;
}) {
  if (
    profileMatch.supportingFactors.length === 0 &&
    profileMatch.limitingFactors.length === 0
  ) {
    return null;
  }

  return (
    <section className="breakdown-panel">
      <div className="section-title-row">
        <h3>Why this fits the current profile</h3>
        <span className="eyebrow">
          {profileMatch.method === "LOCAL_FILE_HEURISTIC"
            ? "Local reference match"
            : "Match unavailable"}
        </span>
      </div>

      {profileMatch.supportingFactors.length > 0 ? (
        <div className="plain-list">
          {profileMatch.supportingFactors.map((factor) => (
            <p key={factor}>{factor}</p>
          ))}
        </div>
      ) : null}

      {profileMatch.limitingFactors.length > 0 ? (
        <div className="plain-list">
          {profileMatch.limitingFactors.map((factor) => (
            <p key={factor}>{factor}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function CandidateAdjustmentPanel({
  isSavingReview,
  labelDraft,
  onExpandResolution,
  onExpandSetup,
  onLabelChange,
  onReturnToProjects,
  onSaveLabel,
  pendingCount,
}: {
  isSavingReview: boolean;
  labelDraft: string;
  onExpandResolution: () => void;
  onExpandSetup: () => void;
  onLabelChange: (value: string) => void;
  onReturnToProjects: () => void;
  onSaveLabel: () => void;
  pendingCount: number;
}) {
  return (
    <details className="utility-block internal-details">
      <summary className="internal-details-summary">
        <span>Adjust clip or rename</span>
        <span className="queue-count">Optional</span>
      </summary>

      <div className="action-row">
        <button
          className="button-secondary"
          disabled={isSavingReview}
          onClick={onExpandSetup}
          type="button"
        >
          Lengthen opening by 2s
        </button>
        <button
          className="button-secondary"
          disabled={isSavingReview}
          onClick={onExpandResolution}
          type="button"
        >
          Lengthen ending by 2s
        </button>
        {pendingCount > 0 ? (
          <button
            className="button-secondary"
            onClick={onReturnToProjects}
            type="button"
          >
            Return to backlog
          </button>
        ) : null}
      </div>

      <div className="vcp-controls-row vcp-controls-row-label review-label-editor">
        <input
          disabled={isSavingReview}
          onChange={(event) => onLabelChange(event.target.value)}
          type="text"
          value={labelDraft}
        />
        <button disabled={isSavingReview} onClick={onSaveLabel} type="button">
          Rename moment
        </button>
      </div>
    </details>
  );
}

function formatProfileMatchStatus(
  status: ReturnType<typeof resolveCandidateProfileMatch>["status"],
): string {
  if (status === "EXAMPLE_COMPARISON") {
    return "Compared with examples";
  }

  if (status === "HEURISTIC") {
    return "Checked against examples";
  }

  if (status === "PLACEHOLDER") {
    return "Needs examples";
  }

  return "Not checked";
}
