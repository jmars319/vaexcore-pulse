import { useEffect, useMemo, useState } from "react";
import {
  enqueueStudioRecording,
  canImportStudioRecording,
  markStudioRecordingQueueItem,
  studioRecordingQueueKey,
} from "../lib/studioIntakeQueue";
import {
  markStudioIntakePersistence,
  restoreStudioIntakePersistence,
  studioIntakePersistenceSets,
} from "../lib/studioIntakePersistence";
import {
  buildStudioIntakeFilterCounts,
  filterStudioIntakeRecordings,
  loadStudioExportHistory,
  loadStudioIntakePersistence,
  outputReadinessLabel,
  persistStudioExportHistory,
  persistStudioIntakePersistence,
  type StudioIntakeFilter,
} from "../lib/studioIntakePresentation";
import {
  fetchLatestStudioRecording,
  studioEventSocketUrl,
  studioRequestHeaders,
} from "../lib/studioDiscoveryClient";
import { studioRecordingFromMessage } from "../lib/studioRecordingParser";
import { resolveStudioDiscovery } from "../lib/suitePresentation";
import { extractSourceName } from "../lib/sessionPresentation";
import type {
  StudioIntakePersistence,
  StudioIntakeQueueItem,
  StudioIntakeState,
  StudioRecordingCandidate,
  StudioRecordingExportHistory,
} from "../lib/studioTypes";
import type { PulseRecordingHandoff } from "../lib/suitePresentation";

type UseStudioIntakeControllerOptions = {
  onRecordingSelected: (recording: StudioRecordingCandidate) => void;
  onHandoffQueued: () => void;
};

export type StudioIntakeController = ReturnType<
  typeof useStudioIntakeController
>;

export function useStudioIntakeController({
  onHandoffQueued,
  onRecordingSelected,
}: UseStudioIntakeControllerOptions) {
  const [studioIntake, setStudioIntake] = useState<StudioIntakeState>({
    connection: "checking",
    detail: "Looking for vaexcore studio.",
    apiUrl: null,
    latestRecording: null,
    recordings: [],
  });
  const [studioIntakeFilter, setStudioIntakeFilter] =
    useState<StudioIntakeFilter>("ready");
  const [studioIntakePersistence, setStudioIntakePersistence] =
    useState<StudioIntakePersistence>(() => loadStudioIntakePersistence());
  const [studioExportHistory, setStudioExportHistory] =
    useState<StudioRecordingExportHistory>(() => loadStudioExportHistory());

  const studioPersistenceSets = useMemo(
    () => studioIntakePersistenceSets(studioIntakePersistence),
    [studioIntakePersistence],
  );
  const filteredStudioIntakeRecordings = useMemo(
    () =>
      filterStudioIntakeRecordings(studioIntake.recordings, studioIntakeFilter),
    [studioIntake.recordings, studioIntakeFilter],
  );
  const studioIntakeFilterCounts = useMemo(
    () => buildStudioIntakeFilterCounts(studioIntake.recordings),
    [studioIntake.recordings],
  );

  useEffect(() => {
    persistStudioIntakePersistence(studioIntakePersistence);
  }, [studioIntakePersistence]);

  useEffect(() => {
    persistStudioExportHistory(studioExportHistory);
  }, [studioExportHistory]);

  useEffect(() => {
    let isSubscribed = true;
    let socket: WebSocket | null = null;

    async function connectStudio() {
      const discovery = await resolveStudioDiscovery();
      if (!isSubscribed) return;

      setStudioIntake((current) => ({
        ...current,
        connection: "checking",
        detail: discovery.detail,
        apiUrl: discovery.apiUrl,
      }));

      try {
        const healthResponse = await fetch(`${discovery.apiUrl}/health`, {
          headers: studioRequestHeaders(discovery),
        });
        if (!healthResponse.ok) {
          throw new Error(
            healthResponse.status === 401 || healthResponse.status === 403
              ? "Studio is reachable but requires an API token."
              : `Studio health returned ${healthResponse.status}.`,
          );
        }

        const latestRecording = await fetchLatestStudioRecording(
          discovery,
        ).catch(() => null);
        if (!isSubscribed) return;

        setStudioIntake((current) => ({
          ...current,
          connection: "connected",
          detail: latestRecording
            ? `Found Studio recording ${extractSourceName(latestRecording.outputPath)}.`
            : "Connected to vaexcore studio. Waiting for stopped recordings.",
          apiUrl: discovery.apiUrl,
          latestRecording: latestRecording ?? current.latestRecording,
          recordings: enqueueStudioRecording(
            current.recordings,
            latestRecording,
            {
              source: "history",
              ...studioPersistenceSets,
            },
          ),
        }));

        socket = new WebSocket(studioEventSocketUrl(discovery));
        socket.addEventListener("message", (event) => {
          const nextRecording = studioRecordingFromMessage(event.data);
          if (!nextRecording || !isSubscribed) return;
          setStudioIntake((current) => ({
            ...current,
            connection: "connected",
            detail: `Studio stopped recording ${extractSourceName(nextRecording.outputPath)}.`,
            apiUrl: discovery.apiUrl,
            latestRecording: nextRecording,
            recordings: enqueueStudioRecording(
              current.recordings,
              nextRecording,
              {
                source: "event",
                ...studioPersistenceSets,
              },
            ),
          }));
        });
        socket.addEventListener("close", () => {
          if (!isSubscribed) return;
          setStudioIntake((current) => ({
            ...current,
            connection: current.latestRecording ? "connected" : "unavailable",
            detail: current.latestRecording
              ? "Studio event stream closed; latest stopped recording is still available."
              : "Studio event stream closed.",
          }));
        });
      } catch (error) {
        if (!isSubscribed) return;
        setStudioIntake((current) => ({
          ...current,
          connection: "unavailable",
          detail:
            error instanceof Error
              ? error.message
              : "Studio is not reachable right now.",
          apiUrl: discovery.apiUrl,
        }));
      }
    }

    void connectStudio();
    return () => {
      isSubscribed = false;
      socket?.close();
    };
  }, [studioPersistenceSets]);

  function handleImportStudioRecording(item: StudioIntakeQueueItem) {
    if (!canImportStudioRecording(item)) return;
    onRecordingSelected(item);
    const key = studioRecordingQueueKey(item);
    setStudioIntakePersistence((current) =>
      markStudioIntakePersistence(current, "consumed", key),
    );
    setStudioIntake((current) => ({
      ...current,
      latestRecording: item,
      detail: `Imported ${extractSourceName(item.outputPath)} into Scan Intake.`,
      recordings: markStudioRecordingQueueItem(
        current.recordings,
        item.queueId,
        "already-consumed",
      ),
    }));
  }

  function handleDismissStudioRecording(item: StudioIntakeQueueItem) {
    const key = studioRecordingQueueKey(item);
    setStudioIntakePersistence((current) =>
      markStudioIntakePersistence(current, "dismissed", key),
    );
    setStudioIntake((current) => ({
      ...current,
      detail: `Hidden ${extractSourceName(item.outputPath)} from active intake.`,
      recordings: markStudioRecordingQueueItem(
        current.recordings,
        item.queueId,
        "dismissed",
      ),
    }));
  }

  function handleRestoreStudioRecording(item: StudioIntakeQueueItem) {
    const key = studioRecordingQueueKey(item);
    setStudioIntakePersistence((current) =>
      restoreStudioIntakePersistence(current, key),
    );
    setStudioIntake((current) => ({
      ...current,
      detail: `Restored ${extractSourceName(item.outputPath)} to intake.`,
      recordings: markStudioRecordingQueueItem(
        current.recordings,
        item.queueId,
        item.verificationState === "missing" ||
          item.verificationState === "empty" ||
          item.verificationState === "unreadable" ||
          item.completionState === "failed"
          ? "unusable"
          : "ready",
      ),
    }));
  }

  async function handleRefreshStudioIntake() {
    setStudioIntake((current) => ({
      ...current,
      connection: "checking",
      detail: "Refreshing Studio recordings.",
    }));

    try {
      const discovery = await resolveStudioDiscovery();
      const latestRecording = await fetchLatestStudioRecording(discovery);
      setStudioIntake((current) => ({
        ...current,
        connection: "connected",
        detail: latestRecording
          ? `Found Studio recording ${extractSourceName(latestRecording.outputPath)}.`
          : "Connected to Studio; no recent recording was available.",
        apiUrl: discovery.apiUrl,
        latestRecording: latestRecording ?? current.latestRecording,
        recordings: enqueueStudioRecording(
          current.recordings,
          latestRecording,
          {
            source: "history",
            ...studioPersistenceSets,
          },
        ),
      }));
    } catch (error) {
      setStudioIntake((current) => ({
        ...current,
        connection: "unavailable",
        detail:
          error instanceof Error ? error.message : "Studio refresh failed.",
      }));
    }
  }

  function handlePulseRecordingHandoff(handoff: PulseRecordingHandoff) {
    const recording: StudioRecordingCandidate = {
      sessionId: handoff.recording.sessionId,
      outputPath: handoff.recording.outputPath,
      profileId: handoff.recording.profileId,
      profileName: handoff.recording.profileName,
      captureMode: handoff.recording.captureMode ?? null,
      captureDetail: handoff.recording.captureDetail ?? null,
      completionState: handoff.recording.completionState ?? null,
      completionDetail: handoff.recording.completionDetail ?? null,
      verificationState: handoff.recording.verificationState ?? null,
      verificationDetail: handoff.recording.verificationDetail ?? null,
      fileSizeBytes: handoff.recording.fileSizeBytes ?? null,
      durationMs: handoff.recording.durationMs ?? null,
      processStatus: handoff.recording.processStatus ?? null,
      stoppedAt: handoff.recording.stoppedAt,
      outputReadiness: handoff.outputReady ?? null,
    };
    const readinessDetail = handoff.outputReady
      ? ` ${outputReadinessLabel(handoff.outputReady)}.`
      : "";

    setStudioIntake((current) => ({
      ...current,
      connection: "connected",
      detail: `${handoff.sourceAppName} queued ${extractSourceName(recording.outputPath)} for manual import.${readinessDetail}`,
      latestRecording: recording,
      recordings: enqueueStudioRecording(current.recordings, recording, {
        source: "handoff",
        requestId: handoff.requestId,
        receivedAt: handoff.requestedAt,
        ...studioPersistenceSets,
      }),
    }));
    onHandoffQueued();
  }

  return {
    filteredStudioIntakeRecordings,
    handleDismissStudioRecording,
    handleImportStudioRecording,
    handlePulseRecordingHandoff,
    handleRefreshStudioIntake,
    handleRestoreStudioRecording,
    setStudioExportHistory,
    setStudioIntake,
    setStudioIntakeFilter,
    setStudioIntakePersistence,
    studioExportHistory,
    studioIntake,
    studioIntakeFilter,
    studioIntakeFilterCounts,
    studioIntakePersistence,
  };
}
