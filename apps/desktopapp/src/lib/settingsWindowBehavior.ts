import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import type { ExampleClipSourceType } from "@vaexcore/pulse-shared-types";
import { isTauriRuntime } from "./tauriRuntime";

export type SettingsSectionId =
  | "profile-setup"
  | "appearance"
  | "window-behavior";

export const settingsSectionSelectedEvent = "settings-section-selected";
export const profileLibraryChangedEvent = "profile-library-changed";

export type ProfileLibraryChangedPayload = {
  profileId?: string;
};

export const settingsSections: Array<{
  id: SettingsSectionId;
  label: string;
  detail: string;
}> = [
  {
    id: "profile-setup",
    label: "Profile Setup",
    detail: "Profiles and examples that guide future scans.",
  },
  {
    id: "appearance",
    label: "Appearance",
    detail: "Light or dark mode.",
  },
  {
    id: "window-behavior",
    label: "Window Behavior",
    detail: "What happens when you close or quit.",
  },
];

export function isSettingsWindow(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    new URLSearchParams(window.location.search).get("window") === "settings"
  );
}

export function scrollSettingsWindowToTop(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    document
      .querySelector(".settings-shell")
      ?.scrollTo({ top: 0, behavior: "auto" });
  });
}

export function openSettingsWindowFromUi(section?: SettingsSectionId): void {
  if (!isTauriRuntime()) {
    const sectionQuery = section
      ? `&section=${encodeURIComponent(section)}`
      : "";
    const settingsUrl = `${window.location.origin}${window.location.pathname}?window=settings${sectionQuery}`;
    window.open(settingsUrl, "vaexcore-pulse-settings", "width=760,height=660");
    return;
  }

  void invoke("open_settings_window", { section: section ?? null }).catch(
    (error) => {
      console.error("Unable to open settings window", error);
    },
  );
}

export function emitProfileSetupChanged(profileId?: string): void {
  if (!isTauriRuntime()) {
    return;
  }

  void emit(profileLibraryChangedEvent, { profileId }).catch((error) => {
    console.error("Unable to notify profile setup changes", error);
  });
}

export function resolveInitialSettingsSection(): SettingsSectionId {
  if (typeof window === "undefined") {
    return "profile-setup";
  }

  const section = new URLSearchParams(window.location.search).get("section");
  return isSettingsSectionId(section) ? section : "profile-setup";
}

export function isSettingsSectionId(
  value: unknown,
): value is SettingsSectionId {
  return (
    value === "profile-setup" ||
    value === "appearance" ||
    value === "window-behavior"
  );
}

export function formatProfileSetupError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Profile setup is unavailable right now.";
  }

  if (isLocalServiceUnavailableError(error)) {
    return "Profile setup is still starting. This should clear in a few seconds.";
  }

  return error.message;
}

export function isLocalServiceUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("could not reach its local service") ||
      error.message.includes("Pulse is still starting") ||
      error.message.includes("Pulse did not finish starting") ||
      error.message.includes("Failed to fetch"))
  );
}

export function formatProfileSourceType(
  sourceType: ExampleClipSourceType,
): string {
  if (sourceType === "TWITCH_CLIP_URL") {
    return "Twitch clip";
  }

  if (sourceType === "YOUTUBE_SHORT_URL") {
    return "YouTube Short";
  }

  if (sourceType === "LOCAL_FILE_UPLOAD") {
    return "Local file";
  }

  return "Local path";
}

export function formatStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
