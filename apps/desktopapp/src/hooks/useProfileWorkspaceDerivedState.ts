import { useMemo } from "react";
import type {
  ClipProfile,
  ExampleClip,
  ExampleClipSourceType,
  MediaAlignmentJob,
  MediaEditPair,
  MediaIndexJob,
  MediaLibraryAsset,
  MediaLibraryAssetType,
} from "@vaexcore/pulse-shared-types";
import {
  localOnlySourceTypeOptions,
  parseTimestamp,
  sourceTypeOptions,
} from "../lib/profileWorkspacePresentation";

type UseProfileWorkspaceDerivedStateInput = {
  selectedProfile: ClipProfile | null;
  examples: ExampleClip[];
  libraryAssets: MediaLibraryAsset[];
  mediaIndexJobs: MediaIndexJob[];
  mediaAlignmentJobs: MediaAlignmentJob[];
  mediaEditPairs: MediaEditPair[];
  isLoadingExamples: boolean;
  sourceType: ExampleClipSourceType;
  profileEditSourceType: ExampleClipSourceType;
  assetType: MediaLibraryAssetType;
  assetSourceType: ExampleClipSourceType;
};

export function useProfileWorkspaceDerivedState({
  selectedProfile,
  examples,
  libraryAssets,
  mediaIndexJobs,
  mediaAlignmentJobs,
  mediaEditPairs,
  isLoadingExamples,
  sourceType,
  profileEditSourceType,
  assetType,
  assetSourceType,
}: UseProfileWorkspaceDerivedStateInput) {
  const visibleExamples = useMemo(
    () =>
      examples.length > 0 || isLoadingExamples
        ? examples
        : (selectedProfile?.exampleClips ?? []),
    [examples, isLoadingExamples, selectedProfile?.exampleClips],
  );

  const selectedSourceType = useMemo(
    () => sourceTypeOptions.find((option) => option.id === sourceType),
    [sourceType],
  );

  const usesLocalFilePicker =
    sourceType === "LOCAL_FILE_UPLOAD" || sourceType === "LOCAL_FILE_PATH";

  const usesLocalProfileEditPicker =
    profileEditSourceType === "LOCAL_FILE_UPLOAD" ||
    profileEditSourceType === "LOCAL_FILE_PATH";

  const availableAssetSourceTypes =
    assetType === "CLIP" ? sourceTypeOptions : localOnlySourceTypeOptions;

  const selectedAssetSourceType = useMemo(
    () =>
      availableAssetSourceTypes.find((option) => option.id === assetSourceType),
    [availableAssetSourceTypes, assetSourceType],
  );

  const usesLocalAssetPicker =
    assetSourceType === "LOCAL_FILE_UPLOAD" ||
    assetSourceType === "LOCAL_FILE_PATH";

  const mediaIndexes = useMemo(() => {
    const latestIndexJobByAssetId = new Map<string, MediaIndexJob>();
    for (const job of mediaIndexJobs) {
      if (!latestIndexJobByAssetId.has(job.assetId)) {
        latestIndexJobByAssetId.set(job.assetId, job);
      }
    }

    const latestAlignmentJobByPairId = new Map<string, MediaAlignmentJob>();
    for (const job of mediaAlignmentJobs) {
      if (job.pairId && !latestAlignmentJobByPairId.has(job.pairId)) {
        latestAlignmentJobByPairId.set(job.pairId, job);
      }
    }

    const mediaAssetById = new Map<string, MediaLibraryAsset>();
    for (const asset of libraryAssets) {
      mediaAssetById.set(asset.id, asset);
    }

    const mediaEditPairById = new Map<string, MediaEditPair>();
    for (const pair of mediaEditPairs) {
      mediaEditPairById.set(pair.id, pair);
    }

    return {
      latestIndexJobByAssetId,
      latestAlignmentJobByPairId,
      mediaAssetById,
      mediaEditPairById,
    };
  }, [libraryAssets, mediaAlignmentJobs, mediaEditPairs, mediaIndexJobs]);

  const mediaCounts = useMemo(() => {
    let globalClipCount = 0;
    let activeIndexJobCount = 0;
    let activeAlignmentJobCount = 0;
    const vodAssetOptions: MediaLibraryAsset[] = [];
    const editAssetOptions: MediaLibraryAsset[] = [];

    for (const asset of libraryAssets) {
      if (asset.assetType === "CLIP" && asset.scope === "GLOBAL") {
        globalClipCount += 1;
      }

      if (asset.assetType === "VOD") {
        vodAssetOptions.push(asset);
      }

      if (asset.assetType === "EDIT") {
        editAssetOptions.push(asset);
      }
    }

    for (const job of mediaIndexJobs) {
      if (job.status === "QUEUED" || job.status === "RUNNING") {
        activeIndexJobCount += 1;
      }
    }

    for (const job of mediaAlignmentJobs) {
      if (job.status === "QUEUED" || job.status === "RUNNING") {
        activeAlignmentJobCount += 1;
      }
    }

    return {
      activeAlignmentJobCount,
      activeIndexJobCount,
      editAssetOptions,
      globalClipCount,
      vodAssetOptions,
    };
  }, [libraryAssets, mediaAlignmentJobs, mediaIndexJobs]);

  const selectedProfileCounts = useMemo(() => {
    const selectedProfileReferenceCount =
      selectedProfile?.exampleClips.length ?? 0;
    const selectedProfileEditReferenceCount =
      selectedProfile?.exampleClips.filter(
        (example) => example.referenceKind === "PROFILE_EDIT",
      ).length ?? 0;
    const selectedProfileUsableReferenceCount =
      selectedProfile?.exampleClips.filter((example) => example.featureSummary)
        .length ?? 0;

    return {
      selectedProfileClipReferenceCount:
        selectedProfileReferenceCount - selectedProfileEditReferenceCount,
      selectedProfileEditReferenceCount,
      selectedProfileReferenceCount,
      selectedProfileUsableReferenceCount,
    };
  }, [selectedProfile?.exampleClips]);

  const recentBackgroundActivity = useMemo(
    () =>
      [
        ...mediaIndexJobs.map((job) => ({
          kind: "INDEX" as const,
          updatedAt: parseTimestamp(job.updatedAt),
          job,
        })),
        ...mediaAlignmentJobs.map((job) => ({
          kind: "ALIGNMENT" as const,
          updatedAt: parseTimestamp(job.updatedAt),
          job,
        })),
      ].sort((left, right) => right.updatedAt - left.updatedAt),
    [mediaAlignmentJobs, mediaIndexJobs],
  );

  return {
    availableAssetSourceTypes,
    recentBackgroundActivity,
    selectedAssetSourceType,
    selectedSourceType,
    usesLocalAssetPicker,
    usesLocalFilePicker,
    usesLocalProfileEditPicker,
    visibleExamples,
    ...mediaCounts,
    ...mediaIndexes,
    ...selectedProfileCounts,
  };
}
