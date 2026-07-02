import { z } from "zod";

import {
  candidateWindowSchema,
  reviewDecisionSchema,
} from "./candidateReviewSchemas";
import {
  analysisCoverageSchema,
  analysisProvenanceSchema,
  defaultAnalysisCoverage,
  defaultAnalysisProvenance,
  featureWindowSchema,
  mediaSourceSchema,
  speechRegionSchema,
  transcriptChunkSchema,
} from "./coreSchemas";

export const settingsSchema = z.object({
  microWindowSeconds: z.number().positive(),
  candidateWindowMinSeconds: z.number().positive(),
  candidateWindowMaxSeconds: z.number().positive(),
  suggestedSetupPaddingSeconds: z.number().nonnegative(),
  suggestedResolutionPaddingSeconds: z.number().nonnegative(),
  experimentalCandidateQuota: z.number().int().nonnegative(),
  transcriptProvider: z.string(),
  runOfflineOnly: z.boolean(),
});

export const projectSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["IDLE", "ANALYZING", "READY", "REVIEWING"]),
  mediaSource: mediaSourceSchema,
  analysisCoverage: analysisCoverageSchema.default(defaultAnalysisCoverage),
  analysisProvenance: analysisProvenanceSchema.default(
    defaultAnalysisProvenance,
  ),
  profileId: z.string(),
  settings: settingsSchema,
  transcript: z.array(transcriptChunkSchema),
  speechRegions: z.array(speechRegionSchema),
  featureWindows: z.array(featureWindowSchema),
  candidates: z.array(candidateWindowSchema),
  reviewDecisions: z.array(reviewDecisionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectSessionSummarySchema = z.object({
  sessionId: z.string(),
  sessionTitle: z.string(),
  sourcePath: z.string(),
  sourceName: z.string(),
  status: z.enum(["IDLE", "ANALYZING", "READY", "REVIEWING"]),
  analysisCoverage: analysisCoverageSchema.default(defaultAnalysisCoverage),
  profileId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  candidateCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
});

export type Settings = z.infer<typeof settingsSchema>;
export type ProjectSession = z.infer<typeof projectSessionSchema>;
export type ProjectSessionSummary = z.infer<typeof projectSessionSummarySchema>;

export const defaultSettings: Settings = {
  microWindowSeconds: 2,
  candidateWindowMinSeconds: 15,
  candidateWindowMaxSeconds: 45,
  suggestedSetupPaddingSeconds: 6,
  suggestedResolutionPaddingSeconds: 8,
  experimentalCandidateQuota: 2,
  transcriptProvider: "stub-local",
  runOfflineOnly: true,
};
