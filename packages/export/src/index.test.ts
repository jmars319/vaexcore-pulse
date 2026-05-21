import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMockProjectSession } from "@vaexcore/pulse-shared-types/testing";
import {
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
});
