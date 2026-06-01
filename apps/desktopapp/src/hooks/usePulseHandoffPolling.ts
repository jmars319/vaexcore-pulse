import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  isPulseRecordingHandoff,
  type PulseRecordingHandoff,
  type SuiteCommand,
} from "../lib/suitePresentation";
import { isTauriRuntime } from "../lib/tauriRuntime";

type UsePulseHandoffPollingOptions = {
  onFocusReview: () => void;
  onFocusSuite: () => void;
  onRecordingHandoff: (handoff: PulseRecordingHandoff) => void;
};

export function usePulseHandoffPolling({
  onFocusReview,
  onFocusSuite,
  onRecordingHandoff,
}: UsePulseHandoffPollingOptions) {
  useEffect(() => {
    if (!isTauriRuntime()) return;

    let isSubscribed = true;

    async function consumeHandoff() {
      try {
        const handoff = await invoke<PulseRecordingHandoff | null>(
          "consume_pulse_recording_handoff",
        );
        if (handoff && isSubscribed) {
          onRecordingHandoff(handoff);
        }

        const commands = await invoke<SuiteCommand[]>("consume_suite_commands");
        for (const command of commands) {
          if (
            command.command === "open-review" &&
            isPulseRecordingHandoff(command.payload) &&
            isSubscribed
          ) {
            onRecordingHandoff(command.payload);
          } else if (command.command === "focus-review" && isSubscribed) {
            onFocusReview();
          } else if (command.command === "focus-suite" && isSubscribed) {
            onFocusSuite();
          }
        }
      } catch {
        // Handoff polling is best-effort and should not interrupt review work.
      }
    }

    void consumeHandoff();
    const interval = window.setInterval(() => {
      void consumeHandoff();
    }, 2500);

    return () => {
      isSubscribed = false;
      window.clearInterval(interval);
    };
  }, []);
}
