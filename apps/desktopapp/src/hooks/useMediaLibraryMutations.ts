import { useState, type Dispatch, type SetStateAction } from "react";
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
  replaceMediaThumbnailOutputsEntry,
} from "../lib/pulseMediaLibraryApi";
import {
  upsertMediaAlignmentJob,
  upsertMediaEditPair,
  upsertMediaIndexJob,
  upsertMediaLibraryAsset,
} from "../lib/pulseApiUpserts";

type UseMediaLibraryMutationsOptions = {
  apiBaseUrl: string;
  setMediaAlignmentJobs: Dispatch<SetStateAction<MediaAlignmentJob[]>>;
  setMediaEditPairs: Dispatch<SetStateAction<MediaEditPair[]>>;
  setMediaIndexJobs: Dispatch<SetStateAction<MediaIndexJob[]>>;
  setMediaLibraryAssets: Dispatch<SetStateAction<MediaLibraryAsset[]>>;
  setProfileLibraryError: (error: string | null) => void;
};

export function useMediaLibraryMutations({
  apiBaseUrl,
  setMediaAlignmentJobs,
  setMediaEditPairs,
  setMediaIndexJobs,
  setMediaLibraryAssets,
  setProfileLibraryError,
}: UseMediaLibraryMutationsOptions) {
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
    savingThumbnailOutputAssetIds,
  };
}
