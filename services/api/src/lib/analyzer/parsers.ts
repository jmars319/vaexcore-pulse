import {
  addExampleClipRequestSchema,
  analyzeProjectRequestSchema,
  cancelMediaAlignmentJobRequestSchema,
  cancelMediaIndexJobRequestSchema,
  clipProfileSchema,
  createMediaAlignmentJobRequestSchema,
  createMediaEditPairRequestSchema,
  createMediaIndexJobRequestSchema,
  createMediaLibraryAssetRequestSchema,
  createClipProfileRequestSchema,
  exampleClipSchema,
  mediaEditPairSchema,
  mediaAlignmentJobSchema,
  mediaAlignmentMatchSchema,
  mediaIndexArtifactSchema,
  mediaIndexJobSchema,
  mediaLibraryAssetSchema,
  projectSessionSearchResultSchema,
  projectSessionSchema,
  projectSessionSummarySchema,
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
  type ProjectSessionSearchResult,
  type ProjectSessionSummary,
  type ReplaceMediaThumbnailOutputsRequest,
  type ReviewUpdateRequest,
} from "@vaexcore/pulse-shared-types";
import { AnalyzerBridgeError, parseWithSchema } from "./core.js";

type AnalyzerSessionEnvelope = {
  message?: string;
  session?: unknown;
};

type AnalyzerSessionListEnvelope = {
  message?: string;
  sessions?: unknown;
};

type AnalyzerSessionSearchEnvelope = {
  message?: string;
  results?: unknown;
};

type AnalyzerProfileEnvelope = {
  message?: string;
  profile?: unknown;
};

type AnalyzerProfileListEnvelope = {
  message?: string;
  profiles?: unknown;
};

type AnalyzerExampleEnvelope = {
  message?: string;
  example?: unknown;
};

type AnalyzerExampleListEnvelope = {
  message?: string;
  examples?: unknown;
};

type AnalyzerAssetEnvelope = {
  message?: string;
  asset?: unknown;
};

type AnalyzerAssetListEnvelope = {
  message?: string;
  assets?: unknown;
};

type AnalyzerPairEnvelope = {
  message?: string;
  pair?: unknown;
};

type AnalyzerPairListEnvelope = {
  message?: string;
  pairs?: unknown;
};

type AnalyzerIndexJobEnvelope = {
  message?: string;
  job?: unknown;
};

type AnalyzerIndexJobListEnvelope = {
  message?: string;
  jobs?: unknown;
};

type AnalyzerIndexArtifactListEnvelope = {
  message?: string;
  artifacts?: unknown;
};

type AnalyzerAlignmentJobEnvelope = {
  message?: string;
  job?: unknown;
};

type AnalyzerAlignmentJobListEnvelope = {
  message?: string;
  jobs?: unknown;
};

type AnalyzerAlignmentMatchListEnvelope = {
  message?: string;
  matches?: unknown;
};

export async function parseSessionResponse(
  response: Response,
): Promise<ProjectSession> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerSessionEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("session", () =>
    projectSessionSchema.parse(payload?.session),
  );
}

export async function parseSessionSummaryListResponse(
  response: Response,
): Promise<ProjectSessionSummary[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerSessionListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("sessions", () =>
    projectSessionSummarySchema.array().parse(payload?.sessions),
  );
}

export async function parseSessionSearchResponse(
  response: Response,
): Promise<ProjectSessionSearchResult[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerSessionSearchEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("session search results", () =>
    projectSessionSearchResultSchema.array().parse(payload?.results),
  );
}

export async function parseProfileResponse(
  response: Response,
): Promise<ClipProfile> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerProfileEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("profile", () =>
    clipProfileSchema.parse(payload?.profile),
  );
}

export async function parseProfileListResponse(
  response: Response,
): Promise<ClipProfile[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerProfileListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("profiles", () =>
    clipProfileSchema.array().parse(payload?.profiles),
  );
}

export async function parseExampleResponse(
  response: Response,
): Promise<ExampleClip> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerExampleEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("example", () =>
    exampleClipSchema.parse(payload?.example),
  );
}

export async function parseExampleListResponse(
  response: Response,
): Promise<ExampleClip[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerExampleListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("examples", () =>
    exampleClipSchema.array().parse(payload?.examples),
  );
}

export async function parseAssetResponse(
  response: Response,
): Promise<MediaLibraryAsset> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerAssetEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("asset", () =>
    mediaLibraryAssetSchema.parse(payload?.asset),
  );
}

export async function parseAssetListResponse(
  response: Response,
): Promise<MediaLibraryAsset[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerAssetListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("assets", () =>
    mediaLibraryAssetSchema.array().parse(payload?.assets),
  );
}

export async function parsePairResponse(
  response: Response,
): Promise<MediaEditPair> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerPairEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("pair", () =>
    mediaEditPairSchema.parse(payload?.pair),
  );
}

export async function parsePairListResponse(
  response: Response,
): Promise<MediaEditPair[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerPairListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("pairs", () =>
    mediaEditPairSchema.array().parse(payload?.pairs),
  );
}

export async function parseIndexJobResponse(
  response: Response,
): Promise<MediaIndexJob> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerIndexJobEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("index job", () =>
    mediaIndexJobSchema.parse(payload?.job),
  );
}

export async function parseIndexJobListResponse(
  response: Response,
): Promise<MediaIndexJob[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerIndexJobListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("index jobs", () =>
    mediaIndexJobSchema.array().parse(payload?.jobs),
  );
}

export async function parseIndexArtifactListResponse(
  response: Response,
): Promise<MediaIndexArtifact[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerIndexArtifactListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("index artifacts", () =>
    mediaIndexArtifactSchema.array().parse(payload?.artifacts),
  );
}

export async function parseAlignmentJobResponse(
  response: Response,
): Promise<MediaAlignmentJob> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerAlignmentJobEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("alignment job", () =>
    mediaAlignmentJobSchema.parse(payload?.job),
  );
}

export async function parseAlignmentJobListResponse(
  response: Response,
): Promise<MediaAlignmentJob[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerAlignmentJobListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("alignment jobs", () =>
    mediaAlignmentJobSchema.array().parse(payload?.jobs),
  );
}

export async function parseAlignmentMatchListResponse(
  response: Response,
): Promise<MediaAlignmentMatch[]> {
  const payload = (await response
    .json()
    .catch(() => null)) as AnalyzerAlignmentMatchListEnvelope | null;

  if (!response.ok) {
    throw new AnalyzerBridgeError(
      payload?.message ?? "Analyzer request failed",
      response.status,
    );
  }

  return parseWithSchema("alignment matches", () =>
    mediaAlignmentMatchSchema.array().parse(payload?.matches),
  );
}
