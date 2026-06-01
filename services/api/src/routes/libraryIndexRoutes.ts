import type { FastifyInstance } from "fastify";
import {
  cancelMediaIndexJobRequestSchema,
  createMediaIndexJobRequestSchema,
} from "@vaexcore/pulse-shared-types";
import {
  cancelMediaIndexJob,
  createMediaIndexJob,
  requestMediaIndexArtifacts,
  requestMediaIndexJobs,
} from "../lib/analyzer.js";
import {
  requiredParam,
  sendAnalyzerRouteError,
  sendInvalidRequest,
} from "./libraryRouteHelpers.js";

export const registerLibraryIndexRoutes = (fastify: FastifyInstance) => {
  fastify.get("/api/library/index-jobs", async (_request, reply) => {
    try {
      return reply.code(200).send(await requestMediaIndexJobs());
    } catch (error) {
      return sendAnalyzerRouteError(
        reply,
        error,
        "media_index_job_list_failed",
      );
    }
  });

  fastify.get("/api/library/index-artifacts", async (_request, reply) => {
    try {
      return reply.code(200).send(await requestMediaIndexArtifacts());
    } catch (error) {
      return sendAnalyzerRouteError(
        reply,
        error,
        "media_index_artifact_list_failed",
      );
    }
  });

  fastify.get(
    "/api/library/assets/:assetId/index-artifacts",
    async (request, reply) => {
      const params = request.params as { assetId?: string };
      const assetId = requiredParam(reply, params.assetId, "assetId");
      if (!assetId) return;

      try {
        return reply.code(200).send(await requestMediaIndexArtifacts(assetId));
      } catch (error) {
        return sendAnalyzerRouteError(
          reply,
          error,
          "media_index_artifact_list_failed",
        );
      }
    },
  );

  fastify.post(
    "/api/library/assets/:assetId/index-jobs",
    async (request, reply) => {
      const params = request.params as { assetId?: string };
      const parsedRequest = createMediaIndexJobRequestSchema.safeParse({
        assetId: params.assetId,
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
          .send(await createMediaIndexJob(parsedRequest.data));
      } catch (error) {
        return sendAnalyzerRouteError(
          reply,
          error,
          "media_index_job_create_failed",
        );
      }
    },
  );

  fastify.post(
    "/api/library/index-jobs/:jobId/cancel",
    async (request, reply) => {
      const params = request.params as { jobId?: string };
      const parsedRequest = cancelMediaIndexJobRequestSchema.safeParse({
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
          .send(await cancelMediaIndexJob(parsedRequest.data));
      } catch (error) {
        return sendAnalyzerRouteError(
          reply,
          error,
          "media_index_job_cancel_failed",
        );
      }
    },
  );
};
