import {
  cancelMediaAlignmentJobRequestSchema,
  cancelMediaIndexJobRequestSchema,
  createMediaAlignmentJobRequestSchema,
  createMediaEditPairRequestSchema,
  createMediaIndexJobRequestSchema,
  createMediaLibraryAssetRequestSchema,
  mediaAlignmentJobSchema,
  mediaAlignmentMatchSchema,
  mediaEditPairSchema,
  mediaIndexJobSchema,
  mediaLibraryAssetSchema,
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

import { jsonRequestHeaders, requestPulseApiJson } from "./pulseApiCore";

export async function fetchMediaLibraryAssets(
  apiBaseUrl: string,
): Promise<MediaLibraryAsset[]> {
  const payload = await requestPulseApiJson<MediaLibraryAsset[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/assets`,
    undefined,
    "Unable to load saved media.",
    "Saved media could not be loaded",
  );
  return mediaLibraryAssetSchema.array().parse(payload);
}

export async function createMediaLibraryAssetEntry(
  apiBaseUrl: string,
  input: CreateMediaLibraryAssetRequest,
): Promise<MediaLibraryAsset> {
  const request = createMediaLibraryAssetRequestSchema.parse(input);
  const payload = await requestPulseApiJson<MediaLibraryAsset>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/assets`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
      body: JSON.stringify(request),
    },
    "Unable to save media.",
    "Saved media could not be created",
  );
  return mediaLibraryAssetSchema.parse(payload);
}

export async function replaceMediaThumbnailOutputsEntry(
  apiBaseUrl: string,
  assetId: string,
  input: ReplaceMediaThumbnailOutputsRequest,
): Promise<MediaLibraryAsset> {
  const request = replaceMediaThumbnailOutputsRequestSchema.parse(input);
  const payload = await requestPulseApiJson<MediaLibraryAsset>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/assets/${encodeURIComponent(assetId)}/thumbnail-outputs`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
      body: JSON.stringify(request),
    },
    "Unable to update chosen thumbnails.",
    "Thumbnail update failed",
  );
  return mediaLibraryAssetSchema.parse(payload);
}

export async function fetchMediaEditPairs(
  apiBaseUrl: string,
): Promise<MediaEditPair[]> {
  const payload = await requestPulseApiJson<MediaEditPair[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/pairs`,
    undefined,
    "Unable to load video comparisons.",
    "Video comparisons could not be loaded",
  );
  return mediaEditPairSchema.array().parse(payload);
}

export async function createMediaEditPairEntry(
  apiBaseUrl: string,
  input: CreateMediaEditPairRequest,
): Promise<MediaEditPair> {
  const request = createMediaEditPairRequestSchema.parse(input);
  const payload = await requestPulseApiJson<MediaEditPair>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/pairs`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
      body: JSON.stringify(request),
    },
    "Unable to save video comparison.",
    "Video comparison could not be created",
  );
  return mediaEditPairSchema.parse(payload);
}

export async function fetchMediaIndexJobs(
  apiBaseUrl: string,
): Promise<MediaIndexJob[]> {
  const payload = await requestPulseApiJson<MediaIndexJob[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/index-jobs`,
    undefined,
    "Unable to load background activity.",
    "Background activity could not be loaded",
  );
  return mediaIndexJobSchema.array().parse(payload);
}

export async function createMediaIndexJobEntry(
  apiBaseUrl: string,
  input: CreateMediaIndexJobRequest,
): Promise<MediaIndexJob> {
  const request = createMediaIndexJobRequestSchema.parse(input);
  const payload = await requestPulseApiJson<MediaIndexJob>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/assets/${encodeURIComponent(request.assetId)}/index-jobs`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
    },
    "Unable to start scan.",
    "Scan could not be started",
  );
  return mediaIndexJobSchema.parse(payload);
}

export async function cancelMediaIndexJobEntry(
  apiBaseUrl: string,
  input: CancelMediaIndexJobRequest,
): Promise<MediaIndexJob> {
  const request = cancelMediaIndexJobRequestSchema.parse(input);
  const payload = await requestPulseApiJson<MediaIndexJob>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/index-jobs/${encodeURIComponent(request.jobId)}/cancel`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
    },
    "Unable to cancel scan.",
    "Scan could not be cancelled",
  );
  return mediaIndexJobSchema.parse(payload);
}

export async function fetchMediaAlignmentJobs(
  apiBaseUrl: string,
): Promise<MediaAlignmentJob[]> {
  const payload = await requestPulseApiJson<MediaAlignmentJob[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/alignment-jobs`,
    undefined,
    "Unable to load video comparisons.",
    "Video comparisons could not be loaded",
  );
  return mediaAlignmentJobSchema.array().parse(payload);
}

export async function fetchMediaAlignmentMatches(
  apiBaseUrl: string,
): Promise<MediaAlignmentMatch[]> {
  const payload = await requestPulseApiJson<MediaAlignmentMatch[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/alignment-matches`,
    undefined,
    "Unable to load comparison matches.",
    "Comparison matches could not be loaded",
  );
  return mediaAlignmentMatchSchema.array().parse(payload);
}

export async function createMediaAlignmentJobEntry(
  apiBaseUrl: string,
  input: CreateMediaAlignmentJobRequest,
): Promise<MediaAlignmentJob> {
  const request = createMediaAlignmentJobRequestSchema.parse(input);
  const payload = await requestPulseApiJson<MediaAlignmentJob>(
    apiBaseUrl,
    request.pairId
      ? `${apiBaseUrl}/api/library/pairs/${encodeURIComponent(request.pairId)}/alignment-jobs`
      : `${apiBaseUrl}/api/library/alignment-jobs`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
      body: JSON.stringify(request),
    },
    "Unable to start video comparison.",
    "Video comparison could not be started",
  );
  return mediaAlignmentJobSchema.parse(payload);
}

export async function cancelMediaAlignmentJobEntry(
  apiBaseUrl: string,
  input: CancelMediaAlignmentJobRequest,
): Promise<MediaAlignmentJob> {
  const request = cancelMediaAlignmentJobRequestSchema.parse(input);
  const payload = await requestPulseApiJson<MediaAlignmentJob>(
    apiBaseUrl,
    `${apiBaseUrl}/api/library/alignment-jobs/${encodeURIComponent(request.jobId)}/cancel`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
    },
    "Unable to cancel video comparison.",
    "Video comparison could not be cancelled",
  );
  return mediaAlignmentJobSchema.parse(payload);
}
