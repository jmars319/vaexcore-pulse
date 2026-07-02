import { z } from "zod";
import {
  exampleClipSourceTypeSchema,
  mediaLibraryAssetScopeSchema,
  mediaLibraryAssetTypeSchema,
  profileStateSchema,
  reviewActionSchema,
  suggestedSegmentSchema,
  timeRangeSchema,
} from "./domain";

export const analyzeProjectRequestSchema = z.object({
  sourcePath: z.string().trim().min(1, "sourcePath is required"),
  profileId: z.string().trim().min(1).optional(),
  sessionTitle: z.string().trim().min(1).max(160).optional(),
  transcriptPath: z.string().trim().min(1).optional(),
});

export const reviewMutationActionSchema = reviewActionSchema.exclude([
  "PENDING",
]);

export const candidateEditActionSchema = z.enum([
  "CREATE",
  "SPLIT",
  "MERGE",
  "RANK",
  "TRANSCRIPT_CORRECTION",
]);

export const createClipProfileRequestSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120),
  description: z.string().trim().max(2000).optional(),
  state: profileStateSchema.optional(),
});

export const addExampleClipRequestSchema = z.object({
  sourceType: exampleClipSourceTypeSchema,
  sourceValue: z.string().trim().min(1, "sourceValue is required").max(4000),
  title: z.string().trim().min(1).max(160).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
});

export const createMediaLibraryAssetRequestSchema = z
  .object({
    assetType: mediaLibraryAssetTypeSchema,
    scope: mediaLibraryAssetScopeSchema,
    profileId: z.string().trim().min(1).optional(),
    sourceType: exampleClipSourceTypeSchema,
    sourceValue: z.string().trim().min(1, "sourceValue is required").max(4000),
    title: z.string().trim().min(1).max(160).optional(),
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .superRefine((value, context) => {
    if (value.scope === "PROFILE" && !value.profileId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "profileId is required when scope is PROFILE",
        path: ["profileId"],
      });
    }

    if (
      value.assetType !== "CLIP" &&
      !["LOCAL_FILE_UPLOAD", "LOCAL_FILE_PATH"].includes(value.sourceType)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "VOD and EDIT assets must use a local file source",
        path: ["sourceType"],
      });
    }
  });

export const createMediaEditPairRequestSchema = z.object({
  vodAssetId: z.string().trim().min(1, "vodAssetId is required"),
  editAssetId: z.string().trim().min(1, "editAssetId is required"),
  profileId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  note: z.string().trim().min(1).max(2000).optional(),
});

export const createMediaIndexJobRequestSchema = z.object({
  assetId: z.string().trim().min(1, "assetId is required"),
});

export const replaceMediaThumbnailOutputsRequestSchema = z
  .object({
    selectedSuggestionIds: z
      .array(
        z.string().trim().min(1, "selectedSuggestionIds entries are required"),
      )
      .max(8),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const [index, suggestionId] of value.selectedSuggestionIds.entries()) {
      if (seen.has(suggestionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "selectedSuggestionIds must be unique",
          path: ["selectedSuggestionIds", index],
        });
        return;
      }
      seen.add(suggestionId);
    }
  });

export const cancelMediaIndexJobRequestSchema = z.object({
  jobId: z.string().trim().min(1, "jobId is required"),
});

export const createMediaAlignmentJobRequestSchema = z
  .object({
    pairId: z.string().trim().min(1).optional(),
    sourceAssetId: z.string().trim().min(1).optional(),
    queryAssetId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.pairId) {
      return;
    }

    if (!value.sourceAssetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sourceAssetId is required when pairId is not provided",
        path: ["sourceAssetId"],
      });
    }

    if (!value.queryAssetId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "queryAssetId is required when pairId is not provided",
        path: ["queryAssetId"],
      });
    }
  });

export const cancelMediaAlignmentJobRequestSchema = z.object({
  jobId: z.string().trim().min(1, "jobId is required"),
});

export const reviewUpdateRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1, "sessionId is required"),
    candidateId: z.string().trim().min(1, "candidateId is required"),
    action: reviewMutationActionSchema,
    label: z.string().trim().min(1).max(160).optional(),
    adjustedSegment: timeRangeSchema.optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
    timestamp: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "RELABEL" && !value.label) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "label is required for RELABEL actions",
        path: ["label"],
      });
    }

    if (value.action === "RETIME" && !value.adjustedSegment) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "adjustedSegment is required for RETIME actions",
        path: ["adjustedSegment"],
      });
    }
  });

export const candidateEditRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1, "sessionId is required"),
    action: candidateEditActionSchema,
    candidateId: z.string().trim().min(1).optional(),
    targetCandidateId: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).max(160).optional(),
    transcriptSnippet: z.string().trim().min(1).max(2000).optional(),
    candidateWindow: timeRangeSchema.optional(),
    suggestedSegment: suggestedSegmentSchema.optional(),
    splitSeconds: z.number().nonnegative().optional(),
    rankDelta: z.number().int().min(-20).max(20).optional(),
    transcriptChunkId: z.string().trim().min(1).optional(),
    transcriptText: z.string().trim().min(1).max(4000).optional(),
    timestamp: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "CREATE") {
      if (!value.candidateWindow) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "candidateWindow is required for CREATE actions",
          path: ["candidateWindow"],
        });
      }
      if (!value.suggestedSegment) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "suggestedSegment is required for CREATE actions",
          path: ["suggestedSegment"],
        });
      }
      if (!value.label) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "label is required for CREATE actions",
          path: ["label"],
        });
      }
    }

    if (["SPLIT", "MERGE", "RANK"].includes(value.action)) {
      if (!value.candidateId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "candidateId is required for this candidate edit",
          path: ["candidateId"],
        });
      }
    }

    if (value.action === "MERGE" && !value.targetCandidateId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetCandidateId is required for MERGE actions",
        path: ["targetCandidateId"],
      });
    }

    if (value.action === "RANK" && !value.rankDelta) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rankDelta is required for RANK actions",
        path: ["rankDelta"],
      });
    }

    if (value.action === "TRANSCRIPT_CORRECTION") {
      if (!value.transcriptChunkId) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "transcriptChunkId is required for transcript corrections",
          path: ["transcriptChunkId"],
        });
      }
      if (!value.transcriptText) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "transcriptText is required for transcript corrections",
          path: ["transcriptText"],
        });
      }
    }
  });

export type AnalyzeProjectRequest = z.infer<typeof analyzeProjectRequestSchema>;
export type ReviewMutationAction = z.infer<typeof reviewMutationActionSchema>;
export type ReviewUpdateRequest = z.infer<typeof reviewUpdateRequestSchema>;
export type CandidateEditAction = z.infer<typeof candidateEditActionSchema>;
export type CandidateEditRequest = z.infer<typeof candidateEditRequestSchema>;
export type CreateClipProfileRequest = z.infer<
  typeof createClipProfileRequestSchema
>;
export type AddExampleClipRequest = z.infer<typeof addExampleClipRequestSchema>;
export type CreateMediaLibraryAssetRequest = z.infer<
  typeof createMediaLibraryAssetRequestSchema
>;
export type CreateMediaEditPairRequest = z.infer<
  typeof createMediaEditPairRequestSchema
>;
export type CreateMediaIndexJobRequest = z.infer<
  typeof createMediaIndexJobRequestSchema
>;
export type ReplaceMediaThumbnailOutputsRequest = z.infer<
  typeof replaceMediaThumbnailOutputsRequestSchema
>;
export type CancelMediaIndexJobRequest = z.infer<
  typeof cancelMediaIndexJobRequestSchema
>;
export type CreateMediaAlignmentJobRequest = z.infer<
  typeof createMediaAlignmentJobRequestSchema
>;
export type CancelMediaAlignmentJobRequest = z.infer<
  typeof cancelMediaAlignmentJobRequestSchema
>;
