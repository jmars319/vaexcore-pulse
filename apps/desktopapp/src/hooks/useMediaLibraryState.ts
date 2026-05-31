import { useCallback, useEffect, useState } from "react";
import {
  cancelMediaAlignmentJobRequestSchema,
  cancelMediaIndexJobRequestSchema,
  createMediaAlignmentJobRequestSchema,
  createMediaEditPairRequestSchema,
  createMediaIndexJobRequestSchema,
  createMediaLibraryAssetRequestSchema,
  replaceMediaThumbnailOutputsRequestSchema,
  type CancelMediaAlignmentJobRequest,
  type CancelMediaIndexJobRequest,
  type CreateMediaAlignmentJobRequest,
  type CreateMediaEditPairRequest,
  type CreateMediaIndexJobRequest,
  type CreateMediaLibraryAssetRequest,
  type MediaAlignmentJob,
  type MediaAlignmentMatch,
  type MediaEditPair,
  type MediaIndexJob,
  type MediaLibraryAsset,
  type ReplaceMediaThumbnailOutputsRequest,
} from "@vaexcore/pulse-shared-types";
import {
  cancelMediaAlignmentJobEntry,
  cancelMediaIndexJobEntry,
  createMediaAlignmentJobEntry,
  createMediaEditPairEntry,
  createMediaIndexJobEntry,
  createMediaLibraryAssetEntry,
  fetchMediaAlignmentJobs,
  fetchMediaAlignmentMatches,
  fetchMediaEditPairs,
  fetchMediaIndexJobs,
  fetchMediaLibraryAssets,
  replaceMediaThumbnailOutputsEntry,
} from "../lib/pulseMediaLibraryApi";
import {
  upsertMediaAlignmentJob,
  upsertMediaEditPair,
  upsertMediaIndexJob,
  upsertMediaLibraryAsset,
} from "../lib/pulseApiUpserts";

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
  const [isCreatingMediaLibraryAsset, setIsCreatingMediaLibraryAsset] =
    useState(false);
  const [isCreatingMediaEditPair, setIsCreatingMediaEditPair] = useState(false);
  const [isCreatingMediaIndexJob, setIsCreatingMediaIndexJob] = useState(false);
  const [isCreatingMediaAlignmentJob, setIsCreatingMediaAlignmentJob] =
    useState(false);
  const [cancellingMediaIndexJobIds, setCancellingMediaIndexJobIds] = useState<
    Record<string, boolean>
  >({});
  const [cancellingMediaAlignmentJobIds, setCancellingMediaAlignmentJobIds] =
    useState<Record<string, boolean>>({});
  const [savingThumbnailOutputAssetIds, setSavingThumbnailOutputAssetIds] =
    useState<Record<string, boolean>>({});

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

  async function handleCreateMediaLibraryAsset(
    input: CreateMediaLibraryAssetRequest,
  ) {
    const request = createMediaLibraryAssetRequestSchema.parse(input);
    setIsCreatingMediaLibraryAsset(true);
    setProfileLibraryError(null);

    try {
      const createdAsset = await createMediaLibraryAssetEntry(
        apiBaseUrl,
        request,
      );
      setMediaLibraryAssets((current) =>
        upsertMediaLibraryAsset(current, createdAsset),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the media reference.",
      );
      throw error;
    } finally {
      setIsCreatingMediaLibraryAsset(false);
    }
  }

  async function handleCreateMediaEditPair(input: CreateMediaEditPairRequest) {
    const request = createMediaEditPairRequestSchema.parse(input);
    setIsCreatingMediaEditPair(true);
    setProfileLibraryError(null);

    try {
      const createdPair = await createMediaEditPairEntry(apiBaseUrl, request);
      setMediaEditPairs((current) => upsertMediaEditPair(current, createdPair));
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the video comparison.",
      );
      throw error;
    } finally {
      setIsCreatingMediaEditPair(false);
    }
  }

  async function handleCreateMediaIndexJob(input: CreateMediaIndexJobRequest) {
    const request = createMediaIndexJobRequestSchema.parse(input);
    setIsCreatingMediaIndexJob(true);
    setProfileLibraryError(null);

    try {
      const createdJob = await createMediaIndexJobEntry(apiBaseUrl, request);
      setMediaIndexJobs((current) => upsertMediaIndexJob(current, createdJob));
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while starting the scan.",
      );
      throw error;
    } finally {
      setIsCreatingMediaIndexJob(false);
    }
  }

  async function handleReplaceMediaThumbnailOutputs(
    assetId: string,
    input: ReplaceMediaThumbnailOutputsRequest,
  ) {
    const request = replaceMediaThumbnailOutputsRequestSchema.parse(input);
    setSavingThumbnailOutputAssetIds((current) => ({
      ...current,
      [assetId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const updatedAsset = await replaceMediaThumbnailOutputsEntry(
        apiBaseUrl,
        assetId,
        request,
      );
      setMediaLibraryAssets((current) =>
        upsertMediaLibraryAsset(current, updatedAsset),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while updating thumbnail picks.",
      );
      throw error;
    } finally {
      setSavingThumbnailOutputAssetIds((current) => {
        const { [assetId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
  }

  async function handleCancelMediaIndexJob(input: CancelMediaIndexJobRequest) {
    const request = cancelMediaIndexJobRequestSchema.parse(input);
    setCancellingMediaIndexJobIds((current) => ({
      ...current,
      [request.jobId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const cancelledJob = await cancelMediaIndexJobEntry(apiBaseUrl, request);
      setMediaIndexJobs((current) =>
        upsertMediaIndexJob(current, cancelledJob),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while cancelling the scan.",
      );
      throw error;
    } finally {
      setCancellingMediaIndexJobIds((current) => {
        const { [request.jobId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
  }

  async function handleCreateMediaAlignmentJob(
    input: CreateMediaAlignmentJobRequest,
  ) {
    const request = createMediaAlignmentJobRequestSchema.parse(input);
    setIsCreatingMediaAlignmentJob(true);
    setProfileLibraryError(null);

    try {
      const createdJob = await createMediaAlignmentJobEntry(
        apiBaseUrl,
        request,
      );
      setMediaAlignmentJobs((current) =>
        upsertMediaAlignmentJob(current, createdJob),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while starting the video comparison.",
      );
      throw error;
    } finally {
      setIsCreatingMediaAlignmentJob(false);
    }
  }

  async function handleCancelMediaAlignmentJob(
    input: CancelMediaAlignmentJobRequest,
  ) {
    const request = cancelMediaAlignmentJobRequestSchema.parse(input);
    setCancellingMediaAlignmentJobIds((current) => ({
      ...current,
      [request.jobId]: true,
    }));
    setProfileLibraryError(null);

    try {
      const cancelledJob = await cancelMediaAlignmentJobEntry(
        apiBaseUrl,
        request,
      );
      setMediaAlignmentJobs((current) =>
        upsertMediaAlignmentJob(current, cancelledJob),
      );
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while cancelling the comparison job.",
      );
      throw error;
    } finally {
      setCancellingMediaAlignmentJobIds((current) => {
        const { [request.jobId]: _removed, ...nextState } = current;
        return nextState;
      });
    }
  }

  return {
    cancellingMediaAlignmentJobIds,
    cancellingMediaIndexJobIds,
    handleCancelMediaAlignmentJob,
    handleCancelMediaIndexJob,
    handleCreateMediaAlignmentJob,
    handleCreateMediaEditPair,
    handleCreateMediaIndexJob,
    handleCreateMediaLibraryAsset,
    handleReplaceMediaThumbnailOutputs,
    isCreatingMediaAlignmentJob,
    isCreatingMediaEditPair,
    isCreatingMediaIndexJob,
    isCreatingMediaLibraryAsset,
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
    savingThumbnailOutputAssetIds,
  };
}
