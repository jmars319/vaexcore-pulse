import type {
  CandidateWindow,
  ConfidenceBand,
  ContentProfile,
  ProfileMatchingSummary,
  ProfilePresentationMode,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";
import {
  describeCandidatePlainly,
  resolveCandidateProfileMatch,
  resolveCandidateLabel,
  type ReviewQueueMode,
} from "@vaexcore/pulse-domain";
import { CandidateCard } from "@vaexcore/pulse-ui";
import { formatSeconds, percentage } from "../lib/format";
import {
  candidateHasReviewRisk,
  formatReviewTagLabel,
  primaryReviewTag,
} from "../lib/reviewTags";

type CandidateQueueProps = {
  candidates: CandidateWindow[];
  selectedCandidateId: string | null;
  decisionsByCandidateId: Record<string, ReviewDecision>;
  profile: ContentProfile;
  profileMatchingSummary: ProfileMatchingSummary;
  pendingCount: number;
  reviewedCount: number;
  totalCandidateCount: number;
  matchingCandidateCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  bandFilter: ConfidenceBand | "ALL";
  onBandFilterChange: (value: ConfidenceBand | "ALL") => void;
  reviewQueueMode: ReviewQueueMode;
  onReviewQueueModeChange: (value: ReviewQueueMode) => void;
  presentationMode: ProfilePresentationMode;
  onPresentationModeChange: (value: ProfilePresentationMode) => void;
  selectedCandidateVisibleInQueue: boolean;
  onSelectCandidate: (candidateId: string) => void;
  onPreviewCandidate: (candidateId: string) => void;
  onSelectNextPending: () => void;
  isStrongMatchFallback: boolean;
};

const filters: Array<ConfidenceBand | "ALL"> = [
  "ALL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "EXPERIMENTAL",
];

export function CandidateQueue({
  candidates,
  selectedCandidateId,
  decisionsByCandidateId,
  profile,
  profileMatchingSummary,
  pendingCount,
  reviewedCount,
  totalCandidateCount,
  matchingCandidateCount,
  searchValue,
  onSearchChange,
  bandFilter,
  onBandFilterChange,
  reviewQueueMode,
  onReviewQueueModeChange,
  presentationMode,
  onPresentationModeChange,
  selectedCandidateVisibleInQueue,
  onSelectCandidate,
  onPreviewCandidate,
  onSelectNextPending,
  isStrongMatchFallback,
}: CandidateQueueProps) {
  const hiddenReviewedCount =
    reviewQueueMode === "ONLY_PENDING"
      ? Math.max(matchingCandidateCount - candidates.length, 0)
      : 0;

  return (
    <section className="queue-panel glass-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Review queue</p>
          <h2>Suggested moments</h2>
          <p className="queue-summary-copy">
            {reviewQueueMode === "ONLY_PENDING"
              ? `${candidates.length} undecided right now • ${hiddenReviewedCount} already decided and hidden`
              : `${pendingCount} undecided • ${reviewedCount} already decided`}
          </p>
        </div>
        <div className="queue-tools">
          <span className="queue-count">
            {candidates.length} visible of {totalCandidateCount}
          </span>
          <button
            className="button-secondary queue-action"
            disabled={pendingCount === 0}
            onClick={onSelectNextPending}
            type="button"
          >
            Next undecided
          </button>
        </div>
      </div>

      <details className="internal-details">
        <summary className="internal-details-summary">
          <span>Find or filter moments</span>
          <span className="queue-count">
            {searchValue ||
            bandFilter !== "ALL" ||
            reviewQueueMode === "ALL" ||
            presentationMode !== "ALL_CANDIDATES"
              ? "Active"
              : "Optional"}
          </span>
        </summary>

        <label className="search-block">
          <span className="input-label">Search moments</span>
          <input
            aria-label="Search moments"
            className="search-input"
            id="review-search-input"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search transcript, labels, or descriptions"
            type="search"
            value={searchValue}
          />
        </label>

        <div className="filter-row">
          <button
            className={
              reviewQueueMode === "ONLY_PENDING"
                ? "filter-chip active"
                : "filter-chip"
            }
            disabled={pendingCount === 0}
            onClick={() => onReviewQueueModeChange("ONLY_PENDING")}
            type="button"
          >
            Needs review ({pendingCount})
          </button>
          <button
            className={
              reviewQueueMode === "ALL" ? "filter-chip active" : "filter-chip"
            }
            onClick={() => onReviewQueueModeChange("ALL")}
            type="button"
          >
            All moments ({totalCandidateCount})
          </button>
        </div>

        <div className="filter-row">
          <button
            className={
              presentationMode === "ALL_CANDIDATES"
                ? "filter-chip active"
                : "filter-chip"
            }
            onClick={() => onPresentationModeChange("ALL_CANDIDATES")}
            type="button"
          >
            Everything
          </button>
          <button
            className={
              presentationMode === "PROFILE_VIEW"
                ? "filter-chip active"
                : "filter-chip"
            }
            onClick={() => onPresentationModeChange("PROFILE_VIEW")}
            type="button"
          >
            Match this profile
          </button>
          <button
            className={
              presentationMode === "STRONG_MATCHES"
                ? "filter-chip active"
                : "filter-chip"
            }
            onClick={() => onPresentationModeChange("STRONG_MATCHES")}
            type="button"
          >
            Strongest profile fits
          </button>
        </div>

        <div className="queue-profile-context">
          <p className="queue-summary-copy">
            {profile.name} • {profileMatchingSummary.note}
          </p>
          {isStrongMatchFallback ? (
            <p className="queue-summary-copy">
              Add more examples to make this filter useful. For now, all
              suggested moments are shown.
            </p>
          ) : null}
        </div>

        <div className="filter-row">
          {filters.map((filterValue) => (
            <button
              key={filterValue}
              className={
                filterValue === bandFilter
                  ? "filter-chip active"
                  : "filter-chip"
              }
              onClick={() => onBandFilterChange(filterValue)}
              type="button"
            >
              {filterValue}
            </button>
          ))}
        </div>
      </details>

      {!selectedCandidateVisibleInQueue ? (
        <p className="queue-summary-copy">
          The current moment is hidden by your current filters, but the detail
          panel stays locked on it until you choose another one.
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <article className="queue-empty-state">
          <span className="detail-label">Queue state</span>
          <p>
            {totalCandidateCount === 0
              ? "No moments found in this video."
              : reviewQueueMode === "ONLY_PENDING"
                ? "Nothing still needing review matches the current search and filters."
                : "No moments match the current search and filters."}
          </p>
        </article>
      ) : (
        <div className="candidate-list">
          {candidates.map((candidate, index) => {
            const decision = decisionsByCandidateId[candidate.id];
            const isSelected = candidate.id === selectedCandidateId;
            const reviewTag = primaryReviewTag(candidate);
            const profileMatch = resolveCandidateProfileMatch(
              candidate,
              profile,
            );
            const plainDescription = describeCandidatePlainly(candidate);
            const profileMatchLabel =
              presentationMode === "ALL_CANDIDATES"
                ? null
                : formatProfileMatchBadge(profileMatch);

            return (
              <div
                className={
                  candidateHasReviewRisk(candidate)
                    ? "candidate-list-item demoted"
                    : "candidate-list-item"
                }
                key={candidate.id}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <CandidateCard
                  candidate={candidate}
                  footerText={`Confidence ${percentage(candidate.scoreEstimate)} • ${formatSeconds(candidate.candidateWindow.startSeconds)} to ${formatSeconds(candidate.candidateWindow.endSeconds)} • ${formatDecisionState(decision?.action)}${profileMatchLabel ? ` • ${profileMatchLabel}` : ""}${reviewTag ? ` • ${formatReviewTagLabel(reviewTag)}` : ""}`}
                  label={resolveCandidateLabel(candidate, decision)}
                  onSelect={() => onSelectCandidate(candidate.id)}
                  secondaryText={`${plainDescription.summary}${plainDescription.detail ? ` ${plainDescription.detail}` : ""}`}
                  selected={isSelected}
                />
                <div className="candidate-list-item-actions">
                  <button
                    className="button-secondary candidate-preview-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectCandidate(candidate.id);
                      onPreviewCandidate(candidate.id);
                    }}
                    type="button"
                  >
                    View moment
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatProfileMatchBadge(
  profileMatch: ReturnType<typeof resolveCandidateProfileMatch>,
): string {
  if (profileMatch.status !== "HEURISTIC") {
    return "No profile match yet";
  }

  if (profileMatch.strength === "STRONG") {
    return "Strong profile fit";
  }

  if (profileMatch.strength === "POSSIBLE") {
    return "Possible profile fit";
  }

  return "Weak profile fit";
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
