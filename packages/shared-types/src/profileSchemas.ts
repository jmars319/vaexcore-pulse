import { z } from "zod";

import {
  analysisCoverageBandSchema,
  analysisCoverageFlagSchema,
  reasonCodeSchema,
} from "./coreSchemas";

export const exampleClipSourceTypeSchema = z.enum([
  "TWITCH_CLIP_URL",
  "YOUTUBE_SHORT_URL",
  "LOCAL_FILE_UPLOAD",
  "LOCAL_FILE_PATH",
]);

export const exampleReferenceKindSchema = z.enum(["CLIP", "PROFILE_EDIT"]);

export const exampleClipStatusSchema = z.enum([
  "REFERENCE_ONLY",
  "LOCAL_FILE_AVAILABLE",
  "MISSING_LOCAL_FILE",
]);

export const profileMatchingMethodSchema = z.enum([
  "NONE",
  "LOCAL_FILE_HEURISTIC",
]);

export const exampleClipFeatureSummarySchema = z.object({
  methodVersion: z.enum(["LOCAL_FILE_HEURISTIC_V1", "LOCAL_FILE_HEURISTIC_V2"]),
  generatedAt: z.string(),
  durationSeconds: z.number().positive(),
  transcriptChunkCount: z.number().int().nonnegative(),
  transcriptDensityPerMinute: z.number().nonnegative(),
  candidateSeedCount: z.number().int().nonnegative(),
  candidateDensityPerMinute: z.number().nonnegative(),
  transcriptAnchorTerms: z.array(z.string()).default([]),
  transcriptAnchorPhrases: z.array(z.string()).default([]),
  speechDensityMean: z.number().min(0).max(1),
  speechDensityPeak: z.number().min(0).max(1),
  energyMean: z.number().min(0).max(1),
  energyPeak: z.number().min(0).max(1),
  pacingMean: z.number().min(0).max(1),
  overlapActivityMean: z.number().min(0).max(1),
  highActivityShare: z.number().min(0).max(1),
  topReasonCodes: z.array(reasonCodeSchema).default([]),
  coverageBand: analysisCoverageBandSchema,
  coverageFlags: z.array(analysisCoverageFlagSchema).default([]),
});

export const exampleClipSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  sourceType: exampleClipSourceTypeSchema,
  sourceValue: z.string(),
  referenceKind: exampleReferenceKindSchema.default("CLIP"),
  title: z.string().optional(),
  note: z.string().optional(),
  status: exampleClipStatusSchema.default("REFERENCE_ONLY"),
  statusDetail: z.string().optional(),
  featureSummary: exampleClipFeatureSummarySchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const candidateProfileMatchStatusSchema = z.enum([
  "UNASSESSED",
  "PLACEHOLDER",
  "HEURISTIC",
  "EXAMPLE_COMPARISON",
]);

export const candidateProfileMatchStrengthSchema = z.enum([
  "UNASSESSED",
  "STRONG",
  "POSSIBLE",
  "WEAK",
]);

export const candidateProfileMatchSchema = z.object({
  profileId: z.string(),
  method: profileMatchingMethodSchema.default("NONE"),
  status: candidateProfileMatchStatusSchema,
  strength: candidateProfileMatchStrengthSchema,
  note: z.string(),
  matchedExampleClipIds: z.array(z.string()).default([]),
  comparedExampleCount: z.number().int().nonnegative().default(0),
  supportingFactors: z.array(z.string()).default([]),
  limitingFactors: z.array(z.string()).default([]),
  similarityScore: z.number().min(0).max(1).optional(),
  updatedAt: z.string().optional(),
});

export const profileStateSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const profileSourceSchema = z.enum(["SYSTEM", "USER"]);

export const profilePresentationModeSchema = z.enum([
  "ALL_CANDIDATES",
  "PROFILE_VIEW",
  "STRONG_MATCHES",
]);

export const clipProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  description: z.string().default(""),
  createdAt: z.string(),
  updatedAt: z.string(),
  state: profileStateSchema.default("ACTIVE"),
  source: profileSourceSchema.default("USER"),
  mode: z
    .enum(["BROAD", "FOCUSED", "CONTEXTUAL", "EXAMPLE_DRIVEN"])
    .default("EXAMPLE_DRIVEN"),
  signalWeights: z.record(z.string(), z.number()).default({}),
  exampleClips: z.array(exampleClipSchema).default([]),
});

export const contentProfileSchema = clipProfileSchema;

export const profileMatchingSummarySchema = z.object({
  profileId: z.string(),
  totalExampleCount: z.number().int().nonnegative(),
  usableLocalExampleCount: z.number().int().nonnegative(),
  referenceOnlyExampleCount: z.number().int().nonnegative(),
  unavailableLocalExampleCount: z.number().int().nonnegative(),
  ready: z.boolean(),
  method: profileMatchingMethodSchema,
  note: z.string(),
});

export type ExampleClipSourceType = z.infer<typeof exampleClipSourceTypeSchema>;
export type ExampleReferenceKind = z.infer<typeof exampleReferenceKindSchema>;
export type ExampleClipStatus = z.infer<typeof exampleClipStatusSchema>;
export type ProfileMatchingMethod = z.infer<typeof profileMatchingMethodSchema>;
export type ExampleClipFeatureSummary = z.infer<
  typeof exampleClipFeatureSummarySchema
>;
export type ExampleClip = z.infer<typeof exampleClipSchema>;
export type CandidateProfileMatchStatus = z.infer<
  typeof candidateProfileMatchStatusSchema
>;
export type CandidateProfileMatchStrength = z.infer<
  typeof candidateProfileMatchStrengthSchema
>;
export type CandidateProfileMatch = z.infer<typeof candidateProfileMatchSchema>;
export type ProfileState = z.infer<typeof profileStateSchema>;
export type ProfileSource = z.infer<typeof profileSourceSchema>;
export type ProfilePresentationMode = z.infer<
  typeof profilePresentationModeSchema
>;
export type ClipProfile = z.infer<typeof clipProfileSchema>;
export type ContentProfile = z.infer<typeof contentProfileSchema>;
export type ProfileMatchingSummary = z.infer<
  typeof profileMatchingSummarySchema
>;
