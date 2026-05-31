import type { ClipProfile } from "@vaexcore/pulse-shared-types";

type ProfileWorkspaceSidebarProps = {
  profiles: ClipProfile[];
  selectedProfileId: string | null;
  isLoadingProfiles: boolean;
  isCreatingProfile: boolean;
  profileName: string;
  profileDescription: string;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: () => Promise<void> | void;
  setProfileName: (name: string) => void;
  setProfileDescription: (description: string) => void;
};

export function ProfileWorkspaceSidebar({
  profiles,
  selectedProfileId,
  isLoadingProfiles,
  isCreatingProfile,
  profileName,
  profileDescription,
  onSelectProfile,
  onCreateProfile,
  setProfileName,
  setProfileDescription,
}: ProfileWorkspaceSidebarProps) {
  return (
    <div className="profile-sidebar-stack">
      <article className="utility-block">
        <div className="panel-header">
          <div>
            <span className="detail-label">Clip profiles</span>
            <h2>Profile library</h2>
            <p>
              Save profiles and examples here so future scans know what to look
              for.
            </p>
          </div>
          <span className="queue-count">{profiles.length} profiles</span>
        </div>

        {isLoadingProfiles ? (
          <p className="queue-summary-copy">Loading profiles...</p>
        ) : null}

        <div className="profile-card-list">
          {profiles.map((profile) => {
            const isActive = profile.id === selectedProfileId;
            return (
              <button
                className={
                  isActive ? "profile-list-card active" : "profile-list-card"
                }
                key={profile.id}
                onClick={() => onSelectProfile(profile.id)}
                type="button"
              >
                <div className="profile-list-card-top">
                  <span className="detail-label">
                    {profile.source === "SYSTEM"
                      ? "System profile"
                      : "User profile"}
                  </span>
                  <span className="session-state-pill active-session">
                    {profile.exampleClips.length} examples
                  </span>
                </div>
                <strong>{profile.name}</strong>
                <p>{profile.description || "No description yet."}</p>
              </button>
            );
          })}
        </div>
      </article>

      <article className="utility-block">
        <span className="detail-label">Create profile</span>
        <div className="analysis-form">
          <label className="search-block">
            <span className="input-label">Name</span>
            <input
              className="search-input"
              disabled={isCreatingProfile}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Dry humor"
              type="text"
              value={profileName}
            />
          </label>

          <label className="search-block">
            <span className="input-label">Description</span>
            <textarea
              className="search-input profile-textarea"
              disabled={isCreatingProfile}
              onChange={(event) => setProfileDescription(event.target.value)}
              placeholder="Describe moments you like to keep."
              value={profileDescription}
            />
          </label>

          <div className="action-row">
            <button
              className="button-primary"
              disabled={isCreatingProfile || !profileName.trim()}
              onClick={() => {
                void onCreateProfile();
              }}
              type="button"
            >
              {isCreatingProfile ? "Creating profile..." : "Create profile"}
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
