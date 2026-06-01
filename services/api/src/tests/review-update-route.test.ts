import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { afterEach, describe, it } from "node:test";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { buildProjectSummary } from "@vaexcore/pulse-domain";
import { createMockProjectSession } from "@vaexcore/pulse-shared-types/testing";
import { buildApp } from "../app";

describe("api smoke routes", () => {
  afterEach(() => {
    delete process.env.VAEXCORE_PULSE_ANALYZER_URL;
    delete process.env.VAEXCORE_PULSE_ANALYZER_TIMEOUT_MS;
  });

  it("proxies review updates and returns the updated session", async () => {
    const analyzerSession = createMockProjectSession();
    analyzerSession.id = "session_media_review";
    analyzerSession.title = "Review Update Session";
    analyzerSession.reviewDecisions = [
      {
        id: "review_session_media_review_candidate_001",
        projectSessionId: analyzerSession.id,
        candidateId: analyzerSession.candidates[0].id,
        action: "RETIME",
        label: "Trim lead-in",
        adjustedSegment: {
          startSeconds: 318,
          endSeconds: 344,
        },
        createdAt: "2026-03-25T14:12:00.000Z",
      },
    ];
    analyzerSession.candidates[0].editableLabel = "Trim lead-in";
    analyzerSession.candidates[0].suggestedSegment.startSeconds = 318;
    analyzerSession.candidates[0].suggestedSegment.endSeconds = 344;

    let capturedBody = "";
    const analyzerServer = http.createServer((request, response) => {
      if (request.method !== "POST" || request.url !== "/review") {
        response.statusCode = 404;
        response.end();
        return;
      }

      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        capturedBody += chunk;
      });
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            status: "updated",
            session: analyzerSession,
          }),
        );
      });
    });

    analyzerServer.listen(0, "127.0.0.1");
    await once(analyzerServer, "listening");

    const address = analyzerServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind analyzer test server");
    }

    process.env.VAEXCORE_PULSE_ANALYZER_URL = `http://127.0.0.1:${address.port}`;

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/projects/review",
        payload: {
          sessionId: analyzerSession.id,
          candidateId: analyzerSession.candidates[0].id,
          action: "RETIME",
          label: "Trim lead-in",
          adjustedSegment: {
            startSeconds: 318,
            endSeconds: 344,
          },
          timestamp: "2026-03-25T14:12:00.000Z",
        },
      });

      const payload = response.json() as {
        id: string;
        candidates: Array<{
          editableLabel: string;
          suggestedSegment: {
            startSeconds: number;
            endSeconds: number;
          };
        }>;
      };

      assert.equal(response.statusCode, 200);
      assert.equal(payload.id, analyzerSession.id);
      assert.equal(payload.candidates[0]?.editableLabel, "Trim lead-in");
      assert.equal(payload.candidates[0]?.suggestedSegment.startSeconds, 318);

      const forwardedRequest = JSON.parse(capturedBody) as {
        sessionId: string;
        candidateId: string;
        action: string;
      };
      assert.equal(forwardedRequest.sessionId, analyzerSession.id);
      assert.equal(
        forwardedRequest.candidateId,
        analyzerSession.candidates[0].id,
      );
      assert.equal(forwardedRequest.action, "RETIME");
    } finally {
      analyzerServer.close();
      await app.close();
    }
  });
});
