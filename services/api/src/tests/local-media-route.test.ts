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

  it("streams local media files with byte-range support", async () => {
    const previewCacheDirectory = path.join(
      os.tmpdir(),
      "vaexcore-pulse-preview-clips",
    );
    await rm(previewCacheDirectory, { recursive: true, force: true });
    await mkdir(previewCacheDirectory, { recursive: true });
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "vaexcore-pulse-api-media-"),
    );
    const mediaPath = path.join(previewCacheDirectory, "preview.mp4");
    const outsideMediaPath = path.join(tempDirectory, "outside-preview.mp4");
    await writeFile(outsideMediaPath, "forbidden", "utf8");
    await writeFile(mediaPath, "abcdefghij", "utf8");

    const app = await buildApp();
    try {
      const fullResponse = await app.inject({
        method: "GET",
        url: `/api/local-media?path=${encodeURIComponent(mediaPath)}`,
      });

      assert.equal(fullResponse.statusCode, 200);
      assert.equal(fullResponse.headers["accept-ranges"], "bytes");
      assert.equal(fullResponse.headers["content-type"], "video/mp4");
      assert.equal(fullResponse.body, "abcdefghij");

      const rangeResponse = await app.inject({
        method: "GET",
        url: `/api/local-media?path=${encodeURIComponent(mediaPath)}`,
        headers: {
          range: "bytes=2-5",
        },
      });

      assert.equal(rangeResponse.statusCode, 206);
      assert.equal(rangeResponse.headers["content-range"], "bytes 2-5/10");
      assert.equal(rangeResponse.headers["content-length"], "4");
      assert.equal(rangeResponse.body, "cdef");

      const forbiddenResponse = await app.inject({
        method: "GET",
        url: `/api/local-media?path=${encodeURIComponent(outsideMediaPath)}`,
      });

      assert.equal(forbiddenResponse.statusCode, 403);
      assert.equal(forbiddenResponse.json().error, "media_path_forbidden");
    } finally {
      await app.close();
      await rm(tempDirectory, { recursive: true, force: true });
      await rm(previewCacheDirectory, { recursive: true, force: true });
    }
  });
});
