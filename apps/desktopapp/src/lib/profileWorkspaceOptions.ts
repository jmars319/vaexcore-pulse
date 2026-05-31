import type { ExampleClipSourceType } from "@vaexcore/pulse-shared-types";

export const sourceTypeOptions: Array<{
  id: ExampleClipSourceType;
  label: string;
  hint: string;
}> = [
  {
    id: "TWITCH_CLIP_URL",
    label: "Twitch clip link",
    hint: "Paste a clip link you may want Pulse to find again.",
  },
  {
    id: "YOUTUBE_SHORT_URL",
    label: "YouTube Short link",
    hint: "Paste a Short link you may want Pulse to find again.",
  },
  {
    id: "LOCAL_FILE_UPLOAD",
    label: "Choose clip file",
    hint: "Choose a clip from your Mac.",
  },
  {
    id: "LOCAL_FILE_PATH",
    label: "Paste clip path",
    hint: "Paste the full path to a clip on your Mac.",
  },
];

export const localOnlySourceTypeOptions = sourceTypeOptions.filter(
  (option) =>
    option.id === "LOCAL_FILE_UPLOAD" || option.id === "LOCAL_FILE_PATH",
);
