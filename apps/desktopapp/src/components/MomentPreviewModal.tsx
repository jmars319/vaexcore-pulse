import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  CandidateWindow,
  ReviewDecision,
} from "@vaexcore/pulse-shared-types";
import { formatLongTime } from "../lib/format";
import {
  buildInspectionSummary,
  buildLocalMediaUrl,
  buildPreparedPreviewSummary,
  describeVideoError,
  type MediaPlaybackInspection,
  type PreparedMediaPreview,
} from "../lib/momentPreviewPresentation";

export type MomentPreviewMode = "SUGGESTED_SEGMENT" | "DETECTED_MOMENT";

type MomentPreviewModalProps = {
  candidate: CandidateWindow | null;
  decision: ReviewDecision | undefined;
  initialMode: MomentPreviewMode;
  isOpen: boolean;
  mediaDurationSeconds: number;
  mediaPath: string;
  apiBaseUrl: string;
  onClose: () => void;
};

export function MomentPreviewModal({
  candidate,
  decision,
  initialMode,
  isOpen,
  mediaDurationSeconds,
  mediaPath,
  apiBaseUrl,
  onClose,
}: MomentPreviewModalProps) {
  const [previewMode, setPreviewMode] =
    useState<MomentPreviewMode>(initialMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<MediaPlaybackInspection | null>(
    null,
  );
  const [isInspecting, setIsInspecting] = useState(false);
  const [preparedPreview, setPreparedPreview] =
    useState<PreparedMediaPreview | null>(null);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [quickTimeFeedback, setQuickTimeFeedback] = useState<string | null>(
    null,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pendingSeekSecondsRef = useRef<number | null>(null);
  const shouldAutoplayRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      return;
    }

    setPreviewMode(initialMode);
    setLoadError(null);
    setQuickTimeFeedback(null);
  }, [candidate?.id, initialMode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [isOpen, onClose]);

  const activeSegment = candidate
    ? (decision?.adjustedSegment ?? candidate.suggestedSegment)
    : null;
  const previewRange =
    !candidate || activeSegment === null
      ? null
      : previewMode === "DETECTED_MOMENT"
        ? candidate.candidateWindow
        : activeSegment;
  const previewStartSeconds = Math.max(
    0,
    (previewRange?.startSeconds ?? 0) -
      (previewMode === "DETECTED_MOMENT" ? 0.4 : 1),
  );
  const previewEndSeconds = Math.min(
    mediaDurationSeconds,
    (previewRange?.endSeconds ?? 0) + 0.75,
  );
  const playbackStartSeconds = preparedPreview ? 0 : previewStartSeconds;
  const playbackEndSeconds = preparedPreview
    ? Math.max(0.2, preparedPreview.durationSeconds - 0.05)
    : previewEndSeconds;

  useEffect(() => {
    if (!isOpen || !candidate || !mediaPath) {
      setInspection(null);
      return;
    }

    let isCancelled = false;
    setIsInspecting(true);
    void invoke<MediaPlaybackInspection>("inspect_media_playback", {
      mediaPath,
    })
      .then((result) => {
        if (!isCancelled) {
          setInspection(result);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setInspection(null);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsInspecting(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [candidate?.id, isOpen, mediaPath]);

  useEffect(() => {
    if (!isOpen || !candidate || !mediaPath || previewRange === null) {
      setPreparedPreview(null);
      setIsPreparingPreview(false);
      return;
    }

    let isCancelled = false;
    setPreparedPreview(null);
    setIsPreparingPreview(true);
    setLoadError(null);

    void invoke<PreparedMediaPreview>("prepare_media_preview_clip", {
      mediaPath,
      startSeconds: previewStartSeconds,
      endSeconds: previewEndSeconds,
    })
      .then((result) => {
        if (!isCancelled) {
          setPreparedPreview(result);
        }
      })
      .catch((error) => {
        if (!isCancelled) {
          setPreparedPreview(null);
          setLoadError(
            error instanceof Error
              ? error.message
              : "Pulse could not prepare a preview for this moment.",
          );
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsPreparingPreview(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [
    candidate?.id,
    isOpen,
    mediaPath,
    previewEndSeconds,
    previewRange,
    previewStartSeconds,
    previewMode,
  ]);

  const mediaSrc = preparedPreview
    ? buildLocalMediaUrl(apiBaseUrl, preparedPreview.previewPath)
    : "";

  function seekAndPlay(playback: boolean) {
    const video = videoRef.current;
    if (
      !video ||
      !candidate ||
      !mediaPath ||
      previewRange === null ||
      !preparedPreview
    ) {
      return;
    }

    pendingSeekSecondsRef.current = playbackStartSeconds;
    shouldAutoplayRef.current = playback;
    setLoadError(null);

    if (video.readyState >= 1) {
      video.currentTime = playbackStartSeconds;
      pendingSeekSecondsRef.current = null;
      if (playback) {
        void video.play().catch(() => {
          // Native controls remain available even if autoplay is blocked.
        });
      }
      return;
    }

    video.load();
  }

  useEffect(() => {
    if (
      !isOpen ||
      !candidate ||
      !mediaPath ||
      previewRange === null ||
      !preparedPreview
    ) {
      return;
    }

    seekAndPlay(true);
  }, [
    candidate?.id,
    isOpen,
    mediaPath,
    mediaSrc,
    playbackStartSeconds,
    preparedPreview,
    previewMode,
    previewRange,
  ]);

  if (!isOpen || !candidate || !mediaPath || previewRange === null) {
    return null;
  }

  const errorMessage = loadError;

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (pendingSeekSecondsRef.current !== null) {
      video.currentTime = pendingSeekSecondsRef.current;
      pendingSeekSecondsRef.current = null;
    }

    if (shouldAutoplayRef.current) {
      void video.play().catch(() => {
        // Native controls remain available even if autoplay is blocked.
      });
    }
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.currentTime >= playbackEndSeconds) {
      video.pause();
    }
  }

  function handleReplay() {
    seekAndPlay(true);
  }

  function handleUseMode(nextMode: MomentPreviewMode) {
    setPreviewMode(nextMode);
  }

  async function handleOpenInQuickTime() {
    setQuickTimeFeedback(null);
    const startSeconds = previewRange?.startSeconds;
    if (typeof startSeconds !== "number") {
      setQuickTimeFeedback("Could not find a start time for this moment.");
      return;
    }

    try {
      const message = await invoke<string>("open_media_in_quicktime", {
        mediaPath,
        startSeconds,
      });
      setQuickTimeFeedback(message);
    } catch (error) {
      setQuickTimeFeedback(
        error instanceof Error
          ? error.message
          : "Could not open QuickTime for this moment.",
      );
    }
  }

  const sourceName = mediaPath.split(/[\\/]/).pop() ?? mediaPath;

  return (
    <div
      aria-label="Moment preview"
      aria-modal="true"
      className="moment-preview-backdrop"
      onClick={onClose}
      role="dialog"
    >
      <section
        className="moment-preview-dialog glass-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="moment-preview-header">
          <div>
            <p className="eyebrow">Moment preview</p>
            <h2>{decision?.label ?? candidate.editableLabel}</h2>
            <p className="moment-preview-copy">
              {sourceName} • {formatLongTime(previewRange.startSeconds)} to{" "}
              {formatLongTime(previewRange.endSeconds)}
            </p>
          </div>
          <button className="button-secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="moment-preview-toolbar">
          <div className="filter-row moment-preview-mode-row">
            <button
              className={
                previewMode === "SUGGESTED_SEGMENT"
                  ? "filter-chip active"
                  : "filter-chip"
              }
              onClick={() => handleUseMode("SUGGESTED_SEGMENT")}
              type="button"
            >
              Suggested clip
            </button>
            <button
              className={
                previewMode === "DETECTED_MOMENT"
                  ? "filter-chip active"
                  : "filter-chip"
              }
              onClick={() => handleUseMode("DETECTED_MOMENT")}
              type="button"
            >
              Detected moment
            </button>
          </div>

          <div className="action-row moment-preview-action-row">
            <button
              className="button-secondary"
              disabled={isPreparingPreview || !preparedPreview}
              onClick={handleReplay}
              type="button"
            >
              Replay range
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                void handleOpenInQuickTime();
              }}
              type="button"
            >
              Open in QuickTime
            </button>
          </div>
        </div>

        <div className="moment-preview-frame">
          {isPreparingPreview ? (
            <div className="moment-preview-placeholder">
              <strong>Preparing preview...</strong>
              <p>Making a short preview so playback starts quickly.</p>
            </div>
          ) : preparedPreview ? (
            <video
              className="moment-preview-video"
              controls
              onError={() => {
                setLoadError(describeVideoError(videoRef.current?.error, true));
              }}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              preload="metadata"
              ref={videoRef}
              src={mediaSrc}
            />
          ) : (
            <div className="moment-preview-placeholder">
              <strong>Preview unavailable</strong>
              <p>
                Pulse could not prepare a preview for this moment. Use QuickTime
                to play the source video.
              </p>
            </div>
          )}
        </div>

        <div className="moment-preview-grid">
          <article className="analysis-summary-card">
            <span className="detail-label">Now previewing</span>
            <strong>
              {previewMode === "SUGGESTED_SEGMENT"
                ? "Suggested clip"
                : "Detected moment"}
            </strong>
            <p>
              {formatLongTime(previewRange.startSeconds)} to{" "}
              {formatLongTime(previewRange.endSeconds)}
            </p>
          </article>
          <article className="analysis-summary-card">
            <span className="detail-label">Preview</span>
            <strong>
              {isPreparingPreview
                ? "Preparing clip"
                : preparedPreview
                  ? "Clip ready"
                  : "Clip unavailable"}
            </strong>
            <p>
              {isPreparingPreview
                ? "Preparing a short preview."
                : preparedPreview
                  ? buildPreparedPreviewSummary(preparedPreview)
                  : "Pulse could not prepare a short preview from this video."}
            </p>
          </article>
          <article className="analysis-summary-card">
            <span className="detail-label">Source file check</span>
            <strong>
              {isInspecting
                ? "Inspecting local playback..."
                : inspection?.pathExists
                  ? "File found"
                  : "File missing"}
            </strong>
            <p>
              {inspection
                ? buildInspectionSummary(inspection)
                : "Checking that the source video is available."}
            </p>
          </article>
        </div>

        {errorMessage ? <p className="analysis-error">{errorMessage}</p> : null}
        {quickTimeFeedback ? (
          <p className="review-status-copy moment-preview-feedback">
            {quickTimeFeedback}
          </p>
        ) : null}
      </section>
    </div>
  );
}
