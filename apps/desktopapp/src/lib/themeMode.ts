export type ThemeMode = "dark" | "light";

export const themeModeStorageKey = "vaexcore-pulse.desktop.theme-mode";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function persistThemeMode(themeMode: ThemeMode) {
  applyThemeMode(themeMode);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(themeModeStorageKey, themeMode);
  }
}

export function applyThemeMode(themeMode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = themeMode;
  document.documentElement.style.colorScheme = themeMode;
}

export function resolveInitialThemeMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }

  const savedThemeMode = window.localStorage.getItem(themeModeStorageKey);
  return savedThemeMode === "light" ? "light" : "dark";
}
