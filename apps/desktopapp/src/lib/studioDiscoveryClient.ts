import type {
  StudioApiEnvelope,
  StudioDiscovery,
  StudioRecentRecordingsSnapshot,
  StudioRecordingCandidate,
} from "./studioTypes";
import { studioRecordingFromHistoryEntry } from "./studioRecordingParser";

export function studioRequestHeaders(discovery: StudioDiscovery): HeadersInit {
  const headers: Record<string, string> = {
    "x-vaexcore-client-id": "vaexcore-pulse",
    "x-vaexcore-client-name": "vaexcore pulse",
  };

  if (discovery.token) {
    headers["x-vaexcore-token"] = discovery.token;
  }

  return headers;
}

export function studioEventSocketUrl(discovery: StudioDiscovery): string {
  const url = new URL(discovery.wsUrl);
  url.searchParams.set("client_id", "vaexcore-pulse-events");
  url.searchParams.set("client_name", "vaexcore pulse events");
  url.searchParams.set("limit", "25");
  if (discovery.token) {
    url.searchParams.set("token", discovery.token);
  }
  return url.toString();
}

export async function fetchLatestStudioRecording(
  discovery: StudioDiscovery,
  fetchImpl: typeof fetch = fetch,
): Promise<StudioRecordingCandidate | null> {
  const response = await fetchImpl(`${discovery.apiUrl}/recordings/recent`, {
    headers: studioRequestHeaders(discovery),
  });
  const body = (await response.json()) as StudioApiEnvelope;

  if (!response.ok || body.ok !== true) {
    return null;
  }

  const snapshot =
    body.data && typeof body.data === "object"
      ? (body.data as StudioRecentRecordingsSnapshot)
      : {};
  const recordings = Array.isArray(snapshot.recordings)
    ? snapshot.recordings
    : [];

  for (const recording of recordings) {
    const candidate = studioRecordingFromHistoryEntry(recording);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}
