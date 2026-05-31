import type {
  AnalysisCoverage,
  AnalysisCoverageBand,
} from "@vaexcore/pulse-shared-types";

export function formatAnalysisCoverageBand(band: AnalysisCoverageBand): string {
  if (band === "STRONG") {
    return "Strong";
  }

  if (band === "THIN") {
    return "Thin";
  }

  return "Partial";
}

export function formatAnalysisCoverageFlag(
  flag: AnalysisCoverage["flags"][number],
): string {
  if (flag === "METADATA_FALLBACK_USED") {
    return "Estimated media metadata";
  }

  if (flag === "SEEDED_TRANSCRIPT") {
    return "Limited transcript coverage";
  }

  if (flag === "TRANSCRIPT_SPARSE") {
    return "Limited transcript";
  }

  if (flag === "LOW_CANDIDATE_COUNT") {
    return "Few possible moments";
  }

  return "No moments found";
}

export function analysisCoverageTone(
  coverage: Pick<AnalysisCoverage, "band">,
): "strong" | "partial" | "thin" {
  if (coverage.band === "STRONG") {
    return "strong";
  }

  if (coverage.band === "THIN") {
    return "thin";
  }

  return "partial";
}

export function summarizeSessionQuality(
  coverage: Pick<AnalysisCoverage, "band" | "flags">,
  candidateCount = 0,
): string {
  if (coverage.flags.includes("NO_CANDIDATES") || candidateCount === 0) {
    return "No clear moments found";
  }

  if (
    coverage.flags.includes("SEEDED_TRANSCRIPT") ||
    coverage.flags.includes("TRANSCRIPT_SPARSE")
  ) {
    return "Limited transcript coverage";
  }

  if (
    coverage.band === "THIN" ||
    coverage.flags.includes("LOW_CANDIDATE_COUNT")
  ) {
    return "Only a few possible moments found";
  }

  if (coverage.band === "STRONG" && candidateCount >= 3) {
    return "Several clear moments found";
  }

  if (coverage.band === "STRONG") {
    return "Clear moments found";
  }

  return "Some useful moments found";
}
