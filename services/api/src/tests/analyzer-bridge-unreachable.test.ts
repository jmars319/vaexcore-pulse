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

  it("reports an unreachable analyzer bridge cleanly", async () => {
    process.env.VAEXCORE_PULSE_ANALYZER_URL = "http://127.0.0.1:1";
    const app = await buildApp();

    try {
      const bridgeResponse = await app.inject({
        method: "GET",
        url: "/api/bridge/analyzer",
      });

      assert.equal(bridgeResponse.statusCode, 200);
      assert.deepEqual(bridgeResponse.json(), {
        analyzer: "unreachable",
        payload: null,
      });
    } finally {
      await app.close();
    }
  });
});
