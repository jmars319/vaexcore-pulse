import type {
  CandidateWindow,
  MediaSource,
  ProjectSession,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";

export const pulseExportPresetIds = [
  "timestamps",
  "youtube-chapters",
  "tiktok-shortlist",
  "editor-handoff",
  "json",
  "edl",
] as const;

export type PulseExportPresetId = (typeof pulseExportPresetIds)[number];

export type PulseExportPreset = {
  id: PulseExportPresetId;
  label: string;
  fileExtension: string;
  description: string;
};

export type PulseBatchExportFile = {
  presetId: PulseExportPresetId;
  fileName: string;
  mimeType: string;
  contents: string;
  description: string;
};

export type PulseBatchExportPackage = {
  generatedAt: string;
  sessionId: string;
  sessionTitle: string;
  sourceName: string;
  acceptedMomentCount: number;
  fileCount: number;
  files: PulseBatchExportFile[];
};

type ExportMoment = {
  candidate: CandidateWindow;
  decision: ReviewDecision;
  label: string;
  startSeconds: number;
  endSeconds: number;
};

export const pulseExportPresets: PulseExportPreset[] = [
  {
    id: "timestamps",
    label: "Timestamp list",
    fileExtension: "txt",
    description: "Plain timestamp list for quick notes and manual posting.",
  },
  {
    id: "youtube-chapters",
    label: "YouTube chapters",
    fileExtension: "txt",
    description: "Chapter-friendly timestamps starting at 00:00.",
  },
  {
    id: "tiktok-shortlist",
    label: "Shorts shortlist CSV",
    fileExtension: "csv",
    description: "CSV shortlist for TikTok, Shorts, and Reels candidates.",
  },
  {
    id: "editor-handoff",
    label: "Editor handoff JSON",
    fileExtension: "json",
    description: "Structured handoff with source, labels, ranges, and notes.",
  },
  {
    id: "json",
    label: "Pulse evidence JSON",
    fileExtension: "json",
    description: "Full Pulse accepted-moment evidence export.",
  },
  {
    id: "edl",
    label: "EDL",
    fileExtension: "edl",
    description: "Non-drop-frame editor decision list.",
  },
];

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

export function buildPulseBatchExportPackage(
  session: ProjectSession,
  decisions: ReviewDecision[] = session.reviewDecisions,
  presetIds: PulseExportPresetId[] = [...pulseExportPresetIds],
): PulseBatchExportPackage {
  const acceptedMoments = buildAcceptedExportMoments(
    session.candidates,
    decisions,
  );
  const generatedAt = new Date().toISOString();
  const baseName = safeFileBaseName(
    session.title || session.mediaSource.fileName,
  );
  const files = presetIds.map((presetId) =>
    buildPresetFile(session, decisions, acceptedMoments, presetId, baseName),
  );

  return {
    generatedAt,
    sessionId: session.id,
    sessionTitle: session.title,
    sourceName: session.mediaSource.fileName,
    acceptedMomentCount: acceptedMoments.length,
    fileCount: files.length,
    files,
  };
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

function buildPresetFile(
  session: ProjectSession,
  decisions: ReviewDecision[],
  moments: ExportMoment[],
  presetId: PulseExportPresetId,
  baseName: string,
): PulseBatchExportFile {
  const preset = pulseExportPresets.find((item) => item.id === presetId);
  if (!preset) {
    throw new Error(`Unsupported Pulse export preset: ${presetId}`);
  }

  const fileName = `${baseName}.${preset.fileExtension}`;
  if (presetId === "timestamps") {
    return {
      presetId,
      fileName: `${baseName}-timestamps.txt`,
      mimeType: "text/plain",
      contents: toTimestampExport(session.candidates, decisions),
      description: preset.description,
    };
  }
  if (presetId === "youtube-chapters") {
    return {
      presetId,
      fileName: `${baseName}-youtube-chapters.txt`,
      mimeType: "text/plain",
      contents: toYoutubeChapterExport(moments),
      description: preset.description,
    };
  }
  if (presetId === "tiktok-shortlist") {
    return {
      presetId,
      fileName: `${baseName}-shorts-shortlist.csv`,
      mimeType: "text/csv",
      contents: toShortlistCsvExport(moments),
      description: preset.description,
    };
  }
  if (presetId === "editor-handoff") {
    return {
      presetId,
      fileName: `${baseName}-editor-handoff.json`,
      mimeType: "application/json",
      contents: toEditorHandoffExport(session, moments),
      description: preset.description,
    };
  }
  if (presetId === "json") {
    return {
      presetId,
      fileName: `${baseName}-pulse-evidence.json`,
      mimeType: "application/json",
      contents: toJsonCandidateExport(
        session.mediaSource,
        session.candidates,
        decisions,
      ),
      description: preset.description,
    };
  }
  return {
    presetId,
    fileName,
    mimeType: "application/edl",
    contents: toEdlExport(session.mediaSource, session.candidates, decisions),
    description: preset.description,
  };
}

function toYoutubeChapterExport(moments: ExportMoment[]): string {
  if (moments.length === 0) return "";
  return moments
    .map((moment, index) => {
      const chapterStart = index === 0 ? 0 : moment.startSeconds;
      return `${formatTimestamp(chapterStart)} ${moment.label}`;
    })
    .join("\n");
}

function toShortlistCsvExport(moments: ExportMoment[]): string {
  const rows = [
    [
      "candidate_id",
      "label",
      "start_seconds",
      "end_seconds",
      "duration_seconds",
      "confidence_band",
      "reason_codes",
    ],
    ...moments.map((moment) => [
      moment.candidate.id,
      moment.label,
      String(moment.startSeconds),
      String(moment.endSeconds),
      String(Math.max(0, moment.endSeconds - moment.startSeconds)),
      moment.candidate.confidenceBand,
      moment.candidate.reasonCodes.join("|"),
    ]),
  ];
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function toEditorHandoffExport(
  session: ProjectSession,
  moments: ExportMoment[],
): string {
  return JSON.stringify(
    {
      schema: "vaexcore.pulse.editor-handoff.v1",
      exportedAt: new Date().toISOString(),
      session: {
        id: session.id,
        title: session.title,
        source: session.mediaSource,
        profileId: session.profileId,
      },
      moments: moments.map((moment, index) => ({
        index: index + 1,
        candidateId: moment.candidate.id,
        label: moment.label,
        startSeconds: moment.startSeconds,
        endSeconds: moment.endSeconds,
        durationSeconds: Math.max(0, moment.endSeconds - moment.startSeconds),
        confidenceBand: moment.candidate.confidenceBand,
        reasonCodes: moment.candidate.reasonCodes,
        reviewTags: moment.candidate.reviewTags,
        notes: moment.decision.notes ?? null,
      })),
    },
    null,
    2,
  );
}

function safeFileBaseName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "pulse-export"
  );
}

function escapeCsvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
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
