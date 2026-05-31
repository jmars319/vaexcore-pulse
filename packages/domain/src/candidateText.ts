import type {
  CandidateDecisionMap,
  CandidateWindow,
  ConfidenceBand,
  ReasonCode,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";

export function resolveCandidateLabel(
  candidate: CandidateWindow,
  decision?: ReviewDecision,
): string {
  return decision?.label ?? candidate.editableLabel;
}

const plainReasonDescriptions: Record<ReasonCode, string> = {
  LOUDNESS_SPIKE: "sudden increase in audio intensity",
  LAUGHTER_BURST: "brief laughter-like audio burst",
  OVERLAP_SPIKE: "multiple voices or sounds rise at once",
  REACTION_PHRASE: "spoken reaction detected",
  COMMENTARY_DENSITY: "sustained spoken commentary",
  SILENCE_BREAK: "quiet stretch followed by renewed activity",
  ACTION_AUDIO_CLUSTER: "cluster of fast action sounds",
  STRUCTURE_SETUP: "setup before a possible event",
  STRUCTURE_CONSEQUENCE: "event appears to create an immediate consequence",
  STRUCTURE_RESOLUTION: "event appears to resolve",
  MENU_HEAVY: "menu or non-gameplay activity",
  CLEANUP_HEAVY: "cleanup or low-payoff activity",
  LOW_INFORMATION: "low activity or unclear outcome",
  CONTEXT_REQUIRED: "surrounding context is still needed",
  TACTICAL_NARRATION: "spoken tactical explanation",
  PITCH_EXCURSION: "noticeable change in vocal pitch",
  ABRUPT_SILENCE_AFTER_INTENSITY: "activity drops quickly after a peak",
};

export type CandidatePlainDescription = {
  summary: string;
  detail: string | null;
  signalPhrases: string[];
};

export function describeReasonCodePlainly(reasonCode: ReasonCode): string {
  return plainReasonDescriptions[reasonCode];
}

export function describeCandidatePlainly(
  candidate: CandidateWindow,
): CandidatePlainDescription {
  const reasonCodes = new Set(candidate.reasonCodes);
  const topSignalPhrases = uniqueReasonCodes(
    candidate.scoreBreakdown
      .filter((item) => item.direction === "POSITIVE")
      .sort((left, right) => right.contribution - left.contribution)
      .map((item) => item.reasonCode),
  )
    .map(describeReasonCodePlainly)
    .slice(0, 3);

  const hasReactionPhrase = reasonCodes.has("REACTION_PHRASE");
  const hasLoudnessSpike = reasonCodes.has("LOUDNESS_SPIKE");
  const hasPitchExcursion = reasonCodes.has("PITCH_EXCURSION");
  const hasActionCluster = reasonCodes.has("ACTION_AUDIO_CLUSTER");
  const hasCommentaryDensity = reasonCodes.has("COMMENTARY_DENSITY");
  const hasTacticalNarration = reasonCodes.has("TACTICAL_NARRATION");
  const hasOverlapSpike = reasonCodes.has("OVERLAP_SPIKE");
  const hasLaughterBurst = reasonCodes.has("LAUGHTER_BURST");
  const hasStructureSetup = reasonCodes.has("STRUCTURE_SETUP");
  const hasStructureConsequence = reasonCodes.has("STRUCTURE_CONSEQUENCE");
  const hasStructureResolution = reasonCodes.has("STRUCTURE_RESOLUTION");
  const hasLowInformation = reasonCodes.has("LOW_INFORMATION");
  const needsContext =
    candidate.contextRequired || reasonCodes.has("CONTEXT_REQUIRED");

  let summary = "Possible moment with only a few clues";

  if (hasLowInformation) {
    summary = "Low activity, unclear payoff";
  } else if (
    hasReactionPhrase &&
    (hasLoudnessSpike || hasPitchExcursion || hasActionCluster)
  ) {
    summary = "Short reaction after sudden event";
  } else if (hasStructureSetup && hasStructureResolution) {
    summary = "Quick escalation followed by resolution";
  } else if (hasCommentaryDensity && hasTacticalNarration) {
    summary = "Extended dialogue segment";
  } else if (hasOverlapSpike && hasLaughterBurst) {
    summary = "Brief group reaction or laughter burst";
  } else if (hasOverlapSpike) {
    summary = "Brief burst of overlapping voices";
  } else if (
    hasActionCluster &&
    (hasStructureConsequence || hasStructureResolution)
  ) {
    summary = "High-activity segment with a possible outcome";
  } else if (hasActionCluster) {
    summary = "Short high-activity segment";
  } else if (hasTacticalNarration) {
    summary = "Spoken tactical explanation";
  } else if (hasCommentaryDensity) {
    summary = "Extended dialogue segment";
  } else if (hasStructureSetup) {
    summary = "Setup segment before possible action";
  } else if (hasStructureResolution || hasStructureConsequence) {
    summary = "Possible resolution moment";
  } else if (hasLoudnessSpike || hasPitchExcursion) {
    summary = "Brief increase in activity";
  }

  const lowConfidence =
    candidate.confidenceBand === "LOW" ||
    candidate.confidenceBand === "EXPERIMENTAL" ||
    hasLowInformation;
  const mediumConfidence =
    candidate.confidenceBand === "MEDIUM" || needsContext;

  if (lowConfidence) {
    summary = `Low confidence: ${lowercaseFirst(summary)}`;
  } else if (
    mediumConfidence &&
    !summary.toLowerCase().startsWith("possible ")
  ) {
    summary = `Possible ${lowercaseFirst(summary)}`;
  }

  let detail: string | null = null;
  if (hasLowInformation) {
    detail = "Not enough signs to be confident.";
  } else if (needsContext) {
    detail = "Needs surrounding context to confirm the outcome.";
  } else if (
    (candidate.confidenceBand === "LOW" ||
      candidate.confidenceBand === "EXPERIMENTAL") &&
    topSignalPhrases.length > 0
  ) {
    detail = `Only a few signs showed up: ${joinReadableList(topSignalPhrases.slice(0, 2))}.`;
  } else if (topSignalPhrases.length > 0) {
    detail = `This moment includes ${joinReadableList(topSignalPhrases.slice(0, 2))}.`;
  }

  return {
    summary,
    detail,
    signalPhrases: topSignalPhrases,
  };
}

export function decisionForCandidate(
  candidateId: string,
  decisionsByCandidateId: CandidateDecisionMap,
): ReviewDecision | undefined {
  return decisionsByCandidateId[candidateId];
}

export function buildCandidateSearchText(
  candidate: CandidateWindow,
  label: string,
): string {
  const plainDescription = describeCandidatePlainly(candidate);

  return [
    candidate.transcriptSnippet,
    label,
    plainDescription.summary,
    plainDescription.detail ?? "",
    plainDescription.signalPhrases.join(" "),
    candidate.reasonCodes.join(" "),
    candidate.reviewTags.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

export function filterCandidates(
  candidates: CandidateWindow[],
  query: string,
  band: ConfidenceBand | "ALL",
  decisionsByCandidateId: CandidateDecisionMap,
): CandidateWindow[] {
  const normalizedQuery = query.trim().toLowerCase();

  return candidates.filter((candidate) => {
    if (band !== "ALL" && candidate.confidenceBand !== band) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return buildCandidateSearchText(
      candidate,
      resolveCandidateLabel(candidate, decisionsByCandidateId[candidate.id]),
    ).includes(normalizedQuery);
  });
}

function uniqueReasonCodes(reasonCodes: ReasonCode[]): ReasonCode[] {
  const seen = new Set<ReasonCode>();

  return reasonCodes.filter((reasonCode) => {
    if (seen.has(reasonCode)) {
      return false;
    }

    seen.add(reasonCode);
    return true;
  });
}

function lowercaseFirst(value: string): string {
  return value.length > 0
    ? value.charAt(0).toLowerCase() + value.slice(1)
    : value;
}

function joinReadableList(values: string[]): string {
  if (values.length === 0) {
    return "";
  }

  if (values.length === 1) {
    return values[0];
  }

  return `${values[0]} and ${values[1]}`;
}
