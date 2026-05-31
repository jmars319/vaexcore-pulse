import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  buildSuiteTimeline,
  formatSuiteLaunchFailure,
  type SuiteAppStatus,
  type SuiteLaunchResult,
  type SuiteSession,
  type SuiteTimelineEvent,
} from "../lib/suitePresentation";
import { isTauriRuntime } from "../lib/tauriRuntime";

export function useSuiteWorkspaceState() {
  const [suiteLaunchStatus, setSuiteLaunchStatus] = useState<string | null>(
    null,
  );
  const [suiteStatus, setSuiteStatus] = useState<SuiteAppStatus[]>([]);
  const [suiteSession, setSuiteSession] = useState<SuiteSession | null>(null);
  const [suiteTimelineEvents, setSuiteTimelineEvents] = useState<
    SuiteTimelineEvent[]
  >([]);
  const [suiteRefreshError, setSuiteRefreshError] = useState<string | null>(
    null,
  );

  const suiteTimeline = useMemo(
    () => buildSuiteTimeline(suiteStatus, suiteTimelineEvents),
    [suiteStatus, suiteTimelineEvents],
  );

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let isSubscribed = true;

    async function refresh() {
      try {
        const [nextStatus, nextSession, nextTimeline] = await Promise.all([
          invoke<SuiteAppStatus[]>("suite_status"),
          invoke<SuiteSession | null>("suite_session"),
          invoke<SuiteTimelineEvent[]>("suite_timeline", { limit: 50 }),
        ]);
        if (!isSubscribed) {
          return;
        }
        setSuiteStatus(nextStatus);
        setSuiteSession(nextSession);
        setSuiteTimelineEvents(nextTimeline);
        setSuiteRefreshError(null);
      } catch (error) {
        if (isSubscribed) {
          setSuiteRefreshError(
            error instanceof Error
              ? error.message
              : "Unable to refresh suite status.",
          );
        }
      }
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 3000);

    return () => {
      isSubscribed = false;
      window.clearInterval(interval);
    };
  }, []);

  async function handleLaunchSuite() {
    setSuiteLaunchStatus("Opening vaexcore apps...");

    if (!isTauriRuntime()) {
      setSuiteLaunchStatus("Launch Suite is available in the desktop app.");
      return;
    }

    try {
      const results = await invoke<SuiteLaunchResult[]>(
        "launch_vaexcore_suite",
      );
      const failed = results.filter((result) => !result.ok);

      setSuiteLaunchStatus(
        failed.length > 0
          ? formatSuiteLaunchFailure(failed)
          : "Launch requested for Studio, Pulse, and Console.",
      );
      const [nextStatus, nextSession, nextTimeline] = await Promise.all([
        invoke<SuiteAppStatus[]>("suite_status"),
        invoke<SuiteSession | null>("suite_session"),
        invoke<SuiteTimelineEvent[]>("suite_timeline", { limit: 50 }),
      ]);
      setSuiteStatus(nextStatus);
      setSuiteSession(nextSession);
      setSuiteTimelineEvents(nextTimeline);
    } catch (error) {
      setSuiteLaunchStatus(
        error instanceof Error
          ? error.message
          : "Unable to launch the vaexcore suite.",
      );
    }
  }

  return {
    handleLaunchSuite,
    suiteLaunchStatus,
    suiteRefreshError,
    suiteSession,
    suiteStatus,
    suiteTimeline,
  };
}
