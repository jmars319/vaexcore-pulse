import type { FastifyPluginAsync } from "fastify";
import {
  analyzeProjectRequestSchema,
  candidateEditRequestSchema,
  reviewUpdateRequestSchema,
} from "@vaexcore/pulse-shared-types";
import {
  AnalyzerBridgeError,
  requestAnalyzerSession,
  requestSessionSummaries,
  requestStoredSession,
  submitCandidateEdit,
  submitReviewUpdate,
} from "../lib/analyzer.js";

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/projects", async (_request, reply) => {
    try {
      const sessions = await requestSessionSummaries();
      return reply.code(200).send(sessions);
    } catch (error) {
      if (error instanceof AnalyzerBridgeError) {
        const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
        return reply.code(statusCode).send({
          error: "session_list_failed",
          message: error.message,
        });
      }

      return reply.code(500).send({
        error: "session_list_failed",
        message: "Unexpected analyzer bridge failure",
      });
    }
  });

  fastify.get("/api/candidates/current", async () => {
    const sessions = await requestSessionSummaries();
    const currentSession = sessions[0];
    if (!currentSession) {
      return {
        projectId: null,
        candidates: [],
      };
    }

    const session = await requestStoredSession(currentSession.sessionId);
    return {
      projectId: session.id,
      candidates: session.candidates,
    };
  });

  fastify.post("/api/projects/analyze", async (request, reply) => {
    const parsedRequest = analyzeProjectRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.code(400).send({
        error: "invalid_request",
        message:
          parsedRequest.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    try {
      const session = await requestAnalyzerSession(parsedRequest.data);
      return reply.code(200).send(session);
    } catch (error) {
      if (error instanceof AnalyzerBridgeError) {
        const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
        return reply.code(statusCode).send({
          error: "analysis_failed",
          message: error.message,
        });
      }

      return reply.code(500).send({
        error: "analysis_failed",
        message: "Unexpected analyzer bridge failure",
      });
    }
  });

  fastify.get("/api/projects/:sessionId", async (request, reply) => {
    const sessionId = String(
      (request.params as { sessionId?: string }).sessionId ?? "",
    ).trim();
    if (!sessionId) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "sessionId is required",
      });
    }

    try {
      const session = await requestStoredSession(sessionId);
      return reply.code(200).send(session);
    } catch (error) {
      if (error instanceof AnalyzerBridgeError) {
        const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
        return reply.code(statusCode).send({
          error: "session_load_failed",
          message: error.message,
        });
      }

      return reply.code(500).send({
        error: "session_load_failed",
        message: "Unexpected analyzer bridge failure",
      });
    }
  });

  fastify.post("/api/projects/review", async (request, reply) => {
    const parsedRequest = reviewUpdateRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.code(400).send({
        error: "invalid_request",
        message:
          parsedRequest.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    try {
      const session = await submitReviewUpdate(parsedRequest.data);
      return reply.code(200).send(session);
    } catch (error) {
      if (error instanceof AnalyzerBridgeError) {
        const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
        return reply.code(statusCode).send({
          error: "review_failed",
          message: error.message,
        });
      }

      return reply.code(500).send({
        error: "review_failed",
        message: "Unexpected analyzer bridge failure",
      });
    }
  });

  fastify.post("/api/projects/candidates/edit", async (request, reply) => {
    const parsedRequest = candidateEditRequestSchema.safeParse(request.body);
    if (!parsedRequest.success) {
      return reply.code(400).send({
        error: "invalid_request",
        message:
          parsedRequest.error.issues[0]?.message ?? "Invalid request body",
      });
    }

    try {
      const session = await submitCandidateEdit(parsedRequest.data);
      return reply.code(200).send(session);
    } catch (error) {
      if (error instanceof AnalyzerBridgeError) {
        const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
        return reply.code(statusCode).send({
          error: "candidate_edit_failed",
          message: error.message,
        });
      }

      return reply.code(500).send({
        error: "candidate_edit_failed",
        message: "Unexpected analyzer bridge failure",
      });
    }
  });
};
