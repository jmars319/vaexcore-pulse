import { z } from "zod";

export const confidenceBandSchema = z.enum([
  "HIGH",
  "MEDIUM",
  "LOW",
  "EXPERIMENTAL",
]);

export const reasonCodeSchema = z.enum([
  "LOUDNESS_SPIKE",
  "LAUGHTER_BURST",
  "OVERLAP_SPIKE",
  "REACTION_PHRASE",
  "COMMENTARY_DENSITY",
  "SILENCE_BREAK",
  "ACTION_AUDIO_CLUSTER",
  "STRUCTURE_SETUP",
  "STRUCTURE_CONSEQUENCE",
  "STRUCTURE_RESOLUTION",
  "MENU_HEAVY",
  "CLEANUP_HEAVY",
  "LOW_INFORMATION",
  "CONTEXT_REQUIRED",
  "TACTICAL_NARRATION",
  "PITCH_EXCURSION",
  "ABRUPT_SILENCE_AFTER_INTENSITY",
]);

export const reviewActionSchema = z.enum([
  "PENDING",
  "ACCEPT",
  "REJECT",
  "DEFER",
  "RETIME",
  "RELABEL",
]);

export const reviewTagSchema = z.enum([
  "DEAD_AIR_RISK",
  "CLEANUP_RISK",
  "MENU_RISK",
  "LOW_INFORMATION_RISK",
]);

export const analysisCoverageBandSchema = z.enum(["STRONG", "PARTIAL", "THIN"]);

export const analysisCoverageFlagSchema = z.enum([
  "METADATA_FALLBACK_USED",
  "SEEDED_TRANSCRIPT",
  "TRANSCRIPT_SPARSE",
  "LOW_CANDIDATE_COUNT",
  "NO_CANDIDATES",
]);

export const analysisProvenanceStateSchema = z.enum([
  "MOCK",
  "REAL",
  "PARTIAL",
  "FAILED",
]);

export const analysisCoverageSchema = z.object({
  band: analysisCoverageBandSchema,
  note: z.string(),
  flags: z.array(analysisCoverageFlagSchema).default([]),
});

export const defaultAnalysisCoverage = {
  band: "PARTIAL",
  note: "Coverage note unavailable for this session.",
  flags: [],
} satisfies z.input<typeof analysisCoverageSchema>;

export const analysisProvenanceSchema = z.object({
  state: analysisProvenanceStateSchema,
  methodVersion: z.string(),
  transcriptSource: z.string(),
  audioSignalSource: z.string(),
  notes: z.array(z.string()).default([]),
});

export const defaultAnalysisProvenance = {
  state: "PARTIAL",
  methodVersion: "pulse-local-analyzer-v1",
  transcriptSource: "unknown",
  audioSignalSource: "heuristic",
  notes: [],
} satisfies z.input<typeof analysisProvenanceSchema>;

export const timeRangeSchema = z
  .object({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().nonnegative(),
  })
  .refine((value) => value.endSeconds > value.startSeconds, {
    message: "endSeconds must be greater than startSeconds",
  });

export const mediaSourceSchema = z.object({
  id: z.string(),
  path: z.string(),
  kind: z.enum(["VIDEO", "AUDIO"]),
  fileName: z.string(),
  durationSeconds: z.number().positive(),
  format: z.string(),
  fileSizeBytes: z.number().int().nonnegative().optional(),
  frameRate: z.number().positive().optional(),
  ingestNotes: z.array(z.string()).default([]),
});

export const transcriptChunkSchema = z.object({
  id: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  text: z.string(),
  confidence: z.number().min(0).max(1).optional(),
});

export const speechRegionSchema = z.object({
  id: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  speechDensity: z.number().min(0).max(1),
  overlapActivity: z.number().min(0).max(1),
});

export const featureWindowSchema = z.object({
  id: z.string(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  rmsLoudness: z.number().min(0).max(1),
  onsetDensity: z.number().min(0).max(1),
  spectralContrast: z.number().min(0).max(1),
  zeroCrossingRate: z.number().min(0).max(1),
  speechDensity: z.number().min(0).max(1),
  overlapActivity: z.number().min(0).max(1),
  laughterLikeBurst: z.number().min(0).max(1),
  pitchExcursion: z.number().min(0).max(1),
  abruptSilenceAfterIntensity: z.number().min(0).max(1),
});

export const scoreContributionSchema = z.object({
  reasonCode: reasonCodeSchema,
  label: z.string(),
  contribution: z.number(),
  direction: z.enum(["POSITIVE", "NEGATIVE"]),
});

export const suggestedSegmentSchema = z.object({
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative(),
  setupPaddingSeconds: z.number().nonnegative(),
  resolutionPaddingSeconds: z.number().nonnegative(),
  trimDeadAirApplied: z.boolean(),
});

export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;
export type ReasonCode = z.infer<typeof reasonCodeSchema>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export type ReviewTag = z.infer<typeof reviewTagSchema>;
export type AnalysisCoverageBand = z.infer<typeof analysisCoverageBandSchema>;
export type AnalysisCoverageFlag = z.infer<typeof analysisCoverageFlagSchema>;
export type AnalysisCoverage = z.infer<typeof analysisCoverageSchema>;
export type AnalysisProvenanceState = z.infer<
  typeof analysisProvenanceStateSchema
>;
export type AnalysisProvenance = z.infer<typeof analysisProvenanceSchema>;
export type TimeRange = z.infer<typeof timeRangeSchema>;
export type MediaSource = z.infer<typeof mediaSourceSchema>;
export type TranscriptChunk = z.infer<typeof transcriptChunkSchema>;
export type SpeechRegion = z.infer<typeof speechRegionSchema>;
export type FeatureWindow = z.infer<typeof featureWindowSchema>;
export type ScoreContribution = z.infer<typeof scoreContributionSchema>;
export type SuggestedSegment = z.infer<typeof suggestedSegmentSchema>;
