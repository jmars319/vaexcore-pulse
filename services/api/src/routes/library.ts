import type { FastifyPluginAsync } from "fastify";
import { registerLibraryAlignmentRoutes } from "./libraryAlignmentRoutes.js";
import { registerLibraryAssetRoutes } from "./libraryAssetRoutes.js";
import { registerLibraryIndexRoutes } from "./libraryIndexRoutes.js";
import { registerLibraryPairRoutes } from "./libraryPairRoutes.js";

export const libraryRoutes: FastifyPluginAsync = async (fastify) => {
  registerLibraryAssetRoutes(fastify);
  registerLibraryPairRoutes(fastify);
  registerLibraryIndexRoutes(fastify);
  registerLibraryAlignmentRoutes(fastify);
};
