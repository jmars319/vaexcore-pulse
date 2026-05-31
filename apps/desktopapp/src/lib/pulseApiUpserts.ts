import type {
  ClipProfile,
  MediaAlignmentJob,
  MediaEditPair,
  MediaIndexJob,
  MediaLibraryAsset,
  ProjectSessionSummary,
} from "@vaexcore/pulse-shared-types";

export function upsertProjectSummary(
  current: ProjectSessionSummary[],
  nextSummary: ProjectSessionSummary,
): ProjectSessionSummary[] {
  const merged = [
    nextSummary,
    ...current.filter((summary) => summary.sessionId !== nextSummary.sessionId),
  ];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function upsertProfile(
  current: ClipProfile[],
  nextProfile: ClipProfile,
): ClipProfile[] {
  const merged = [
    nextProfile,
    ...current.filter((profile) => profile.id !== nextProfile.id),
  ];

  return merged.sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "SYSTEM" ? -1 : 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function upsertMediaLibraryAsset(
  current: MediaLibraryAsset[],
  nextAsset: MediaLibraryAsset,
): MediaLibraryAsset[] {
  const merged = [
    nextAsset,
    ...current.filter((asset) => asset.id !== nextAsset.id),
  ];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function upsertMediaEditPair(
  current: MediaEditPair[],
  nextPair: MediaEditPair,
): MediaEditPair[] {
  const merged = [
    nextPair,
    ...current.filter((pair) => pair.id !== nextPair.id),
  ];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function upsertMediaIndexJob(
  current: MediaIndexJob[],
  nextJob: MediaIndexJob,
): MediaIndexJob[] {
  const merged = [nextJob, ...current.filter((job) => job.id !== nextJob.id)];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function upsertMediaAlignmentJob(
  current: MediaAlignmentJob[],
  nextJob: MediaAlignmentJob,
): MediaAlignmentJob[] {
  const merged = [nextJob, ...current.filter((job) => job.id !== nextJob.id)];

  return merged.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}
