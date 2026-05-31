import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { VaexcorePulseLogo } from "@vaexcore/pulse-ui";
import { ProfileSetupSettingsSection } from "./ProfileSetupSettingsSection";
import {
  isSettingsSectionId,
  resolveInitialSettingsSection,
  scrollSettingsWindowToTop,
  settingsSectionSelectedEvent,
  settingsSections,
  type SettingsSectionId,
} from "../lib/settingsWindowBehavior";
import { isTauriRuntime } from "../lib/tauriRuntime";
import {
  persistThemeMode,
  resolveInitialThemeMode,
  type ThemeMode,
} from "../lib/themeMode";

export function SettingsWindowApp() {
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionId>(() => resolveInitialSettingsSection());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    resolveInitialThemeMode(),
  );

  useEffect(() => {
    persistThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    scrollSettingsWindowToTop();
  }, [activeSettingsSection]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let isSubscribed = true;
    let unlistenSettingsSection: (() => void) | undefined;

    void listen<SettingsSectionId>(settingsSectionSelectedEvent, (event) => {
      if (isSettingsSectionId(event.payload)) {
        setActiveSettingsSection(event.payload);
        scrollSettingsWindowToTop();
      }
    }).then((unlisten) => {
      if (!isSubscribed) {
        unlisten();
        return;
      }

      unlistenSettingsSection = unlisten;
    });

    return () => {
      isSubscribed = false;
      unlistenSettingsSection?.();
    };
  }, []);

  function handleThemeModeChange(nextThemeMode: ThemeMode) {
    setThemeMode(nextThemeMode);
    persistThemeMode(nextThemeMode);

    if (isTauriRuntime()) {
      void emit("theme-mode-changed", nextThemeMode);
    }
  }

  return (
    <main className="settings-shell">
      <section aria-labelledby="settings-title" className="settings-window">
        <header className="settings-header">
          <div className="settings-brand-mark">
            <VaexcorePulseLogo />
          </div>
          <div>
            <p className="eyebrow">vaexcore pulse</p>
            <h1 id="settings-title">Settings</h1>
          </div>
        </header>

        <div className="settings-layout">
          <nav aria-label="Settings sections" className="settings-section-nav">
            {settingsSections.map((section) => (
              <button
                aria-current={
                  activeSettingsSection === section.id ? "page" : undefined
                }
                className={
                  activeSettingsSection === section.id ? "active" : undefined
                }
                key={section.id}
                onClick={() => setActiveSettingsSection(section.id)}
                type="button"
              >
                <strong>{section.label}</strong>
                <span>{section.detail}</span>
              </button>
            ))}
          </nav>

          <div className="settings-section-panel">
            {activeSettingsSection === "profile-setup" ? (
              <ProfileSetupSettingsSection />
            ) : null}

            {activeSettingsSection === "appearance" ? (
              <section className="settings-card">
                <div>
                  <span className="detail-label">Appearance</span>
                  <h2>Color mode</h2>
                  <p>
                    Keep the logo palette in a calmer dark or brighter light
                    workspace.
                  </p>
                </div>
                <div aria-label="Color mode" className="segmented-control">
                  <button
                    aria-pressed={themeMode === "dark"}
                    className={themeMode === "dark" ? "active" : undefined}
                    onClick={() => handleThemeModeChange("dark")}
                    type="button"
                  >
                    Dark
                  </button>
                  <button
                    aria-pressed={themeMode === "light"}
                    className={themeMode === "light" ? "active" : undefined}
                    onClick={() => handleThemeModeChange("light")}
                    type="button"
                  >
                    Light
                  </button>
                </div>
              </section>
            ) : null}

            {activeSettingsSection === "window-behavior" ? (
              <section className="settings-card">
                <span className="detail-label">Window behavior</span>
                <h2>Close window vs quit app</h2>
                <ul className="settings-note-list">
                  <li>
                    <strong>Close Main Window</strong>
                    <span>
                      Hides the workspace. Pulse stays open from the menu.
                    </span>
                  </li>
                  <li>
                    <strong>Quit vaexcore pulse</strong>
                    <span>
                      Closes Pulse and stops scans or background work.
                    </span>
                  </li>
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
