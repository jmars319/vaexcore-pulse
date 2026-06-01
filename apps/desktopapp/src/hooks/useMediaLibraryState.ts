import { useCallback, useEffect, useState } from "react";
import type {
  MediaAlignmentJob,
  MediaAlignmentMatch,
  MediaEditPair,
  MediaIndexJob,
  MediaLibraryAsset,
} from "@vaexcore/pulse-shared-types";
import {
  fetchMediaAlignmentJobs,
  fetchMediaAlignmentMatches,
  fetchMediaEditPairs,
  fetchMediaIndexJobs,
  fetchMediaLibraryAssets,
} from "../lib/pulseMediaLibraryApi";
import { useMediaLibraryMutations } from "./useMediaLibraryMutations";

type UseMediaLibraryStateOptions = {
  apiBaseUrl: string;
  isPulseReady: boolean;
  setProfileLibraryError: (error: string | null) => void;
};

export function useMediaLibraryState({
  apiBaseUrl,
  isPulseReady,
  setProfileLibraryError,
}: UseMediaLibraryStateOptions) {
  const [mediaLibraryAssets, setMediaLibraryAssets] = useState<
    MediaLibraryAsset[]
  >([]);
  const [mediaEditPairs, setMediaEditPairs] = useState<MediaEditPair[]>([]);
  const [mediaIndexJobs, setMediaIndexJobs] = useState<MediaIndexJob[]>([]);
  const [mediaAlignmentJobs, setMediaAlignmentJobs] = useState<
    MediaAlignmentJob[]
  >([]);
  const [mediaAlignmentMatches, setMediaAlignmentMatches] = useState<
    MediaAlignmentMatch[]
  >([]);
  const [isLoadingMediaLibraryAssets, setIsLoadingMediaLibraryAssets] =
    useState(false);
  const [isLoadingMediaEditPairs, setIsLoadingMediaEditPairs] = useState(false);
  const [isLoadingMediaIndexJobs, setIsLoadingMediaIndexJobs] = useState(false);
  const [isLoadingMediaAlignmentJobs, setIsLoadingMediaAlignmentJobs] =
    useState(false);
  const mutationState = useMediaLibraryMutations({
    apiBaseUrl,
    setMediaAlignmentJobs,
    setMediaEditPairs,
    setMediaIndexJobs,
    setMediaLibraryAssets,
    setProfileLibraryError,
  });

  const refreshMediaLibraryAssets = useCallback(async () => {
    const nextAssets = await fetchMediaLibraryAssets(apiBaseUrl);
    setMediaLibraryAssets(nextAssets);
    return nextAssets;
  }, [apiBaseUrl]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingMediaLibraryAssets(false);
      return;
    }

    let isCancelled = false;

    async function loadMediaLibraryAssets() {
      setIsLoadingMediaLibraryAssets(true);
      try {
        const nextAssets = await fetchMediaLibraryAssets(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaLibraryAssets(nextAssets);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load saved media: ${error.message}`
            : "Unable to load saved media",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaLibraryAssets(false);
        }
      }
    }

    void loadMediaLibraryAssets();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, setProfileLibraryError]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingMediaEditPairs(false);
      return;
    }

    let isCancelled = false;

    async function loadMediaEditPairs() {
      setIsLoadingMediaEditPairs(true);
      try {
        const nextPairs = await fetchMediaEditPairs(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaEditPairs(nextPairs);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load video comparisons: ${error.message}`
            : "Unable to load video comparisons",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaEditPairs(false);
        }
      }
    }

    void loadMediaEditPairs();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, setProfileLibraryError]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingMediaIndexJobs(false);
      return;
    }

    let isCancelled = false;

    async function loadMediaIndexJobs() {
      setIsLoadingMediaIndexJobs(true);
      try {
        const nextJobs = await fetchMediaIndexJobs(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setMediaIndexJobs(nextJobs);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load background activity: ${error.message}`
            : "Unable to load background activity",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaIndexJobs(false);
        }
      }
    }

    void loadMediaIndexJobs();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, setProfileLibraryError]);

  useEffect(() => {
    if (!isPulseReady) {
      return;
    }

    const hasActiveIndexJobs = mediaIndexJobs.some(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );
    if (!hasActiveIndexJobs) {
      return;
    }

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      async function refreshIndexState() {
        try {
          const [nextJobs, nextAssets, nextPairs] = await Promise.all([
            fetchMediaIndexJobs(apiBaseUrl),
            fetchMediaLibraryAssets(apiBaseUrl),
            fetchMediaEditPairs(apiBaseUrl),
          ]);
          if (isCancelled) {
            return;
          }

          setMediaIndexJobs(nextJobs);
          setMediaLibraryAssets(nextAssets);
          setMediaEditPairs(nextPairs);
        } catch {
          // Keep the current UI state; the explicit refresh/load effects surface errors.
        }
      }

      void refreshIndexState();
    }, 2000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiBaseUrl, isPulseReady, mediaIndexJobs]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingMediaAlignmentJobs(false);
      return;
    }

    let isCancelled = false;

    async function loadMediaAlignmentState() {
      setIsLoadingMediaAlignmentJobs(true);
      try {
        const [nextJobs, nextMatches] = await Promise.all([
          fetchMediaAlignmentJobs(apiBaseUrl),
          fetchMediaAlignmentMatches(apiBaseUrl),
        ]);
        if (isCancelled) {
          return;
        }

        setMediaAlignmentJobs(nextJobs);
        setMediaAlignmentMatches(nextMatches);
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load video comparisons: ${error.message}`
            : "Unable to load video comparisons",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingMediaAlignmentJobs(false);
        }
      }
    }

    void loadMediaAlignmentState();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, setProfileLibraryError]);

  useEffect(() => {
    if (!isPulseReady) {
      return;
    }

    const hasActiveAlignmentJobs = mediaAlignmentJobs.some(
      (job) => job.status === "QUEUED" || job.status === "RUNNING",
    );
    if (!hasActiveAlignmentJobs) {
      return;
    }

    let isCancelled = false;
    const intervalId = window.setInterval(() => {
      async function refreshAlignmentState() {
        try {
          const [nextJobs, nextMatches, nextPairs] = await Promise.all([
            fetchMediaAlignmentJobs(apiBaseUrl),
            fetchMediaAlignmentMatches(apiBaseUrl),
            fetchMediaEditPairs(apiBaseUrl),
          ]);
          if (isCancelled) {
            return;
          }

          setMediaAlignmentJobs(nextJobs);
          setMediaAlignmentMatches(nextMatches);
          setMediaEditPairs(nextPairs);
        } catch {
          // Keep current state; explicit load effects surface persistent failures.
        }
      }

      void refreshAlignmentState();
    }, 2000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiBaseUrl, isPulseReady, mediaAlignmentJobs]);

  return {
    ...mutationState,
    isLoadingMediaAlignmentJobs,
    isLoadingMediaEditPairs,
    isLoadingMediaIndexJobs,
    isLoadingMediaLibraryAssets,
    mediaAlignmentJobs,
    mediaAlignmentMatches,
    mediaEditPairs,
    mediaIndexJobs,
    mediaLibraryAssets,
    refreshMediaLibraryAssets,
  };
}
