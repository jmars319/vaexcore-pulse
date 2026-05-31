import { fetchWithLocalApiMessage } from "./localApi";

type ApiMessagePayload = {
  message?: string;
};

export const jsonRequestHeaders = {
  "content-type": "application/json",
};

export async function requestPulseApiJson<Payload>(
  apiBaseUrl: string,
  url: string,
  init: RequestInit | undefined,
  connectionFailureMessage: string,
  apiFailureMessage: string,
): Promise<Payload> {
  const response = await fetchWithLocalApiMessage(
    url,
    apiBaseUrl,
    init,
    connectionFailureMessage,
  );
  const payload = (await response.json().catch(() => null)) as
    | ApiMessagePayload
    | Payload
    | null;

  if (!response.ok) {
    throw new Error(apiPayloadMessage(payload, apiFailureMessage));
  }

  return payload as Payload;
}

function apiPayloadMessage(payload: unknown, fallback: string): string {
  return payload &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message
    ? payload.message
    : fallback;
}
