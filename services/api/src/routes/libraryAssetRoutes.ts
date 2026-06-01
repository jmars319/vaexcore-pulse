import type { FastifyInstance } from "fastify";
import {
  createMediaLibraryAssetRequestSchema,
  replaceMediaThumbnailOutputsRequestSchema,
} from "@vaexcore/pulse-shared-types";
import {
  createMediaLibraryAsset,
  replaceMediaThumbnailOutputs,
  requestMediaLibraryAssets,
} from "../lib/analyzer.js";
import {
  requiredParam,
  sendAnalyzerRouteError,
  sendInvalidRequest,
} from "./libraryRouteHelpers.js";

export const registerLibraryAssetRoutes = (fastify: FastifyInstance) => {
  fastify.get("/api/library/assets", async (_request, reply) => {
    try {
      return reply.code(200).send(await requestMediaLibraryAssets());
    } catch (error) {
      return sendAnalyzerRouteError(reply, error, "library_asset_list_failed");
    }
  });

  fastify.post("/api/library/assets", async (request, reply) => {
    const parsedRequest = createMediaLibraryAssetRequestSchema.safeParse(
      request.body,
    );
    if (!parsedRequest.success) {
      return sendInvalidRequest(reply, parsedRequest.error.issues[0]?.message);
    }

    try {
      return reply
        .code(200)
        .send(await createMediaLibraryAsset(parsedRequest.data));
    } catch (error) {
      return sendAnalyzerRouteError(
        reply,
        error,
        "library_asset_create_failed",
      );
    }
  });

  fastify.post(
    "/api/library/assets/:assetId/thumbnail-outputs",
    async (request, reply) => {
      const params = request.params as { assetId?: string };
      const assetId = requiredParam(reply, params.assetId, "assetId");
      if (!assetId) return;

      const parsedRequest = replaceMediaThumbnailOutputsRequestSchema.safeParse(
        request.body,
      );
      if (!parsedRequest.success) {
        return sendInvalidRequest(
          reply,
          parsedRequest.error.issues[0]?.message,
        );
      }

      try {
        return reply
          .code(200)
          .send(
            await replaceMediaThumbnailOutputs(assetId, parsedRequest.data),
          );
      } catch (error) {
        return sendAnalyzerRouteError(
          reply,
          error,
          "thumbnail_output_update_failed",
        );
      }
    },
  );
};
