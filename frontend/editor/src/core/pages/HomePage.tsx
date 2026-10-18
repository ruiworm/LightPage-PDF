import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useSidebarContext } from "@app/contexts/SidebarContext";
import { useDocumentMeta } from "@app/hooks/useDocumentMeta";
import { getToolOgImage } from "@app/data/ogImage";
import urlSeoOverrides from "@app/data/urlSeoOverrides.json";
import { useBaseUrl } from "@app/hooks/useBaseUrl";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { useFileContext } from "@app/contexts/file/fileHooks";
import {
  useNavigationState,
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { isApplyingRestoredView } from "@app/services/workbenchSession";
import { useViewer } from "@app/contexts/ViewerContext";
import { useLocation, useNavigate } from "react-router-dom";

import RightSidebar from "@app/components/tools/RightSidebar";
import { ReaderRail } from "@app/components/viewer/readerRail/ReaderRail";
import Workbench from "@app/components/layout/Workbench";
import { CompactWorkspace } from "@app/components/layout/CompactWorkspace";
import { useViewActive } from "@app/components/layout/RetainedView";
import FileSidebar from "@app/components/shared/FileSidebar";
import FileManager from "@app/components/FileManager";
import { getDefaultWorkbenchForFileCount } from "@app/utils/homePageNavigation";
import { EDITOR_BASENAME } from "@app/routes/editorBasename";
import { READER_PATH } from "@app/routes/readerRoute";
import { rememberSettingsOrigin } from "@app/utils/settingsNavigation";
import { HomePageExtensions } from "@app/components/home/HomePageExtensions";
import { PolicyAutoRunController } from "@app/components/policies/PolicyAutoRunController";
import { usePoliciesEnabled } from "@app/components/policies/usePoliciesEnabled";
import { QuickNavHostBridge } from "@app/components/shared/quickNav/QuickNavHostBridge";
import type { QuickNavToolReasons } from "@app/contexts/QuickNavHostContext";
import { usePreferences } from "@app/contexts/PreferencesContext";
import {
  getToolDisabledReason,
  getDisabledLabel,
} from "@app/components/tools/fullscreen/shared";
import {
  consumeReaderModeFromPreference,
  consumeReaderModeRequest,
} from "@app/utils/pendingReaderMode";
import { FilesPageProvider } from "@app/contexts/FilesPageContext";
import { useProcessingFolderCreation } from "@app/hooks/useProcessingFolderCreation";
import { consumeProcessingFolderCreationRequest } from "@app/utils/pendingProcessingFolderCreation";

import "@app/components/layout/WorkspaceFrame.css";

/**
 * The wings' slide is `--wings-ms` (dimensions.css). Read from the document so one
 * value drives both, with the literal as the fallback for a test environment that
 * loads no stylesheet, and a frame of headroom so the unmount never clips the
 * last frame of the animation.
 */
const WINGS_FALLBACK_MS = 220;
const WINGS_HEADROOM_MS = 60;

function wingsDurationMs(): number {
  if (typeof window === "undefined") return WINGS_FALLBACK_MS;
  const token = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--wings-ms")
    .trim();
  const parsed = Number.parseFloat(token);
  if (!Number.isFinite(parsed) || parsed <= 0) return WINGS_FALLBACK_MS;
  return token.endsWith("ms") ? parsed : parsed * 1000;
}

export default function HomePage() {
  const viewActive = useViewActive();
  const { t, i18n } = useTranslation();
  const policiesEnabled = usePoliciesEnabled();
  const { sidebarRefs } = useSidebarContext();

  const { quickAccessRef } = sidebarRefs;

  const {
    selectedTool,
    selectedToolKey,
    handleToolSelect,
    handleBackToTools,
    readerMode,
    setReaderMode,
    toolAvailability,
    customWorkbenchViews,
    toolRegistry,
  } = useToolWorkflow();

  const navigate = useNavigate();
  const { config } = useAppConfig();
  const processingFolderCreation = useProcessingFolderCreation();
  const isMobile = useIsMobile();
  const location = useLocation();
  useEffect(() => {
    if (
      viewActive &&
      processingFolderCreation.open &&
      consumeProcessingFolderCreationRequest()
    ) {
      processingFolderCreation.open();
    }
  }, [viewActive, location.key, processingFolderCreation.open]);

  // Settings is its own page; it restores the recorded origin on Back.
  const openSettings = useCallback(() => {
    rememberSettingsOrigin();
    navigate("/settings");
  }, [navigate]);

  const { activeFiles } = useFileContext();
  const navigationState = useNavigationState();
  const { requestNavigation } = useNavigationGuard();

  // From the processor's Reader entry. Ref-guarded: one-shot, and StrictMode double-invokes.
  const consumedReaderRequest = useRef(false);
  useEffect(() => {
    if (!viewActive) return;
    if (consumedReaderRequest.current) return;
    consumedReaderRequest.current = true;
    if (consumeReaderModeRequest()) setReaderMode(true);
  }, [viewActive, setReaderMode]);
  const { actions } = useNavigationActions();

  const { searchInterfaceActions, activeFileId } = useViewer();

  // Find in document lives in the rail, not the bar reading hides, so the
  // shortcut opens it where the reader already is. e.code, for non-QWERTY
  // layouts.
  useEffect(() => {
    if (!viewActive || !readerMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const combo = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
      if (!combo || e.code !== "KeyF") return;
      // Same carve-out the search itself makes: a dialog owns the keyboard.
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"]'))
        return;
      e.preventDefault();
      searchInterfaceActions.open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewActive, readerMode, searchInterfaceActions]);

  const goToDefaultState = useCallback(() => {
    handleBackToTools();
    actions.setWorkbench(getDefaultWorkbenchForFileCount(activeFiles.length));
  }, [handleBackToTools, actions, activeFiles.length]);

  const { preferences, updatePreference } = usePreferences();
  const goToStartupView = useCallback(() => {
    // The router transitions its updates; the tool reset must see the same destination.
    startTransition(() => {
      goToDefaultState();
      if (preferences.defaultStartupView === "read") {
        if (location.pathname !== READER_PATH) navigate(READER_PATH);
        setReaderMode(true);
      } else if (preferences.defaultStartupView === "automate")
        handleToolSelect("automate");
    });
  }, [
    goToDefaultState,
    preferences.defaultStartupView,
    location.pathname,
    navigate,
    setReaderMode,
    handleToolSelect,
  ]);

  // Reconcile route and workspace only on transitions, or the old route can undo a view change.
  const derivedFromPath = actions.viewDerivedFromPathRef;
  useEffect(() => {
    if (!viewActive) return;
    if (derivedFromPath.current === location.pathname) return;
    if (location.pathname.startsWith("/files")) {
      if (navigationState.workbench !== "myFiles") {
        actions.setWorkbench("myFiles");
      }
    } else if (navigationState.workbench === "myFiles") {
      // A restore is reopening a recorded view onto files still loading. Leave the
      // path unmarked so the correction runs once those files land.
      if (isApplyingRestoredView()) return;
      actions.setWorkbench(getDefaultWorkbenchForFileCount(activeFiles.length));
    }
    derivedFromPath.current = location.pathname;
    // Deliberately not keyed on the workbench: this reacts to the path only.
  }, [
    viewActive,
    location.pathname,
    actions,
    derivedFromPath,
    activeFiles.length,
  ]);

  // View moved, so the path follows. Pushed, not replaced, so Back leaves the library.
  const wasInLibraryRef = useRef(navigationState.workbench === "myFiles");
  useEffect(() => {
    if (!viewActive) return;
    const inLibrary = navigationState.workbench === "myFiles";
    if (inLibrary === wasInLibraryRef.current) return;
    wasInLibraryRef.current = inLibrary;
    const onFilesPath = location.pathname.startsWith("/files");
    if (inLibrary && !onFilesPath) {
      navigate("/files");
    } else if (!inLibrary && onFilesPath && !readerMode) {
      // Reading also leaves the library, and its own effect names the path it
      // leaves for. Both navigating puts the editor between the two in history,
      // so Back out of reading would land somewhere the user never went.
      navigate(EDITOR_BASENAME);
    }
  }, [
    viewActive,
    navigationState.workbench,
    location.pathname,
    navigate,
    readerMode,
  ]);

  // Path moved, so the path is the cause. The ref starts null so mount counts too:
  // that is what makes a reload land back in reading, and what takes you out of it
  // when the library moves the path to its own.
  const readerDerivedFromPath = useRef<string | null>(null);
  useEffect(() => {
    if (!viewActive) return;
    if (readerDerivedFromPath.current === location.pathname) return;
    const isMount = readerDerivedFromPath.current === null;
    readerDerivedFromPath.current = location.pathname;
    const onReadPath = location.pathname.startsWith(READER_PATH);
    // The startup-view preference can open reading before this page mounts (the
    // desktop shell holds the page back until its auth check settles). Reading is
    // then the cause and the path follows it, rather than the path closing it.
    if (
      isMount &&
      readerMode &&
      !onReadPath &&
      consumeReaderModeFromPreference()
    ) {
      navigate(READER_PATH, { replace: true });
      return;
    }
    if (onReadPath !== readerMode) setReaderMode(onReadPath);
  }, [viewActive, location.pathname, readerMode, setReaderMode, navigate]);

  // The wings animate off their own edge, so the unmount waits out the leave rather
  // than happening with it. The rails' stylesheets take them out of flow while it
  // runs, so what is underneath is already in its reading position and nothing
  // reflows twice.
  const [wingsMounted, setWingsMounted] = useState(!readerMode);
  const [wingsPhase, setWingsPhase] = useState<"leaving" | "returning" | null>(
    null,
  );
  const readingRef = useRef(readerMode);
  useEffect(() => {
    if (readingRef.current === readerMode) return;
    readingRef.current = readerMode;
    const slide = wingsDurationMs() + WINGS_HEADROOM_MS;
    if (readerMode) {
      setWingsPhase("leaving");
      const gone = window.setTimeout(() => {
        setWingsPhase(null);
        setWingsMounted(false);
      }, slide);
      return () => window.clearTimeout(gone);
    }
    setWingsMounted(true);
    setWingsPhase("returning");
    const settled = window.setTimeout(() => setWingsPhase(null), slide);
    return () => window.clearTimeout(settled);
  }, [readerMode]);

  // Reading moved, so the path follows. Pushed, not replaced, so Back leaves it.
  const wasReadingRef = useRef(readerMode);
  useEffect(() => {
    if (!viewActive) return;
    if (readerMode === wasReadingRef.current) return;
    wasReadingRef.current = readerMode;
    const onReadPath = location.pathname.startsWith(READER_PATH);
    if (readerMode && !onReadPath) {
      navigate(READER_PATH, {
        replace: consumeReaderModeFromPreference(),
      });
    } else if (!readerMode && onReadPath) {
      navigate(EDITOR_BASENAME);
    }
  }, [viewActive, readerMode, location.pathname, navigate]);

  const hideToolPanel =
    navigationState.workbench === "myFiles" ||
    (customWorkbenchViews.find(
      (v) => v.workbenchId === navigationState.workbench,
    )?.hideToolPanel ??
      false);

  const quickNavToolReasons = useMemo(() => {
    const reasons: QuickNavToolReasons = {};
    for (const id of ["automate", "sharedSign"] as const) {
      const tool = toolRegistry[id];
      if (!tool) continue;
      const disabledReason = getToolDisabledReason(
        id,
        tool,
        toolAvailability,
        config?.premiumEnabled,
      );
      if (!disabledReason) continue;
      const { key, fallback } = getDisabledLabel(disabledReason);
      reasons[id] = t(key, fallback).replace(/:\s*$/, "");
    }
    return reasons;
  }, [toolRegistry, toolAvailability, config?.premiumEnabled, t]);

  const openFromComputerRef = useRef<(() => void) | null>(null);
  // Reading unmounts the sidebar that owns the picker, so a request made there
  // is held until the sidebar is back to answer it.
  const openFromComputerPending = useRef(false);
  const registerOpenFromComputer = useCallback((open: (() => void) | null) => {
    openFromComputerRef.current = open;
    if (open && openFromComputerPending.current) {
      openFromComputerPending.current = false;
      open();
    }
  }, []);
  const openFromComputer = useCallback(() => {
    if (openFromComputerRef.current) {
      openFromComputerRef.current();
      return;
    }
    // Opening a document from disk shows it, and reading is a view of one
    // document, so the picker lands you on what you opened either way.
    openFromComputerPending.current = true;
    setReaderMode(false);
  }, [setReaderMode]);

  const baseUrl = useBaseUrl();

  // Update document meta when tool changes. Convert aliases (e.g. /pdf-to-word)
  // all share the one `convert` tool, so prefer a per-URL SEO override when the
  // path has one - this keeps the hydrated title/description matching the
  // keyword-targeted copy that crawlers see in the prerendered HTML.
  const appName = config?.appNameNavbar || "LightPage PDF";
  // The override copy is English-only (it mirrors the prerendered HTML), so
  // every other locale keeps its translated tool name and description.
  const isEnglish = (i18n.resolvedLanguage || i18n.language || "").startsWith(
    "en",
  );
  const seoOverride = isEnglish
    ? (
        urlSeoOverrides as Record<
          string,
          { title: string; description: string }
        >
      )[location.pathname]
    : undefined;
  const defaultDescription = t(
    "app.description",
    "A free, private PDF editor you can run on any infrastructure.",
  );
  const metaTitle = seoOverride
    ? `${seoOverride.title} - ${appName}`
    : selectedTool
      ? `${selectedTool.name} - ${appName}`
      : appName;
  const metaDescription =
    seoOverride?.description || selectedTool?.description || defaultDescription;
  useDocumentMeta(
    {
      title: metaTitle,
      description: metaDescription,
      ogTitle: metaTitle,
      ogDescription: metaDescription,
      ogImage: getToolOgImage(baseUrl, selectedToolKey),
      ogUrl:
        seoOverride || selectedTool
          ? `${baseUrl}${window.location.pathname}`
          : baseUrl,
    },
    viewActive,
  );

  return (
    <div className="h-screen overflow-hidden">
      {viewActive && <HomePageExtensions />}
      {viewActive && processingFolderCreation.dialog}
      {viewActive && policiesEnabled && <PolicyAutoRunController />}
      {viewActive && (
        <QuickNavHostBridge
          themeMode={preferences.theme}
          onSetTheme={(mode) => updatePreference("theme", mode)}
          requestNavigation={requestNavigation}
          readerMode={readerMode}
          fileLibrary={navigationState.workbench === "myFiles"}
          onSetReaderMode={setReaderMode}
          onGoToDefaultState={goToDefaultState}
          onGoToStartupView={goToStartupView}
          onSelectTool={handleToolSelect}
          activeTool={selectedToolKey}
          onShowFileLibrary={() => actions.setWorkbench("myFiles")}
          onCreateProcessingFolder={processingFolderCreation.open}
          toolReasons={quickNavToolReasons}
          onOpenFromComputer={
            navigationState.workbench === "myFiles"
              ? undefined
              : openFromComputer
          }
        />
      )}
      <FilesPageProvider>
        <CompactWorkspace
          compact={isMobile}
          active={viewActive}
          activeFileId={activeFileId ?? null}
          toolKey={selectedToolKey ?? null}
          toolHasSettings={!hideToolPanel && Boolean(selectedTool?.component)}
          filesVisible={wingsMounted && navigationState.workbench !== "myFiles"}
          toolsVisible={wingsMounted && !hideToolPanel}
          wingsPhase={wingsPhase}
          files={
            <FileSidebar
              ref={quickAccessRef}
              accountHoisted
              onOpenSettings={openSettings}
              onRegisterOpenFromComputer={registerOpenFromComputer}
            />
          }
          tools={<RightSidebar />}
          trailing={
            readerMode &&
            (viewActive ? <ReaderRail /> : <div className="reader-rail" />)
          }
        >
          <Workbench />
        </CompactWorkspace>
        {viewActive && <FileManager selectedTool={selectedTool} />}
      </FilesPageProvider>
    </div>
  );
}
