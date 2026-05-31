import {
  addExampleClipRequestSchema,
  clipProfileSchema,
  createClipProfileRequestSchema,
  exampleClipSchema,
  type AddExampleClipRequest,
  type ClipProfile,
  type CreateClipProfileRequest,
  type ExampleClip,
} from "@vaexcore/pulse-shared-types";

import { jsonRequestHeaders, requestPulseApiJson } from "./pulseApiCore";

export async function fetchProfiles(
  apiBaseUrl: string,
): Promise<ClipProfile[]> {
  const payload = await requestPulseApiJson<ClipProfile[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/profiles`,
    undefined,
    "Unable to load clip profiles.",
    "Profile list load failed",
  );
  return clipProfileSchema.array().parse(payload);
}

export async function fetchProfileExamples(
  apiBaseUrl: string,
  profileId: string,
): Promise<ExampleClip[]> {
  const payload = await requestPulseApiJson<ExampleClip[]>(
    apiBaseUrl,
    `${apiBaseUrl}/api/profiles/${encodeURIComponent(profileId)}/examples`,
    undefined,
    "Unable to load profile examples.",
    "Profile example list load failed",
  );
  return exampleClipSchema.array().parse(payload);
}

export async function createProfile(
  apiBaseUrl: string,
  input: CreateClipProfileRequest,
): Promise<ClipProfile> {
  const request = createClipProfileRequestSchema.parse(input);
  const payload = await requestPulseApiJson<ClipProfile>(
    apiBaseUrl,
    `${apiBaseUrl}/api/profiles`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
      body: JSON.stringify(request),
    },
    "Unable to create clip profile.",
    "Profile create failed",
  );
  return clipProfileSchema.parse(payload);
}

export async function createProfileExample(
  apiBaseUrl: string,
  profileId: string,
  input: AddExampleClipRequest,
): Promise<ExampleClip> {
  const request = addExampleClipRequestSchema.parse(input);
  const payload = await requestPulseApiJson<ExampleClip>(
    apiBaseUrl,
    `${apiBaseUrl}/api/profiles/${encodeURIComponent(profileId)}/examples`,
    {
      method: "POST",
      headers: jsonRequestHeaders,
      body: JSON.stringify(request),
    },
    "Unable to save example clip reference.",
    "Profile example create failed",
  );
  return exampleClipSchema.parse(payload);
}
