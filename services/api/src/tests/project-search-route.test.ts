import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { afterEach, describe, it } from "node:test";
import { buildApp } from "../app";

describe("api smoke routes", () => {
  afterEach(() => {
    delete process.env.VAEXCORE_PULSE_ANALYZER_URL;
    delete process.env.VAEXCORE_PULSE_ANALYZER_TIMEOUT_MS;
  });

  it("proxies project library search through the analyzer bridge", async () => {
    let capturedUrl = "";
    const analyzerServer = http.createServer((request, response) => {
      capturedUrl = request.url ?? "";
      if (
        request.method !== "GET" ||
        !capturedUrl.startsWith("/sessions/search")
      ) {
        response.statusCode = 404;
        response.end();
        return;
      }

      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          results: [
            {
              sessionId: "session_search_001",
              sessionTitle: "Reaction Review",
              sourceName: "reaction-vod.mkv",
              sourcePath: "/tmp/reaction-vod.mkv",
              profileId: "generic",
              updatedAt: "2026-05-21T00:00:00.000Z",
              score: 8,
              matchedFields: ["title", "transcript"],
              snippets: ["Seeded reaction transcript anchor"],
              candidateCount: 3,
              acceptedCount: 1,
              rejectedCount: 1,
              deferredCount: 0,
              pendingCount: 1,
            },
          ],
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
        url: "/api/projects/search?q=reaction",
      });
      const payload = response.json() as Array<{
        sessionId: string;
        matchedFields: string[];
      }>;

      assert.equal(response.statusCode, 200);
      assert.equal(payload[0]?.sessionId, "session_search_001");
      assert.deepEqual(payload[0]?.matchedFields, ["title", "transcript"]);
      assert.equal(capturedUrl, "/sessions/search?query=reaction");
    } finally {
      analyzerServer.close();
      await app.close();
    }
  });
});
