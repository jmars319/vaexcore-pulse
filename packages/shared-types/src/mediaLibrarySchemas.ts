import { z } from "zod";

import { timeRangeSchema } from "./coreSchemas";
import {
  exampleClipFeatureSummarySchema,
  exampleClipSourceTypeSchema,
  exampleClipStatusSchema,
} from "./profileSchemas";

export const mediaLibraryAssetTypeSchema = z.enum(["CLIP", "VOD", "EDIT"]);

export const mediaLibraryAssetScopeSchema = z.enum(["GLOBAL", "PROFILE"]);

export const mediaEditPairStatusSchema = z.enum(["READY", "INCOMPLETE"]);

export const mediaIndexJobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const mediaIndexArtifactKindSchema = z.enum([
  "AUDIO_FINGERPRINT",
  "THUMBNAIL_SUGGESTIONS",
]);

export const mediaIndexArtifactMethodSchema = z.enum([
  "BYTE_SAMPLED_AUDIO_PROXY_V1",
  "DECODED_AUDIO_FINGERPRINT_V1",
  "FFMPEG_TIMELINE_THUMBNAILS_V1",
]);

export const mediaAlignmentJobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
]);

export const mediaAlignmentMethodSchema = z.enum([
  "AUDIO_PROXY_BUCKET_CORRELATION_V1",
  "DECODED_AUDIO_BUCKET_CORRELATION_V1",
]);

export const mediaAlignmentMatchKindSchema = z.enum([
  "EDIT_TO_VOD_KEEP",
  "CLIP_TO_VOD_MATCH",
]);

export const mediaEditAlignmentKindSchema = z.enum([
  "PROVISIONAL_KEEP",
  "PROVISIONAL_REMOVED_POOL",
  "CONFIRMED_KEEP",
  "CONFIRMED_REMOVED",
]);

export const mediaEditAlignmentMethodSchema = z.enum([
  "RUNTIME_PROPORTIONAL_ESTIMATE",
  "AUDIO_PROXY_ALIGNMENT",
  "DECODED_AUDIO_ALIGNMENT",
  "MANUAL",
]);

export const mediaIndexSummarySchema = z.object({
  methodVersion: z.enum(["MEDIA_INDEX_V1"]),
  generatedAt: z.string(),
  sourcePath: z.string(),
  fileName: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  kind: z.enum(["VIDEO", "AUDIO"]),
  format: z.string(),
  durationSeconds: z.number().positive(),
  frameRate: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  videoCodec: z.string().optional(),
  audioCodec: z.string().optional(),
  hasVideo: z.boolean(),
  hasAudio: z.boolean(),
  streamCount: z.number().int().nonnegative(),
  notes: z.array(z.string()).default([]),
});

export const mediaIndexAudioBucketSchema = z.object({
  index: z.number().int().nonnegative(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  energyScore: z.number().min(0).max(1),
  onsetScore: z.number().min(0).max(1),
  spectralFluxScore: z.number().min(0).max(1),
  silenceScore: z.number().min(0).max(1),
  fingerprint: z.string(),
});

export const mediaThumbnailSuggestionSchema = z.object({
  id: z.string(),
  imagePath: z.string(),
  timestampSeconds: z.number().nonnegative(),
  score: z.number().min(0).max(1),
  activityScore: z.number().min(0).max(1),
  brightnessScore: z.number().min(0).max(1),
  contrastScore: z.number().min(0).max(1),
  sharpnessScore: z.number().min(0).max(1),
  note: z.string(),
});

export const mediaThumbnailSuggestionSetSchema = z.object({
  methodVersion: z.enum(["FFMPEG_TIMELINE_THUMBNAILS_V1"]),
  generatedAt: z.string(),
  sourcePath: z.string(),
  sampleWindowCount: z.number().int().nonnegative(),
  note: z.string(),
  suggestions: z.array(mediaThumbnailSuggestionSchema).default([]),
});

export const mediaThumbnailOutputSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  sourceSuggestionId: z.string(),
  imagePath: z.string(),
  timestampSeconds: z.number().nonnegative(),
  score: z.number().min(0).max(1),
  activityScore: z.number().min(0).max(1),
  brightnessScore: z.number().min(0).max(1),
  contrastScore: z.number().min(0).max(1),
  sharpnessScore: z.number().min(0).max(1),
  note: z.string(),
  position: z.number().int().nonnegative(),
  selectedAt: z.string(),
});

export const mediaThumbnailOutputSetSchema = z.object({
  updatedAt: z.string(),
  outputs: z.array(mediaThumbnailOutputSchema).default([]),
});

export const mediaIndexArtifactSummarySchema = z.object({
  latestAudioFingerprintArtifactId: z.string().optional(),
  audioFingerprintBucketCount: z.number().int().nonnegative().default(0),
  audioFingerprintMethod: mediaIndexArtifactMethodSchema.optional(),
  audioFingerprintUpdatedAt: z.string().optional(),
  latestThumbnailSuggestionArtifactId: z.string().optional(),
  thumbnailSuggestionCount: z.number().int().nonnegative().default(0),
  thumbnailSuggestionMethod: mediaIndexArtifactMethodSchema.optional(),
  thumbnailSuggestionUpdatedAt: z.string().optional(),
  bucketDurationSeconds: z.number().positive().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
});

export const mediaIndexArtifactSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  jobId: z.string().optional(),
  kind: mediaIndexArtifactKindSchema,
  method: mediaIndexArtifactMethodSchema,
  bucketDurationSeconds: z.number().positive(),
  durationSeconds: z.number().positive(),
  bucketCount: z.number().int().nonnegative(),
  confidenceScore: z.number().min(0).max(1),
  payloadByteSize: z.number().int().nonnegative(),
  energyMean: z.number().min(0).max(1).optional(),
  energyPeak: z.number().min(0).max(1).optional(),
  onsetMean: z.number().min(0).max(1).optional(),
  silenceShare: z.number().min(0).max(1).optional(),
  sampleWindowCount: z.number().int().nonnegative().optional(),
  buckets: z.array(mediaIndexAudioBucketSchema).default([]),
  thumbnailSuggestions: z.array(mediaThumbnailSuggestionSchema).default([]),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const mediaLibraryAssetSchema = z.object({
  id: z.string(),
  assetType: mediaLibraryAssetTypeSchema,
  scope: mediaLibraryAssetScopeSchema,
  profileId: z.string().optional(),
  sourceType: exampleClipSourceTypeSchema,
  sourceValue: z.string(),
  title: z.string().optional(),
  note: z.string().optional(),
  status: exampleClipStatusSchema.default("REFERENCE_ONLY"),
  statusDetail: z.string().optional(),
  featureSummary: exampleClipFeatureSummarySchema.optional(),
  indexSummary: mediaIndexSummarySchema.optional(),
  indexArtifactSummary: mediaIndexArtifactSummarySchema.optional(),
  thumbnailSuggestionSet: mediaThumbnailSuggestionSetSchema.optional(),
  thumbnailOutputSet: mediaThumbnailOutputSetSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const mediaIndexJobSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  status: mediaIndexJobStatusSchema,
  progress: z.number().min(0).max(1),
  statusDetail: z.string(),
  errorMessage: z.string().optional(),
  result: mediaIndexSummarySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
});

export const mediaAlignmentBucketMatchSchema = z.object({
  queryBucketIndex: z.number().int().nonnegative(),
  sourceBucketIndex: z.number().int().nonnegative(),
  score: z.number().min(0).max(1),
});

export const mediaAlignmentMatchSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  pairId: z.string().optional(),
  sourceAssetId: z.string(),
  queryAssetId: z.string(),
  kind: mediaAlignmentMatchKindSchema,
  method: mediaAlignmentMethodSchema,
  sourceRange: timeRangeSchema,
  queryRange: timeRangeSchema,
  score: z.number().min(0).max(1),
  confidenceScore: z.number().min(0).max(1),
  matchedBucketCount: z.number().int().nonnegative(),
  totalQueryBucketCount: z.number().int().nonnegative(),
  bucketMatches: z.array(mediaAlignmentBucketMatchSchema).default([]),
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const mediaAlignmentJobSchema = z.object({
  id: z.string(),
  pairId: z.string().optional(),
  sourceAssetId: z.string(),
  queryAssetId: z.string(),
  status: mediaAlignmentJobStatusSchema,
  progress: z.number().min(0).max(1),
  statusDetail: z.string(),
  errorMessage: z.string().optional(),
  method: mediaAlignmentMethodSchema,
  matchCount: z.number().int().nonnegative().default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
});

export const mediaEditAlignmentSegmentSchema = z.object({
  id: z.string(),
  kind: mediaEditAlignmentKindSchema,
  method: mediaEditAlignmentMethodSchema,
  sourceRange: timeRangeSchema.optional(),
  editRange: timeRangeSchema.optional(),
  estimatedSourceSeconds: z.number().nonnegative().optional(),
  estimatedEditSeconds: z.number().nonnegative().optional(),
  confidenceScore: z.number().min(0).max(1),
  note: z.string(),
});

export const mediaEditPairSchema = z.object({
  id: z.string(),
  vodAssetId: z.string(),
  editAssetId: z.string(),
  profileId: z.string().optional(),
  title: z.string().optional(),
  note: z.string().optional(),
  status: mediaEditPairStatusSchema,
  statusDetail: z.string(),
  sourceDurationSeconds: z.number().positive().optional(),
  editDurationSeconds: z.number().positive().optional(),
  keptDurationSeconds: z.number().nonnegative().optional(),
  removedDurationSeconds: z.number().nonnegative().optional(),
  keepRatio: z.number().min(0).max(1).optional(),
  compressionRatio: z.number().positive().optional(),
  alignmentSegments: z.array(mediaEditAlignmentSegmentSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type MediaLibraryAssetType = z.infer<typeof mediaLibraryAssetTypeSchema>;
export type MediaLibraryAssetScope = z.infer<
  typeof mediaLibraryAssetScopeSchema
>;
export type MediaEditPairStatus = z.infer<typeof mediaEditPairStatusSchema>;
export type MediaIndexJobStatus = z.infer<typeof mediaIndexJobStatusSchema>;
export type MediaIndexArtifactKind = z.infer<
  typeof mediaIndexArtifactKindSchema
>;
export type MediaIndexArtifactMethod = z.infer<
  typeof mediaIndexArtifactMethodSchema
>;
export type MediaAlignmentJobStatus = z.infer<
  typeof mediaAlignmentJobStatusSchema
>;
export type MediaAlignmentMethod = z.infer<typeof mediaAlignmentMethodSchema>;
export type MediaAlignmentMatchKind = z.infer<
  typeof mediaAlignmentMatchKindSchema
>;
export type MediaEditAlignmentKind = z.infer<
  typeof mediaEditAlignmentKindSchema
>;
export type MediaEditAlignmentMethod = z.infer<
  typeof mediaEditAlignmentMethodSchema
>;
export type MediaIndexSummary = z.infer<typeof mediaIndexSummarySchema>;
export type MediaIndexAudioBucket = z.infer<typeof mediaIndexAudioBucketSchema>;
export type MediaIndexArtifactSummary = z.infer<
  typeof mediaIndexArtifactSummarySchema
>;
export type MediaIndexArtifact = z.infer<typeof mediaIndexArtifactSchema>;
export type MediaLibraryAsset = z.infer<typeof mediaLibraryAssetSchema>;
export type MediaIndexJob = z.infer<typeof mediaIndexJobSchema>;
export type MediaAlignmentBucketMatch = z.infer<
  typeof mediaAlignmentBucketMatchSchema
>;
export type MediaAlignmentMatch = z.infer<typeof mediaAlignmentMatchSchema>;
export type MediaAlignmentJob = z.infer<typeof mediaAlignmentJobSchema>;
export type MediaEditAlignmentSegment = z.infer<
  typeof mediaEditAlignmentSegmentSchema
>;
export type MediaEditPair = z.infer<typeof mediaEditPairSchema>;
