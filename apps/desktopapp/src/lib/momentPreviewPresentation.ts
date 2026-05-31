export type MediaPlaybackInspection = {
  pathExists: boolean;
  readable: boolean;
  fileSizeBytes?: number;
  ffprobeAvailable: boolean;
  probeSucceeded: boolean;
  formatName?: string;
  videoCodec?: string;
  audioCodec?: string;
  detail: string;
};

export type PreparedMediaPreview = {
  previewPath: string;
  reusedExisting: boolean;
  fileSizeBytes?: number;
  durationSeconds: number;
  detail: string;
};

export function describeVideoError(
  error: MediaError | null | undefined,
  usingPreparedPreview = false,
): string {
  if (!error) {
    return usingPreparedPreview
      ? "The preview could not load this moment."
      : "The preview could not load this video.";
  }

  if (error.code === MediaError.MEDIA_ERR_ABORTED) {
    return "Preview playback was interrupted.";
  }

  if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return usingPreparedPreview
      ? "The preview could not load this moment."
      : "The preview could not load this video.";
  }

  if (error.code === MediaError.MEDIA_ERR_DECODE) {
    return usingPreparedPreview
      ? "The preview could not play this moment."
      : "The preview could not play this video.";
  }

  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return usingPreparedPreview
      ? "This moment is not supported by the preview player."
      : "This video is not supported by the preview player.";
  }

  return usingPreparedPreview
    ? "The preview could not open this moment."
    : "The preview could not open this video.";
}

export function buildInspectionSummary(
  inspection: MediaPlaybackInspection,
): string {
  if (!inspection.pathExists) {
    return inspection.detail;
  }

  if (!inspection.readable) {
    return inspection.detail;
  }

  return typeof inspection.fileSizeBytes === "number"
    ? `File is available (${formatPreviewFileSize(inspection.fileSizeBytes)}).`
    : "File is available.";
}

export function formatPreviewFileSize(bytes: number): string {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  if (bytes >= 1024 ** 2) {
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

export function buildPreparedPreviewSummary(
  preview: PreparedMediaPreview,
): string {
  const parts = [
    `Ready (${preview.durationSeconds.toFixed(1)}s)`,
    typeof preview.fileSizeBytes === "number"
      ? formatPreviewFileSize(preview.fileSizeBytes)
      : null,
  ].filter(Boolean);

  return parts.join(" • ");
}

export function buildLocalMediaUrl(
  apiBaseUrl: string,
  mediaPath: string,
): string {
  const url = new URL("/api/local-media", apiBaseUrl);
  url.searchParams.set("path", mediaPath);
  return url.toString();
}
