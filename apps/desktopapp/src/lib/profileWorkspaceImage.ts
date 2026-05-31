import { convertFileSrc } from "@tauri-apps/api/core";

export function toLocalImageSrc(imagePath: string) {
  try {
    return convertFileSrc(imagePath);
  } catch {
    return imagePath;
  }
}
