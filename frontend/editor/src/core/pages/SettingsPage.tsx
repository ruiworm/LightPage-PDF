import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LoadingFallback } from "@app/components/shared/LoadingFallback";
import { useActiveHeading } from "@app/components/settings/useActiveHeading";
import LoginRequiredBanner from "@app/components/shared/config/LoginRequiredBanner";
import { useSettingsNav } from "@app/components/settings/useSettingsNav";
import type { NavKey } from "@app/components/shared/config/types";
import {
  UnsavedChangesProvider,
  useUnsavedChanges,
} from "@app/contexts/UnsavedChangesContext";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { READER_PATH } from "@app/routes/readerRoute";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { stripBasePath } from "@app/constants/app";
import { takeSettingsOrigin } from "@app/utils/settingsNavigation";
import "@app/components/shared/config/settingsSections.css";
import "@app/pages/SettingsPage.css";

const ANCHOR_POLL_MS = 150;
const ANCHOR_WAIT_MS = 5000;
const HIDDEN_SETTINGS_GROUPS = new Set(["server", "monitoring", "about"]);

/** `/settings/people` -> "people". Null for `/settings` itself. */
function sectionFromPath(pathname: string): string | null {
  const match = stripBasePath(pathname).match(/\/settings\/([^/?#]+)/);
  return match?.[1] ?? null;
}

const SettingsPageInner: React.FC = () => {
  const { t } = useTranslation();
  const [contentRef, setContentRef] = useState<HTMLDivElement | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { confirmIfDirty } = useUnsavedChanges();
  const { preferences, updatePreference } = usePreferences();
  const goToStartupView = () => {
    const view = preferences.defaultStartupView;
    navigate(
      view === "read"
        ? READER_PATH
        : view === "automate"
          ? "/automate"
          : EDITOR_BASENAME,
    );
  };
  // Leaving restores where the user came from (the editor, the processor,
  // wherever) by replacement, or the editor for a deep link with no origin.
  const leave = useCallback(() => {
    navigate(takeSettingsOrigin() ?? EDITOR_BASENAME, { replace: true });
  }, [navigate]);

  const {
    sections: availableSections,
    overlay,
    aliases,
    pending,
  } = useSettingsNav(leave);
  const sections = useMemo(
    () =>
      availableSections.filter(
        (section) => !HIDDEN_SETTINGS_GROUPS.has(section.id ?? ""),
      ),
    [availableSections],
  );
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const urlSection = sectionFromPath(location.pathname);
  const activeItem = useMemo(
    () => items.find((i) => i.key === urlSection) ?? null,
    [items, urlSection],
  );
  // The URL always names what is shown. `/settings` and an unknown key land on
  // the first section; a retired key (an old bookmark, an older search result)
  // follows its alias to whatever replaced it.
  useEffect(() => {
    // `pending` matters as much as an empty list: the permission-gated sections
    // arrive a request later, so a deep link to one of them is not unknown yet.
    if (items.length === 0 || activeItem || pending) return;
    const target =
      (urlSection && aliases?.[urlSection]) ??
      items.find((i) => !i.disabled)?.key ??
      items[0].key;
    // The hash rides along: an aliased bookmark addresses a control, and the
    // control it names is still there under whatever absorbed its section.
    navigate(`/settings/${target}${location.search}${location.hash}`, {
      replace: true,
    });
  }, [
    items,
    activeItem,
    pending,
    urlSection,
    aliases,
    location.search,
    location.hash,
    navigate,
  ]);

  // Replace, not push: Back should leave settings, not walk the tabs you opened.
  const switchSection = useCallback(
    (key: NavKey) => {
      navigate(`/settings/${key}`, { replace: true });
    },
    [navigate],
  );

  // The app navigation also leaves settings, so keep the unsaved-change guard.
  const requestNavigation = useCallback(
    (go: () => void) => {
      void confirmIfDirty().then((ok) => {
        if (ok) go();
      });
    },
    [confirmIfDirty],
  );

  // Sections dispatch `appConfig:navigate` to send the user to a sibling tab.
  useEffect(() => {
    const handler = (ev: Event) => {
      const key = (ev as CustomEvent<{ key?: NavKey }>).detail?.key;
      if (key) switchSection(key);
    };
    window.addEventListener("appConfig:navigate", handler);
    return () => window.removeEventListener("appConfig:navigate", handler);
  }, [switchSection]);

  // Keep deep links without observing headings for the removed navigation.
  const headings = useMemo(() => [], []);
  const { focus: focusHeading } = useActiveHeading(contentRef, headings);

  const anchor = decodeURIComponent(location.hash.replace(/^#/, ""));
  const activeKey = activeItem?.key;

  // Deep link: /settings/{section}#{slug} scrolls to and briefly highlights one
  // control. The slug is the only address; the super search builds the same URL.
  //
  // Keyed on the section key, never on the item object: the nav builders return
  // fresh arrays each render, so depending on the item would re-arm the jump on
  // every scroll-spy re-render and pin the reader to the anchor. Sections mount
  // lazily, so it polls for the target instead of firing once and missing it.
  useEffect(() => {
    if (!anchor || !activeKey) return;
    let raf = 0;
    let timer = 0;
    const giveUpAt = Date.now() + ANCHOR_WAIT_MS;
    const attempt = () => {
      if (document.getElementById(anchor)) {
        raf = window.requestAnimationFrame(() => focusHeading(anchor));
      } else if (Date.now() < giveUpAt) {
        timer = window.setTimeout(attempt, ANCHOR_POLL_MS);
      }
    };
    timer = window.setTimeout(attempt, ANCHOR_POLL_MS);
    return () => {
      window.clearTimeout(timer);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [activeKey, anchor, focusHeading]);

  // Sections that bring their own page header get the whole pane.
  const fullBleed = activeItem?.fullBleed ?? false;

  return (
    <div className="settings-page" data-tour="settings-modal">
      <QuickNavHostBridge
        themeMode={preferences.theme}
        onSetTheme={(mode) => updatePreference("theme", mode)}
        requestNavigation={requestNavigation}
        onGoToStartupView={goToStartupView}
      />

      <main
        className="settings-page__main modal-content"
        data-tour="settings-content-area"
      >
        <div className="modal-content-scroll" ref={setContentRef}>
          <div className={`modal-body${fullBleed ? " is-full-bleed" : ""}`}>
            {activeItem && !fullBleed && (
              <header className="settings-page__header">
                <h1 className="settings-page__title">
                  {activeItem.key === "general"
                    ? t("settings.title", "Settings")
                    : activeItem.label}
                </h1>
              </header>
            )}
            {/* Once, here: every admin section used to draw this itself, so an
                admin with login off met the same block on all thirteen. */}
            <LoginRequiredBanner show={activeItem?.disabled ?? false} />
            {/* A loading section keeps the page header and app navigation visible. */}
            <Suspense fallback={<LoadingFallback />}>
              {activeItem?.component}
            </Suspense>
          </div>
        </div>
      </main>

      {overlay}
    </div>
  );
};

/** Settings in a single content pane beneath the app navigation. */
export default function SettingsPage() {
  return (
    <UnsavedChangesProvider>
      <SettingsPageInner />
    </UnsavedChangesProvider>
  );
}
