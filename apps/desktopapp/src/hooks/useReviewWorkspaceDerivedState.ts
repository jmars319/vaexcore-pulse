import { useMemo } from "react";
import {
  acceptedCandidates,
  buildProjectSummary,
  deriveSessionReviewState,
  filterCandidates,
  filterCandidatesByPresentationMode,
  filterCandidatesByReviewMode,
  hasStrongCandidateProfileMatch,
  summarizeReviewQueueState,
  type ReviewQueueMode,
} from "@vaexcore/pulse-domain";
import {
  toEdlExport,
  toJsonCandidateExport,
  toTimestampExport,
} from "@vaexcore/pulse-export";
import type {
  CandidateWindow,
  ConfidenceBand,
  ContentProfile,
  ProfilePresentationMode,
  ProjectSession,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";
import { formatSessionReviewState } from "../lib/sessionPresentation";
import type { MomentPreviewMode } from "../components/MomentPreviewModal";

type UseReviewWorkspaceDerivedStateOptions = {
  bandFilter: ConfidenceBand | "ALL";
  currentProfile: ContentProfile;
  decisionsByCandidateId: Record<string, ReviewDecision>;
  deferredSearchValue: string;
  momentPreviewState: {
    candidateId: string;
    mode: MomentPreviewMode;
  } | null;
  presentationMode: ProfilePresentationMode;
  projectSession: ProjectSession | null;
  reviewQueueMode: ReviewQueueMode;
  selectedCandidateId: string | null;
  sessionCandidates: CandidateWindow[];
};

export function useReviewWorkspaceDerivedState({
  bandFilter,
  currentProfile,
  decisionsByCandidateId,
  deferredSearchValue,
  momentPreviewState,
  presentationMode,
  projectSession,
  reviewQueueMode,
  selectedCandidateId,
  sessionCandidates,
}: UseReviewWorkspaceDerivedStateOptions) {
  const searchFilteredCandidates = useMemo(
    () =>
      filterCandidates(
        sessionCandidates,
        deferredSearchValue,
        bandFilter,
        decisionsByCandidateId,
      ),
    [
      bandFilter,
      decisionsByCandidateId,
      deferredSearchValue,
      sessionCandidates,
    ],
  );
  const presentationFilteredCandidates = useMemo(
    () =>
      filterCandidatesByPresentationMode(
        searchFilteredCandidates,
        currentProfile,
        presentationMode,
      ),
    [currentProfile, presentationMode, searchFilteredCandidates],
  );
  const queueCandidates = useMemo(() => {
    if (!projectSession) return presentationFilteredCandidates;
    return filterCandidatesByReviewMode(
      presentationFilteredCandidates,
      projectSession,
      reviewQueueMode,
    );
  }, [presentationFilteredCandidates, projectSession, reviewQueueMode]);

  const selectedCandidate =
    queueCandidates.find((candidate) => candidate.id === selectedCandidateId) ??
    presentationFilteredCandidates.find(
      (candidate) => candidate.id === selectedCandidateId,
    ) ??
    sessionCandidates.find(
      (candidate) => candidate.id === selectedCandidateId,
    ) ??
    queueCandidates[0] ??
    (reviewQueueMode === "ALL" ? presentationFilteredCandidates[0] : null) ??
    null;
  const selectedCandidateIndex = selectedCandidate
    ? sessionCandidates.findIndex(
        (candidate) => candidate.id === selectedCandidate.id,
      )
    : -1;

  const acceptedCount = acceptedCandidates(
    sessionCandidates,
    decisionsByCandidateId,
  ).length;
  const rejectedCount = sessionCandidates.filter(
    (candidate) => decisionsByCandidateId[candidate.id]?.action === "REJECT",
  ).length;
  const reviewedCount = acceptedCount + rejectedCount;
  const pendingReviewCount = Math.max(
    sessionCandidates.length - reviewedCount,
    0,
  );
  const reviewQueueState = useMemo(
    () =>
      projectSession
        ? summarizeReviewQueueState(projectSession, reviewQueueMode)
        : null,
    [projectSession, reviewQueueMode],
  );
  const activeSessionSummary = projectSession
    ? buildProjectSummary(projectSession)
    : null;
  const activeSessionReviewState = activeSessionSummary
    ? deriveSessionReviewState(activeSessionSummary)
    : null;
  const activeSessionReviewStateLabel = activeSessionReviewState
    ? formatSessionReviewState(activeSessionReviewState)
    : null;
  const hasAssessedStrongMatches = searchFilteredCandidates.some((candidate) =>
    hasStrongCandidateProfileMatch(candidate, currentProfile),
  );
  const isStrongMatchFallback =
    presentationMode === "STRONG_MATCHES" && !hasAssessedStrongMatches;
  const selectedDecision = selectedCandidate
    ? decisionsByCandidateId[selectedCandidate.id]
    : undefined;
  const previewCandidate = momentPreviewState
    ? (sessionCandidates.find(
        (candidate) => candidate.id === momentPreviewState.candidateId,
      ) ?? null)
    : null;
  const previewDecision = previewCandidate
    ? decisionsByCandidateId[previewCandidate.id]
    : undefined;
  const selectedCandidateVisibleInQueue = selectedCandidate
    ? queueCandidates.some((candidate) => candidate.id === selectedCandidate.id)
    : true;
  const timestampPreview = projectSession
    ? toTimestampExport(
        sessionCandidates,
        Object.values(decisionsByCandidateId),
      )
    : "";
  const jsonPreview = projectSession
    ? toJsonCandidateExport(
        projectSession.mediaSource,
        sessionCandidates,
        Object.values(decisionsByCandidateId),
      )
    : "";
  const edlPreview = projectSession
    ? toEdlExport(
        projectSession.mediaSource,
        sessionCandidates,
        Object.values(decisionsByCandidateId),
      )
    : "";

  return {
    acceptedCount,
    activeSessionReviewState,
    activeSessionReviewStateLabel,
    edlPreview,
    isStrongMatchFallback,
    jsonPreview,
    pendingReviewCount,
    previewCandidate,
    previewDecision,
    queueCandidates,
    rejectedCount,
    reviewQueueState,
    reviewedCount,
    searchFilteredCandidates,
    selectedCandidate,
    selectedCandidateIndex,
    selectedCandidateVisibleInQueue,
    selectedDecision,
    timestampPreview,
  };
}
