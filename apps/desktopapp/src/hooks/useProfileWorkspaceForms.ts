import { useState } from "react";
import { supportedInputExtensions } from "@vaexcore/pulse-media";
import type {
  AddExampleClipRequest,
  CreateClipProfileRequest,
  CreateMediaEditPairRequest,
  CreateMediaLibraryAssetRequest,
  ExampleClipSourceType,
  MediaLibraryAssetScope,
  MediaLibraryAssetType,
} from "@vaexcore/pulse-shared-types";

type UseProfileWorkspaceFormsInput = {
  selectedProfileId: string | null;
  onCreateProfile: (input: CreateClipProfileRequest) => Promise<void>;
  onAddExample: (
    profileId: string,
    input: AddExampleClipRequest,
  ) => Promise<void>;
  onCreateMediaAsset: (input: CreateMediaLibraryAssetRequest) => Promise<void>;
  onCreateMediaPair: (input: CreateMediaEditPairRequest) => Promise<void>;
};

export function useProfileWorkspaceForms({
  selectedProfileId,
  onCreateProfile,
  onAddExample,
  onCreateMediaAsset,
  onCreateMediaPair,
}: UseProfileWorkspaceFormsInput) {
  const [profileName, setProfileName] = useState("");
  const [profileDescription, setProfileDescription] = useState("");
  const [sourceType, setSourceType] =
    useState<ExampleClipSourceType>("TWITCH_CLIP_URL");
  const [sourceValue, setSourceValue] = useState("");
  const [exampleTitle, setExampleTitle] = useState("");
  const [exampleNote, setExampleNote] = useState("");
  const [profileEditSourceType, setProfileEditSourceType] =
    useState<ExampleClipSourceType>("LOCAL_FILE_PATH");
  const [profileEditSourceValue, setProfileEditSourceValue] = useState("");
  const [profileEditTitle, setProfileEditTitle] = useState("");
  const [profileEditNote, setProfileEditNote] = useState("");
  const [assetType, setAssetType] = useState<MediaLibraryAssetType>("CLIP");
  const [assetScope, setAssetScope] =
    useState<MediaLibraryAssetScope>("GLOBAL");
  const [assetSourceType, setAssetSourceType] =
    useState<ExampleClipSourceType>("LOCAL_FILE_PATH");
  const [assetSourceValue, setAssetSourceValue] = useState("");
  const [assetTitle, setAssetTitle] = useState("");
  const [assetNote, setAssetNote] = useState("");
  const [pairScope, setPairScope] = useState<MediaLibraryAssetScope>("GLOBAL");
  const [selectedVodAssetId, setSelectedVodAssetId] = useState("");
  const [selectedEditAssetId, setSelectedEditAssetId] = useState("");
  const [pairTitle, setPairTitle] = useState("");
  const [pairNote, setPairNote] = useState("");

  async function openLocalMediaPicker(
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

  async function handlePickLocalExample(nextSourceType: ExampleClipSourceType) {
    setSourceType(nextSourceType);
    await openLocalMediaPicker(nextSourceType, (selection) =>
      setSourceValue(selection),
    );
  }

  async function handlePickProfileEdit(nextSourceType: ExampleClipSourceType) {
    setProfileEditSourceType(nextSourceType);
    await openLocalMediaPicker(nextSourceType, (selection) =>
      setProfileEditSourceValue(selection),
    );
  }

  async function handlePickMediaLibraryAsset(
    nextSourceType: ExampleClipSourceType,
  ) {
    setAssetSourceType(nextSourceType);
    await openLocalMediaPicker(nextSourceType, (selection) =>
      setAssetSourceValue(selection),
    );
  }

  async function handleCreateProfile() {
    const trimmedName = profileName.trim();
    if (!trimmedName) {
      return;
    }

    try {
      await onCreateProfile({
        name: trimmedName,
        description: profileDescription.trim() || undefined,
      });
      setProfileName("");
      setProfileDescription("");
    } catch {
      return;
    }
  }

  async function handleAddExample() {
    if (!selectedProfileId || !sourceValue.trim()) {
      return;
    }

    try {
      await onAddExample(selectedProfileId, {
        sourceType,
        sourceValue: sourceValue.trim(),
        title: exampleTitle.trim() || undefined,
        note: exampleNote.trim() || undefined,
      });
      setSourceValue("");
      setExampleTitle("");
      setExampleNote("");
    } catch {
      return;
    }
  }

  async function handleCreateProfileEdit() {
    if (!selectedProfileId || !profileEditSourceValue.trim()) {
      return;
    }

    try {
      await onCreateMediaAsset({
        assetType: "EDIT",
        scope: "PROFILE",
        profileId: selectedProfileId,
        sourceType: profileEditSourceType,
        sourceValue: profileEditSourceValue.trim(),
        title: profileEditTitle.trim() || undefined,
        note: profileEditNote.trim() || undefined,
      });
      setProfileEditSourceValue("");
      setProfileEditTitle("");
      setProfileEditNote("");
      setProfileEditSourceType("LOCAL_FILE_PATH");
    } catch {
      return;
    }
  }

  async function handleCreateMediaAsset() {
    if (!assetSourceValue.trim()) {
      return;
    }

    if (assetScope === "PROFILE" && !selectedProfileId) {
      return;
    }

    try {
      await onCreateMediaAsset({
        assetType,
        scope: assetScope,
        profileId:
          assetScope === "PROFILE"
            ? (selectedProfileId ?? undefined)
            : undefined,
        sourceType: assetSourceType,
        sourceValue: assetSourceValue.trim(),
        title: assetTitle.trim() || undefined,
        note: assetNote.trim() || undefined,
      });
      setAssetSourceValue("");
      setAssetTitle("");
      setAssetNote("");
      if (assetType !== "CLIP") {
        setAssetSourceType("LOCAL_FILE_PATH");
      }
    } catch {
      return;
    }
  }

  async function handleCreateMediaPair() {
    if (!selectedVodAssetId || !selectedEditAssetId) {
      return;
    }

    if (pairScope === "PROFILE" && !selectedProfileId) {
      return;
    }

    try {
      await onCreateMediaPair({
        vodAssetId: selectedVodAssetId,
        editAssetId: selectedEditAssetId,
        profileId:
          pairScope === "PROFILE"
            ? (selectedProfileId ?? undefined)
            : undefined,
        title: pairTitle.trim() || undefined,
        note: pairNote.trim() || undefined,
      });
      setSelectedVodAssetId("");
      setSelectedEditAssetId("");
      setPairTitle("");
      setPairNote("");
    } catch {
      return;
    }
  }

  return {
    assetNote,
    assetScope,
    assetSourceType,
    assetSourceValue,
    assetTitle,
    assetType,
    exampleNote,
    exampleTitle,
    handleAddExample,
    handleCreateMediaAsset,
    handleCreateMediaPair,
    handleCreateProfile,
    handleCreateProfileEdit,
    handlePickLocalExample,
    handlePickMediaLibraryAsset,
    handlePickProfileEdit,
    pairNote,
    pairScope,
    pairTitle,
    profileDescription,
    profileEditNote,
    profileEditSourceType,
    profileEditSourceValue,
    profileEditTitle,
    profileName,
    selectedEditAssetId,
    selectedVodAssetId,
    setAssetNote,
    setAssetScope,
    setAssetSourceType,
    setAssetSourceValue,
    setAssetTitle,
    setAssetType,
    setExampleNote,
    setExampleTitle,
    setPairNote,
    setPairScope,
    setPairTitle,
    setProfileDescription,
    setProfileEditNote,
    setProfileEditSourceType,
    setProfileEditSourceValue,
    setProfileEditTitle,
    setProfileName,
    setSelectedEditAssetId,
    setSelectedVodAssetId,
    setSourceType,
    setSourceValue,
    sourceType,
    sourceValue,
  };
}
