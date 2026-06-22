import http from "node:http";

export function createMediaLibraryRouteFixture() {
  // Asset fixture boundary
  const asset = {
    id: "asset_clip_global_001",
    assetType: "CLIP",
    scope: "GLOBAL",
    sourceType: "LOCAL_FILE_PATH",
    sourceValue: "/tmp/global-clip.mp4",
    title: "Global opener reference",
    note: "Reusable clip example.",
    status: "LOCAL_FILE_AVAILABLE",
    statusDetail: "Local clip summary is ready for heuristic profile matching.",
    featureSummary: {
      methodVersion: "LOCAL_FILE_HEURISTIC_V2",
      generatedAt: "2026-04-20T12:00:00.000Z",
      durationSeconds: 42,
      transcriptChunkCount: 4,
      transcriptDensityPerMinute: 5.7,
      candidateSeedCount: 3,
      candidateDensityPerMinute: 4.3,
      transcriptAnchorTerms: ["opener", "panic"],
      transcriptAnchorPhrases: ["opener panic"],
      speechDensityMean: 0.5,
      speechDensityPeak: 0.75,
      energyMean: 0.48,
      energyPeak: 0.72,
      pacingMean: 0.41,
      overlapActivityMean: 0.22,
      highActivityShare: 0.25,
      topReasonCodes: ["REACTION_PHRASE"],
      coverageBand: "PARTIAL",
      coverageFlags: ["SEEDED_TRANSCRIPT"],
    },
    indexArtifactSummary: {
      latestAudioFingerprintArtifactId: "artifact_audio_001",
      audioFingerprintBucketCount: 2,
      audioFingerprintMethod: "BYTE_SAMPLED_AUDIO_PROXY_V1",
      audioFingerprintUpdatedAt: "2026-04-20T12:10:00.000Z",
      latestThumbnailSuggestionArtifactId: "artifact_thumbnail_001",
      thumbnailSuggestionCount: 2,
      thumbnailSuggestionMethod: "FFMPEG_TIMELINE_THUMBNAILS_V1",
      thumbnailSuggestionUpdatedAt: "2026-04-20T12:10:10.000Z",
      bucketDurationSeconds: 30,
      confidenceScore: 0.18,
    },
    thumbnailSuggestionSet: {
      methodVersion: "FFMPEG_TIMELINE_THUMBNAILS_V1",
      generatedAt: "2026-04-20T12:10:10.000Z",
      sourcePath: "/tmp/global-clip.mp4",
      sampleWindowCount: 8,
      note: "Bounded ffmpeg thumbnail suggestions scored from local activity buckets and simple visual clarity heuristics.",
      suggestions: [
        {
          id: "thumbnail_asset_clip_global_001_11000",
          imagePath:
            "/tmp/vaexcore-pulse-thumbnails/asset_clip_global_001_01.jpg",
          timestampSeconds: 11,
          score: 0.73,
          activityScore: 0.68,
          brightnessScore: 0.7,
          contrastScore: 0.66,
          sharpnessScore: 0.61,
          note: "Activity 68%, brightness 70%, contrast 66%, clarity 61%.",
        },
        {
          id: "thumbnail_asset_clip_global_001_29000",
          imagePath:
            "/tmp/vaexcore-pulse-thumbnails/asset_clip_global_001_02.jpg",
          timestampSeconds: 29,
          score: 0.69,
          activityScore: 0.64,
          brightnessScore: 0.63,
          contrastScore: 0.67,
          sharpnessScore: 0.58,
          note: "Activity 64%, brightness 63%, contrast 67%, clarity 58%.",
        },
      ],
    },
    thumbnailOutputSet: {
      updatedAt: "2026-04-20T12:11:00.000Z",
      outputs: [
        {
          id: "thumb_output_001",
          assetId: "asset_clip_global_001",
          sourceSuggestionId: "thumbnail_asset_clip_global_001_11000",
          imagePath:
            "/tmp/vaexcore-pulse-thumbnails/asset_clip_global_001_01.jpg",
          timestampSeconds: 11,
          score: 0.73,
          activityScore: 0.68,
          brightnessScore: 0.7,
          contrastScore: 0.66,
          sharpnessScore: 0.61,
          note: "Activity 68%, brightness 70%, contrast 66%, clarity 61%.",
          position: 0,
          selectedAt: "2026-04-20T12:11:00.000Z",
        },
      ],
    },
    createdAt: "2026-04-20T12:00:00.000Z",
    updatedAt: "2026-04-20T12:00:00.000Z",
  };
  const updatedAsset = {
    ...asset,
    thumbnailOutputSet: {
      updatedAt: "2026-04-20T12:11:30.000Z",
      outputs: [
        ...(asset.thumbnailOutputSet?.outputs ?? []),
        {
          id: "thumb_output_002",
          assetId: "asset_clip_global_001",
          sourceSuggestionId: "thumbnail_asset_clip_global_001_29000",
          imagePath:
            "/tmp/vaexcore-pulse-thumbnails/asset_clip_global_001_02.jpg",
          timestampSeconds: 29,
          score: 0.69,
          activityScore: 0.64,
          brightnessScore: 0.63,
          contrastScore: 0.67,
          sharpnessScore: 0.58,
          note: "Activity 64%, brightness 63%, contrast 67%, clarity 58%.",
          position: 1,
          selectedAt: "2026-04-20T12:11:30.000Z",
        },
      ],
    },
  };
  // Pair fixture boundary
  const pair = {
    id: "pair_story_arc_001",
    vodAssetId: "asset_vod_001",
    editAssetId: "asset_edit_001",
    title: "Story arc pair",
    note: "Coarse edit decision record.",
    status: "READY",
    statusDetail:
      "Paired source and edit registered. Pulse is showing runtime-based edit coverage now; confirmed keep ranges are added automatically when alignment jobs find matching audio fingerprints.",
    sourceDurationSeconds: 14400,
    editDurationSeconds: 3420,
    keptDurationSeconds: 3420,
    removedDurationSeconds: 10980,
    keepRatio: 0.2375,
    compressionRatio: 4.2105,
    createdAt: "2026-04-20T12:05:00.000Z",
    updatedAt: "2026-04-20T12:05:00.000Z",
  };
  // Index job fixture
  const indexJob = {
    id: "index_job_001",
    assetId: asset.id,
    status: "SUCCEEDED",
    progress: 1,
    statusDetail: "Media index ready.",
    result: {
      methodVersion: "MEDIA_INDEX_V1",
      generatedAt: "2026-04-20T12:10:00.000Z",
      sourcePath: "/tmp/global-clip.mp4",
      fileName: "global-clip.mp4",
      fileSizeBytes: 1024,
      kind: "VIDEO",
      format: "mov,mp4,m4a,3gp,3g2,mj2",
      durationSeconds: 42,
      frameRate: 60,
      width: 1920,
      height: 1080,
      videoCodec: "h264",
      audioCodec: "aac",
      hasVideo: true,
      hasAudio: true,
      streamCount: 2,
      notes: ["Metadata probed with local ffprobe."],
    },
    createdAt: "2026-04-20T12:09:00.000Z",
    updatedAt: "2026-04-20T12:10:00.000Z",
    startedAt: "2026-04-20T12:09:00.000Z",
    finishedAt: "2026-04-20T12:10:00.000Z",
  };
  const artifact = {
    id: "artifact_audio_001",
    assetId: asset.id,
    jobId: indexJob.id,
    kind: "AUDIO_FINGERPRINT",
    method: "BYTE_SAMPLED_AUDIO_PROXY_V1",
    bucketDurationSeconds: 30,
    durationSeconds: 42,
    bucketCount: 2,
    confidenceScore: 0.18,
    payloadByteSize: 250,
    energyMean: 0.42,
    energyPeak: 0.5,
    onsetMean: 0.15,
    silenceShare: 0.31,
    buckets: [
      {
        index: 0,
        startSeconds: 0,
        endSeconds: 30,
        energyScore: 0.5,
        onsetScore: 0.15,
        spectralFluxScore: 0.2,
        silenceScore: 0.15,
        fingerprint: "0123456789abcdef0000",
      },
      {
        index: 1,
        startSeconds: 30,
        endSeconds: 42,
        energyScore: 0.34,
        onsetScore: 0.15,
        spectralFluxScore: 0.19,
        silenceScore: 0.47,
        fingerprint: "fedcba98765432100000",
      },
    ],
    note: "Bounded byte-sampled audio proxy for coarse future matching.",
    createdAt: "2026-04-20T12:10:00.000Z",
    updatedAt: "2026-04-20T12:10:00.000Z",
  };
  const thumbnailArtifact = {
    id: "artifact_thumbnail_001",
    assetId: asset.id,
    jobId: indexJob.id,
    kind: "THUMBNAIL_SUGGESTIONS",
    method: "FFMPEG_TIMELINE_THUMBNAILS_V1",
    bucketDurationSeconds: 30,
    durationSeconds: 42,
    bucketCount: 2,
    confidenceScore: 0.71,
    payloadByteSize: 420,
    sampleWindowCount: 8,
    thumbnailSuggestions: asset.thumbnailSuggestionSet.suggestions,
    note: "Bounded ffmpeg thumbnail suggestions scored from local activity buckets and simple visual clarity heuristics.",
    createdAt: "2026-04-20T12:10:10.000Z",
    updatedAt: "2026-04-20T12:10:10.000Z",
  };
  // Alignment fixture boundary
  const alignmentJob = {
    id: "align_job_001",
    pairId: pair.id,
    sourceAssetId: pair.vodAssetId,
    queryAssetId: pair.editAssetId,
    status: "SUCCEEDED",
    progress: 1,
    statusDetail: "Alignment complete with 1 candidate match.",
    method: "AUDIO_PROXY_BUCKET_CORRELATION_V1",
    matchCount: 1,
    createdAt: "2026-04-20T12:12:00.000Z",
    updatedAt: "2026-04-20T12:13:00.000Z",
    startedAt: "2026-04-20T12:12:00.000Z",
    finishedAt: "2026-04-20T12:13:00.000Z",
  };
  const alignmentMatch = {
    id: "align_match_001",
    jobId: alignmentJob.id,
    pairId: pair.id,
    sourceAssetId: pair.vodAssetId,
    queryAssetId: pair.editAssetId,
    kind: "EDIT_TO_VOD_KEEP",
    method: "AUDIO_PROXY_BUCKET_CORRELATION_V1",
    sourceRange: {
      startSeconds: 300,
      endSeconds: 420,
    },
    queryRange: {
      startSeconds: 0,
      endSeconds: 120,
    },
    score: 0.72,
    confidenceScore: 0.34,
    matchedBucketCount: 4,
    totalQueryBucketCount: 114,
    bucketMatches: [
      {
        queryBucketIndex: 0,
        sourceBucketIndex: 10,
        score: 0.72,
      },
    ],
    note: "Candidate alignment from byte-sampled audio proxy buckets.",
    createdAt: "2026-04-20T12:13:00.000Z",
    updatedAt: "2026-04-20T12:13:00.000Z",
  };

  // Analyzer route boundary
  const analyzerServer = http.createServer((request, response) => {
    if (request.method === "GET" && request.url === "/library/assets") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          assets: [asset],
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/library/assets") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "created",
          asset,
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `/library/assets/${asset.id}/thumbnail-outputs`
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "updated",
          asset: updatedAsset,
        }),
      );
      return;
    }

    if (request.method === "GET" && request.url === "/library/pairs") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          pairs: [pair],
        }),
      );
      return;
    }

    if (request.method === "POST" && request.url === "/library/pairs") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "created",
          pair,
        }),
      );
      return;
    }

    if (request.method === "GET" && request.url === "/library/index-jobs") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          jobs: [indexJob],
        }),
      );
      return;
    }

    if (
      request.method === "GET" &&
      request.url === "/library/index-artifacts"
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          artifacts: [thumbnailArtifact, artifact],
        }),
      );
      return;
    }

    if (
      request.method === "GET" &&
      request.url === `/library/assets/${asset.id}/index-artifacts`
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          artifacts: [thumbnailArtifact, artifact],
        }),
      );
      return;
    }

    if (request.method === "GET" && request.url === "/library/alignment-jobs") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          jobs: [alignmentJob],
        }),
      );
      return;
    }

    if (
      request.method === "GET" &&
      request.url === "/library/alignment-matches"
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          matches: [alignmentMatch],
        }),
      );
      return;
    }

    if (
      request.method === "GET" &&
      request.url === `/library/pairs/${pair.id}/alignment-matches`
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "listed",
          matches: [alignmentMatch],
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      request.url === "/library/alignment-jobs"
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "created",
          job: alignmentJob,
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `/library/pairs/${pair.id}/alignment-jobs`
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "created",
          job: alignmentJob,
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `/library/alignment-jobs/${alignmentJob.id}/cancel`
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "cancelled",
          job: {
            ...alignmentJob,
            status: "CANCELLED",
            cancelledAt: "2026-04-20T12:14:00.000Z",
          },
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `/library/assets/${asset.id}/index-jobs`
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "created",
          job: indexJob,
        }),
      );
      return;
    }

    if (
      request.method === "POST" &&
      request.url === `/library/index-jobs/${indexJob.id}/cancel`
    ) {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          status: "cancelled",
          job: {
            ...indexJob,
            status: "CANCELLED",
            cancelledAt: "2026-04-20T12:11:00.000Z",
          },
        }),
      );
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  return {
    alignmentJob,
    alignmentMatch,
    analyzerServer,
    artifact,
    asset,
    indexJob,
    pair,
    thumbnailArtifact,
    updatedAsset,
  };
}
