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

  it("proxies a real analyze request through to the analyzer", async () => {
    const analyzerSession = createMockProjectSession();
    analyzerSession.id = "session_media_backlog";
    analyzerSession.title = "Backlog VOD Review";
    analyzerSession.mediaSource.path = "/tmp/backlog-vod.mkv";
    analyzerSession.mediaSource.fileName = "backlog-vod.mkv";

    const analyzerServer = http.createServer((request, response) => {
      if (request.method !== "POST" || request.url !== "/analyze") {
        response.statusCode = 404;
        response.end();
        return;
      }

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "completed",
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
        method: "POST",
        url: "/api/projects/analyze",
        payload: {
          sourcePath: "/tmp/backlog-vod.mkv",
          profileId: "generic",
          sessionTitle: "Backlog VOD Review",
        },
      });

      const payload = response.json() as {
        id: string;
        title: string;
        mediaSource: {
          path: string;
        };
      };

      assert.equal(response.statusCode, 200);
      assert.equal(payload.id, "session_media_backlog");
      assert.equal(payload.title, "Backlog VOD Review");
      assert.equal(payload.mediaSource.path, "/tmp/backlog-vod.mkv");
    } finally {
      analyzerServer.close();
      await app.close();
    }
  });
});
