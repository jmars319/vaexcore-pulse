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

  it("proxies profile and example clip routes through the analyzer bridge", async () => {
    const profile = {
      id: "profile_dry_humor",
      name: "Dry humor",
      label: "Dry humor",
      description: "Deadpan reactions and low-key payoffs.",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
      state: "ACTIVE",
      source: "USER",
      mode: "EXAMPLE_DRIVEN",
      signalWeights: {},
      exampleClips: [],
    };
    const example = {
      id: "example_001",
      profileId: profile.id,
      sourceType: "TWITCH_CLIP_URL",
      sourceValue: "https://clips.twitch.tv/example",
      referenceKind: "CLIP",
      title: "Dry payoff example",
      note: "Hold for deadpan timing.",
      status: "REFERENCE_ONLY",
      statusDetail:
        "Remote clip retrieval is not enabled yet. vaexcore pulse is storing this reference for future matching work.",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
    };

    const analyzerServer = http.createServer((request, response) => {
      if (request.method === "GET" && request.url === "/profiles") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            status: "listed",
            profiles: [{ ...profile, exampleClips: [example] }],
          }),
        );
        return;
      }

      if (
        request.method === "GET" &&
        request.url === `/profiles/${profile.id}/examples`
      ) {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            status: "listed",
            examples: [example],
          }),
        );
        return;
      }

      if (request.method === "POST" && request.url === "/profiles") {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            status: "created",
            profile,
          }),
        );
        return;
      }

      if (
        request.method === "POST" &&
        request.url === `/profiles/${profile.id}/examples`
      ) {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({
            status: "created",
            example,
          }),
        );
        return;
      }

      response.statusCode = 404;
      response.end();
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
      const listProfilesResponse = await app.inject({
        method: "GET",
        url: "/api/profiles",
      });
      const createProfileResponse = await app.inject({
        method: "POST",
        url: "/api/profiles",
        payload: {
          name: "Dry humor",
          description: "Deadpan reactions and low-key payoffs.",
        },
      });
      const listExamplesResponse = await app.inject({
        method: "GET",
        url: `/api/profiles/${profile.id}/examples`,
      });
      const createExampleResponse = await app.inject({
        method: "POST",
        url: `/api/profiles/${profile.id}/examples`,
        payload: {
          sourceType: "TWITCH_CLIP_URL",
          sourceValue: "https://clips.twitch.tv/example",
          title: "Dry payoff example",
          note: "Hold for deadpan timing.",
        },
      });

      assert.equal(listProfilesResponse.statusCode, 200);
      assert.equal(createProfileResponse.statusCode, 200);
      assert.equal(listExamplesResponse.statusCode, 200);
      assert.equal(createExampleResponse.statusCode, 200);

      const listedProfiles = listProfilesResponse.json() as Array<{
        id: string;
        exampleClips: Array<{ id: string }>;
      }>;
      const createdProfile = createProfileResponse.json() as { id: string };
      const listedExamples = listExamplesResponse.json() as Array<{
        id: string;
        profileId: string;
      }>;
      const createdExample = createExampleResponse.json() as {
        id: string;
        profileId: string;
      };

      assert.equal(listedProfiles[0]?.id, profile.id);
      assert.equal(listedProfiles[0]?.exampleClips.length, 1);
      assert.equal(createdProfile.id, profile.id);
      assert.equal(listedExamples[0]?.id, example.id);
      assert.equal(createdExample.profileId, profile.id);
    } finally {
      analyzerServer.close();
      await app.close();
    }
  });
});
