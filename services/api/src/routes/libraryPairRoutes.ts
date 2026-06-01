import type { FastifyInstance } from "fastify";
import { createMediaEditPairRequestSchema } from "@vaexcore/pulse-shared-types";
import { createMediaEditPair, requestMediaEditPairs } from "../lib/analyzer.js";
import {
  sendAnalyzerRouteError,
  sendInvalidRequest,
} from "./libraryRouteHelpers.js";

export const registerLibraryPairRoutes = (fastify: FastifyInstance) => {
  fastify.get("/api/library/pairs", async (_request, reply) => {
    try {
      return reply.code(200).send(await requestMediaEditPairs());
    } catch (error) {
      return sendAnalyzerRouteError(reply, error, "media_pair_list_failed");
    }
  });

  fastify.post("/api/library/pairs", async (request, reply) => {
    const parsedRequest = createMediaEditPairRequestSchema.safeParse(
      request.body,
    );
    if (!parsedRequest.success) {
      return sendInvalidRequest(reply, parsedRequest.error.issues[0]?.message);
    }

    try {
      return reply
        .code(200)
        .send(await createMediaEditPair(parsedRequest.data));
    } catch (error) {
      return sendAnalyzerRouteError(reply, error, "media_pair_create_failed");
    }
  });
};
