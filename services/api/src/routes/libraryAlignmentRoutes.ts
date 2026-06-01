import type { FastifyInstance } from "fastify";
import {
  cancelMediaAlignmentJobRequestSchema,
  createMediaAlignmentJobRequestSchema,
} from "@vaexcore/pulse-shared-types";
import {
  cancelMediaAlignmentJob,
  createMediaAlignmentJob,
  requestMediaAlignmentJobs,
  requestMediaAlignmentMatches,
} from "../lib/analyzer.js";
import {
  requiredParam,
  sendAnalyzerRouteError,
  sendInvalidRequest,
} from "./libraryRouteHelpers.js";

export const registerLibraryAlignmentRoutes = (fastify: FastifyInstance) => {
  fastify.get("/api/library/alignment-jobs", async (_request, reply) => {
    try {
      return reply.code(200).send(await requestMediaAlignmentJobs());
    } catch (error) {
      return sendAnalyzerRouteError(
        reply,
        error,
        "media_alignment_job_list_failed",
      );
    }
  });

  fastify.get("/api/library/alignment-matches", async (_request, reply) => {
    try {
      return reply.code(200).send(await requestMediaAlignmentMatches());
    } catch (error) {
      return sendAnalyzerRouteError(
        reply,
        error,
        "media_alignment_match_list_failed",
      );
    }
  });

  fastify.get(
    "/api/library/pairs/:pairId/alignment-matches",
    async (request, reply) => {
      const params = request.params as { pairId?: string };
      const pairId = requiredParam(reply, params.pairId, "pairId");
      if (!pairId) return;

      try {
        return reply.code(200).send(await requestMediaAlignmentMatches(pairId));
      } catch (error) {
        return sendAnalyzerRouteError(
          reply,
          error,
          "media_alignment_match_list_failed",
        );
      }
    },
  );

  fastify.post("/api/library/alignment-jobs", async (request, reply) => {
    const parsedRequest = createMediaAlignmentJobRequestSchema.safeParse(
      request.body,
    );
    if (!parsedRequest.success) {
      return sendInvalidRequest(reply, parsedRequest.error.issues[0]?.message);
    }

    try {
      return reply
        .code(200)
        .send(await createMediaAlignmentJob(parsedRequest.data));
    } catch (error) {
      return sendAnalyzerRouteError(
        reply,
        error,
        "media_alignment_job_create_failed",
      );
    }
  });

  fastify.post(
    "/api/library/pairs/:pairId/alignment-jobs",
    async (request, reply) => {
      const params = request.params as { pairId?: string };
      const parsedRequest = createMediaAlignmentJobRequestSchema.safeParse({
        pairId: params.pairId,
      });
      if (!parsedRequest.success) {
        return sendInvalidRequest(
          reply,
          parsedRequest.error.issues[0]?.message,
        );
      }

      try {
        return reply
          .code(200)
          .send(await createMediaAlignmentJob(parsedRequest.data));
      } catch (error) {
        return sendAnalyzerRouteError(
          reply,
          error,
          "media_alignment_job_create_failed",
        );
      }
    },
  );

  fastify.post(
    "/api/library/alignment-jobs/:jobId/cancel",
    async (request, reply) => {
      const params = request.params as { jobId?: string };
      const parsedRequest = cancelMediaAlignmentJobRequestSchema.safeParse({
        jobId: params.jobId,
      });
      if (!parsedRequest.success) {
        return sendInvalidRequest(
          reply,
          parsedRequest.error.issues[0]?.message,
        );
      }

      try {
        return reply
          .code(200)
          .send(await cancelMediaAlignmentJob(parsedRequest.data));
      } catch (error) {
        return sendAnalyzerRouteError(
          reply,
          error,
          "media_alignment_job_cancel_failed",
        );
      }
    },
  );
};
