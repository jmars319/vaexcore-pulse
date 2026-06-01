import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, it } from "node:test";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { buildProjectSummary } from "@vaexcore/pulse-domain";
import { createMockProjectSession } from "@vaexcore/pulse-shared-types/testing";
import { buildApp } from "../app";
import { createMediaLibraryRouteFixture } from "./mediaLibraryRouteFixture";

describe("api smoke routes", () => {
  afterEach(() => {
    delete process.env.VAEXCORE_PULSE_ANALYZER_URL;
    delete process.env.VAEXCORE_PULSE_ANALYZER_TIMEOUT_MS;
  });

  it("proxies media library assets and vod-edit pairs through the analyzer bridge", async () => {
    const {
      alignmentJob,
      alignmentMatch,
      analyzerServer,
      artifact,
      asset,
      indexJob,
      pair,
      thumbnailArtifact,
    } = createMediaLibraryRouteFixture();

    analyzerServer.listen(0, "127.0.0.1");
    await once(analyzerServer, "listening");

    const address = analyzerServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind analyzer test server");
    }

    process.env.VAEXCORE_PULSE_ANALYZER_URL = `http://127.0.0.1:${address.port}`;

    const app = await buildApp();
    try {
      const listAssetsResponse = await app.inject({
        method: "GET",
        url: "/api/library/assets",
      });
      const createAssetResponse = await app.inject({
        method: "POST",
        url: "/api/library/assets",
        payload: {
          assetType: "CLIP",
          scope: "GLOBAL",
          sourceType: "LOCAL_FILE_PATH",
          sourceValue: "/tmp/global-clip.mp4",
          title: "Global opener reference",
        },
      });
      const listPairsResponse = await app.inject({
        method: "GET",
        url: "/api/library/pairs",
      });
      const createPairResponse = await app.inject({
        method: "POST",
        url: "/api/library/pairs",
        payload: {
          vodAssetId: "asset_vod_001",
          editAssetId: "asset_edit_001",
          title: "Story arc pair",
        },
      });
      const listIndexJobsResponse = await app.inject({
        method: "GET",
        url: "/api/library/index-jobs",
      });
      const listIndexArtifactsResponse = await app.inject({
        method: "GET",
        url: "/api/library/index-artifacts",
      });
      const replaceThumbnailOutputsResponse = await app.inject({
        method: "POST",
        url: `/api/library/assets/${asset.id}/thumbnail-outputs`,
        payload: {
          selectedSuggestionIds: [
            "thumbnail_asset_clip_global_001_11000",
            "thumbnail_asset_clip_global_001_29000",
          ],
        },
      });
      const listAssetIndexArtifactsResponse = await app.inject({
        method: "GET",
        url: `/api/library/assets/${asset.id}/index-artifacts`,
      });
      const listAlignmentJobsResponse = await app.inject({
        method: "GET",
        url: "/api/library/alignment-jobs",
      });
      const listAlignmentMatchesResponse = await app.inject({
        method: "GET",
        url: "/api/library/alignment-matches",
      });
      const listPairAlignmentMatchesResponse = await app.inject({
        method: "GET",
        url: `/api/library/pairs/${pair.id}/alignment-matches`,
      });
      const createAlignmentJobResponse = await app.inject({
        method: "POST",
        url: "/api/library/alignment-jobs",
        payload: {
          sourceAssetId: pair.vodAssetId,
          queryAssetId: pair.editAssetId,
        },
      });
      const createPairAlignmentJobResponse = await app.inject({
        method: "POST",
        url: `/api/library/pairs/${pair.id}/alignment-jobs`,
      });
      const cancelAlignmentJobResponse = await app.inject({
        method: "POST",
        url: `/api/library/alignment-jobs/${alignmentJob.id}/cancel`,
      });
      const createIndexJobResponse = await app.inject({
        method: "POST",
        url: `/api/library/assets/${asset.id}/index-jobs`,
      });
      const cancelIndexJobResponse = await app.inject({
        method: "POST",
        url: `/api/library/index-jobs/${indexJob.id}/cancel`,
      });

      assert.equal(listAssetsResponse.statusCode, 200);
      assert.equal(createAssetResponse.statusCode, 200);
      assert.equal(listPairsResponse.statusCode, 200);
      assert.equal(createPairResponse.statusCode, 200);
      assert.equal(listIndexJobsResponse.statusCode, 200);
      assert.equal(listIndexArtifactsResponse.statusCode, 200);
      assert.equal(replaceThumbnailOutputsResponse.statusCode, 200);
      assert.equal(listAssetIndexArtifactsResponse.statusCode, 200);
      assert.equal(listAlignmentJobsResponse.statusCode, 200);
      assert.equal(listAlignmentMatchesResponse.statusCode, 200);
      assert.equal(listPairAlignmentMatchesResponse.statusCode, 200);
      assert.equal(createAlignmentJobResponse.statusCode, 200);
      assert.equal(createPairAlignmentJobResponse.statusCode, 200);
      assert.equal(cancelAlignmentJobResponse.statusCode, 200);
      assert.equal(createIndexJobResponse.statusCode, 200);
      assert.equal(cancelIndexJobResponse.statusCode, 200);

      const listedAssets = listAssetsResponse.json() as Array<{ id: string }>;
      const createdAsset = createAssetResponse.json() as { id: string };
      const listedPairs = listPairsResponse.json() as Array<{ id: string }>;
      const createdPair = createPairResponse.json() as { id: string };
      const listedJobs = listIndexJobsResponse.json() as Array<{ id: string }>;
      const listedArtifacts = listIndexArtifactsResponse.json() as Array<{
        id: string;
      }>;
      const replacedThumbnailOutputsAsset =
        replaceThumbnailOutputsResponse.json() as {
          id: string;
          thumbnailOutputSet?: { outputs: Array<{ id: string }> };
        };
      const listedAssetArtifacts =
        listAssetIndexArtifactsResponse.json() as Array<{ id: string }>;
      const listedAlignmentJobs = listAlignmentJobsResponse.json() as Array<{
        id: string;
      }>;
      const listedAlignmentMatches =
        listAlignmentMatchesResponse.json() as Array<{ id: string }>;
      const listedPairAlignmentMatches =
        listPairAlignmentMatchesResponse.json() as Array<{ id: string }>;
      const createdAlignmentJob = createAlignmentJobResponse.json() as {
        id: string;
      };
      const createdPairAlignmentJob = createPairAlignmentJobResponse.json() as {
        id: string;
      };
      const cancelledAlignmentJob = cancelAlignmentJobResponse.json() as {
        id: string;
        status: string;
      };
      const createdJob = createIndexJobResponse.json() as { id: string };
      const cancelledJob = cancelIndexJobResponse.json() as {
        id: string;
        status: string;
      };

      assert.equal(listedAssets[0]?.id, asset.id);
      assert.equal(createdAsset.id, asset.id);
      assert.equal(listedPairs[0]?.id, pair.id);
      assert.equal(createdPair.id, pair.id);
      assert.equal(listedJobs[0]?.id, indexJob.id);
      assert.equal(replacedThumbnailOutputsAsset.id, asset.id);
      assert.equal(
        replacedThumbnailOutputsAsset.thumbnailOutputSet?.outputs.length,
        2,
      );
      assert.deepEqual(
        listedArtifacts.map((listedArtifact) => listedArtifact.id).sort(),
        [artifact.id, thumbnailArtifact.id].sort(),
      );
      assert.deepEqual(
        listedAssetArtifacts.map((listedArtifact) => listedArtifact.id).sort(),
        [artifact.id, thumbnailArtifact.id].sort(),
      );
      assert.equal(listedAlignmentJobs[0]?.id, alignmentJob.id);
      assert.equal(listedAlignmentMatches[0]?.id, alignmentMatch.id);
      assert.equal(listedPairAlignmentMatches[0]?.id, alignmentMatch.id);
      assert.equal(createdAlignmentJob.id, alignmentJob.id);
      assert.equal(createdPairAlignmentJob.id, alignmentJob.id);
      assert.equal(cancelledAlignmentJob.status, "CANCELLED");
      assert.equal(createdJob.id, indexJob.id);
      assert.equal(cancelledJob.status, "CANCELLED");
    } finally {
      analyzerServer.close();
      await app.close();
    }
  });
});
