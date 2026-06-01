import { useState } from "react";
import { acceptedCandidates } from "@vaexcore/pulse-domain";
import type {
  ProjectSession,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";
import { markStudioIntakePersistence } from "../lib/studioIntakePersistence";
import { studioRecordingQueueKey } from "../lib/studioIntakeQueue";
import { markStudioRecordingExported } from "../lib/studioExportHistory";
import { studioRequestHeaders } from "../lib/studioDiscoveryClient";
import {
  resolveStudioDiscovery,
  studioPulseSourceEventId,
} from "../lib/suitePresentation";
import type { StudioIntakeController } from "./useStudioIntakeController";

type UseStudioExportControllerOptions = Pick<
  StudioIntakeController,
  | "setStudioExportHistory"
  | "setStudioIntake"
  | "setStudioIntakePersistence"
  | "studioIntake"
>;

type ExportAcceptedOptions = {
  decisionsByCandidateId: Record<string, ReviewDecision>;
  edlPreview: string;
  jsonPreview: string;
  projectSession: ProjectSession | null;
  timestampPreview: string;
};

export function useStudioExportController({
  setStudioExportHistory,
  setStudioIntake,
  setStudioIntakePersistence,
  studioIntake,
}: UseStudioExportControllerOptions) {
  const [studioExportStatus, setStudioExportStatus] = useState<string | null>(
    null,
  );
  const [isExportingToStudio, setIsExportingToStudio] = useState(false);
  const [studioExportedCandidateIds, setStudioExportedCandidateIds] = useState<
    Record<string, boolean>
  >({});

  async function handleExportAcceptedToStudio({
    decisionsByCandidateId,
    edlPreview,
    jsonPreview,
    projectSession,
    timestampPreview,
  }: ExportAcceptedOptions) {
    if (!projectSession || isExportingToStudio) return;

    const keptCandidates = acceptedCandidates(
      projectSession.candidates,
      decisionsByCandidateId,
    );
    if (keptCandidates.length === 0) {
      setStudioExportStatus("No kept moments are ready to send.");
      return;
    }

    setIsExportingToStudio(true);
    setStudioExportStatus("Sending kept moments to Studio...");
    const exportedAt = new Date().toISOString();

    try {
      const discovery = await resolveStudioDiscovery();
      const recordingSessionId =
        studioIntake.latestRecording?.outputPath ===
        projectSession.mediaSource.path
          ? studioIntake.latestRecording.sessionId
          : null;

      const confirmedSourceEventIds = await Promise.all(
        keptCandidates.map(async (candidate) => {
          const decision = decisionsByCandidateId[candidate.id];
          const segment =
            decision?.adjustedSegment ?? candidate.suggestedSegment;
          const label = decision?.label ?? candidate.editableLabel;
          const sourceEventId = studioPulseSourceEventId(
            projectSession.id,
            candidate.id,
          );
          const headers = new Headers(studioRequestHeaders(discovery));
          headers.set("content-type", "application/json");
          const response = await fetch(`${discovery.apiUrl}/marker/create`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              label: `Pulse keep: ${label}`,
              source_app: "vaexcore-pulse",
              source_event_id: sourceEventId,
              recording_session_id: recordingSessionId,
              media_path: projectSession.mediaSource.path,
              start_seconds: segment.startSeconds,
              end_seconds: segment.endSeconds,
              metadata: {
                contract: "vaexcore.studio.marker.v1",
                schemaVersion: 1,
                exportedAt,
                reviewStatus: "accepted",
                source: {
                  appId: "vaexcore-pulse",
                  appName: "vaexcore pulse",
                  workflow: "accepted-highlight-export",
                },
                pulseSessionId: projectSession.id,
                pulseSessionTitle: projectSession.title,
                candidateId: candidate.id,
                sourceEventId,
                recordingSessionId,
                media: {
                  path: projectSession.mediaSource.path,
                  durationSeconds: projectSession.mediaSource.durationSeconds,
                },
                timestamps: {
                  startSeconds: segment.startSeconds,
                  endSeconds: segment.endSeconds,
                  durationSeconds: segment.endSeconds - segment.startSeconds,
                  adjusted: Boolean(decision?.adjustedSegment),
                },
                confidenceBand: candidate.confidenceBand,
                scoreEstimate: candidate.scoreEstimate,
                reasonCodes: candidate.reasonCodes,
                reviewTags: candidate.reviewTags,
                label,
                transcriptSnippet: candidate.transcriptSnippet,
              },
            }),
          });

          if (!response.ok) {
            throw new Error(`Studio marker create returned ${response.status}`);
          }
          const body = (await response.json().catch(() => null)) as {
            ok?: boolean;
          } | null;
          if (body?.ok !== true) {
            throw new Error(
              "Studio marker create returned an invalid response",
            );
          }
          return sourceEventId;
        }),
      );

      setStudioExportedCandidateIds((current) => ({
        ...current,
        ...Object.fromEntries(
          confirmedSourceEventIds.map((sourceEventId) => [sourceEventId, true]),
        ),
      }));
      setStudioExportStatus(
        `Confirmed ${confirmedSourceEventIds.length} kept moments in Studio.`,
      );

      const exportedRecordingKey =
        studioIntake.latestRecording?.outputPath ===
        projectSession.mediaSource.path
          ? studioRecordingQueueKey(studioIntake.latestRecording)
          : null;
      if (exportedRecordingKey) {
        setStudioIntakePersistence((current) =>
          markStudioIntakePersistence(
            current,
            "exported",
            exportedRecordingKey,
          ),
        );
        setStudioExportHistory((current) =>
          markStudioRecordingExported(current, exportedRecordingKey, {
            exportedAt,
            formats: [
              ...(timestampPreview ? (["timestamps"] as const) : []),
              ...(jsonPreview ? (["json"] as const) : []),
              ...(edlPreview ? (["edl"] as const) : []),
            ],
            acceptedCount: keptCandidates.length,
            pulseSessionId: projectSession.id,
            pulseSessionTitle: projectSession.title,
          }),
        );
      }
      setStudioIntake((current) => ({
        ...current,
        connection: "connected",
        detail: "Studio accepted the latest kept moments.",
        apiUrl: discovery.apiUrl,
        recordings: exportedRecordingKey
          ? current.recordings.map((item) =>
              studioRecordingQueueKey(item) === exportedRecordingKey
                ? {
                    ...item,
                    state: "already-exported",
                    detail:
                      "Studio recording already has exported review results.",
                  }
                : item,
            )
          : current.recordings,
      }));
    } catch (error) {
      setStudioExportStatus(
        error instanceof Error
          ? `Studio export failed: ${error.message}`
          : "Studio export failed.",
      );
    } finally {
      setIsExportingToStudio(false);
    }
  }

  return {
    handleExportAcceptedToStudio,
    isExportingToStudio,
    studioExportedCandidateIds,
    studioExportStatus,
  };
}
