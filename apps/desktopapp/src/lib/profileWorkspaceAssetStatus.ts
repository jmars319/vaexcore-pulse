import type {
  MediaAlignmentJob,
  MediaLibraryAsset,
  MediaIndexJob,
} from "@vaexcore/pulse-shared-types";

export function describeBackgroundActivity(
  activeIndexJobCount: number,
  activeAlignmentJobCount: number,
): string {
  if (activeIndexJobCount > 0 && activeAlignmentJobCount > 0) {
    return `Pulse is reviewing ${activeIndexJobCount} file${activeIndexJobCount === 1 ? "" : "s"} and comparing ${activeAlignmentJobCount} edit${activeAlignmentJobCount === 1 ? "" : "s"}.`;
  }

  if (activeIndexJobCount > 0) {
    return `Pulse is reviewing ${activeIndexJobCount} file${activeIndexJobCount === 1 ? "" : "s"} right now.`;
  }

  return `Pulse is comparing ${activeAlignmentJobCount} edit${activeAlignmentJobCount === 1 ? "" : "s"} right now.`;
}

export function describeAssetPrimaryStatus(
  asset: MediaLibraryAsset,
  latestIndexJob: MediaIndexJob | undefined,
): string {
  if (
    latestIndexJob?.status === "QUEUED" ||
    latestIndexJob?.status === "RUNNING"
  ) {
    if (asset.assetType === "VOD") {
      return "Pulse is scanning this full video in the background.";
    }

    if (asset.assetType === "EDIT") {
      return "Pulse is reviewing this edited video in the background.";
    }

    return "Pulse is reviewing this clip in the background.";
  }

  if (latestIndexJob?.status === "FAILED") {
    return "The last scan failed. Open details to see what happened.";
  }

  if (asset.status === "MISSING_LOCAL_FILE") {
    return "This file is unavailable right now. Reconnect it before scanning.";
  }

  if (asset.assetType === "EDIT" && asset.scope === "PROFILE") {
    return asset.featureSummary
      ? "Ready to guide future scans for this profile."
      : "Scan this edit to help this profile learn what you keep.";
  }

  if (asset.assetType === "VOD") {
    return asset.featureSummary
      ? "Ready for future comparisons."
      : "Scan this full video when you want to compare it with an edit.";
  }

  if (asset.assetType === "CLIP") {
    return asset.featureSummary
      ? "Ready as a saved clip example."
      : "Scan this clip to make it more useful.";
  }

  return asset.featureSummary
    ? "Scan complete."
    : "Scan this edited video to make it more useful.";
}

export function buildAssetAnalysisActionLabel(
  asset: MediaLibraryAsset,
  latestIndexJob: MediaIndexJob | undefined,
  hasActiveIndexJob: boolean,
): string {
  if (hasActiveIndexJob) {
    if (asset.assetType === "EDIT") {
      return "Analyzing edit...";
    }

    if (asset.assetType === "VOD") {
      return "Scanning full video...";
    }

    return "Analyzing clip...";
  }

  if (latestIndexJob) {
    if (asset.assetType === "EDIT") {
      return "Scan edit again";
    }

    if (asset.assetType === "VOD") {
      return "Scan again";
    }

    return "Scan clip again";
  }

  if (asset.assetType === "EDIT") {
    return "Scan edited video";
  }

  if (asset.assetType === "VOD") {
    return "Scan full video";
  }

  return "Scan clip";
}

export function mediaAssetHasAudioFingerprint(
  asset: MediaLibraryAsset | undefined,
): boolean {
  return Boolean(asset?.indexArtifactSummary?.latestAudioFingerprintArtifactId);
}

export function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function describePairAlignmentBlockedReason(
  sourceAsset: MediaLibraryAsset | undefined,
  editAsset: MediaLibraryAsset | undefined,
): string | null {
  if (!sourceAsset || !editAsset) {
    return "One or both videos are unavailable right now.";
  }

  const sourceReady = mediaAssetHasAudioFingerprint(sourceAsset);
  const editReady = mediaAssetHasAudioFingerprint(editAsset);
  if (sourceReady && editReady) {
    return null;
  }

  if (!sourceReady && !editReady) {
    return "Scan both videos first.";
  }

  if (!sourceReady) {
    return "Scan the full video first.";
  }

  return "Scan the edited video first.";
}

export function describePairAlignmentBlockedAction(
  sourceAssetHasAudioFingerprint: boolean,
  editAssetHasAudioFingerprint: boolean,
): string {
  if (!sourceAssetHasAudioFingerprint && !editAssetHasAudioFingerprint) {
    return "Scan both videos first";
  }

  if (!sourceAssetHasAudioFingerprint) {
    return "Scan full video first";
  }

  return "Scan edited video first";
}
