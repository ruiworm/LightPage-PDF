import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { AppNavigationBar } from "@app/components/shared/quickNav/AppNavigationBar";
import type { QuickNavEntry } from "@app/components/shared/quickNav/QuickNavRailBase";
import { useQuickNavHost } from "@app/contexts/QuickNavHostContext";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { PORTAL_BASENAME } from "@app/routes/portalBasename";
import { stripBasePath } from "@app/constants/app";
import { rememberSettingsOrigin } from "@app/utils/settingsNavigation";

import { Icon } from "@app/ui/Icon";
const SIZE = "1.125rem";

/** Entries come from the URL, not either app's context, so navigation survives a switch. */
export function QuickNavRailHost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const host = useQuickNavHost();
  const appMounted = Boolean(host?.appMounted);
  const path = stripBasePath(pathname);
  const inSettings = path.startsWith("/settings");
  const inPortal = path.startsWith(PORTAL_BASENAME);
  // Settings and the docs browser are pages in their own right, so neither app
  // is the current one while you are on them.
  const inEditor = !inPortal && !inSettings;

  // Only the app knows its own default state.
  const returnHome = () => {
    const reset = host?.actions.current?.goToDefaultState;
    if (reset) reset();
    else navigate(inPortal ? PORTAL_BASENAME : EDITOR_BASENAME);
  };

  // The brand follows the user's startup view, which can be the reader.
  const goToStartupView = () => {
    const start = host?.actions.current?.goToStartupView;
    if (start) start();
    else returnHome();
  };

  // Guarded where the app supplies a guard, so leaving mid-edit still prompts.
  const guarded = (leave: () => void) => {
    const guard = host?.actions.current?.requestNavigation;
    if (guard) guard(leave);
    else leave();
  };

  const go = (to: string) => guarded(() => navigate(to));

  const editor: QuickNavEntry = {
    id: "editor",
    label: t("quickNav.editor", "Editor"),
    icon: <Icon name="pencil" size={SIZE} filled={inEditor} />,
    current: inEditor && !host?.fileLibrary,
    onClick: () => {
      if (inEditor) {
        returnHome();
        return;
      }
      go(EDITOR_BASENAME);
    },
  };

  const surfaces: QuickNavEntry[] = [editor];

  const within: QuickNavEntry[] = [
    {
      id: "files",
      label: t("fileSidebar.myFiles", "File library"),
      icon: <Icon name="folder" size={SIZE} />,
      current: inEditor && Boolean(host?.fileLibrary),
      testId: "my-files-button",
      // Through the app where possible: the library is a view, not a route. From the
      // processor there is no editor to ask, so the path carries it and HomePage seeds
      // the view on arrival. Unwrapped: setting the view runs the app's own
      // unsaved-changes check, and asking twice leaves the second ask nowhere to
      // prompt.
      onClick: () => {
        const show = host?.actions.current?.showFileLibrary;
        // Unwrapped: setting the view runs the app's own unsaved-changes check, and
        // asking twice leaves the second ask with nowhere to prompt.
        if (show) show();
        else go("/files");
      },
    },
  ];

  const openSettings = () => {
    const target = "/settings/general";
    if (inSettings) {
      navigate(target, { replace: true });
      return;
    }
    rememberSettingsOrigin();
    go(target);
  };

  // A route that isn't the app hides the bar - see useSuppressQuickNavRail.
  if (!appMounted || host?.chromeless) return null;

  return (
    <AppNavigationBar
      entries={[...within, ...surfaces]}
      onReturnHome={() => guarded(goToStartupView)}
      onOpenSettings={openSettings}
      settingsActive={inSettings}
      themeMode={host?.themeMode ?? "system"}
      onSetTheme={(mode) => host?.actions.current?.setTheme?.(mode)}
    />
  );
}
