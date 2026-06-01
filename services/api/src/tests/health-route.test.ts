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

  it("serves the health endpoint", async () => {
    const app = await buildApp();

    try {
      const healthResponse = await app.inject({
        method: "GET",
        url: "/health",
      });

      const healthPayload = healthResponse.json() as {
        service: string;
        status: string;
        mode: string;
        localRuntime: {
          contractVersion: number;
          mode: string;
          networkPolicy: string;
        };
      };

      assert.equal(healthResponse.statusCode, 200);
      assert.equal(healthPayload.service, "api");
      assert.equal(healthPayload.status, "ok");
      assert.equal(healthPayload.mode, "local-bridge");
      assert.equal(healthPayload.localRuntime.contractVersion, 1);
      assert.equal(healthPayload.localRuntime.mode, "local-first");
      assert.equal(healthPayload.localRuntime.networkPolicy, "localhost-only");
    } finally {
      await app.close();
    }
  });
});
