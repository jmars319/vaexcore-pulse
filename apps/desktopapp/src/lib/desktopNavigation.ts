export type DesktopPage =
  | "projects"
  | "new-analysis"
  | "candidate-review"
  | "suite";

export type DesktopNavItem = { id: DesktopPage; label: string };

export const desktopPages: DesktopNavItem[] = [
  { id: "new-analysis", label: "Scan Intake" },
  { id: "candidate-review", label: "Review" },
  { id: "projects", label: "Backlog" },
  { id: "suite", label: "Suite" },
];

export function initialDesktopPage(): DesktopPage {
  const requested = new URLSearchParams(window.location.search).get("page");
  return desktopPages.some((page) => page.id === requested)
    ? (requested as DesktopPage)
    : "new-analysis";
}
