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

  it("returns a timeout error when the analyzer stops responding", async () => {
    const analyzerServer = http.createServer((_request, _response) => {
      // Intentionally hold the socket open to exercise the bridge timeout.
    });

    analyzerServer.listen(0, "127.0.0.1");
    await once(analyzerServer, "listening");

    const address = analyzerServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind analyzer test server");
    }

    process.env.VAEXCORE_PULSE_ANALYZER_URL = `http://127.0.0.1:${address.port}`;
    process.env.VAEXCORE_PULSE_ANALYZER_TIMEOUT_MS = "50";

    const app = await buildApp();
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/projects",
      });

      const payload = response.json() as {
        error: string;
        message: string;
      };

      assert.equal(response.statusCode, 502);
      assert.equal(payload.error, "session_list_failed");
      assert.match(payload.message, /timed out/i);
    } finally {
      analyzerServer.close();
      await app.close();
    }
  });
});
