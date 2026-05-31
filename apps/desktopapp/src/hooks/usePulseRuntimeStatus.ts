import { useEffect, useState } from "react";

export type PulseRuntimeStatus = "checking" | "starting" | "ready" | "slow";

export function usePulseRuntimeStatus(apiBaseUrl: string): PulseRuntimeStatus {
  const [status, setStatus] = useState<PulseRuntimeStatus>("checking");

  useEffect(() => {
    let isCancelled = false;
    let attemptCount = 0;
    let intervalId: number | undefined;

    async function checkRuntime() {
      attemptCount += 1;
      const isReady = await checkPulseHealth(apiBaseUrl);
      if (isCancelled) {
        return;
      }

      if (isReady) {
        setStatus("ready");
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
        }
        return;
      }

      setStatus(
        attemptCount > 10 ? "slow" : attemptCount > 1 ? "starting" : "checking",
      );
    }

    void checkRuntime();
    intervalId = window.setInterval(() => {
      void checkRuntime();
    }, 1000);

    return () => {
      isCancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [apiBaseUrl]);

  return status;
}

async function checkPulseHealth(
  apiBaseUrl: string,
  timeoutMs = 1200,
): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${apiBaseUrl}/health`, {
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function isPulseRuntimeReady(status: PulseRuntimeStatus): boolean {
  return status === "ready";
}

export function buildPulseStartupCopy(status: PulseRuntimeStatus): {
  headline: string;
  detail: string;
  statusLabel: string;
} {
  if (status === "slow") {
    return {
      detail:
        "Pulse is taking longer than usual. Keep this window open; it will continue trying.",
      headline: "Pulse is still starting",
      statusLabel: "Starting",
    };
  }

  return {
    detail:
      "This usually takes a few seconds. You can choose a video while Pulse gets ready.",
    headline: status === "checking" ? "Checking Pulse" : "Pulse is starting",
    statusLabel: status === "checking" ? "Checking" : "Starting",
  };
}
