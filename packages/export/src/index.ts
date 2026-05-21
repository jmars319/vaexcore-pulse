import type {
  CandidateWindow,
  MediaSource,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";

type ExportMoment = {
  candidate: CandidateWindow;
  decision: ReviewDecision;
  label: string;
  startSeconds: number;
  endSeconds: number;
};

export function toJsonCandidateExport(
  mediaSource: MediaSource,
  candidates: CandidateWindow[],
  decisions: ReviewDecision[],
): string {
  const acceptedMoments = buildAcceptedExportMoments(candidates, decisions).map(
    (moment, index) => ({
      index: index + 1,
      candidateId: moment.candidate.id,
      label: moment.label,
      startSeconds: moment.startSeconds,
      endSeconds: moment.endSeconds,
      confidenceBand: moment.candidate.confidenceBand,
      reasonCodes: moment.candidate.reasonCodes,
      reviewDecisionId: moment.decision.id,
    }),
  );

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      mediaSource,
      acceptedMoments,
      candidates,
      decisions,
    },
    null,
    2,
  );
}

export function toTimestampExport(
  candidates: CandidateWindow[],
  decisions: ReviewDecision[],
): string {
  return buildAcceptedExportMoments(candidates, decisions)
    .map(
      (moment) =>
        `${formatTimestamp(moment.startSeconds)} - ${formatTimestamp(moment.endSeconds)}  ${moment.label}`,
    )
    .join("\n");
}

export function toEdlExport(
  mediaSource: MediaSource,
  candidates: CandidateWindow[],
  decisions: ReviewDecision[],
): string {
  const moments = buildAcceptedExportMoments(candidates, decisions);
  const frameRate = Math.max(1, Math.round(mediaSource.frameRate ?? 30));
  let destinationCursorSeconds = 0;
  const lines = [
    `TITLE: vaexcore pulse - ${mediaSource.fileName}`,
    "FCM: NON-DROP FRAME",
    "",
  ];

  moments.forEach((moment, index) => {
    const durationSeconds = Math.max(
      0,
      moment.endSeconds - moment.startSeconds,
    );
    const destinationStartSeconds = destinationCursorSeconds;
    const destinationEndSeconds = destinationCursorSeconds + durationSeconds;
    destinationCursorSeconds = destinationEndSeconds;

    lines.push(
      `${String(index + 1).padStart(3, "0")}  AX       V     C        ${formatEdlTimecode(
        moment.startSeconds,
        frameRate,
      )} ${formatEdlTimecode(moment.endSeconds, frameRate)} ${formatEdlTimecode(
        destinationStartSeconds,
        frameRate,
      )} ${formatEdlTimecode(destinationEndSeconds, frameRate)}`,
      `* FROM CLIP NAME: ${mediaSource.fileName}`,
      `* COMMENT: ${sanitizeEdlComment(moment.label)}`,
    );
  });

  if (moments.length === 0) {
    lines.push("* NO ACCEPTED MOMENTS");
  }

  return lines.join("\n");
}

export function toEdlPlaceholder(
  mediaSource: MediaSource,
  candidates: CandidateWindow[],
  decisions: ReviewDecision[] = [],
): string {
  return toEdlExport(mediaSource, candidates, decisions);
}

function buildAcceptedExportMoments(
  candidates: CandidateWindow[],
  decisions: ReviewDecision[],
): ExportMoment[] {
  const decisionByCandidateId = new Map(
    decisions.map((decision) => [decision.candidateId, decision]),
  );

  return candidates.flatMap((candidate) => {
    const decision = decisionByCandidateId.get(candidate.id);
    if (decision?.action !== "ACCEPT") {
      return [];
    }
    const startSeconds =
      decision.adjustedSegment?.startSeconds ??
      candidate.suggestedSegment.startSeconds;
    const endSeconds =
      decision.adjustedSegment?.endSeconds ??
      candidate.suggestedSegment.endSeconds;
    return [
      {
        candidate,
        decision,
        label: decision.label ?? candidate.editableLabel,
        startSeconds,
        endSeconds,
      },
    ];
  });
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

function formatEdlTimecode(totalSeconds: number, frameRate: number): string {
  const totalFrames = Math.max(0, Math.round(totalSeconds * frameRate));
  const framesPerHour = frameRate * 3600;
  const framesPerMinute = frameRate * 60;
  const hours = Math.floor(totalFrames / framesPerHour);
  const minutes = Math.floor((totalFrames % framesPerHour) / framesPerMinute);
  const seconds = Math.floor((totalFrames % framesPerMinute) / frameRate);
  const frames = totalFrames % frameRate;

  return [hours, minutes, seconds, frames]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}

function sanitizeEdlComment(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}
