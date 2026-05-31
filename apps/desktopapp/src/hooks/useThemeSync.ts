import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../lib/tauriRuntime";
import {
  isThemeMode,
  persistThemeMode,
  themeModeStorageKey,
  type ThemeMode,
} from "../lib/themeMode";

export function useThemeSync(
  themeMode: ThemeMode,
  setThemeMode: (themeMode: ThemeMode) => void,
) {
  useEffect(() => {
    persistThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    let isSubscribed = true;
    let unlistenTheme: (() => void) | undefined;

    function handleStorage(event: StorageEvent) {
      if (
        event.key === themeModeStorageKey &&
        isThemeMode(event.newValue) &&
        event.newValue !== themeMode
      ) {
        setThemeMode(event.newValue);
      }
    }

    window.addEventListener("storage", handleStorage);

    if (isTauriRuntime()) {
      void listen<ThemeMode>("theme-mode-changed", (event) => {
        if (isThemeMode(event.payload)) {
          setThemeMode(event.payload);
        }
      }).then((unlisten) => {
        if (!isSubscribed) {
          unlisten();
          return;
        }

        unlistenTheme = unlisten;
      });
    }

    return () => {
      isSubscribed = false;
      window.removeEventListener("storage", handleStorage);
      unlistenTheme?.();
    };
  }, [setThemeMode, themeMode]);
}
