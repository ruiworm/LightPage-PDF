import { useEffect } from "react";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { useViewActive } from "@app/components/layout/RetainedView";

// Guard unsaved edits on BOTH exit routes.
//
// `beforeunload` only covers a full-page unload (tab close / reload / external
// navigation). Switching tools inside the SPA never triggers it, so on its own
// this hook let the editor drop every edit silently. NavigationContext is the
// app's own in-app guard - it is what PageEditor uses - and it drives
// NavigationWarningModal.
export function useUnsavedChangesGuard(dirty: boolean): void {
  const viewActive = useViewActive();
  const { actions } = useNavigationActions();
  const setHasUnsavedChanges = actions.setHasUnsavedChanges;

  useEffect(() => {
    if (!viewActive || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, viewActive]);

  useEffect(() => {
    if (!viewActive) return;
    setHasUnsavedChanges(dirty);
    // Clear on unmount so a stale flag cannot block navigation after the
    // editor is gone.
    return () => setHasUnsavedChanges(false);
  }, [dirty, viewActive, setHasUnsavedChanges]);
}
