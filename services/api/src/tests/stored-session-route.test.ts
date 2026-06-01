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

  it("loads a persisted session through the analyzer bridge", async () => {
    const analyzerSession = createMockProjectSession();
    analyzerSession.id = "session_media_restore";
    analyzerSession.title = "Persisted Review Session";
    analyzerSession.reviewDecisions = [
      {
        id: "review_session_media_restore_candidate_001",
        projectSessionId: analyzerSession.id,
        candidateId: analyzerSession.candidates[0].id,
        action: "ACCEPT",
        label: "Keep opener payoff",
        adjustedSegment: {
          startSeconds: 320,
          endSeconds: 346,
        },
        createdAt: "2026-03-25T14:10:00.000Z",
      },
    ];

    const analyzerServer = http.createServer((request, response) => {
      if (
        request.method !== "GET" ||
        request.url !== `/session/${analyzerSession.id}`
      ) {
        response.statusCode = 404;
        response.end();
        return;
      }

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "loaded",
          session: analyzerSession,
        }),
      );
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
        method: "GET",
        url: `/api/projects/${analyzerSession.id}`,
      });

      const payload = response.json() as {
        id: string;
        reviewDecisions: Array<{
          action: string;
          label?: string;
        }>;
      };

      assert.equal(response.statusCode, 200);
      assert.equal(payload.id, analyzerSession.id);
      assert.equal(payload.reviewDecisions[0]?.action, "ACCEPT");
      assert.equal(payload.reviewDecisions[0]?.label, "Keep opener payoff");
    } finally {
      analyzerServer.close();
      await app.close();
    }
  });
});
