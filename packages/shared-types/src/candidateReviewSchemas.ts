import { z } from "zod";

import {
  confidenceBandSchema,
  reasonCodeSchema,
  reviewActionSchema,
  reviewTagSchema,
  scoreContributionSchema,
  suggestedSegmentSchema,
  timeRangeSchema,
} from "./coreSchemas";
import { candidateProfileMatchSchema } from "./profileSchemas";

export const candidateEditRecordSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "MANUAL_CREATE",
    "SPLIT",
    "MERGE",
    "RANK_ADJUST",
    "TRANSCRIPT_CORRECTION",
    "DUPLICATE_SCAN",
  ]),
  note: z.string(),
  sourceCandidateIds: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export const candidateWindowSchema = z.object({
  id: z.string(),
  candidateWindow: timeRangeSchema,
  suggestedSegment: suggestedSegmentSchema,
  confidenceBand: confidenceBandSchema,
  scoreEstimate: z.number().min(0).max(1),
  reasonCodes: z.array(reasonCodeSchema).min(1),
  transcriptSnippet: z.string(),
  scoreBreakdown: z.array(scoreContributionSchema).min(1),
  contextRequired: z.boolean().default(false),
  editableLabel: z.string(),
  reviewTags: z.array(reviewTagSchema).default([]),
  profileMatches: z
    .array(z.lazy(() => candidateProfileMatchSchema))
    .default([]),
  rankAdjustment: z.number().default(0),
  qualitySignals: z.record(z.string(), z.number()).default({}),
  duplicateOfCandidateId: z.string().optional(),
  nearDuplicateCandidateIds: z.array(z.string()).default([]),
  editHistory: z.array(candidateEditRecordSchema).default([]),
});

export const reviewDecisionSchema = z.object({
  id: z.string(),
  projectSessionId: z.string(),
  candidateId: z.string(),
  action: reviewActionSchema,
  label: z.string().optional(),
  adjustedSegment: timeRangeSchema.optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
});

export type CandidateWindow = z.infer<typeof candidateWindowSchema>;
export type CandidateEditRecord = z.infer<typeof candidateEditRecordSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export type CandidateDecisionMap = Record<string, ReviewDecision | undefined>;
