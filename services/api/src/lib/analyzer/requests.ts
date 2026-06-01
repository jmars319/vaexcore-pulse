import {
  addExampleClipRequestSchema,
  analyzeProjectRequestSchema,
  cancelMediaAlignmentJobRequestSchema,
  cancelMediaIndexJobRequestSchema,
  createMediaAlignmentJobRequestSchema,
  createMediaEditPairRequestSchema,
  createMediaIndexJobRequestSchema,
  createMediaLibraryAssetRequestSchema,
  createClipProfileRequestSchema,
  replaceMediaThumbnailOutputsRequestSchema,
  reviewUpdateRequestSchema,
  type AddExampleClipRequest,
  type AnalyzeProjectRequest,
  type CancelMediaAlignmentJobRequest,
  type CancelMediaIndexJobRequest,
  type ClipProfile,
  type CreateMediaAlignmentJobRequest,
  type CreateMediaEditPairRequest,
  type CreateMediaIndexJobRequest,
  type CreateMediaLibraryAssetRequest,
  type CreateClipProfileRequest,
  type ExampleClip,
  type MediaEditPair,
  type MediaAlignmentJob,
  type MediaAlignmentMatch,
  type MediaIndexArtifact,
  type MediaIndexJob,
  type MediaLibraryAsset,
  type ProjectSession,
  type ProjectSessionSummary,
  type ReplaceMediaThumbnailOutputsRequest,
  type ReviewUpdateRequest,
} from "@vaexcore/pulse-shared-types";
import { AnalyzerBridgeError, fetchAnalyzer } from "./core.js";
import {
  parseAlignmentJobResponse,
  parseAlignmentJobListResponse,
  parseAlignmentMatchListResponse,
  parseAssetListResponse,
  parseAssetResponse,
  parseExampleListResponse,
  parseExampleResponse,
  parseIndexArtifactListResponse,
  parseIndexJobListResponse,
  parseIndexJobResponse,
  parsePairListResponse,
  parsePairResponse,
  parseProfileListResponse,
  parseProfileResponse,
  parseSessionResponse,
  parseSessionSummaryListResponse,
} from "./parsers.js";

export async function requestAnalyzerSession(
  input: AnalyzeProjectRequest,
): Promise<ProjectSession> {
  const request = analyzeProjectRequestSchema.parse(input);
  const response = await fetchAnalyzer("/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sourcePath: request.sourcePath,
      profileId: request.profileId ?? "generic",
      sessionTitle: request.sessionTitle,
      persist: true,
    }),
  });

  return parseSessionResponse(response);
}

export async function requestStoredSession(
  sessionId: string,
): Promise<ProjectSession> {
  const response = await fetchAnalyzer(
    `/session/${encodeURIComponent(sessionId)}`,
  );
  return parseSessionResponse(response);
}

export async function requestSessionSummaries(): Promise<
  ProjectSessionSummary[]
> {
  const response = await fetchAnalyzer("/sessions");
  return parseSessionSummaryListResponse(response);
}

export async function requestProfiles(): Promise<ClipProfile[]> {
  const response = await fetchAnalyzer("/profiles");
  return parseProfileListResponse(response);
}

export async function createProfile(
  input: CreateClipProfileRequest,
): Promise<ClipProfile> {
  const request = createClipProfileRequestSchema.parse(input);
  const response = await fetchAnalyzer("/profiles", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseProfileResponse(response);
}

export async function requestProfileExamples(
  profileId: string,
): Promise<ExampleClip[]> {
  const response = await fetchAnalyzer(
    `/profiles/${encodeURIComponent(profileId)}/examples`,
  );
  return parseExampleListResponse(response);
}

export async function addProfileExample(
  profileId: string,
  input: AddExampleClipRequest,
): Promise<ExampleClip> {
  const request = addExampleClipRequestSchema.parse(input);
  const response = await fetchAnalyzer(
    `/profiles/${encodeURIComponent(profileId)}/examples`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );
  return parseExampleResponse(response);
}

export async function requestMediaLibraryAssets(): Promise<
  MediaLibraryAsset[]
> {
  const response = await fetchAnalyzer("/library/assets");
  return parseAssetListResponse(response);
}

export async function createMediaLibraryAsset(
  input: CreateMediaLibraryAssetRequest,
): Promise<MediaLibraryAsset> {
  const request = createMediaLibraryAssetRequestSchema.parse(input);
  const response = await fetchAnalyzer("/library/assets", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseAssetResponse(response);
}

export async function replaceMediaThumbnailOutputs(
  assetId: string,
  input: ReplaceMediaThumbnailOutputsRequest,
): Promise<MediaLibraryAsset> {
  const request = replaceMediaThumbnailOutputsRequestSchema.parse(input);
  const response = await fetchAnalyzer(
    `/library/assets/${encodeURIComponent(assetId)}/thumbnail-outputs`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );
  return parseAssetResponse(response);
}

export async function requestMediaEditPairs(): Promise<MediaEditPair[]> {
  const response = await fetchAnalyzer("/library/pairs");
  return parsePairListResponse(response);
}

export async function createMediaEditPair(
  input: CreateMediaEditPairRequest,
): Promise<MediaEditPair> {
  const request = createMediaEditPairRequestSchema.parse(input);
  const response = await fetchAnalyzer("/library/pairs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parsePairResponse(response);
}

export async function requestMediaIndexJobs(): Promise<MediaIndexJob[]> {
  const response = await fetchAnalyzer("/library/index-jobs");
  return parseIndexJobListResponse(response);
}

export async function requestMediaIndexArtifacts(
  assetId?: string,
): Promise<MediaIndexArtifact[]> {
  const response = await fetchAnalyzer(
    assetId
      ? `/library/assets/${encodeURIComponent(assetId)}/index-artifacts`
      : "/library/index-artifacts",
  );
  return parseIndexArtifactListResponse(response);
}

export async function requestMediaAlignmentJobs(): Promise<
  MediaAlignmentJob[]
> {
  const response = await fetchAnalyzer("/library/alignment-jobs");
  return parseAlignmentJobListResponse(response);
}

export async function requestMediaAlignmentMatches(
  pairId?: string,
): Promise<MediaAlignmentMatch[]> {
  const response = await fetchAnalyzer(
    pairId
      ? `/library/pairs/${encodeURIComponent(pairId)}/alignment-matches`
      : "/library/alignment-matches",
  );
  return parseAlignmentMatchListResponse(response);
}

export async function createMediaAlignmentJob(
  input: CreateMediaAlignmentJobRequest,
): Promise<MediaAlignmentJob> {
  const request = createMediaAlignmentJobRequestSchema.parse(input);
  const response = await fetchAnalyzer(
    request.pairId
      ? `/library/pairs/${encodeURIComponent(request.pairId)}/alignment-jobs`
      : "/library/alignment-jobs",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );
  return parseAlignmentJobResponse(response);
}

export async function cancelMediaAlignmentJob(
  input: CancelMediaAlignmentJobRequest,
): Promise<MediaAlignmentJob> {
  const request = cancelMediaAlignmentJobRequestSchema.parse(input);
  const response = await fetchAnalyzer(
    `/library/alignment-jobs/${encodeURIComponent(request.jobId)}/cancel`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );
  return parseAlignmentJobResponse(response);
}

export async function createMediaIndexJob(
  input: CreateMediaIndexJobRequest,
): Promise<MediaIndexJob> {
  const request = createMediaIndexJobRequestSchema.parse(input);
  const response = await fetchAnalyzer(
    `/library/assets/${encodeURIComponent(request.assetId)}/index-jobs`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );
  return parseIndexJobResponse(response);
}

export async function cancelMediaIndexJob(
  input: CancelMediaIndexJobRequest,
): Promise<MediaIndexJob> {
  const request = cancelMediaIndexJobRequestSchema.parse(input);
  const response = await fetchAnalyzer(
    `/library/index-jobs/${encodeURIComponent(request.jobId)}/cancel`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );
  return parseIndexJobResponse(response);
}

export async function submitReviewUpdate(
  input: ReviewUpdateRequest,
): Promise<ProjectSession> {
  const request = reviewUpdateRequestSchema.parse(input);
  const response = await fetchAnalyzer("/review", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return parseSessionResponse(response);
}

export async function requestAnalyzerHealth(): Promise<unknown> {
  const response = await fetchAnalyzer("/health");
  if (!response.ok) {
    throw new AnalyzerBridgeError(
      "Analyzer health check failed",
      response.status,
    );
  }

  return await response.json().catch(() => null);
}
