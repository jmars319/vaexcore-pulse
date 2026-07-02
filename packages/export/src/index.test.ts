import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMockProjectSession } from "@vaexcore/pulse-shared-types/testing";
import {
  buildPulseBatchExportPackage,
  toEdlExport,
  toEdlPlaceholder,
  toJsonCandidateExport,
  toTimestampExport,
} from "./index";

describe("Pulse export helpers", () => {
  it("exports only accepted moments to timestamp, JSON, and EDL formats", () => {
    const session = createMockProjectSession();
    const accepted = {
      id: "accept_candidate_001",
      projectSessionId: session.id,
      candidateId: "candidate_001",
      action: "ACCEPT" as const,
      label: "Keeper reaction",
      adjustedSegment: {
        startSeconds: 314,
        endSeconds: 342,
      },
      createdAt: "2026-05-21T00:00:00.000Z",
    };
    const rejected = {
      id: "reject_candidate_002",
      projectSessionId: session.id,
      candidateId: "candidate_002",
      action: "REJECT" as const,
      createdAt: "2026-05-21T00:01:00.000Z",
    };

    const timestamps = toTimestampExport(session.candidates, [
      accepted,
      rejected,
    ]);
    assert.equal(timestamps, "00:05:14 - 00:05:42  Keeper reaction");

    const json = JSON.parse(
      toJsonCandidateExport(session.mediaSource, session.candidates, [
        accepted,
        rejected,
      ]),
    );
    assert.equal(json.acceptedMoments.length, 1);
    assert.equal(json.acceptedMoments[0].candidateId, "candidate_001");
    assert.equal(json.acceptedMoments[0].label, "Keeper reaction");

    const edl = toEdlExport(session.mediaSource, session.candidates, [
      accepted,
      rejected,
    ]);
    assert.match(edl, /TITLE: vaexcore pulse - raid-night-2026-03-07\.mkv/);
    assert.match(edl, /001  AX       V     C/);
    assert.match(edl, /\* COMMENT: Keeper reaction/);
    assert.doesNotMatch(edl, /candidate_002|Setup cue/);
  });

  it("keeps the legacy EDL placeholder export name as a concrete alias", () => {
    const session = createMockProjectSession();
    const edl = toEdlPlaceholder(session.mediaSource, session.candidates, []);

    assert.match(edl, /TITLE: vaexcore pulse - raid-night-2026-03-07\.mkv/);
    assert.match(edl, /\* NO ACCEPTED MOMENTS/);
    assert.doesNotMatch(edl, /Placeholder EDL|intentionally deferred/);
  });

  it("builds batch export packages from named presets", () => {
    const session = createMockProjectSession();
    const accepted = {
      id: "accept_candidate_001",
      projectSessionId: session.id,
      candidateId: "candidate_001",
      action: "ACCEPT" as const,
      label: "Streamer reaction",
      adjustedSegment: {
        startSeconds: 314,
        endSeconds: 342,
      },
      notes: "Works as a short candidate.",
      createdAt: "2026-05-21T00:00:00.000Z",
    };

    const batch = buildPulseBatchExportPackage(
      session,
      [accepted],
      ["youtube-chapters", "tiktok-shortlist", "editor-handoff"],
    );

    assert.equal(batch.acceptedMomentCount, 1);
    assert.equal(batch.fileCount, 3);
    assert.deepEqual(
      batch.files.map((file) => file.presetId),
      ["youtube-chapters", "tiktok-shortlist", "editor-handoff"],
    );
    assert.match(batch.files[0].contents, /^00:00:00 Streamer reaction/);
    assert.match(batch.files[1].contents, /candidate_id,label/);
    assert.match(
      batch.files[2].contents,
      /vaexcore\.pulse\.editor-handoff\.v1/,
    );
  });

  it("handles large accepted export sets without changing accepted filtering", () => {
    const session = createMockProjectSession();
    const candidates = Array.from({ length: 500 }, (_, index) => ({
      ...session.candidates[index % session.candidates.length],
      id: `candidate_large_${index}`,
      editableLabel: `Large candidate ${index}`,
      suggestedSegment: {
        ...session.candidates[index % session.candidates.length]
          .suggestedSegment,
        startSeconds: index * 30,
        endSeconds: index * 30 + 24,
      },
    }));
    const largeSession = {
      ...session,
      id: "session_large_export",
      candidates,
    };
    const decisions = candidates.map((candidate, index) => ({
      id: `decision_large_${index}`,
      projectSessionId: largeSession.id,
      candidateId: candidate.id,
      action: index % 2 === 0 ? ("ACCEPT" as const) : ("REJECT" as const),
      label: candidate.editableLabel,
      createdAt: "2026-05-21T00:00:00.000Z",
    }));

    const batch = buildPulseBatchExportPackage(largeSession, decisions, [
      "timestamps",
      "json",
    ]);
    assert.equal(batch.acceptedMomentCount, 250);
    const exportedLines = batch.files[0].contents.split("\n");
    assert.ok(exportedLines.some((line) => line.endsWith("Large candidate 0")));
    assert.equal(
      exportedLines.some((line) => line.endsWith("Large candidate 1")),
      false,
    );
    assert.equal(
      JSON.parse(batch.files[1].contents).acceptedMoments.length,
      250,
    );
  });
});
