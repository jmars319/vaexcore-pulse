import { useEffect, useState } from "react";
import { supportedInputExtensions } from "@vaexcore/pulse-media";
import type {
  ClipProfile,
  ExampleClip,
  ExampleClipSourceType,
} from "@vaexcore/pulse-shared-types";
import {
  buildPulseStartupCopy,
  isPulseRuntimeReady,
  usePulseRuntimeStatus,
} from "./usePulseRuntimeStatus";
import { createMediaLibraryAssetEntry } from "../lib/pulseMediaLibraryApi";
import {
  createProfile,
  createProfileExample,
  fetchProfileExamples,
  fetchProfiles,
} from "../lib/pulseProfileApi";
import { upsertProfile } from "../lib/pulseApiUpserts";
import {
  emitProfileSetupChanged,
  formatProfileSetupError,
  isLocalServiceUnavailableError,
} from "../lib/settingsWindowBehavior";

/* Source option boundary */
export const profileSourceTypeOptions: Array<{
  id: ExampleClipSourceType;
  label: string;
  hint: string;
}> = [
  {
    id: "LOCAL_FILE_UPLOAD",
    label: "Choose clip file",
    hint: "Choose a short clip from this Mac.",
  },
  {
    id: "LOCAL_FILE_PATH",
    label: "Paste file path",
    hint: "Paste the full path to a short clip on this Mac.",
  },
  {
    id: "TWITCH_CLIP_URL",
    label: "Twitch clip link",
    hint: "Paste a Twitch clip link.",
  },
  {
    id: "YOUTUBE_SHORT_URL",
    label: "YouTube Short link",
    hint: "Paste a YouTube Short link.",
  },
];

export const localProfileSourceTypeOptions = profileSourceTypeOptions.filter(
  (option) =>
    option.id === "LOCAL_FILE_PATH" || option.id === "LOCAL_FILE_UPLOAD",
);

/* Profile setup boundary */
export function useProfileSetupSettings() {
  const apiBaseUrl =
    import.meta.env.VITE_VAEXCORE_PULSE_API_BASE_URL ?? "http://127.0.0.1:4010";
  const pulseRuntimeStatus = usePulseRuntimeStatus(apiBaseUrl);
  const isPulseReady = isPulseRuntimeReady(pulseRuntimeStatus);
  const [profiles, setProfiles] = useState<ClipProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    null,
  );
  const [selectedProfileExamples, setSelectedProfileExamples] = useState<
    ExampleClip[]
  >([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [isLoadingProfileExamples, setIsLoadingProfileExamples] =
    useState(false);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [isAddingProfileExample, setIsAddingProfileExample] = useState(false);
  const [isAddingEditedVideo, setIsAddingEditedVideo] = useState(false);
  const [profileLibraryError, setProfileLibraryError] = useState<string | null>(
    null,
  );
  const [profileSetupNotice, setProfileSetupNotice] = useState<string | null>(
    null,
  );
  const [profileLoadRetryCount, setProfileLoadRetryCount] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [sourceType, setSourceType] =
    useState<ExampleClipSourceType>("LOCAL_FILE_UPLOAD");
  const [sourceValue, setSourceValue] = useState("");
  const [exampleTitle, setExampleTitle] = useState("");
  const [exampleNote, setExampleNote] = useState("");
  const [editSourceType, setEditSourceType] =
    useState<ExampleClipSourceType>("LOCAL_FILE_UPLOAD");
  const [editSourceValue, setEditSourceValue] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editNote, setEditNote] = useState("");

  const selectedProfile = selectedProfileId
    ? (profiles.find((profile) => profile.id === selectedProfileId) ?? null)
    : null;
  const selectedSourceType = profileSourceTypeOptions.find(
    (option) => option.id === sourceType,
  );
  const selectedEditSourceType = localProfileSourceTypeOptions.find(
    (option) => option.id === editSourceType,
  );
  const visibleExamples =
    selectedProfileExamples.length > 0 || isLoadingProfileExamples
      ? selectedProfileExamples
      : (selectedProfile?.exampleClips ?? []);
  const isClipFilePicker = sourceType === "LOCAL_FILE_UPLOAD";
  const isEditFilePicker = editSourceType === "LOCAL_FILE_UPLOAD";
  const canPickClipFile = sourceType === "LOCAL_FILE_PATH" || isClipFilePicker;
  const canPickEditFile =
    editSourceType === "LOCAL_FILE_PATH" || isEditFilePicker;
  const startupCopy = buildPulseStartupCopy(pulseRuntimeStatus);

  /* Profile load boundary */
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
        setSelectedProfileId((current) =>
          current && nextProfiles.some((profile) => profile.id === current)
            ? current
            : (nextProfiles[0]?.id ?? null),
        );
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(formatProfileSetupError(error));
        if (isLocalServiceUnavailableError(error)) {
          window.setTimeout(() => {
            if (!isCancelled) {
              setProfileLoadRetryCount((current) => current + 1);
            }
          }, 2000);
        }
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
  }, [apiBaseUrl, isPulseReady, profileLoadRetryCount]);

  /* Example load boundary */
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
    const profileIdForLoad: string = profileId;

    let isCancelled = false;

    async function loadExamples() {
      setIsLoadingProfileExamples(true);
      try {
        const examples = await fetchProfileExamples(
          apiBaseUrl,
          profileIdForLoad,
        );
        if (isCancelled) {
          return;
        }

        setSelectedProfileExamples(examples);
        setProfiles((current) =>
          current.map((profile) =>
            profile.id === profileIdForLoad
              ? { ...profile, exampleClips: examples }
              : profile,
          ),
        );
        setProfileLibraryError(null);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileLibraryError(formatProfileSetupError(error));
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

  /* Local media picker boundary */
  async function handlePickLocalMedia(
    nextSourceType: ExampleClipSourceType,
    onSelect: (selection: string) => void,
  ) {
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

      if (typeof selection === "string") {
        onSelect(selection);
      }
    } catch {
      if (nextSourceType === "LOCAL_FILE_UPLOAD") {
        onSelect("");
      }
    }
  }

  /* Profile mutation boundary */
  async function handleCreateProfile() {
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      return;
    }

    setIsCreatingProfile(true);
    setProfileLibraryError(null);
    setProfileSetupNotice(null);

    try {
      const createdProfile = await createProfile(apiBaseUrl, {
        name: trimmedName,
        description: profileDescription.trim() || undefined,
      });
      setProfiles((current) =>
        upsertProfile(current, {
          ...createdProfile,
          exampleClips: createdProfile.exampleClips ?? [],
        }),
      );
      setSelectedProfileId(createdProfile.id);
      setSelectedProfileExamples(createdProfile.exampleClips ?? []);
      setProfileName("");
      setProfileDescription("");
      setProfileSetupNotice("Profile saved.");
      emitProfileSetupChanged(createdProfile.id);
    } catch (error) {
      setProfileLibraryError(formatProfileSetupError(error));
    } finally {
      setIsCreatingProfile(false);
    }
  }

  /* Example mutation boundary */
  async function handleAddExample() {
    if (!selectedProfileId || !sourceValue.trim()) {
      return;
    }

    setIsAddingProfileExample(true);
    setProfileLibraryError(null);
    setProfileSetupNotice(null);

    try {
      const createdExample = await createProfileExample(
        apiBaseUrl,
        selectedProfileId,
        {
          sourceType,
          sourceValue: sourceValue.trim(),
          title: exampleTitle.trim() || undefined,
          note: exampleNote.trim() || undefined,
        },
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
          profile.id === selectedProfileId
            ? {
                ...profile,
                exampleClips: nextExamples,
                updatedAt: createdExample.updatedAt,
              }
            : profile,
        ),
      );
      setSourceValue("");
      setExampleTitle("");
      setExampleNote("");
      setProfileSetupNotice("Clip reference saved.");
      emitProfileSetupChanged(selectedProfileId);
    } catch (error) {
      setProfileLibraryError(formatProfileSetupError(error));
    } finally {
      setIsAddingProfileExample(false);
    }
  }

  async function handleAddEditedVideo() {
    if (!selectedProfileId || !editSourceValue.trim()) {
      return;
    }

    setIsAddingEditedVideo(true);
    setProfileLibraryError(null);
    setProfileSetupNotice(null);

    try {
      await createMediaLibraryAssetEntry(apiBaseUrl, {
        assetType: "EDIT",
        scope: "PROFILE",
        profileId: selectedProfileId,
        sourceType: editSourceType,
        sourceValue: editSourceValue.trim(),
        title: editTitle.trim() || undefined,
        note: editNote.trim() || undefined,
      });
      setEditSourceValue("");
      setEditTitle("");
      setEditNote("");
      setProfileSetupNotice("Edited video reference saved.");
      emitProfileSetupChanged(selectedProfileId);
    } catch (error) {
      setProfileLibraryError(formatProfileSetupError(error));
    } finally {
      setIsAddingEditedVideo(false);
    }
  }

  return {
    canPickClipFile,
    canPickEditFile,
    editNote,
    editSourceType,
    editSourceValue,
    editTitle,
    exampleNote,
    exampleTitle,
    handleAddEditedVideo,
    handleAddExample,
    handleCreateProfile,
    handlePickLocalMedia,
    isAddingEditedVideo,
    isAddingProfileExample,
    isClipFilePicker,
    isCreatingProfile,
    isEditFilePicker,
    isLoadingProfileExamples,
    isLoadingProfiles,
    isPulseReady,
    profileDescription,
    profileLibraryError,
    profileName,
    profileSetupNotice,
    profiles,
    selectedEditSourceType,
    selectedProfile,
    selectedProfileId,
    selectedSourceType,
    setEditNote,
    setEditSourceType,
    setEditSourceValue,
    setEditTitle,
    setExampleNote,
    setExampleTitle,
    setProfileDescription,
    setProfileName,
    setSelectedProfileId,
    setSourceType,
    setSourceValue,
    sourceType,
    sourceValue,
    startupCopy,
    visibleExamples,
  };
}
