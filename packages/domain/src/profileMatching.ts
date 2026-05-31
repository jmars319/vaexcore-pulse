import type {
  CandidateProfileMatch,
  CandidateWindow,
  ClipProfile,
  ProfileMatchingSummary,
  ProfilePresentationMode,
} from "@vaexcore/pulse-shared-types";

export function buildProfileMatchingSummary(
  profile: Pick<ClipProfile, "id" | "exampleClips">,
): ProfileMatchingSummary {
  const totalExampleCount = profile.exampleClips.length;
  const usableLocalExampleCount = profile.exampleClips.filter(
    (example) =>
      (example.sourceType === "LOCAL_FILE_PATH" ||
        example.sourceType === "LOCAL_FILE_UPLOAD") &&
      example.status === "LOCAL_FILE_AVAILABLE" &&
      Boolean(example.featureSummary),
  ).length;
  const referenceOnlyExampleCount = profile.exampleClips.filter(
    (example) =>
      example.sourceType === "TWITCH_CLIP_URL" ||
      example.sourceType === "YOUTUBE_SHORT_URL" ||
      example.status === "REFERENCE_ONLY",
  ).length;
  const unavailableLocalExampleCount = Math.max(
    totalExampleCount - usableLocalExampleCount - referenceOnlyExampleCount,
    0,
  );

  if (totalExampleCount === 0) {
    return {
      profileId: profile.id,
      totalExampleCount,
      usableLocalExampleCount,
      referenceOnlyExampleCount,
      unavailableLocalExampleCount,
      ready: false,
      method: "NONE",
      note: "Add a few clip examples or a finished edit to improve suggestions.",
    };
  }

  if (usableLocalExampleCount > 0) {
    const ignoredReferenceCopy =
      referenceOnlyExampleCount > 0
        ? ` ${referenceOnlyExampleCount} saved link${referenceOnlyExampleCount === 1 ? "" : "s"} will be useful later.`
        : "";
    return {
      profileId: profile.id,
      totalExampleCount,
      usableLocalExampleCount,
      referenceOnlyExampleCount,
      unavailableLocalExampleCount,
      ready: true,
      method: "LOCAL_FILE_HEURISTIC",
      note: `Using ${usableLocalExampleCount} saved example${usableLocalExampleCount === 1 ? "" : "s"} to compare new moments.${ignoredReferenceCopy}`,
    };
  }

  if (referenceOnlyExampleCount > 0 && unavailableLocalExampleCount === 0) {
    return {
      profileId: profile.id,
      totalExampleCount,
      usableLocalExampleCount,
      referenceOnlyExampleCount,
      unavailableLocalExampleCount,
      ready: false,
      method: "NONE",
      note: "Links are saved. Add a local clip or finished edit to improve suggestions.",
    };
  }

  return {
    profileId: profile.id,
    totalExampleCount,
    usableLocalExampleCount,
    referenceOnlyExampleCount,
    unavailableLocalExampleCount,
    ready: false,
    method: "NONE",
    note: "Saved examples are not ready yet. Check the files and try again.",
  };
}

export function resolveCandidateProfileMatch(
  candidate: Pick<CandidateWindow, "profileMatches">,
  profile: Pick<ClipProfile, "id" | "exampleClips">,
): CandidateProfileMatch {
  const storedMatch = candidate.profileMatches.find(
    (match) => match.profileId === profile.id,
  );

  if (storedMatch) {
    return storedMatch;
  }

  const summary = buildProfileMatchingSummary(profile);

  return {
    profileId: profile.id,
    method: summary.method,
    status: summary.totalExampleCount > 0 ? "PLACEHOLDER" : "UNASSESSED",
    strength: "UNASSESSED",
    note: summary.note,
    matchedExampleClipIds: [],
    comparedExampleCount: summary.usableLocalExampleCount,
    supportingFactors: [],
    limitingFactors: [],
  };
}

export function hasStrongCandidateProfileMatch(
  candidate: Pick<CandidateWindow, "profileMatches">,
  profile: Pick<ClipProfile, "id" | "exampleClips">,
): boolean {
  const match = resolveCandidateProfileMatch(candidate, profile);
  return match.strength === "STRONG";
}

export function filterCandidatesByPresentationMode(
  candidates: CandidateWindow[],
  profile: Pick<ClipProfile, "id" | "exampleClips">,
  presentationMode: ProfilePresentationMode,
): CandidateWindow[] {
  if (presentationMode === "PROFILE_VIEW") {
    return [...candidates].sort((left, right) => {
      const leftMatch = resolveCandidateProfileMatch(left, profile);
      const rightMatch = resolveCandidateProfileMatch(right, profile);
      const strengthRank = profileMatchStrengthRank(leftMatch.strength);
      const rightStrengthRank = profileMatchStrengthRank(rightMatch.strength);
      if (strengthRank !== rightStrengthRank) {
        return strengthRank - rightStrengthRank;
      }

      const leftScore = leftMatch.similarityScore ?? -1;
      const rightScore = rightMatch.similarityScore ?? -1;
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return right.scoreEstimate - left.scoreEstimate;
    });
  }

  if (presentationMode !== "STRONG_MATCHES") {
    return [...candidates];
  }

  const strongMatches = candidates.filter((candidate) =>
    hasStrongCandidateProfileMatch(candidate, profile),
  );

  return strongMatches.length > 0 ? strongMatches : candidates;
}

function profileMatchStrengthRank(
  strength: CandidateProfileMatch["strength"],
): number {
  if (strength === "STRONG") {
    return 0;
  }

  if (strength === "POSSIBLE") {
    return 1;
  }

  if (strength === "WEAK") {
    return 2;
  }

  return 3;
}
