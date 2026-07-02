import type {
  CandidateWindow,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";
import { resolveCandidateProfileMatch } from "@vaexcore/pulse-domain";
import {
  ConfidenceBadge,
  ReviewControls,
  TranscriptSnippetBlock,
} from "@vaexcore/pulse-ui";
import { formatLongTime, percentage } from "../lib/format";
import { formatReviewTagLabel } from "../lib/reviewTags";

type CandidateProfileMatch = ReturnType<typeof resolveCandidateProfileMatch>;
type CandidatePlainDescription = {
  summary: string;
  detail?: string | null;
  signalPhrases: string[];
};

export function CandidateDetailEmptyState({
  candidateCount,
}: {
  candidateCount: number;
}) {
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

export function CandidateDetailHeader({
  candidate,
  decision,
  candidateIndex,
  candidateCount,
  pendingCount,
  selectedCandidateVisibleInQueue,
}: {
  candidate: CandidateWindow;
  decision: ReviewDecision | undefined;
  candidateIndex: number;
  candidateCount: number;
  pendingCount: number;
  selectedCandidateVisibleInQueue: boolean;
}) {
  return (
    <>
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

      {candidate.duplicateOfCandidateId ||
      candidate.nearDuplicateCandidateIds.length > 0 ? (
        <div className="review-tag-row">
          {candidate.duplicateOfCandidateId ? (
            <span className="review-tag-pill">
              Duplicate of {candidate.duplicateOfCandidateId}
            </span>
          ) : null}
          {candidate.nearDuplicateCandidateIds.length > 0 ? (
            <span className="review-tag-pill">
              {candidate.nearDuplicateCandidateIds.length} nearby duplicate
              {candidate.nearDuplicateCandidateIds.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function CandidateOverviewCards({
  activeSegment,
  candidate,
  plainDescription,
}: {
  activeSegment: Pick<
    CandidateWindow["suggestedSegment"],
    "startSeconds" | "endSeconds"
  >;
  candidate: CandidateWindow;
  plainDescription: CandidatePlainDescription;
}) {
  return (
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

      <article className="detail-card">
        <span className="detail-label">Quality signals</span>
        <strong>{formatQualitySummary(candidate)}</strong>
        <p>
          Rank adjustment {candidate.rankAdjustment > 0 ? "+" : ""}
          {candidate.rankAdjustment.toFixed(0)}
        </p>
      </article>
    </div>
  );
}

function formatQualitySummary(candidate: CandidateWindow): string {
  const audioActivity = candidate.qualitySignals.audioActivity;
  const speechDensity = candidate.qualitySignals.speechDensity;
  if (audioActivity === undefined && speechDensity === undefined) {
    return "No quality signals saved";
  }

  return [
    audioActivity === undefined ? null : `Audio ${percentage(audioActivity)}`,
    speechDensity === undefined ? null : `Speech ${percentage(speechDensity)}`,
  ]
    .filter(Boolean)
    .join(" • ");
}

export function CandidatePreviewPanel({
  canPreview,
  onPreviewDetectedMoment,
  onPreviewSuggestedSegment,
}: {
  canPreview: boolean;
  onPreviewDetectedMoment: () => void;
  onPreviewSuggestedSegment: () => void;
}) {
  return (
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
  );
}

export function CandidateDecisionPanel({
  decision,
  isSavingReview,
  labelDraft,
  onAccept,
  onDefer,
  onExpandSetup,
  onLabelChange,
  onReject,
  onSaveLabel,
  onSelectNextPending,
  onSelectNextVisible,
  onSelectPreviousVisible,
  pendingCount,
  reviewError,
  visibleCandidateCount,
}: {
  decision: ReviewDecision | undefined;
  isSavingReview: boolean;
  labelDraft: string;
  onAccept: () => void;
  onDefer: () => void;
  onExpandSetup: () => void;
  onLabelChange: (value: string) => void;
  onReject: () => void;
  onSaveLabel: () => void;
  onSelectNextPending: () => void;
  onSelectNextVisible: () => void;
  onSelectPreviousVisible: () => void;
  pendingCount: number;
  reviewError: string | null;
  visibleCandidateCount: number;
}) {
  return (
    <section className="review-panel review-panel-primary">
      <div className="section-title-row">
        <h3>Your decision</h3>
        <span className="review-status-copy">
          {decision?.action === "ACCEPT"
            ? "Marked to keep"
            : decision?.action === "REJECT"
              ? "Marked to skip"
              : decision?.action === "DEFER"
                ? "Deferred for later"
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
          disabled={isSavingReview}
          onClick={onDefer}
          type="button"
        >
          Defer
        </button>
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
  );
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

  if (action === "DEFER") {
    return "Deferred";
  }

  return "Undecided";
}
