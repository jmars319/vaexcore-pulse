import type {
  CandidateWindow,
  ContentProfile,
} from "@vaexcore/pulse-shared-types";

export function explainCandidatePlaceholder(
  candidate: CandidateWindow,
  profile?: ContentProfile,
): string {
  return explainCandidateDeterministically(candidate, profile);
}

export function suggestTitlePlaceholder(candidate: CandidateWindow): string {
  return suggestDeterministicTitle(candidate);
}

export function explainCandidateDeterministically(
  candidate: CandidateWindow,
  profile?: ContentProfile,
): string {
  const profileLabel = profile?.label ?? "current";
  const reasons = candidate.reasonCodes
    .slice(0, 3)
    .map(formatReasonCode)
    .join(", ");
  const risks = candidate.reviewTags.map(formatReviewTag).join(", ");
  const confidence = candidate.confidenceBand.toLowerCase();
  const riskCopy = risks ? ` Watch ${risks}.` : "";
  const transcriptCopy = candidate.transcriptSnippet
    ? ` Transcript cue: "${trimSnippet(candidate.transcriptSnippet)}".`
    : "";
  return `Pulse marked this as a ${confidence} confidence ${profileLabel} moment because of ${reasons || "local timing and signal patterns"}.${riskCopy}${transcriptCopy}`;
}

export function suggestDeterministicTitle(candidate: CandidateWindow): string {
  const leadReason = formatReasonCode(
    candidate.reasonCodes[0] ?? "CONTEXT_REQUIRED",
  );
  return `${candidate.editableLabel} - ${leadReason}`;
}

function formatReasonCode(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatReviewTag(value: string): string {
  return formatReasonCode(value).replace(" Risk", " risk").toLowerCase();
}

function trimSnippet(value: string): string {
  return value.length > 140 ? `${value.slice(0, 137).trim()}...` : value;
}
