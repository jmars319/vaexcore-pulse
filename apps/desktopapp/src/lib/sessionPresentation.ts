import {
  deriveSessionReviewState,
  isCandidatePending,
  reviewedCandidateCount,
  summarizeSessionQuality,
} from "@vaexcore/pulse-domain";
import {
  isSupportedInput,
  supportedInputExtensions,
} from "@vaexcore/pulse-media";
import type {
  ClipProfile,
  ProjectSession,
  ProjectSessionSummary,
} from "@vaexcore/pulse-shared-types";
import {
  buildPulseStartupCopy,
  isPulseRuntimeReady,
  type PulseRuntimeStatus,
} from "../hooks/usePulseRuntimeStatus";

export type AnalysisReadiness = {
  canAnalyze: boolean;
  statusLabel: string;
  headline: string;
  detail: string;
  tone: "ready" | "blocked";
};

export type StartGuide = {
  statusLabel: string;
  headline: string;
  detail: string;
  steps: string[];
  ctaLabel: string | null;
  ctaAction: "profile-setup" | "pick-media" | null;
};

export function buildSuggestedSessionTitle(sourcePath: string): string {
  return extractSourceName(sourcePath).replace(/\.[^.]+$/, "");
}

export function extractSourceName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).pop() ?? sourcePath;
}

export function buildAnalysisLaunchState(
  sourcePath: string,
  options: {
    hasPersistedProfiles: boolean;
    isLoadingProfiles: boolean;
    pulseRuntimeStatus: PulseRuntimeStatus;
  },
): AnalysisReadiness {
  if (!isPulseRuntimeReady(options.pulseRuntimeStatus)) {
    const copy = buildPulseStartupCopy(options.pulseRuntimeStatus);
    return {
      canAnalyze: false,
      detail: copy.detail,
      headline: copy.headline,
      statusLabel: copy.statusLabel,
      tone: "blocked",
    };
  }

  if (options.isLoadingProfiles) {
    return {
      canAnalyze: false,
      detail: "Waiting for your saved profiles.",
      headline: "Loading profiles",
      statusLabel: "Checking profiles",
      tone: "blocked",
    };
  }

  if (!options.hasPersistedProfiles) {
    return {
      canAnalyze: false,
      detail: "Create a profile first so Pulse knows what to look for.",
      headline: "No profile yet",
      statusLabel: "Profile required",
      tone: "blocked",
    };
  }

  if (!sourcePath) {
    return {
      canAnalyze: false,
      detail: "Choose a supported local video before starting.",
      headline: "Choose a video",
      statusLabel: "Video required",
      tone: "blocked",
    };
  }

  if (!isSupportedInput(sourcePath)) {
    return {
      canAnalyze: false,
      detail: `Unsupported file type. Try: ${supportedInputExtensions.join(", ")}`,
      headline: "Unsupported file type",
      statusLabel: "File type issue",
      tone: "blocked",
    };
  }

  return {
    canAnalyze: true,
    detail: "Pulse can scan this video now. Review opens when it finishes.",
    headline: "Ready to scan",
    statusLabel: "Ready",
    tone: "ready",
  };
}

export function buildLabelDrafts(
  session: ProjectSession,
): Record<string, string> {
  const decisionLabelsByCandidateId = Object.fromEntries(
    session.reviewDecisions
      .filter((decision) => Boolean(decision.label))
      .map((decision) => [decision.candidateId, decision.label as string]),
  );

  return Object.fromEntries(
    session.candidates.map((candidate) => [
      candidate.id,
      decisionLabelsByCandidateId[candidate.id] ?? candidate.editableLabel,
    ]),
  );
}

export function formatSessionReviewState(
  sessionReviewState: ReturnType<typeof deriveSessionReviewState>,
): string {
  if (sessionReviewState === "REVIEWED") {
    return "Reviewed";
  }

  if (sessionReviewState === "IN_PROGRESS") {
    return "In progress";
  }

  return "Pending";
}

export function buildSessionOpenLabel(summary: ProjectSessionSummary): string {
  const sessionReviewState = deriveSessionReviewState(summary);
  if (sessionReviewState === "REVIEWED") {
    return "Open session";
  }

  if (sessionReviewState === "IN_PROGRESS") {
    return "Continue review";
  }

  return "Start reviewing";
}

export function resolveProfile(
  profiles: ClipProfile[],
  profileId: string,
): ClipProfile {
  return (
    profiles.find((profile) => profile.id === profileId) ?? {
      id: profileId,
      name: "Profile unavailable",
      label: profileId,
      description: "This profile is not available right now.",
      createdAt: "",
      updatedAt: "",
      state: "ACTIVE",
      source: "USER",
      mode: "EXAMPLE_DRIVEN",
      signalWeights: {},
      exampleClips: [],
    }
  );
}

export function formatSessionCompletion(
  summary: ProjectSessionSummary,
): number {
  if (summary.candidateCount === 0) {
    return 0;
  }

  return Math.round(
    (reviewedCandidateCount(summary) / summary.candidateCount) * 100,
  );
}

export function buildProjectCoverageCopy(
  summary: ProjectSessionSummary,
): string {
  return summarizeSessionQuality(
    summary.analysisCoverage,
    summary.candidateCount,
  );
}

export function findFirstPendingCandidateId(
  session: ProjectSession,
): string | null {
  return (
    session.candidates.find((candidate) =>
      isCandidatePending(session, candidate.id),
    )?.id ?? null
  );
}

export function findNextPendingCandidateId(
  session: ProjectSession,
  currentCandidateId: string | null,
): string | null {
  return findNextCandidateId(session, currentCandidateId, (candidateId) =>
    isCandidatePending(session, candidateId),
  );
}

export function findNextCandidateId(
  session: ProjectSession,
  currentCandidateId: string | null,
  predicate?: (candidateId: string) => boolean,
): string | null {
  if (session.candidates.length === 0) {
    return null;
  }

  const startIndex = currentCandidateId
    ? session.candidates.findIndex(
        (candidate) => candidate.id === currentCandidateId,
      )
    : -1;

  for (let offset = 1; offset <= session.candidates.length; offset += 1) {
    const candidate =
      session.candidates[
        (Math.max(startIndex, -1) + offset) % session.candidates.length
      ];
    if (!predicate || predicate(candidate.id)) {
      return candidate.id;
    }
  }

  return null;
}

export function findAdjacentVisibleCandidateId(
  candidates: Array<{
    id: string;
  }>,
  currentCandidateId: string | null,
  direction: -1 | 1,
): string | null {
  if (candidates.length === 0) {
    return null;
  }

  const currentIndex = currentCandidateId
    ? candidates.findIndex((candidate) => candidate.id === currentCandidateId)
    : -1;

  if (currentIndex === -1) {
    return direction === 1
      ? (candidates[0]?.id ?? null)
      : (candidates[candidates.length - 1]?.id ?? null);
  }

  const nextIndex =
    (currentIndex + direction + candidates.length) % candidates.length;
  return candidates[nextIndex]?.id ?? null;
}

export function formatSummaryTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildStartGuide(input: {
  hasPersistedProfiles: boolean;
  hasReferenceMaterial: boolean;
  hasSavedSessions: boolean;
  hasSelectedVideo: boolean;
}): StartGuide {
  if (!input.hasPersistedProfiles) {
    return {
      statusLabel: "First setup",
      headline: "Create your first profile",
      detail: "A profile tells Pulse what kinds of moments you like to keep.",
      steps: [
        "Open Profile Setup.",
        "Create one profile.",
        "Add a few clips or one finished edit.",
      ],
      ctaLabel: "Set up profile",
      ctaAction: "profile-setup",
    };
  }

  if (!input.hasReferenceMaterial) {
    return {
      statusLabel: input.hasSavedSessions ? "Reference refresh" : "First setup",
      headline: "Add a few examples",
      detail: "Examples help Pulse make better suggestions.",
      steps: [
        "Add 2-3 short clips that feel like moments you would keep.",
        "Add one finished edit if you have one.",
        "Scan a longer video and review the suggestions.",
      ],
      ctaLabel: "Add examples",
      ctaAction: "profile-setup",
    };
  }

  if (!input.hasSelectedVideo) {
    return {
      statusLabel: input.hasSavedSessions ? "Next scan" : "Ready",
      headline: input.hasSavedSessions
        ? "Choose the next video to scan"
        : "Pick the first video you want to scan",
      detail: "Choose a file and Pulse will build a review queue.",
      steps: [
        "Choose one local video file.",
        "Confirm the profile you want to use.",
        "Start the scan.",
      ],
      ctaLabel: "Choose video",
      ctaAction: "pick-media",
    };
  }

  return {
    statusLabel: input.hasSavedSessions ? "Ready" : "First scan",
    headline: input.hasSavedSessions
      ? "This scan is ready to run"
      : "You are ready for the first scan",
    detail:
      "Start with one video, then review each suggested moment and choose what to keep.",
    steps: [
      "Start the scan.",
      "Review the suggested moments.",
      "Keep adding examples as your profile improves.",
    ],
    ctaLabel: null,
    ctaAction: null,
  };
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}
