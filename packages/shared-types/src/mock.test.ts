import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPulseDemoContentPack } from "./demoContent";
import { projectSessionSchema } from "./index";
import {
  createMockProjectSession,
  createMockProjectSessions,
  createMockReviewHistory,
} from "./testing";

describe("shared-types mock data", () => {
  it("creates a schema-valid mock project session with shaped candidates", () => {
    const session = createMockProjectSession();

    assert.doesNotThrow(() => projectSessionSchema.parse(session));
    assert.equal(session.profileId, "generic");
    assert.equal(session.candidates.length, 4);
    assert.equal(session.analysisCoverage.band, "PARTIAL");
    assert.equal(session.analysisProvenance.state, "MOCK");
    assert.ok(session.analysisCoverage.note.length > 0);

    for (const candidate of session.candidates) {
      assert.ok(
        candidate.suggestedSegment.startSeconds >=
          candidate.candidateWindow.startSeconds,
      );
      assert.ok(
        candidate.suggestedSegment.endSeconds <=
          candidate.candidateWindow.endSeconds,
      );
      assert.ok(candidate.reasonCodes.length > 0);
      assert.ok(Array.isArray(candidate.reviewTags));
    }

    assert.deepEqual(session.candidates[3]?.reviewTags, [
      "LOW_INFORMATION_RISK",
    ]);
  });

  it("creates profile-varied mock sessions that stay unique by id", () => {
    const sessions = createMockProjectSessions();
    const ids = new Set(sessions.map((session) => session.id));

    assert.equal(sessions.length, 3);
    assert.equal(ids.size, sessions.length);
    assert.deepEqual(
      sessions.map((session) => session.profileId),
      ["generic", "stealth", "exploration"],
    );
  });

  it("creates review history entries that reference the primary mock session", () => {
    const session = createMockProjectSession();
    const candidateIds = new Set(
      session.candidates.map((candidate) => candidate.id),
    );
    const history = createMockReviewHistory();

    assert.notEqual(history.length, 0);

    for (const decision of history) {
      assert.equal(decision.projectSessionId, session.id);
      assert.equal(candidateIds.has(decision.candidateId), true);
    }
  });

  it("creates a demo content pack for onboarding and smoke validation", () => {
    const pack = createPulseDemoContentPack();

    assert.equal(pack.schema, "vaexcore.pulse.demo-content-pack.v1");
    assert.ok(pack.sessions.length >= 3);
    assert.ok(pack.reviewDecisions.length >= 2);
    assert.ok(pack.smokeChecklist.some((item) => item.includes("Search")));
  });
});
