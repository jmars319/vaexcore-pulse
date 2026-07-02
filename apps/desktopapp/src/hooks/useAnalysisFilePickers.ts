import {
  isSupportedInput,
  supportedInputExtensions,
} from "@vaexcore/pulse-media";
import type { DesktopPage } from "../lib/desktopNavigation";
import { buildSuggestedSessionTitle } from "../lib/sessionPresentation";

type AnalysisFilePickerOptions = {
  analysisTitle: string;
  setActivePage: (page: DesktopPage) => void;
  setAnalysisError: (error: string | null) => void;
  setAnalysisTitle: (title: string) => void;
  setSelectedMediaPath: (path: string) => void;
  setSelectedTranscriptPath: (path: string) => void;
};

export function useAnalysisFilePickers({
  analysisTitle,
  setActivePage,
  setAnalysisError,
  setAnalysisTitle,
  setSelectedMediaPath,
  setSelectedTranscriptPath,
}: AnalysisFilePickerOptions) {
  async function handlePickMedia() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selection = await open({
        directory: false,
        multiple: false,
        filters: [
          {
            name: "Media",
            extensions: supportedInputExtensions.map((extension) =>
              extension.slice(1),
            ),
          },
        ],
      });

      if (typeof selection === "string" && isSupportedInput(selection)) {
        setSelectedMediaPath(selection);
        setAnalysisError(null);
        if (!analysisTitle.trim()) {
          setAnalysisTitle(buildSuggestedSessionTitle(selection));
        }
        setActivePage("new-analysis");
        return;
      }

      if (typeof selection === "string") {
        setSelectedMediaPath(selection);
        setAnalysisError(
          `Unsupported file type. Try: ${supportedInputExtensions.join(", ")}`,
        );
        setActivePage("new-analysis");
      }
    } catch {
      setAnalysisError(
        "Could not open the file picker. You can paste a full file path instead.",
      );
    }
  }

  async function handlePickTranscript() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selection = await open({
        directory: false,
        multiple: false,
        filters: [
          {
            name: "Transcript",
            extensions: ["srt", "vtt", "txt", "text", "json"],
          },
        ],
      });

      if (typeof selection === "string") {
        setSelectedTranscriptPath(selection);
        setAnalysisError(null);
        setActivePage("new-analysis");
      }
    } catch {
      setAnalysisError(
        "Could not open the transcript picker. You can paste a full transcript path instead.",
      );
    }
  }

  return {
    handlePickMedia,
    handlePickTranscript,
  };
}
