import type { ClipProfile, ExampleClip } from "@vaexcore/pulse-shared-types";
import {
  formatReferenceKind,
  formatReferenceSummaryLabel,
  formatStatus,
  formatTopReasons,
  formatTranscriptAnchors,
} from "../lib/profileWorkspacePresentation";

type ProfileExamplesListProps = {
  isLoadingExamples: boolean;
  selectedProfile: ClipProfile | null;
  visibleExamples: ExampleClip[];
};

export function ProfileExamplesList({
  isLoadingExamples,
  selectedProfile,
  visibleExamples,
}: ProfileExamplesListProps) {
  return (
    <article className="utility-block">
      <div className="panel-header">
        <div>
          <span className="detail-label">Saved examples</span>
          <h2>Examples in this profile</h2>
        </div>
        {isLoadingExamples ? (
          <span className="queue-count">Refreshing…</span>
        ) : null}
      </div>

      {selectedProfile && visibleExamples.length === 0 ? (
        <p className="queue-summary-copy">
          No saved examples yet for this profile.
        </p>
      ) : null}

      <div className="profile-example-list">
        {visibleExamples.map((example) => (
          <article className="profile-example-card" key={example.id}>
            <div className="profile-example-top">
              <span className="detail-label">
                {formatReferenceKind(example.referenceKind, example.sourceType)}
              </span>
              <span className="session-state-pill active-session">
                {formatStatus(example.status)}
              </span>
            </div>
            <strong>{example.title || "Untitled example"}</strong>
            <p className="profile-example-source">{example.sourceValue}</p>
            {example.note ? <p>{example.note}</p> : null}
            {example.statusDetail ? (
              <p className="queue-summary-copy">{example.statusDetail}</p>
            ) : null}
            {example.featureSummary ? (
              <p className="queue-summary-copy">
                {formatReferenceSummaryLabel(example.referenceKind)} • duration{" "}
                {Math.round(example.featureSummary.durationSeconds)}s
                {example.featureSummary.transcriptAnchorTerms.length > 0
                  ? ` • anchors ${formatTranscriptAnchors(example.featureSummary.transcriptAnchorTerms)}`
                  : ""}{" "}
                • top clues{" "}
                {formatTopReasons(example.featureSummary.topReasonCodes)}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </article>
  );
}
