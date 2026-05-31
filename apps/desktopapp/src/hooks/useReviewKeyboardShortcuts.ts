import { useEffect } from "react";
import type { DesktopPage } from "../lib/desktopNavigation";
import { isEditableTarget } from "../lib/sessionPresentation";

type UseReviewKeyboardShortcutsOptions = {
  activePage: DesktopPage;
  onAccept: () => void;
  onExpandResolution: () => void;
  onExpandSetup: () => void;
  onOpenMomentPreview: (candidateId: string | null) => void;
  onReject: () => void;
  onSelectNextPending: () => void;
  onSelectNextVisible: () => void;
  onSelectPreviousVisible: () => void;
  selectedCandidateId: string | null;
};

export function useReviewKeyboardShortcuts({
  activePage,
  onAccept,
  onExpandResolution,
  onExpandSetup,
  onOpenMomentPreview,
  onReject,
  onSelectNextPending,
  onSelectNextVisible,
  onSelectPreviousVisible,
  selectedCandidateId,
}: UseReviewKeyboardShortcutsOptions) {
  useEffect(() => {
    if (activePage !== "candidate-review") {
      return;
    }

    function handleReviewKeydown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "/") {
        const searchInput = document.getElementById(
          "review-search-input",
        ) as HTMLInputElement | null;
        if (!searchInput) {
          return;
        }

        event.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      const normalizedKey = event.key.toLowerCase();
      if (normalizedKey === "k") {
        event.preventDefault();
        onAccept();
        return;
      }

      if (normalizedKey === "x") {
        event.preventDefault();
        onReject();
        return;
      }

      if (normalizedKey === "v") {
        event.preventDefault();
        onOpenMomentPreview(selectedCandidateId);
        return;
      }

      if (normalizedKey === "n") {
        event.preventDefault();
        onSelectNextPending();
        return;
      }

      if (normalizedKey === "j") {
        event.preventDefault();
        onSelectPreviousVisible();
        return;
      }

      if (normalizedKey === "l") {
        event.preventDefault();
        onSelectNextVisible();
        return;
      }

      if (event.key === "[") {
        event.preventDefault();
        onExpandSetup();
        return;
      }

      if (event.key === "]") {
        event.preventDefault();
        onExpandResolution();
      }
    }

    window.addEventListener("keydown", handleReviewKeydown);
    return () => {
      window.removeEventListener("keydown", handleReviewKeydown);
    };
  }, [
    activePage,
    onAccept,
    onExpandResolution,
    onExpandSetup,
    onOpenMomentPreview,
    onReject,
    onSelectNextPending,
    onSelectNextVisible,
    onSelectPreviousVisible,
    selectedCandidateId,
  ]);
}
