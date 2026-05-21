import { useState } from "react";
import type {
  CandidateWindow,
  ContentProfile,
  ProfileMatchingSummary,
  ProjectSessionSummary,
  ReviewDecision,
  TranscriptChunk,
} from "@vaexcore/pulse-shared-types";
import {
  describeCandidatePlainly,
  describeReasonCodePlainly,
  resolveCandidateProfileMatch,
} from "@vaexcore/pulse-domain";
import {
  ConfidenceBadge,
  ReviewControls,
  TranscriptSnippetBlock,
} from "@vaexcore/pulse-ui";
import { formatLongTime, percentage } from "../lib/format";
import { formatReviewTagLabel } from "../lib/reviewTags";
import { TranscriptContextPeek } from "./TranscriptContextPeek";

type CandidateDetailProps = {
  candidate: CandidateWindow | null;
  decision: ReviewDecision | undefined;
  profile: ContentProfile;
  transcript: TranscriptChunk[];
  exportPreview: string;
  edlPreview: string;
  jsonPreview: string;
  candidateIndex: number;
  candidateCount: number;
  pendingCount: number;
  nextPendingSession: ProjectSessionSummary | null;
  profileMatchingSummary: ProfileMatchingSummary;
  selectedCandidateVisibleInQueue: boolean;
  visibleCandidateCount: number;
  canPreview: boolean;
  canExportAcceptedToStudio: boolean;
  onAccept: () => void;
  onReject: () => void;
  onExportAcceptedToStudio: () => void;
  onExpandSetup: () => void;
  onExpandResolution: () => void;
  onPreviewDetectedMoment: () => void;
  onPreviewSuggestedSegment: () => void;
  onOpenNextPendingSession: () => void;
  onSelectPreviousVisible: () => void;
  onSelectNextVisible: () => void;
  onSelectNextPending: () => void;
  onLabelChange: (value: string) => void;
  labelDraft: string;
  onSaveLabel: () => void;
  onReturnToProjects: () => void;
  isCurrentCandidateSentToStudio: boolean;
  isExportingToStudio: boolean;
  isSavingReview: boolean;
  reviewError: string | null;
  studioRecordingExportHistory: {
    exportedAt: string;
    formats: string[];
    acceptedCount: number;
    pulseSessionId: string;
    pulseSessionTitle: string;
  } | null;
  studioExportStatus: string | null;
};

export function CandidateDetail({
  candidate,
  decision,
  profile,
  transcript,
  exportPreview,
  edlPreview,
  jsonPreview,
  candidateIndex,
  candidateCount,
  pendingCount,
  nextPendingSession,
  profileMatchingSummary,
  selectedCandidateVisibleInQueue,
  visibleCandidateCount,
  canPreview,
  canExportAcceptedToStudio,
  onAccept,
  onReject,
  onExportAcceptedToStudio,
  onExpandSetup,
  onExpandResolution,
  onPreviewDetectedMoment,
  onPreviewSuggestedSegment,
  onOpenNextPendingSession,
  onSelectPreviousVisible,
  onSelectNextVisible,
  onSelectNextPending,
  onLabelChange,
  labelDraft,
  onSaveLabel,
  onReturnToProjects,
  isCurrentCandidateSentToStudio,
  isExportingToStudio,
  isSavingReview,
  reviewError,
  studioRecordingExportHistory,
  studioExportStatus,
}: CandidateDetailProps) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  if (!candidate) {
    return (
      <section className="detail-panel glass-panel empty-state">
        <p className="eyebrow">Selected moment</p>
        <h2>
          {candidateCount === 0 ? "No moments found" : "No moment selected"}
        </h2>
        <p>
          {candidateCount === 0
            ? "No clear moments were found in this session."
            : "Select a moment to see why it was suggested and where the clip starts and ends."}
        </p>
      </section>
    );
  }

  const activeSegment = decision?.adjustedSegment ?? candidate.suggestedSegment;
  const profileMatch = resolveCandidateProfileMatch(candidate, profile);
  const plainDescription = describeCandidatePlainly(candidate);

  async function handleCopyExport(
    format: "timestamps" | "json" | "edl",
    value: string,
  ) {
    if (!value) {
      setCopyFeedback(`No ${format} export is ready yet.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(
        format === "timestamps"
          ? "Copied timestamps."
          : format === "edl"
            ? "Copied EDL."
            : "Copied JSON export.",
      );
    } catch {
      setCopyFeedback("Copy failed on this machine.");
    }
  }

  return (
    <section className="detail-panel glass-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Selected moment</p>
          <h2>{decision?.label ?? candidate.editableLabel}</h2>
          <p className="detail-progress-copy">
            Moment {candidateIndex + 1} of {candidateCount} • {pendingCount}{" "}
            undecided
          </p>
          {!selectedCandidateVisibleInQueue ? (
            <p className="detail-mode-copy">
              This moment is hidden by the current queue filters.
            </p>
          ) : null}
        </div>
        <div className="detail-header-meta">
          <span className="decision-pill">
            {formatDecisionState(decision?.action)}
          </span>
          <ConfidenceBadge band={candidate.confidenceBand} />
        </div>
      </div>

      {candidate.reviewTags.length > 0 ? (
        <div className="review-tag-row">
          {candidate.reviewTags.map((reviewTag) => (
            <span className="review-tag-pill" key={reviewTag}>
              {formatReviewTagLabel(reviewTag)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="detail-grid">
        <article className="detail-card">
          <span className="detail-label">Detected moment</span>
          <strong>
            {formatLongTime(candidate.candidateWindow.startSeconds)} to{" "}
            {formatLongTime(candidate.candidateWindow.endSeconds)}
          </strong>
          <TranscriptSnippetBlock
            heading="Transcript snippet"
            text={candidate.transcriptSnippet}
          />
        </article>

        <article className="detail-card">
          <span className="detail-label">Suggested clip</span>
          <strong>
            {formatLongTime(activeSegment.startSeconds)} to{" "}
            {formatLongTime(activeSegment.endSeconds)}
          </strong>
          <p>
            Lead-in {candidate.suggestedSegment.setupPaddingSeconds}s • Ending{" "}
            {candidate.suggestedSegment.resolutionPaddingSeconds}s
          </p>
        </article>

        <article className="detail-card narrative-card">
          <span className="detail-label">Why this was suggested</span>
          <strong>{plainDescription.summary}</strong>
          <p>
            {plainDescription.detail ??
              "Enough signs lined up to make this worth reviewing."}
          </p>
          {plainDescription.signalPhrases.length > 0 ? (
            <div className="analysis-coverage-flag-row">
              {plainDescription.signalPhrases.map((phrase) => (
                <span className="analysis-coverage-flag" key={phrase}>
                  {phrase}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      </div>

      <section className="review-panel preview-launch-panel">
        <div className="section-title-row">
          <h3>Watch this moment</h3>
          <span className="review-status-copy">
            Open the source video at this exact spot.
          </span>
        </div>
        <div className="action-row">
          <button
            className="button-secondary"
            disabled={!canPreview}
            onClick={onPreviewSuggestedSegment}
            type="button"
          >
            View suggested clip
          </button>
          <button
            className="button-secondary"
            disabled={!canPreview}
            onClick={onPreviewDetectedMoment}
            type="button"
          >
            View detected moment
          </button>
        </div>
      </section>

      <section className="review-panel review-panel-primary">
        <div className="section-title-row">
          <h3>Your decision</h3>
          <span className="review-status-copy">
            {decision?.action === "ACCEPT"
              ? "Marked to keep"
              : decision?.action === "REJECT"
                ? "Marked to skip"
                : "Still undecided"}
          </span>
        </div>

        <ReviewControls
          blockLabel="Quick decision"
          disabled={isSavingReview}
          labelDraft={labelDraft}
          onAccept={onAccept}
          onLabelChange={onLabelChange}
          onReject={onReject}
          onRelabel={onSaveLabel}
          onRetime={onExpandSetup}
          showLabelEditor={false}
          showTimingAction={false}
        />

        <div className="action-row">
          <button
            className="button-secondary"
            disabled={visibleCandidateCount === 0}
            onClick={onSelectPreviousVisible}
            type="button"
          >
            Previous moment
          </button>
          <button
            className="button-secondary"
            disabled={isSavingReview || pendingCount === 0}
            onClick={onSelectNextPending}
            type="button"
          >
            Next undecided
          </button>
          <button
            className="button-secondary"
            disabled={visibleCandidateCount === 0}
            onClick={onSelectNextVisible}
            type="button"
          >
            Next moment
          </button>
        </div>

        {isSavingReview ? (
          <p className="review-status">Saving your decision...</p>
        ) : null}
        {reviewError ? <p className="review-error">{reviewError}</p> : null}
      </section>

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
            {profileMatchingSummary.usableLocalExampleCount === 1
              ? ""
              : "s"}{" "}
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

      {profileMatch.supportingFactors.length > 0 ||
      profileMatch.limitingFactors.length > 0 ? (
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
      ) : null}

      {pendingCount === 0 ? (
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
                    void handleCopyExport("timestamps", exportPreview);
                  }}
                  type="button"
                >
                  Copy timestamps
                </button>
                {jsonPreview ? (
                  <button
                    className="button-secondary"
                    onClick={() => {
                      void handleCopyExport("json", jsonPreview);
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
                      void handleCopyExport("edl", edlPreview);
                    }}
                    type="button"
                  >
                    Copy EDL
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
                  Last Studio export:{" "}
                  {studioRecordingExportHistory.acceptedCount} kept moments as{" "}
                  {studioRecordingExportHistory.formats.join(", ")} on{" "}
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
      ) : null}

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
    </section>
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

function formatDecisionState(
  action: ReviewDecision["action"] | undefined,
): string {
  if (action === "ACCEPT") {
    return "Kept";
  }

  if (action === "REJECT") {
    return "Skipped";
  }

  return "Undecided";
}
