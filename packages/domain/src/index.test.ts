import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CandidateDecisionMap } from "@vaexcore/pulse-shared-types";
import { createMockProjectSession } from "@vaexcore/pulse-shared-types/testing";
import {
  acceptedCandidates,
  analysisCoverageTone,
  buildProfileMatchingSummary,
  buildCandidateTranscriptContext,
  buildProjectSummary,
  describeCandidatePlainly,
  describeReasonCodePlainly,
  defaultReviewQueueMode,
  deriveSessionReviewState,
  filterCandidates,
  filterCandidatesByPresentationMode,
  filterCandidatesByReviewMode,
  formatAnalysisCoverageBand,
  formatAnalysisCoverageFlag,
  findNextPendingSessionSummary,
  hasStrongCandidateProfileMatch,
  isCandidatePending,
  makeReviewDecision,
  reviewedCandidateCount,
  resolveCandidateProfileMatch,
  resolveCandidateLabel,
  summarizeReviewQueueState,
  summarizeSessionQuality,
} from "./index";

describe("domain helpers", () => {
  // Summary fixture boundary
  it("builds a stable project summary from a session", () => {
    const session = createMockProjectSession();
    session.reviewDecisions = [
      {
        id: "accept_candidate_001",
        projectSessionId: session.id,
        candidateId: session.candidates[0].id,
        action: "ACCEPT",
        createdAt: "2026-03-13T09:25:00.000Z",
      },
    ];

    const summary = buildProjectSummary(session);

    assert.deepEqual(summary, {
      sessionId: session.id,
      sessionTitle: session.title,
      sourcePath: session.mediaSource.path,
      sourceName: session.mediaSource.fileName,
      status: session.status,
      analysisCoverage: session.analysisCoverage,
      profileId: "generic",
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      candidateCount: session.candidates.length,
      acceptedCount: 1,
      rejectedCount: 0,
      deferredCount: 0,
      pendingCount: session.candidates.length - 1,
    });
  });

  it("derives backlog review state from a session summary", () => {
    const session = createMockProjectSession();
    let summary = buildProjectSummary(session);

    assert.equal(reviewedCandidateCount(summary), 0);
    assert.equal(deriveSessionReviewState(summary), "PENDING");

    session.reviewDecisions = [
      {
        id: "accept_candidate_001",
        projectSessionId: session.id,
        candidateId: session.candidates[0].id,
        action: "ACCEPT",
        createdAt: "2026-03-25T16:10:00.000Z",
      },
    ];
    summary = buildProjectSummary(session);
    assert.equal(reviewedCandidateCount(summary), 1);
    assert.equal(deriveSessionReviewState(summary), "IN_PROGRESS");

    session.reviewDecisions = session.candidates.map((candidate, index) => ({
      id: `decision_${candidate.id}`,
      projectSessionId: session.id,
      candidateId: candidate.id,
      action: index % 2 === 0 ? ("ACCEPT" as const) : ("REJECT" as const),
      createdAt: "2026-03-25T16:12:00.000Z",
    }));
    summary = buildProjectSummary(session);
    assert.equal(deriveSessionReviewState(summary), "REVIEWED");
  });

  // Candidate filter boundary
  it("filters by relabeled text and confidence band", () => {
    const session = createMockProjectSession();
    const relabeledDecision = {
      id: "relabel_candidate_004",
      projectSessionId: session.id,
      candidateId: "candidate_004",
      action: "RELABEL" as const,
      label: "Puzzle route setup",
      createdAt: "2026-03-13T09:28:00.000Z",
    };
    const decisionsByCandidateId: CandidateDecisionMap = {
      candidate_004: relabeledDecision,
    };

    const candidates = filterCandidates(
      session.candidates,
      "route",
      "EXPERIMENTAL",
      decisionsByCandidateId,
    );

    assert.equal(candidates.length, 1);
    assert.equal(
      resolveCandidateLabel(candidates[0], relabeledDecision),
      "Puzzle route setup",
    );
  });

  it("returns accepted candidates and shapes review decisions", () => {
    const session = createMockProjectSession();
    const accepted = makeReviewDecision(
      session.id,
      session.candidates[0].id,
      "ACCEPT",
      {
        label: session.candidates[0].editableLabel,
      },
    );
    const rejected = makeReviewDecision(
      session.id,
      session.candidates[1].id,
      "REJECT",
    );

    const acceptedOnly = acceptedCandidates(session.candidates, {
      [session.candidates[0].id]: accepted,
      [session.candidates[1].id]: rejected,
    });

    assert.ok(
      accepted.id.includes(`${session.id}:${session.candidates[0].id}:ACCEPT`),
    );
    assert.deepEqual(
      acceptedOnly.map((candidate) => candidate.id),
      [session.candidates[0].id],
    );
  });

  it("builds a small transcript context peek around a candidate window", () => {
    const session = createMockProjectSession();
    const context = buildCandidateTranscriptContext(
      session.transcript,
      session.candidates[2],
    );

    assert.deepEqual(
      context.before.map((chunk) => chunk.id),
      ["chunk_001", "chunk_002"],
    );
    assert.deepEqual(
      context.inside.map((chunk) => chunk.id),
      ["chunk_003"],
    );
    assert.deepEqual(
      context.after.map((chunk) => chunk.id),
      ["chunk_004"],
    );
  });

  it("finds the next useful pending session from persisted summaries", () => {
    const baseSession = createMockProjectSession();
    const reviewingSummary = buildProjectSummary({
      ...baseSession,
      id: "session_reviewing",
      title: "Reviewing",
      reviewDecisions: [
        {
          id: "decision_accept",
          projectSessionId: "session_reviewing",
          candidateId: baseSession.candidates[0].id,
          action: "ACCEPT",
          createdAt: "2026-03-25T18:10:00.000Z",
        },
      ],
    });
    const pendingSummary = buildProjectSummary({
      ...baseSession,
      id: "session_pending",
      title: "Pending",
      reviewDecisions: [],
    });
    const reviewedSummary = buildProjectSummary({
      ...baseSession,
      id: "session_reviewed",
      title: "Reviewed",
      reviewDecisions: baseSession.candidates.map((candidate, index) => ({
        id: `decision_${candidate.id}`,
        projectSessionId: "session_reviewed",
        candidateId: candidate.id,
        action: index % 2 === 0 ? ("ACCEPT" as const) : ("REJECT" as const),
        createdAt: "2026-03-25T18:12:00.000Z",
      })),
    });

    const summaries = [reviewedSummary, reviewingSummary, pendingSummary];

    assert.equal(
      findNextPendingSessionSummary(summaries)?.sessionId,
      "session_reviewing",
    );
    assert.equal(
      findNextPendingSessionSummary(summaries, {
        excludeSessionIds: ["session_reviewing"],
      })?.sessionId,
      "session_pending",
    );
    assert.equal(
      findNextPendingSessionSummary(summaries, {
        excludeSessionIds: ["session_reviewing", "session_pending"],
      }),
      null,
    );
  });

  // Review queue boundary
  it("defaults partially reviewed sessions to pending mode and filters accordingly", () => {
    const session = createMockProjectSession();
    session.reviewDecisions = [
      {
        id: "accept_candidate_001",
        projectSessionId: session.id,
        candidateId: session.candidates[0].id,
        action: "ACCEPT",
        createdAt: "2026-03-25T18:20:00.000Z",
      },
      {
        id: "reject_candidate_002",
        projectSessionId: session.id,
        candidateId: session.candidates[1].id,
        action: "REJECT",
        createdAt: "2026-03-25T18:22:00.000Z",
      },
    ];

    assert.equal(isCandidatePending(session, session.candidates[0].id), false);
    assert.equal(isCandidatePending(session, session.candidates[2].id), true);
    assert.equal(defaultReviewQueueMode(session), "ONLY_PENDING");
    assert.deepEqual(
      filterCandidatesByReviewMode(
        session.candidates,
        session,
        defaultReviewQueueMode(session),
      ).map((candidate) => candidate.id),
      [session.candidates[2].id, session.candidates[3].id],
    );

    session.reviewDecisions = session.candidates.map((candidate, index) => ({
      id: `decision_${candidate.id}`,
      projectSessionId: session.id,
      candidateId: candidate.id,
      action: index % 2 === 0 ? ("ACCEPT" as const) : ("REJECT" as const),
      createdAt: "2026-03-25T18:25:00.000Z",
    }));

    assert.equal(defaultReviewQueueMode(session), "ALL");
  });

  it("defaults fresh sessions to pending mode so review starts with undecided moments", () => {
    const session = createMockProjectSession();

    assert.equal(defaultReviewQueueMode(session), "ONLY_PENDING");
    assert.deepEqual(
      filterCandidatesByReviewMode(
        session.candidates,
        session,
        defaultReviewQueueMode(session),
      ).map((candidate) => candidate.id),
      session.candidates.map((candidate) => candidate.id),
    );
  });

  it("treats deferred candidates as reviewed but not accepted", () => {
    const session = createMockProjectSession();
    session.reviewDecisions = [
      {
        id: "defer_candidate_001",
        projectSessionId: session.id,
        candidateId: session.candidates[0].id,
        action: "DEFER",
        createdAt: "2026-03-25T18:20:00.000Z",
      },
    ];

    assert.equal(isCandidatePending(session, session.candidates[0].id), false);
    assert.equal(buildProjectSummary(session).acceptedCount, 0);
    assert.equal(
      buildProjectSummary(session).pendingCount,
      session.candidates.length - 1,
    );
  });

  it("summarizes review queue state for pending and complete fixtures", () => {
    const session = createMockProjectSession();
    session.reviewDecisions = [
      {
        id: "accept_candidate_001",
        projectSessionId: session.id,
        candidateId: session.candidates[0].id,
        action: "ACCEPT",
        createdAt: "2026-03-25T18:20:00.000Z",
      },
    ];

    assert.deepEqual(summarizeReviewQueueState(session, "ONLY_PENDING"), {
      mode: "ONLY_PENDING",
      totalCount: session.candidates.length,
      pendingCount: session.candidates.length - 1,
      reviewedCount: 1,
      visibleCount: session.candidates.length - 1,
      hiddenReviewedCount: 1,
      state: "pending",
      detail: `${session.candidates.length - 1} undecided moments remain; 1 already decided.`,
    });

    session.reviewDecisions = session.candidates.map((candidate, index) => ({
      id: `decision_${candidate.id}`,
      projectSessionId: session.id,
      candidateId: candidate.id,
      action: index % 2 === 0 ? ("ACCEPT" as const) : ("REJECT" as const),
      createdAt: "2026-03-25T18:25:00.000Z",
    }));

    assert.equal(summarizeReviewQueueState(session, "ALL").state, "complete");
    assert.equal(
      summarizeReviewQueueState(session, "ALL").visibleCount,
      session.candidates.length,
    );
  });

  // Profile matching boundary
  it("builds honest placeholder profile matching state without hiding candidates", () => {
    const session = createMockProjectSession();
    const profile = {
      id: "profile_dry_humor",
      name: "Dry humor",
      label: "Dry humor",
      description: "Deadpan reaction timing.",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
      state: "ACTIVE" as const,
      source: "USER" as const,
      mode: "EXAMPLE_DRIVEN" as const,
      signalWeights: {},
      exampleClips: [
        {
          id: "example_001",
          profileId: "profile_dry_humor",
          sourceType: "TWITCH_CLIP_URL" as const,
          sourceValue: "https://clips.twitch.tv/example",
          referenceKind: "CLIP" as const,
          status: "REFERENCE_ONLY" as const,
          createdAt: "2026-04-11T00:00:00.000Z",
          updatedAt: "2026-04-11T00:00:00.000Z",
        },
      ],
    };

    const summary = buildProfileMatchingSummary(profile);
    const placeholderMatch = resolveCandidateProfileMatch(
      session.candidates[0],
      profile,
    );
    const filtered = filterCandidatesByPresentationMode(
      session.candidates,
      profile,
      "STRONG_MATCHES",
    );

    assert.equal(summary.totalExampleCount, 1);
    assert.equal(summary.referenceOnlyExampleCount, 1);
    assert.equal(summary.usableLocalExampleCount, 0);
    assert.equal(summary.ready, false);
    assert.equal(summary.method, "NONE");
    assert.equal(placeholderMatch.status, "PLACEHOLDER");
    assert.equal(placeholderMatch.strength, "UNASSESSED");
    assert.equal(
      hasStrongCandidateProfileMatch(session.candidates[0], profile),
      false,
    );
    assert.equal(filtered.length, session.candidates.length);
  });

  // Display wording boundary
  it("formats analysis coverage bands for desktop display", () => {
    assert.equal(formatAnalysisCoverageBand("STRONG"), "Strong");
    assert.equal(formatAnalysisCoverageBand("PARTIAL"), "Partial");
    assert.equal(formatAnalysisCoverageBand("THIN"), "Thin");
    assert.equal(
      formatAnalysisCoverageFlag("METADATA_FALLBACK_USED"),
      "Estimated media metadata",
    );
    assert.equal(
      analysisCoverageTone({
        band: "THIN",
      }),
      "thin",
    );
  });

  it("builds plain-English candidate descriptions from real analyzer signals", () => {
    const session = createMockProjectSession();
    const reactionDescription = describeCandidatePlainly(session.candidates[0]);
    const lowSignalDescription = describeCandidatePlainly(
      session.candidates[3],
    );

    assert.equal(
      reactionDescription.summary,
      "Short reaction after sudden event",
    );
    assert.equal(
      reactionDescription.signalPhrases[0],
      "spoken reaction detected",
    );
    assert.equal(
      lowSignalDescription.summary,
      "Low confidence: low activity, unclear payoff",
    );
    assert.equal(
      lowSignalDescription.detail,
      "Not enough signs to be confident.",
    );
    assert.equal(
      describeReasonCodePlainly("STRUCTURE_RESOLUTION"),
      "event appears to resolve",
    );
  });

  it("summarizes session quality in plain English", () => {
    assert.equal(
      summarizeSessionQuality(
        {
          band: "PARTIAL",
          flags: ["SEEDED_TRANSCRIPT"],
        },
        3,
      ),
      "Limited transcript coverage",
    );
    assert.equal(
      summarizeSessionQuality(
        {
          band: "THIN",
          flags: ["LOW_CANDIDATE_COUNT"],
        },
        1,
      ),
      "Only a few possible moments found",
    );
    assert.equal(
      summarizeSessionQuality(
        {
          band: "STRONG",
          flags: [],
        },
        4,
      ),
      "Several clear moments found",
    );
  });
});
