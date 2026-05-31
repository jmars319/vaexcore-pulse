import {
  projectSessionSchema,
  projectSessionSummarySchema,
  type ProjectSession,
  type ProjectSessionSummary,
} from "@vaexcore/pulse-shared-types";

import { requestPulseApiJson } from "./pulseApiCore";

export async function fetchProjectSession(
  apiBaseUrl: string,
  sessionId: string,
): Promise<ProjectSession> {
  const payload = await requestPulseApiJson<ProjectSession>(
    apiBaseUrl,
    `${apiBaseUrl}/api/projects/${encodeURIComponent(sessionId)}`,
    undefined,
    "Unable to load the local session.",
    "Session load failed",
  );
  return projectSessionSchema.parse(payload);
}

export async function fetchProjectSummaries(
  apiBaseUrl: string,
): Promise<ProjectSessionSummary[]> {
  const payload = await requestPulseApiJson<ProjectSessionSummary[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/projects`,
    undefined,
    "Unable to load saved sessions.",
    "Project list load failed",
  );
  return projectSessionSummarySchema.array().parse(payload);
}
