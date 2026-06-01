import { lazy, Suspense } from "react";
import { isSettingsWindow } from "./lib/settingsWindowBehavior";

const DesktopApp = lazy(() => import("./DesktopApp"));
const SettingsWindowApp = lazy(() =>
  import("./components/SettingsWindowApp").then((module) => ({
    default: module.SettingsWindowApp,
  })),
);

export default function App() {
  return (
    <Suspense fallback={null}>
      {isSettingsWindow() ? <SettingsWindowApp /> : <DesktopApp />}
    </Suspense>
  );
}
