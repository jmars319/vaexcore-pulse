import type { FastifyReply } from "fastify";
import { AnalyzerBridgeError } from "../lib/analyzer.js";

export const sendAnalyzerRouteError = (
  reply: FastifyReply,
  error: unknown,
  errorCode: string,
) => {
  if (error instanceof AnalyzerBridgeError) {
    const statusCode = error.statusCode >= 500 ? 502 : error.statusCode;
    return reply.code(statusCode).send({
      error: errorCode,
      message: error.message,
    });
  }

  return reply.code(500).send({
    error: errorCode,
    message: "Unexpected analyzer bridge failure",
  });
};

export const sendInvalidRequest = (
  reply: FastifyReply,
  message = "Invalid request body",
) =>
  reply.code(400).send({
    error: "invalid_request",
    message,
  });

export const requiredParam = (
  reply: FastifyReply,
  value: string | undefined,
  name: string,
) => {
  if (value) return value;
  sendInvalidRequest(reply, `${name} is required`);
  return null;
};
