import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  buildProjectSummary,
  findNextPendingSessionSummary,
} from "@vaexcore/pulse-domain";
import type {
  ProjectSession,
  ProjectSessionSummary,
} from "@vaexcore/pulse-shared-types";
import {
  fetchProjectSession,
  fetchProjectSummaries,
} from "../lib/pulseProjectApi";
import { upsertProjectSummary } from "../lib/pulseApiUpserts";
import type { DesktopPage } from "../lib/desktopNavigation";

const lastSessionIdStorageKey = "vaexcore-pulse.desktop.last-session-id";

type ApplyProjectSessionOptions = {
  preferredCandidateId?: string | null;
  preserveSelection?: boolean;
  preserveFilters?: boolean;
  rememberRealSession?: boolean;
  restoreResumeState?: boolean;
};

type UseProjectSessionLifecycleOptions = {
  apiBaseUrl: string;
  applyProjectSession: (
    nextSession: ProjectSession,
    options?: ApplyProjectSessionOptions,
  ) => void;
  currentSessionId: string | null;
  isPulseReady: boolean;
  setActivePage: Dispatch<SetStateAction<DesktopPage>>;
  setAnalysisError: Dispatch<SetStateAction<string | null>>;
};

export function useProjectSessionLifecycle({
  apiBaseUrl,
  applyProjectSession,
  currentSessionId,
  isPulseReady,
  setActivePage,
  setAnalysisError,
}: UseProjectSessionLifecycleOptions) {
  const [projectSummaries, setProjectSummaries] = useState<
    ProjectSessionSummary[]
  >([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const applyProjectSessionRef = useRef(applyProjectSession);

  useEffect(() => {
    applyProjectSessionRef.current = applyProjectSession;
  }, [applyProjectSession]);

  const pendingSessionCount = useMemo(
    () => projectSummaries.filter((summary) => summary.pendingCount > 0).length,
    [projectSummaries],
  );
  const nextPendingSession = useMemo(
    () =>
      findNextPendingSessionSummary(projectSummaries, {
        excludeSessionIds: currentSessionId ? [currentSessionId] : [],
      }) ?? findNextPendingSessionSummary(projectSummaries),
    [currentSessionId, projectSummaries],
  );

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingProjects(false);
      setProjectsError(null);
      return;
    }

    let isCancelled = false;

    async function loadProjectSummaries() {
      setIsLoadingProjects(true);
      try {
        const summaries = await fetchProjectSummaries(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setProjectSummaries(summaries);
        setProjectsError(null);
        setActivePage((current) => {
          if (current !== "new-analysis") {
            return current;
          }

          if (window.localStorage.getItem(lastSessionIdStorageKey)) {
            return current;
          }

          return summaries.length > 0 ? "projects" : current;
        });
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProjectsError(
          error instanceof Error
            ? `Unable to load saved sessions: ${error.message}`
            : "Unable to load saved sessions",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingProjects(false);
        }
      }
    }

    void loadProjectSummaries();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, setActivePage]);

  useEffect(() => {
    if (!isPulseReady) {
      return;
    }

    const lastSessionId = window.localStorage.getItem(lastSessionIdStorageKey);
    if (!lastSessionId) {
      return;
    }
    const sessionIdToRestore = lastSessionId;

    let isCancelled = false;

    async function restoreLastSession() {
      try {
        const nextSession = await fetchProjectSession(
          apiBaseUrl,
          sessionIdToRestore,
        );
        if (isCancelled) {
          return;
        }

        applyProjectSessionRef.current(nextSession, {
          restoreResumeState: true,
          rememberRealSession: true,
        });
        setProjectSummaries((current) =>
          upsertProjectSummary(current, buildProjectSummary(nextSession)),
        );
        setAnalysisError(null);
        setActivePage("candidate-review");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setAnalysisError(
          error instanceof Error
            ? `Unable to restore the last session: ${error.message}`
            : "Unable to restore the last session",
        );
      }
    }

    void restoreLastSession();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, setActivePage, setAnalysisError]);

  async function handleOpenProject(sessionId: string) {
    setProjectsError(null);

    try {
      const nextSession = await fetchProjectSession(apiBaseUrl, sessionId);
      applyProjectSessionRef.current(nextSession, {
        restoreResumeState: true,
        rememberRealSession: true,
      });
      setProjectSummaries((current) =>
        upsertProjectSummary(current, buildProjectSummary(nextSession)),
      );
      setActivePage("candidate-review");
    } catch (error) {
      setProjectsError(
        error instanceof Error
          ? error.message
          : "Something went wrong while opening the session.",
      );
    }
  }

  async function handleOpenNextPendingSession() {
    if (!nextPendingSession) {
      setProjectsError(null);
      setActivePage("projects");
      return;
    }

    await handleOpenProject(nextPendingSession.sessionId);
  }

  return {
    handleOpenNextPendingSession,
    handleOpenProject,
    isLoadingProjects,
    nextPendingSession,
    pendingSessionCount,
    projectSummaries,
    projectsError,
    setProjectSummaries,
    setProjectsError,
  };
}

export { lastSessionIdStorageKey };
