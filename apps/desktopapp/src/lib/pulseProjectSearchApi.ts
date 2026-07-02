import {
  projectSessionSearchResultSchema,
  type ProjectSessionSearchResult,
} from "@vaexcore/pulse-shared-types";

import { requestPulseApiJson } from "./pulseApiCore";

export async function fetchProjectSearchResults(
  apiBaseUrl: string,
  query: string,
): Promise<ProjectSessionSearchResult[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const payload = await requestPulseApiJson<ProjectSessionSearchResult[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/projects/search?q=${encodeURIComponent(normalizedQuery)}`,
    undefined,
    "Unable to search saved sessions.",
    "Project search failed",
  );
  return projectSessionSearchResultSchema.array().parse(payload);
}
