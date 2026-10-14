import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense,
  lazy,
  memo,
} from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { Box, Loader, Center, Stack, Text } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useAllFiles } from "@app/contexts/FileContext";
import {
  useNavigationState,
  useNavigationActions,
} from "@app/contexts/NavigationContext";
import { isBaseWorkbench } from "@app/types/workbench";
import { useSigningOverlay } from "@app/contexts/SigningOverlayContext";
import styles from "@app/components/layout/Workbench.module.css";

import WorkbenchBar from "@app/components/shared/WorkbenchBar";
import { useWorkbenchTakeover } from "@app/components/layout/WorkbenchTakeover";
import LandingPage from "@app/components/shared/LandingPage";
import DismissAllErrorsButton from "@app/components/shared/DismissAllErrorsButton";
import { ChatFAB } from "@app/components/chat/ChatFAB";
import {
  RetainedView,
  useViewActive,
} from "@app/components/layout/RetainedView";
import ToolLoadingFallback from "@app/components/tools/ToolLoadingFallback";
import { useIsMobile } from "@app/hooks/useIsMobile";

// Workbench panels are loaded on demand. Viewer pulls in pdfjs-dist and the
// full @embedpdf plugin set; FileEditor/PageEditor are only needed once a file
// is open. Lazy-loading keeps all of that out of the initial bundle.
const PageEditor = memo(
  lazy(() => import("@app/components/pageEditor/PageEditor")),
);
const PageEditorControls = memo(
  lazy(() => import("@app/components/pageEditor/PageEditorControls")),
);
const Viewer = memo(lazy(() => import("@app/components/viewer/Viewer")));
const FileManagerView = lazy(
  () => import("@app/components/filesPage/FileManagerView"),
);

// No props needed - component uses contexts directly
export default function Workbench() {
  const viewActive = useViewActive();
  // A flow that owns the canvas outright (desktop onboarding's Downloads sweep).
  // Null in every other case, which is every case in core.
  const takeover = useWorkbenchTakeover();

  // Use context-based hooks to eliminate all prop drilling
  const { files: activeFiles, fileIds } = useAllFiles();
  const { workbench: currentView } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const setCurrentView = navActions.setWorkbench;
  const {
    previewFile,
    pageEditorFunctions,
    setPreviewFile,
    setPageEditorFunctions,
    customWorkbenchViews,
    readerMode,
  } = useToolWorkflow();

  const { handleToolSelect, selectedToolKey } = useToolWorkflow();
  const { overlay: signingOverlay } = useSigningOverlay();

  // Get navigation state - this is the source of truth

  // Get tool registry from context (instead of direct hook call)
  const { activeFileId } = useViewer();
  const hasFiles = activeFiles.length > 0;
  const viewerVisible =
    !takeover &&
    (currentView === "viewer" || currentView === "fileEditor") &&
    Boolean(
      signingOverlay?.file || (hasFiles && (activeFileId || previewFile)),
    );
  const { t } = useTranslation();

  // The viewer's tool row can be retracted to give the document more height.
  // State lives here (not in WorkbenchBar) so the reopen tab can hang below the
  // bar, outside the bar's overflow-clipped wrapper. Scoped to the viewer.
  const [viewerToolbarCollapsed, setViewerToolbarCollapsed] = useState(false);
  const showReopenTab = currentView === "viewer" && viewerToolbarCollapsed;

  const activeCustomView = customWorkbenchViews.find(
    (v) => v.workbenchId === currentView,
  );
  const textEditorView = customWorkbenchViews.find(
    (v) => v.workbenchId === "custom:pdfTextEditor" && v.data != null,
  );
  const TextEditorCanvas = textEditorView?.component;
  const topControlsAvailable = !activeCustomView?.hideTopControls;
  // Reading hides the bar; the rail's Reader entry is the way back. A takeover hides
  // the switcher and search too: both navigate away from a flow that must finish.
  const isMobile = useIsMobile();
  const showWorkbenchBar =
    topControlsAvailable &&
    !readerMode &&
    !takeover &&
    (currentView !== "myFiles" || isMobile);

  // On the transition, so reading sets the toolbar's start state without locking it.
  const prevReaderModeRef = useRef(readerMode);
  useEffect(() => {
    if (readerMode !== prevReaderModeRef.current) {
      setViewerToolbarCollapsed(readerMode);
      prevReaderModeRef.current = readerMode;
    }
  }, [readerMode]);

  const handlePreviewClose = useCallback(() => {
    setPreviewFile(null);
    const previousMode = sessionStorage.getItem("previousMode");
    if (previousMode === "split") {
      // Use context's handleToolSelect which coordinates tool selection and view changes
      handleToolSelect("split");
      sessionStorage.removeItem("previousMode");
    } else if (previousMode === "compress") {
      handleToolSelect("compress");
      sessionStorage.removeItem("previousMode");
    } else if (previousMode === "convert") {
      handleToolSelect("convert");
      sessionStorage.removeItem("previousMode");
    } else {
      setCurrentView("viewer");
    }
  }, [setPreviewFile, handleToolSelect, setCurrentView]);

  const renderMainContent = () => {
    if (!viewActive) return null;
    // Ahead of every view check: a takeover replaces the canvas whatever the current
    // workbench happens to be, so navigation underneath it cannot surface.
    if (takeover) return takeover;

    // Check if we're showing a custom workbench first
    // Custom workbenches may not require files in FileContext (e.g., sign request workbench)
    if (!isBaseWorkbench(currentView)) {
      // This document session is retained below, independently of the active tab.
      if (currentView === "custom:pdfTextEditor") return null;
      const customView = customWorkbenchViews.find(
        (view) => view.workbenchId === currentView && view.data != null,
      );
      if (customView) {
        const CustomComponent = customView.component;
        return <CustomComponent data={customView.data} />;
      }
    }

    // The file-library workbench is available regardless of whether files are
    // currently loaded into the workbench - it lives on top of the IDB store.
    if (currentView === "myFiles") {
      return <FileManagerView />;
    }

    // Shared Signing drives the main viewer from the sidebar (document + overlays
    // via context), ahead of the empty-state landing page.
    if (currentView === "viewer" && signingOverlay?.file) {
      return null;
    }

    if (activeFiles.length === 0) {
      // Files are open but their bytes are still loading (a cold PDF engine can
      // take seconds). Showing the drop zone here reads as "the click did nothing".
      if (fileIds.length > 0) {
        return (
          <Center h="100%" w="100%">
            <Stack align="center" gap="md">
              <Loader size="lg" />
              <Text c="dimmed" size="sm">
                {t("fileManager.loadingFiles", "Loading files...")}
              </Text>
            </Stack>
          </Center>
        );
      }
      return <LandingPage />;
    }

    switch (currentView) {
      case "fileEditor":
      case "viewer":
        if (!activeFileId && !previewFile) return <LandingPage />;
        return null;

      default:
        return null;
    }
  };

  return (
    <Box
      className="flex-1 h-full min-w-0 relative flex flex-col"
      data-tour="workbench"
      style={{ backgroundColor: "var(--c-bg)", minWidth: 0 }}
    >
      {showWorkbenchBar && (
        <div className={styles.workbenchBarShell}>
          <div className={styles.workbenchBarWrapper}>
            <div className={styles.workbenchBarInner}>
              <WorkbenchBar
                currentView={currentView}
                setCurrentView={setCurrentView}
                hasFiles={hasFiles}
                viewerToolbarCollapsed={viewerToolbarCollapsed}
                onCollapseViewerToolbar={setViewerToolbarCollapsed}
              />
            </div>
          </div>
          {/* Reopen tab for the retracted viewer tool row. */}
          {showReopenTab && (
            <Button
              type="button"
              variant="quiet"
              className={styles.workbenchBarReopenTab}
              onClick={() => setViewerToolbarCollapsed(false)}
              aria-expanded={false}
              aria-label={t("workbenchBar.showToolbar", "Show toolbar")}
              title={t("workbenchBar.showToolbar", "Show toolbar")}
              leftSection={<Icon name="chevron-down" size={"1rem"} />}
            />
          )}
        </div>
      )}

      {/* Dismiss All Errors Button */}
      <DismissAllErrorsButton />

      {/* Floating AI chat button + panel */}
      {viewActive &&
        currentView !== "myFiles" &&
        selectedToolKey !== "redact" && <ChatFAB />}

      {/* Main content area */}
      <Box
        className={`flex-1 min-h-0 z-10 ${currentView === "pageEditor" ? "relative flex flex-col" : `relative ${styles.workbenchScrollable}`}`}
        style={{
          transition: "opacity 0.15s ease-in-out",
          // Force min-width:0 so flex children (notably the files page
          // toolbar with its 5 bulk-action buttons + 2 selects + view
          // toggle) can shrink below their intrinsic content size on
          // narrow viewports instead of overflowing horizontally.
          minWidth: 0,
          ...(currentView === "pageEditor" && { height: 0 }),
        }}
      >
        <RetainedView active={viewerVisible}>
          <Suspense fallback={<ToolLoadingFallback />}>
            {signingOverlay?.file ? (
              <Viewer
                previewFile={signingOverlay.file}
                signaturePreviews={signingOverlay.signaturePreviews}
                signaturePreviewsReadOnly={
                  signingOverlay.signaturePreviewsReadOnly
                }
                signaturePlacementMode={signingOverlay.signaturePlacementMode}
                signaturePlacementData={signingOverlay.signaturePlacementData}
                signaturePlacementType={signingOverlay.signaturePlacementType}
                onSignaturePreviewsChange={
                  signingOverlay.onSignaturePreviewsChange
                }
                signatureOverlayApiRef={signingOverlay.signatureOverlayApiRef}
              />
            ) : (
              <Viewer previewFile={previewFile} onClose={handlePreviewClose} />
            )}
          </Suspense>
        </RetainedView>
        {viewActive && hasFiles && (
          <RetainedView active={!takeover && currentView === "pageEditor"}>
            <Suspense fallback={<ToolLoadingFallback />}>
              <div style={{ position: "relative", height: "100%" }}>
                <PageEditor onFunctionsReady={setPageEditorFunctions} />
                {pageEditorFunctions && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      zIndex: 100,
                    }}
                  >
                    <PageEditorControls
                      onClosePdf={pageEditorFunctions.closePdf}
                      onUndo={pageEditorFunctions.handleUndo}
                      onRedo={pageEditorFunctions.handleRedo}
                      canUndo={pageEditorFunctions.canUndo}
                      canRedo={pageEditorFunctions.canRedo}
                      onRotate={pageEditorFunctions.handleRotate}
                      onDelete={pageEditorFunctions.handleDelete}
                      onSplit={pageEditorFunctions.handleSplit}
                      onSplitAll={pageEditorFunctions.handleSplitAll}
                      onPageBreak={pageEditorFunctions.handlePageBreak}
                      onPageBreakAll={pageEditorFunctions.handlePageBreakAll}
                      onExportAll={pageEditorFunctions.onExportAll}
                      exportLoading={pageEditorFunctions.exportLoading}
                      selectionMode={pageEditorFunctions.selectionMode}
                      selectedPageIds={pageEditorFunctions.selectedPageIds}
                      displayDocument={pageEditorFunctions.displayDocument}
                      splitPositions={pageEditorFunctions.splitPositions}
                      totalPages={pageEditorFunctions.totalPages}
                    />
                  </div>
                )}
              </div>
            </Suspense>
          </RetainedView>
        )}
        {TextEditorCanvas && (
          <RetainedView
            active={!takeover && currentView === "custom:pdfTextEditor"}
          >
            <Suspense fallback={<ToolLoadingFallback />}>
              <TextEditorCanvas data={textEditorView.data} />
            </Suspense>
          </RetainedView>
        )}
        <Suspense fallback={<ToolLoadingFallback />}>
          {renderMainContent()}
        </Suspense>
      </Box>
    </Box>
  );
}
