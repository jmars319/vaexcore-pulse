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

  it("proxies persisted session summaries through the analyzer bridge", async () => {
    const analyzerSession = createMockProjectSession();
    analyzerSession.id = "session_media_backlog";
    analyzerSession.title = "Backlog VOD Review";
    analyzerSession.mediaSource.path = "/tmp/backlog-vod.mkv";
    analyzerSession.mediaSource.fileName = "backlog-vod.mkv";
    analyzerSession.reviewDecisions = [
      {
        id: "review_session_media_backlog_candidate_001",
        projectSessionId: analyzerSession.id,
        candidateId: analyzerSession.candidates[0].id,
        action: "ACCEPT",
        createdAt: "2026-03-25T15:00:00.000Z",
      },
      {
        id: "review_session_media_backlog_candidate_002",
        projectSessionId: analyzerSession.id,
        candidateId: analyzerSession.candidates[1].id,
        action: "REJECT",
        createdAt: "2026-03-25T15:02:00.000Z",
      },
    ];

    const analyzerSummary = buildProjectSummary(analyzerSession);

    const analyzerServer = http.createServer((request, response) => {
      if (request.method !== "GET" || request.url !== "/sessions") {
        response.statusCode = 404;
        response.end();
        return;
      }

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          sessions: [analyzerSummary],
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
        url: "/api/projects",
      });

      const payload = response.json() as Array<{
        sessionId: string;
        sessionTitle: string;
        sourcePath: string;
        sourceName: string;
        candidateCount: number;
        acceptedCount: number;
        rejectedCount: number;
        pendingCount: number;
      }>;

      assert.equal(response.statusCode, 200);
      assert.equal(payload.length, 1);
      assert.deepEqual(payload[0], analyzerSummary);
    } finally {
      analyzerServer.close();
      await app.close();
    }
  });
});
