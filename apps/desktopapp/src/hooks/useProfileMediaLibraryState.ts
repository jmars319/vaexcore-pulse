import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { listen } from "@tauri-apps/api/event";
import { defaultProfileId } from "@vaexcore/pulse-profiles";
import {
  addExampleClipRequestSchema,
  createClipProfileRequestSchema,
  type AddExampleClipRequest,
  type ClipProfile,
  type CreateClipProfileRequest,
  type ExampleClip,
} from "@vaexcore/pulse-shared-types";
import {
  createProfile,
  createProfileExample,
  fetchProfileExamples,
  fetchProfiles,
} from "../lib/pulseProfileApi";
import { upsertProfile } from "../lib/pulseApiUpserts";
import {
  profileLibraryChangedEvent,
  type ProfileLibraryChangedPayload,
} from "../lib/settingsWindowBehavior";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { useMediaLibraryState } from "./useMediaLibraryState";

type UseProfileMediaLibraryStateOptions = {
  apiBaseUrl: string;
  isPulseReady: boolean;
  onProfileExamplesChanged: (profileId: string) => Promise<void>;
  setAnalysisProfileId: Dispatch<SetStateAction<string>>;
};

export function useProfileMediaLibraryState({
  apiBaseUrl,
  isPulseReady,
  onProfileExamplesChanged,
  setAnalysisProfileId,
}: UseProfileMediaLibraryStateOptions) {
  const [profiles, setProfiles] = useState<ClipProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] =
    useState<string>(defaultProfileId);
  const [selectedProfileExamples, setSelectedProfileExamples] = useState<
    ExampleClip[]
  >([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isLoadingProfileExamples, setIsLoadingProfileExamples] =
    useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isAddingProfileExample, setIsAddingProfileExample] = useState(false);
  const [profileLibraryError, setProfileLibraryError] = useState<string | null>(
    null,
  );

  const mediaState = useMediaLibraryState({
    apiBaseUrl,
    isPulseReady,
    setProfileLibraryError,
  });
  const { refreshMediaLibraryAssets } = mediaState;

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingProfiles(false);
      setProfileLibraryError(null);
      return;
    }

    let isCancelled = false;

    async function loadProfiles() {
      setIsLoadingProfiles(true);
      try {
        const nextProfiles = await fetchProfiles(apiBaseUrl);
        if (isCancelled) {
          return;
        }

        setProfiles(nextProfiles);
        setProfileLibraryError(null);
        setSelectedProfileId((current) =>
          nextProfiles.some((profile) => profile.id === current)
            ? current
            : (nextProfiles[0]?.id ?? defaultProfileId),
        );
        setAnalysisProfileId((current) =>
          nextProfiles.some((profile) => profile.id === current)
            ? current
            : (nextProfiles[0]?.id ?? defaultProfileId),
        );
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load clip profiles: ${error.message}`
            : "Unable to load clip profiles",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingProfiles(false);
        }
      }
    }

    void loadProfiles();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, setAnalysisProfileId]);

  useEffect(() => {
    if (!isTauriRuntime() || !isPulseReady) {
      return;
    }

    let isSubscribed = true;
    let unlistenProfileLibrary: (() => void) | undefined;

    async function refreshProfilesFromSettings(preferredProfileId?: string) {
      try {
        const [nextProfiles] = await Promise.all([
          fetchProfiles(apiBaseUrl),
          refreshMediaLibraryAssets(),
        ]);
        if (!isSubscribed) {
          return;
        }

        const targetProfileId = preferredProfileId ?? selectedProfileId;
        const nextSelectedProfileId = nextProfiles.some(
          (profile) => profile.id === targetProfileId,
        )
          ? targetProfileId
          : (nextProfiles[0]?.id ?? defaultProfileId);
        const shouldLoadExamples = nextProfiles.some(
          (profile) => profile.id === nextSelectedProfileId,
        );
        const nextExamples = shouldLoadExamples
          ? await fetchProfileExamples(apiBaseUrl, nextSelectedProfileId)
          : [];

        if (!isSubscribed) {
          return;
        }

        setProfiles(
          shouldLoadExamples
            ? nextProfiles.map((profile) =>
                profile.id === nextSelectedProfileId
                  ? { ...profile, exampleClips: nextExamples }
                  : profile,
              )
            : nextProfiles,
        );
        setSelectedProfileId(nextSelectedProfileId);
        setSelectedProfileExamples(nextExamples);
        setAnalysisProfileId((current) => {
          if (
            preferredProfileId &&
            nextProfiles.some((profile) => profile.id === preferredProfileId)
          ) {
            return preferredProfileId;
          }

          return nextProfiles.some((profile) => profile.id === current)
            ? current
            : nextSelectedProfileId;
        });
        setProfileLibraryError(null);
      } catch (error) {
        if (!isSubscribed) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to refresh profile setup: ${error.message}`
            : "Unable to refresh profile setup",
        );
      }
    }

    void listen<ProfileLibraryChangedPayload>(
      profileLibraryChangedEvent,
      (event) => {
        void refreshProfilesFromSettings(event.payload?.profileId);
      },
    ).then((unlisten) => {
      if (!isSubscribed) {
        unlisten();
        return;
      }

      unlistenProfileLibrary = unlisten;
    });

    return () => {
      isSubscribed = false;
      unlistenProfileLibrary?.();
    };
  }, [
    apiBaseUrl,
    isPulseReady,
    refreshMediaLibraryAssets,
    selectedProfileId,
    setAnalysisProfileId,
  ]);

  useEffect(() => {
    if (!isPulseReady) {
      setIsLoadingProfileExamples(false);
      return;
    }

    const profileId = selectedProfileId;
    if (!profileId) {
      setSelectedProfileExamples([]);
      return;
    }
    const selectedProfileIdForLoad: string = profileId;

    let isCancelled = false;

    async function loadExamples() {
      setIsLoadingProfileExamples(true);
      try {
        const examples = await fetchProfileExamples(
          apiBaseUrl,
          selectedProfileIdForLoad,
        );
        if (isCancelled) {
          return;
        }

        setSelectedProfileExamples(examples);
        setProfiles((current) =>
          current.map((profile) =>
            profile.id === selectedProfileIdForLoad
              ? { ...profile, exampleClips: examples }
              : profile,
          ),
        );
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(
          error instanceof Error
            ? `Unable to load example clips: ${error.message}`
            : "Unable to load example clips",
        );
      } finally {
        if (!isCancelled) {
          setIsLoadingProfileExamples(false);
        }
      }
    }

    void loadExamples();

    return () => {
      isCancelled = true;
    };
  }, [apiBaseUrl, isPulseReady, selectedProfileId]);

  async function handleCreateProfile(input: CreateClipProfileRequest) {
    const request = createClipProfileRequestSchema.parse(input);
    setIsCreatingProfile(true);
    setProfileLibraryError(null);

    try {
      const createdProfile = await createProfile(apiBaseUrl, request);
      setProfiles((current) =>
        upsertProfile(current, {
          ...createdProfile,
          exampleClips: createdProfile.exampleClips ?? [],
        }),
      );
      setSelectedProfileId(createdProfile.id);
      setSelectedProfileExamples(createdProfile.exampleClips ?? []);
      setAnalysisProfileId(createdProfile.id);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while creating the profile.",
      );
      throw error;
    } finally {
      setIsCreatingProfile(false);
    }
  }

  async function handleAddProfileExample(
    profileId: string,
    input: AddExampleClipRequest,
  ) {
    const request = addExampleClipRequestSchema.parse(input);
    setIsAddingProfileExample(true);
    setProfileLibraryError(null);

    try {
      const createdExample = await createProfileExample(
        apiBaseUrl,
        profileId,
        request,
      );
      const nextExamples = [
        createdExample,
        ...selectedProfileExamples.filter(
          (example) => example.id !== createdExample.id,
        ),
      ];
      setSelectedProfileExamples(nextExamples);
      setProfiles((current) =>
        current.map((profile) =>
          profile.id === profileId
            ? {
                ...profile,
                exampleClips: nextExamples,
                updatedAt: createdExample.updatedAt,
              }
            : profile,
        ),
      );
      await onProfileExamplesChanged(profileId);
    } catch (error) {
      setProfileLibraryError(
        error instanceof Error
          ? error.message
          : "Something went wrong while saving the clip.",
      );
      throw error;
    } finally {
      setIsAddingProfileExample(false);
    }
  }

  return {
    ...mediaState,
    handleAddProfileExample,
    handleCreateProfile,
    isAddingProfileExample,
    isCreatingProfile,
    isLoadingProfileExamples,
    isLoadingProfiles,
    profileLibraryError,
    profiles,
    selectedProfileExamples,
    selectedProfileId,
    setSelectedProfileId,
  };
}
