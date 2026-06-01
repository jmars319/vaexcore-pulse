import type {
  AddExampleClipRequest,
  CancelMediaAlignmentJobRequest,
  ClipProfile,
  CancelMediaIndexJobRequest,
  CreateClipProfileRequest,
  CreateMediaAlignmentJobRequest,
  CreateMediaEditPairRequest,
  CreateMediaIndexJobRequest,
  CreateMediaLibraryAssetRequest,
  ExampleClip,
  MediaAlignmentJob,
  MediaAlignmentMatch,
  MediaEditPair,
  MediaIndexJob,
  MediaLibraryAsset,
  ReplaceMediaThumbnailOutputsRequest,
} from "@vaexcore/pulse-shared-types";
import { useProfileWorkspaceDerivedState } from "../hooks/useProfileWorkspaceDerivedState";
import { useProfileWorkspaceForms } from "../hooks/useProfileWorkspaceForms";
import { ProfileExamplesList } from "./ProfileExamplesList";
import { ProfileReferenceBuilder } from "./ProfileReferenceBuilder";
import { ProfileWorkspaceOverview } from "./ProfileWorkspaceOverview";
import { ProfileWorkspaceMediaLab } from "./ProfileWorkspaceMediaLab";
import { ProfileWorkspaceSidebar } from "./ProfileWorkspaceSidebar";

type ProfileWorkspaceProps = {
  profiles: ClipProfile[];
  selectedProfileId: string | null;
  selectedProfile: ClipProfile | null;
  examples: ExampleClip[];
  libraryAssets: MediaLibraryAsset[];
  mediaIndexJobs: MediaIndexJob[];
  mediaAlignmentJobs: MediaAlignmentJob[];
  mediaAlignmentMatches: MediaAlignmentMatch[];
  mediaEditPairs: MediaEditPair[];
  cancellingMediaIndexJobIds: Record<string, boolean>;
  cancellingMediaAlignmentJobIds: Record<string, boolean>;
  savingThumbnailOutputAssetIds: Record<string, boolean>;
  isLoadingProfiles: boolean;
  isLoadingExamples: boolean;
  isLoadingLibraryAssets: boolean;
  isLoadingMediaIndexJobs: boolean;
  isLoadingMediaAlignmentJobs: boolean;
  isLoadingMediaPairs: boolean;
  isCreatingProfile: boolean;
  isAddingExample: boolean;
  isCreatingMediaAsset: boolean;
  isCreatingMediaIndexJob: boolean;
  isCreatingMediaAlignmentJob: boolean;
  isCreatingMediaPair: boolean;
  error: string | null;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (input: CreateClipProfileRequest) => Promise<void>;
  onAddExample: (
    profileId: string,
    input: AddExampleClipRequest,
  ) => Promise<void>;
  onCreateMediaAsset: (input: CreateMediaLibraryAssetRequest) => Promise<void>;
  onCreateMediaIndexJob: (input: CreateMediaIndexJobRequest) => Promise<void>;
  onReplaceThumbnailOutputs: (
    assetId: string,
    input: ReplaceMediaThumbnailOutputsRequest,
  ) => Promise<void>;
  onCreateMediaAlignmentJob: (
    input: CreateMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCancelMediaIndexJob: (input: CancelMediaIndexJobRequest) => Promise<void>;
  onCancelMediaAlignmentJob: (
    input: CancelMediaAlignmentJobRequest,
  ) => Promise<void>;
  onCreateMediaPair: (input: CreateMediaEditPairRequest) => Promise<void>;
};

export function ProfileWorkspace({
  profiles,
  selectedProfileId,
  selectedProfile,
  examples,
  libraryAssets,
  mediaIndexJobs,
  mediaAlignmentJobs,
  mediaAlignmentMatches,
  mediaEditPairs,
  cancellingMediaIndexJobIds,
  cancellingMediaAlignmentJobIds,
  savingThumbnailOutputAssetIds,
  isLoadingProfiles,
  isLoadingExamples,
  isLoadingLibraryAssets,
  isLoadingMediaIndexJobs,
  isLoadingMediaAlignmentJobs,
  isLoadingMediaPairs,
  isCreatingProfile,
  isAddingExample,
  isCreatingMediaAsset,
  isCreatingMediaIndexJob,
  isCreatingMediaAlignmentJob,
  isCreatingMediaPair,
  error,
  onSelectProfile,
  onCreateProfile,
  onAddExample,
  onCreateMediaAsset,
  onCreateMediaIndexJob,
  onReplaceThumbnailOutputs,
  onCreateMediaAlignmentJob,
  onCancelMediaIndexJob,
  onCancelMediaAlignmentJob,
  onCreateMediaPair,
}: ProfileWorkspaceProps) {
  const forms = useProfileWorkspaceForms({
    onAddExample,
    onCreateMediaAsset,
    onCreateMediaPair,
    onCreateProfile,
    selectedProfileId,
  });

  const derived = useProfileWorkspaceDerivedState({
    assetSourceType: forms.assetSourceType,
    assetType: forms.assetType,
    examples,
    isLoadingExamples,
    libraryAssets,
    mediaAlignmentJobs,
    mediaEditPairs,
    mediaIndexJobs,
    profileEditSourceType: forms.profileEditSourceType,
    selectedProfile,
    sourceType: forms.sourceType,
  });

  return (
    <section className="profile-library-layout">
      <ProfileWorkspaceSidebar
        isCreatingProfile={isCreatingProfile}
        isLoadingProfiles={isLoadingProfiles}
        onCreateProfile={forms.handleCreateProfile}
        onSelectProfile={onSelectProfile}
        profileDescription={forms.profileDescription}
        profileName={forms.profileName}
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        setProfileDescription={forms.setProfileDescription}
        setProfileName={forms.setProfileName}
      />

      <div className="profile-detail-stack">
        <ProfileWorkspaceOverview
          error={error}
          selectedProfile={selectedProfile}
          selectedProfileClipReferenceCount={
            derived.selectedProfileClipReferenceCount
          }
          selectedProfileEditReferenceCount={
            derived.selectedProfileEditReferenceCount
          }
          selectedProfileReferenceCount={derived.selectedProfileReferenceCount}
          selectedProfileUsableReferenceCount={
            derived.selectedProfileUsableReferenceCount
          }
        />

        <ProfileReferenceBuilder
          derived={derived}
          forms={forms}
          isAddingExample={isAddingExample}
          isCreatingMediaAsset={isCreatingMediaAsset}
          selectedProfile={selectedProfile}
        />

        <ProfileExamplesList
          isLoadingExamples={isLoadingExamples}
          selectedProfile={selectedProfile}
          visibleExamples={derived.visibleExamples}
        />

        <ProfileWorkspaceMediaLab
          activeAlignmentJobCount={derived.activeAlignmentJobCount}
          activeIndexJobCount={derived.activeIndexJobCount}
          cancellingMediaAlignmentJobIds={cancellingMediaAlignmentJobIds}
          editAssetOptions={derived.editAssetOptions}
          handleCreateMediaPair={forms.handleCreateMediaPair}
          isCreatingMediaAlignmentJob={isCreatingMediaAlignmentJob}
          isCreatingMediaIndexJob={isCreatingMediaIndexJob}
          isCreatingMediaPair={isCreatingMediaPair}
          isLoadingMediaAlignmentJobs={isLoadingMediaAlignmentJobs}
          isLoadingMediaIndexJobs={isLoadingMediaIndexJobs}
          isLoadingMediaPairs={isLoadingMediaPairs}
          latestAlignmentJobByPairId={derived.latestAlignmentJobByPairId}
          latestIndexJobByAssetId={derived.latestIndexJobByAssetId}
          mediaAlignmentMatches={mediaAlignmentMatches}
          mediaAssetById={derived.mediaAssetById}
          mediaEditPairById={derived.mediaEditPairById}
          mediaEditPairs={mediaEditPairs}
          onCancelMediaAlignmentJob={onCancelMediaAlignmentJob}
          onCreateMediaAlignmentJob={onCreateMediaAlignmentJob}
          onCreateMediaIndexJob={onCreateMediaIndexJob}
          pairNote={forms.pairNote}
          pairScope={forms.pairScope}
          pairTitle={forms.pairTitle}
          recentBackgroundActivity={derived.recentBackgroundActivity}
          selectedEditAssetId={forms.selectedEditAssetId}
          selectedProfileId={selectedProfileId}
          selectedVodAssetId={forms.selectedVodAssetId}
          setPairNote={forms.setPairNote}
          setPairScope={forms.setPairScope}
          setPairTitle={forms.setPairTitle}
          setSelectedEditAssetId={forms.setSelectedEditAssetId}
          setSelectedVodAssetId={forms.setSelectedVodAssetId}
          vodAssetOptions={derived.vodAssetOptions}
        />
      </div>
    </section>
  );
}
