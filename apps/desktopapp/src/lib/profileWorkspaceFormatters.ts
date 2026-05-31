import type {
  ExampleClip,
  ExampleClipSourceType,
  ExampleReferenceKind,
  MediaAlignmentJob,
  MediaEditPair,
  MediaLibraryAsset,
  MediaLibraryAssetScope,
  MediaLibraryAssetType,
  MediaIndexJob,
} from "@vaexcore/pulse-shared-types";

export function formatTimestamp(value: string): string {
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

export function formatSourceType(sourceType: ExampleClipSourceType): string {
  if (sourceType === "TWITCH_CLIP_URL") {
    return "Twitch clip URL";
  }

  if (sourceType === "YOUTUBE_SHORT_URL") {
    return "YouTube Short URL";
  }

  if (sourceType === "LOCAL_FILE_UPLOAD") {
    return "Local clip file";
  }

  return "Local clip path";
}

export function formatReferenceKind(
  referenceKind: ExampleReferenceKind,
  sourceType: ExampleClipSourceType,
): string {
  if (referenceKind === "PROFILE_EDIT") {
    return "Finished edit";
  }

  return formatSourceType(sourceType);
}

export function formatReferenceSummaryLabel(
  referenceKind: ExampleReferenceKind,
): string {
  return referenceKind === "PROFILE_EDIT"
    ? "Edit summary ready"
    : "Clip summary ready";
}

export function formatAssetType(assetType: MediaLibraryAssetType): string {
  if (assetType === "VOD") {
    return "Full video";
  }

  if (assetType === "EDIT") {
    return "Edited video";
  }

  return "Clip";
}

export function formatAssetScope(scope: MediaLibraryAssetScope): string {
  return scope === "GLOBAL" ? "Global" : "Profile";
}

export function formatIndexJobStatus(status: MediaIndexJob["status"]): string {
  if (status === "QUEUED") {
    return "Queued";
  }

  if (status === "RUNNING") {
    return "Running";
  }

  if (status === "SUCCEEDED") {
    return "Succeeded";
  }

  if (status === "FAILED") {
    return "Failed";
  }

  return "Cancelled";
}

export function formatAlignmentJobStatus(
  status: MediaAlignmentJob["status"],
): string {
  if (status === "QUEUED") {
    return "Queued";
  }

  if (status === "RUNNING") {
    return "Running";
  }

  if (status === "SUCCEEDED") {
    return "Succeeded";
  }

  if (status === "FAILED") {
    return "Failed";
  }

  return "Cancelled";
}

export function formatIndexSummary(
  summary: NonNullable<MediaLibraryAsset["indexSummary"]>,
): string {
  const resolution =
    summary.width && summary.height
      ? ` • ${summary.width}x${summary.height}`
      : "";
  const codecs = [
    summary.videoCodec ? `video ${summary.videoCodec}` : null,
    summary.audioCodec ? `audio ${summary.audioCodec}` : null,
  ].filter(Boolean);

  return [
    `${formatDuration(summary.durationSeconds)}`,
    `${formatFileSize(summary.fileSizeBytes)}`,
    `${summary.kind.toLowerCase()} ${summary.format}`,
    codecs.length > 0 ? codecs.join(", ") : null,
  ]
    .filter(Boolean)
    .join(" • ")
    .concat(resolution);
}

export function formatAudioFingerprintMethod(
  method: NonNullable<
    MediaLibraryAsset["indexArtifactSummary"]
  >["audioFingerprintMethod"],
): string {
  if (method === "DECODED_AUDIO_FINGERPRINT_V1") {
    return "audio match";
  }

  if (method === "BYTE_SAMPLED_AUDIO_PROXY_V1") {
    return "quick audio match";
  }

  return "unknown";
}

export function formatAlignmentMethod(
  method: MediaAlignmentJob["method"],
): string {
  if (method === "DECODED_AUDIO_BUCKET_CORRELATION_V1") {
    return "audio match";
  }

  if (method === "AUDIO_PROXY_BUCKET_CORRELATION_V1") {
    return "quick audio match";
  }

  return "unknown";
}

export function formatPairStatus(status: MediaEditPair["status"]): string {
  return status === "READY" ? "Ready" : "Incomplete";
}

export function formatAlignmentKind(
  kind: MediaEditPair["alignmentSegments"][number]["kind"],
): string {
  if (kind === "PROVISIONAL_KEEP") {
    return "Provisional kept edit";
  }

  if (kind === "PROVISIONAL_REMOVED_POOL") {
    return "Provisional removed pool";
  }

  if (kind === "CONFIRMED_KEEP") {
    return "Confirmed keep";
  }

  return "Confirmed removal";
}

export function formatAlignmentRange(
  label: string,
  range: MediaEditPair["alignmentSegments"][number]["sourceRange"],
): string {
  if (!range) {
    return `${label} unresolved`;
  }

  return `${label} ${formatDuration(range.startSeconds)}-${formatDuration(range.endSeconds)}`;
}

export function formatStatus(
  status: ExampleClip["status"] | MediaLibraryAsset["status"],
): string {
  if (status === "LOCAL_FILE_AVAILABLE") {
    return "Local file found";
  }

  if (status === "MISSING_LOCAL_FILE") {
    return "Path missing";
  }

  return "Reference only";
}

export function formatTopReasons(
  reasonCodes:
    | NonNullable<ExampleClip["featureSummary"]>["topReasonCodes"]
    | NonNullable<MediaLibraryAsset["featureSummary"]>["topReasonCodes"],
) {
  if (!reasonCodes || reasonCodes.length === 0) {
    return "none yet";
  }

  return reasonCodes.join(", ");
}

export function formatTranscriptAnchors(
  terms:
    | NonNullable<ExampleClip["featureSummary"]>["transcriptAnchorTerms"]
    | NonNullable<MediaLibraryAsset["featureSummary"]>["transcriptAnchorTerms"],
) {
  if (!terms || terms.length === 0) {
    return "none yet";
  }

  return terms.slice(0, 3).join(", ");
}

export function formatDuration(value: number | undefined) {
  if (value === undefined) {
    return "n/a";
  }

  if (value >= 3600) {
    return `${(value / 3600).toFixed(1)}h`;
  }

  if (value >= 60) {
    return `${Math.round(value / 60)}m`;
  }

  return `${Math.round(value)}s`;
}

export function formatClockDuration(value: number | undefined) {
  if (value === undefined) {
    return "n/a";
  }

  const totalSeconds = Math.max(0, Math.round(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatRatio(value: number | undefined) {
  if (value === undefined) {
    return "n/a";
  }

  return `${Math.round(value * 100)}%`;
}

export function formatFileSize(value: number) {
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)}MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)}KB`;
  }

  return `${value}B`;
}
