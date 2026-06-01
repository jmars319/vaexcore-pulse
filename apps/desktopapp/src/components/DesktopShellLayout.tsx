import type { ReactNode } from "react";
import { LayoutShell, VaexcorePulseLogo } from "@vaexcore/pulse-ui";
import type { ProjectSessionSummary } from "@vaexcore/pulse-shared-types";
import { DesktopAside } from "./DesktopAside";
import { ShellHeader } from "./ShellHeader";
import { desktopPages, type DesktopPage } from "../lib/desktopNavigation";
import { openSettingsWindowFromUi } from "../lib/settingsWindowBehavior";
import type { SuiteAppStatus, SuiteSession } from "../lib/suitePresentation";

type DesktopShellLayoutProps = {
  acceptedCount: number;
  activePage: DesktopPage;
  activeSessionReviewStateLabel: string | null;
  children: ReactNode;
  currentProfileLabel: string;
  currentSessionLabel: string;
  nextPendingSession: ProjectSessionSummary | null;
  onLaunchSuite: () => void;
  onPickMedia: () => void;
  onSelectPage: (page: DesktopPage) => void;
  pendingReviewCount: number;
  pendingSessionCount: number;
  projectSummaries: ProjectSessionSummary[];
  rejectedCount: number;
  selectedCandidateTranscriptSnippet: string | null;
  selectedMediaPath: string;
  sessionCandidateCount: number;
  suiteLaunchStatus: string | null;
  suiteSession: SuiteSession | null;
  suiteStatus: SuiteAppStatus[];
};

export function DesktopShellLayout({
  acceptedCount,
  activePage,
  activeSessionReviewStateLabel,
  children,
  currentProfileLabel,
  currentSessionLabel,
  nextPendingSession,
  onLaunchSuite,
  onPickMedia,
  onSelectPage,
  pendingReviewCount,
  pendingSessionCount,
  projectSummaries,
  rejectedCount,
  selectedCandidateTranscriptSnippet,
  selectedMediaPath,
  sessionCandidateCount,
  suiteLaunchStatus,
  suiteSession,
  suiteStatus,
}: DesktopShellLayoutProps) {
  return (
    <LayoutShell
      activeId={activePage}
      appName="vaexcore pulse"
      aside={
        <DesktopAside
          acceptedCount={acceptedCount}
          activePage={activePage}
          nextPendingSession={nextPendingSession}
          pendingReviewCount={pendingReviewCount}
          pendingSessionCount={pendingSessionCount}
          projectSummaries={projectSummaries}
          rejectedCount={rejectedCount}
          selectedCandidateTranscriptSnippet={
            selectedCandidateTranscriptSnippet
          }
          selectedMediaPath={selectedMediaPath}
          sessionCandidateCount={sessionCandidateCount}
          suiteSession={suiteSession}
          suiteStatus={suiteStatus}
        />
      }
      brandMark={<VaexcorePulseLogo />}
      navItems={desktopPages}
      onSelect={(pageId) => onSelectPage(pageId as DesktopPage)}
      sidebarActions={
        <button
          aria-label="Open Settings"
          className="settings-icon-button"
          onClick={() => openSettingsWindowFromUi()}
          title="Open Settings"
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            viewBox="0 0 24 24"
            width="18"
          >
            <path
              d="M12 8.2a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.04.04a1.95 1.95 0 0 1-2.76 2.76l-.04-.04a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.96 1.46v.12a1.95 1.95 0 0 1-3.9 0v-.07a1.6 1.6 0 0 0-1.05-1.5 1.6 1.6 0 0 0-1.77.32l-.04.04a1.95 1.95 0 0 1-2.76-2.76l.04-.04A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.46-.96h-.12a1.95 1.95 0 0 1 0-3.9h.07a1.6 1.6 0 0 0 1.5-1.05 1.6 1.6 0 0 0-.32-1.77l-.04-.04a1.95 1.95 0 0 1 2.76-2.76l.04.04a1.6 1.6 0 0 0 1.77.32h.01a1.6 1.6 0 0 0 .96-1.46v-.12a1.95 1.95 0 0 1 3.9 0v.07a1.6 1.6 0 0 0 .96 1.46 1.6 1.6 0 0 0 1.77-.32l.04-.04a1.95 1.95 0 0 1 2.76 2.76l-.04.04a1.6 1.6 0 0 0-.32 1.77v.01a1.6 1.6 0 0 0 1.46.96h.12a1.95 1.95 0 0 1 0 3.9h-.07a1.6 1.6 0 0 0-1.5 1.05Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      }
      subtitle={
        activePage === "suite"
          ? "Watch the local suite session, shared timeline, and connected app presence."
          : "Scan long videos, review likely moments quickly, and build references from your own edits."
      }
      title={activePage === "suite" ? "Suite Workspace" : "Review Workspace"}
    >
      {activePage === "suite" ? null : (
        <ShellHeader
          acceptedCount={acceptedCount}
          activeSessionStateLabel={
            activeSessionReviewStateLabel ??
            (selectedMediaPath
              ? "Video staged for scanning"
              : "Choose a video or reopen a saved session.")
          }
          currentProfileLabel={currentProfileLabel}
          currentSessionLabel={currentSessionLabel}
          onLaunchSuite={onLaunchSuite}
          onPickMedia={onPickMedia}
          pendingCount={pendingReviewCount}
          rejectedCount={rejectedCount}
          selectedMediaPath={selectedMediaPath || "No video selected yet."}
          suiteLaunchStatus={suiteLaunchStatus}
          totalCount={sessionCandidateCount}
        />
      )}
      {children}
    </LayoutShell>
  );
}
