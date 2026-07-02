import type { ProjectSession, ReviewDecision } from "./domain";
import { createMockProjectSessions, createMockReviewHistory } from "./mock";

export type PulseDemoContentPack = {
  schema: "vaexcore.pulse.demo-content-pack.v1";
  generatedAt: string;
  title: string;
  description: string;
  sessions: ProjectSession[];
  reviewDecisions: ReviewDecision[];
  smokeChecklist: string[];
};

export function createPulseDemoContentPack(): PulseDemoContentPack {
  return {
    schema: "vaexcore.pulse.demo-content-pack.v1",
    generatedAt: "2026-05-21T00:00:00.000Z",
    title: "Pulse Strong V1 Demo Content",
    description:
      "Deterministic local sessions for onboarding, export smoke tests, search checks, and review workflow validation.",
    sessions: createMockProjectSessions(),
    reviewDecisions: createMockReviewHistory(),
    smokeChecklist: [
      "Open the backlog and confirm profile-grouped saved sessions.",
      "Search for reaction, payoff, and seeded transcript anchors.",
      "Review all moments in the primary demo session.",
      "Copy timestamp, JSON, EDL, and batch export package outputs.",
      "Send accepted moments to Studio through the local handoff smoke path.",
    ],
  };
}
