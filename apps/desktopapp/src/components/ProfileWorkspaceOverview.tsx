import type { ClipProfile } from "@vaexcore/pulse-shared-types";
import { formatTimestamp } from "../lib/profileWorkspacePresentation";

type ProfileWorkspaceOverviewProps = {
  error: string | null;
  selectedProfile: ClipProfile | null;
  selectedProfileClipReferenceCount: number;
  selectedProfileEditReferenceCount: number;
  selectedProfileReferenceCount: number;
  selectedProfileUsableReferenceCount: number;
};

export function ProfileWorkspaceOverview({
  error,
  selectedProfile,
  selectedProfileClipReferenceCount,
  selectedProfileEditReferenceCount,
  selectedProfileReferenceCount,
  selectedProfileUsableReferenceCount,
}: ProfileWorkspaceOverviewProps) {
  return (
    <>
      <article className="utility-block">
        {selectedProfile ? (
          <>
            <div className="panel-header">
              <div>
                <span className="detail-label">Selected profile</span>
                <h2>{selectedProfile.name}</h2>
                <p>
                  {selectedProfile.description ||
                    "No description yet. Add a few examples to make this profile more useful."}
                </p>
              </div>
              <div className="profile-summary-badges">
                <span className="session-state-pill active-session">
                  {selectedProfile.state}
                </span>
                <span className="session-state-pill next-target">
                  {selectedProfile.source === "SYSTEM" ? "System" : "User"}
                </span>
              </div>
            </div>

            <div className="analysis-summary-grid analysis-summary-grid-compact">
              <article className="analysis-summary-card">
                <span className="detail-label">Saved examples</span>
                <strong>{selectedProfileReferenceCount} total</strong>
                <p>
                  Add clips and finished edits that feel like the moments you
                  want to keep.
                </p>
              </article>
              <article className="analysis-summary-card">
                <span className="detail-label">Example mix</span>
                <strong>
                  {selectedProfileClipReferenceCount} clips •{" "}
                  {selectedProfileEditReferenceCount} edits
                </strong>
                <p>
                  Clips capture quick moments. Finished edits show what made the
                  final cut.
                </p>
              </article>
              <article className="analysis-summary-card">
                <span className="detail-label">Ready examples</span>
                <strong>
                  {selectedProfileUsableReferenceCount} ready examples
                </strong>
                <p>Use clips or finished edits to improve future scans.</p>
              </article>
              <article className="analysis-summary-card">
                <span className="detail-label">Last updated</span>
                <strong>{formatTimestamp(selectedProfile.updatedAt)}</strong>
                <p>Created {formatTimestamp(selectedProfile.createdAt)}</p>
              </article>
            </div>
          </>
        ) : (
          <>
            <span className="detail-label">Selected profile</span>
            <h2>No profile selected</h2>
            <p>
              Create a profile or choose one from the library to start adding
              examples.
            </p>
          </>
        )}
      </article>

      {error ? <p className="analysis-error">{error}</p> : null}

      <article className="utility-block">
        <div className="panel-header">
          <div>
            <span className="detail-label">Start here</span>
            <h2>Build this profile with real examples</h2>
            <p>Start with a few clips. Add a finished edit if you have one.</p>
          </div>
        </div>

        {selectedProfile ? (
          <ol className="plain-list ordered reference-step-list">
            <li>
              Add a few short clips that capture the kinds of moments you want
              more of.
            </li>
            <li>
              Add one finished edit to show Pulse what usually makes the final
              cut.
            </li>
            <li>
              Use the media library later only if you need to save more files.
            </li>
          </ol>
        ) : (
          <p className="queue-summary-copy">
            Choose or create a profile first. Then add clips and edited videos
            as examples.
          </p>
        )}
      </article>
    </>
  );
}
