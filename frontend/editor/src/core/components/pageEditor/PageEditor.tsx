import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { Text, Center, Box, LoadingOverlay, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { useFileState, useFileActions } from "@app/contexts/FileContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { usePageEditor } from "@app/contexts/PageEditorContext";
import { PageEditorFunctions, PDFPage } from "@app/types/pageEditor";
// Thumbnail generation is now handled by individual PageThumbnail components
import "@app/components/pageEditor/PageEditor.module.css";
import PageThumbnail from "@app/components/pageEditor/PageThumbnail";
import DragDropGrid, {
  type DragHandleProps,
} from "@app/components/pageEditor/DragDropGrid";
import SkeletonLoader from "@app/components/shared/SkeletonLoader";
import { FileId } from "@app/types/file";
import { GRID_CONSTANTS } from "@app/components/pageEditor/constants";
import { useInitialPageDocument } from "@app/components/pageEditor/hooks/useInitialPageDocument";
import { usePageDocument } from "@app/components/pageEditor/hooks/usePageDocument";
import { usePageEditorState } from "@app/components/pageEditor/hooks/usePageEditorState";
import { usePageEditorWorkbenchBarButtons } from "@app/components/pageEditor/pageEditorWorkbenchBarButtons";
import { useWheelZoom } from "@app/hooks/useWheelZoom";
import { useEditedDocumentState } from "@app/components/pageEditor/hooks/useEditedDocumentState";
import { useUndoManagerState } from "@app/components/pageEditor/hooks/useUndoManagerState";
import { usePageSelectionManager } from "@app/components/pageEditor/hooks/usePageSelectionManager";
import { usePageEditorCommands } from "@app/components/pageEditor/hooks/useEditorCommands";
import { usePageEditorExport } from "@app/components/pageEditor/hooks/usePageEditorExport";
import { usePageThumbnailLoader } from "@app/components/pageEditor/hooks/usePageThumbnailLoader";
import { convertSplitPageIdsToIndexes } from "@app/components/pageEditor/utils/splitPositions";
import { useViewActive } from "@app/components/layout/RetainedView";

export interface PageEditorProps {
  onFunctionsReady?: (functions: PageEditorFunctions) => void;
}

interface PageEditorFileEntry {
  fileId: FileId;
  name: string;
  versionNumber: number | undefined;
  isSelected: boolean;
}

const PageEditor = ({ onFunctionsReady }: PageEditorProps) => {
  const viewActive = useViewActive();
  const { t } = useTranslation();
  // Use split contexts to prevent re-renders
  const { state, selectors } = useFileState();
  const { actions } = useFileActions();

  // Navigation guard for unsaved changes
  const {
    actions: {
      setHasUnsavedChanges: setGlobalUnsavedChanges,
      registerNavigationWarningHandlers,
      unregisterNavigationWarningHandlers,
    },
  } = useNavigationActions();
  const activeRef = useRef(viewActive);
  activeRef.current = viewActive;
  const dirtyRef = useRef(false);
  const setHasUnsavedChanges = useCallback(
    (dirty: boolean) => {
      dirtyRef.current = dirty;
      if (activeRef.current) setGlobalUnsavedChanges(dirty);
    },
    [setGlobalUnsavedChanges],
  );
  useEffect(() => {
    if (!viewActive) return;
    setGlobalUnsavedChanges(dirtyRef.current);
    return () => setGlobalUnsavedChanges(false);
  }, [viewActive, setGlobalUnsavedChanges]);
  const [discardRevision, setDiscardRevision] = useState(0);

  // Get PageEditor coordination functions
  const {
    updateFileOrderFromPages,
    fileOrder,
    fileColorIndexMap,
    reorderedPages,
    clearReorderedPages,
    updateCurrentPages,
    savePersistedDocument,
    clearPersistedDocument,
    contentRevision,
  } = usePageEditor();

  const [visiblePageIds, setVisiblePageIds] = useState<string[]>([]);
  const handleVisibleItemsChange = useCallback((items: PDFPage[]) => {
    setVisiblePageIds((prev) => {
      const ids = items.map((item) => item.id);
      if (
        prev.length === ids.length &&
        prev.every((id, index) => id === ids[index])
      ) {
        return prev;
      }
      return ids;
    });
  }, []);

  // Zoom state management
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);
  const rootFontSize = useMemo(() => {
    if (typeof window === "undefined") {
      return 16;
    }
    const computed = getComputedStyle(document.documentElement).fontSize;
    const parsed = parseFloat(computed);
    return Number.isNaN(parsed) ? 16 : parsed;
  }, []);
  const itemGapPx = useMemo(() => {
    return parseFloat(GRID_CONSTANTS.ITEM_GAP) * rootFontSize * zoomLevel;
  }, [rootFontSize, zoomLevel]);

  // Zoom actions
  const zoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + 0.1, 3.0));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - 0.1, 0.5));
  }, []);

  // Derive page editor files from PageEditorContext's fileOrder (page editor workspace order)
  // Filter to only show PDF files (PageEditor only supports PDFs)
  // Use stable string keys to prevent infinite loops
  // Cache file objects to prevent infinite re-renders from new object references
  const fileOrderKey = fileOrder.join(",");
  const selectedIdsKey = [...state.ui.selectedFileIds].sort().join(",");
  const filesSignature = selectors.getFilesSignature();

  const fileObjectsRef = useRef(new Map<FileId, PageEditorFileEntry>());
  const gridItemRefsRef = useRef<React.MutableRefObject<
    Map<string, HTMLDivElement>
  > | null>(null);

  const pageEditorFiles = useMemo(() => {
    const cache = fileObjectsRef.current;
    const newFiles: PageEditorFileEntry[] = [];

    fileOrder.forEach((fileId) => {
      const stub = selectors.getStirlingFileStub(fileId);
      const isSelected = state.ui.selectedFileIds.includes(fileId);
      const isPdf = stub?.name?.toLowerCase().endsWith(".pdf") ?? false;

      if (!isPdf || !isSelected) return; // Skip non-PDFs

      const cached = cache.get(fileId);

      // Check if data actually changed (compare by fileId, not position)
      if (
        cached &&
        cached.fileId === fileId &&
        cached.name === (stub?.name || "") &&
        cached.versionNumber === stub?.versionNumber &&
        cached.isSelected === isSelected
      ) {
        // Reuse existing object reference
        newFiles.push(cached);
      } else {
        // Create new object only if data changed
        const newFile = {
          fileId,
          name: stub?.name || "",
          versionNumber: stub?.versionNumber,
          isSelected,
        };
        cache.set(fileId, newFile);
        newFiles.push(newFile);
      }
    });

    // Clean up removed files from cache
    const activeIds = new Set(newFiles.map((f) => f.fileId));
    for (const cachedId of cache.keys()) {
      if (!activeIds.has(cachedId)) {
        cache.delete(cachedId);
      }
    }

    return newFiles;
  }, [fileOrderKey, selectedIdsKey, filesSignature]);

  // Get selected file IDs for filtering
  const selectedFileIds = useMemo(() => {
    return pageEditorFiles.filter((f) => f.isSelected).map((f) => f.fileId);
  }, [pageEditorFiles]);
  const activeFilesSignature = selectors.getFilesSignature();

  // fileOrder catches up in an effect, so read the selection directly to avoid
  // briefly showing the empty state after a PDF is checked.
  const hasPdfFiles = useMemo(() => {
    return state.ui.selectedFileIds.some((id) => {
      const stub = selectors.getStirlingFileStub(id);
      return stub?.name?.toLowerCase().endsWith(".pdf") ?? false;
    });
  }, [state.ui.selectedFileIds, state.files.byId, selectors]);

  const initialDocument = useInitialPageDocument();
  const { document: mergedPdfDocument, isLoading } = usePageDocument();

  // The undo manager is created below this hook, so the reset is forwarded
  // through a ref rather than reordering the two.
  const clearUndoHistoryRef = useRef<() => void>(() => {});
  const handleDocumentReplaced = useCallback(() => {
    clearUndoHistoryRef.current();
  }, []);

  const { setEditedDocument, displayDocument, getEditedDocument } =
    useEditedDocumentState({
      initialDocument,
      mergedPdfDocument,
      reorderedPages,
      clearReorderedPages,
      fileOrder,
      updateCurrentPages,
      contentRevision: contentRevision + discardRevision,
      onDocumentReplaced: handleDocumentReplaced,
    });

  const displayDocumentRef = useRef(displayDocument);
  useEffect(() => {
    displayDocumentRef.current = displayDocument;
  }, [displayDocument]);

  usePageThumbnailLoader({
    document: displayDocument,
    visiblePageIds,
    setDocument: setEditedDocument,
    contentRevision,
  });

  const displayDocumentId = displayDocument?.id ?? null;

  useEffect(() => {
    setVisiblePageIds([]);
  }, [displayDocumentId]);

  useEffect(() => {
    return () => {
      if (!viewActive) {
        return;
      }

      const doc = displayDocumentRef.current;
      if (doc && doc.pages.length > 0) {
        const signature = doc.pages.map((page) => page.id).join(",");
        savePersistedDocument(doc, signature);
      }
    };
  }, [savePersistedDocument, viewActive]);

  // UI state management
  const {
    selectionMode,
    selectedPageIds,
    movingPage,
    isAnimating,
    splitPositions,
    exportLoading,
    setSelectionMode,
    setSelectedPageIds,
    setMovingPage,
    setSplitPositions,
    setExportLoading,
    togglePage,
    toggleSelectAll,
    animateReorder,
  } = usePageEditorState();

  const {
    csvInput,
    setCsvInput,
    totalPages,
    getPageNumbersFromIds,
    handleSelectAll,
    handleDeselectAll,
    handleSetSelectedPages,
    updatePagesFromCSV,
  } = usePageSelectionManager({
    displayDocument,
    selectedPageIds,
    setSelectedPageIds,
    setSelectionMode,
    toggleSelectAll,
    activeFilesSignature,
  });

  // Grid container ref for positioning split indicators
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const {
    canUndo,
    canRedo,
    executeCommandWithTracking,
    handleUndo,
    handleRedo,
    clearUndoHistory,
  } = useUndoManagerState({
    setHasUnsavedChanges,
  });
  clearUndoHistoryRef.current = clearUndoHistory;

  const {
    createRotateCommand,
    createDeleteCommand,
    createSplitCommand,
    executeCommand,
    handleRotate,
    handleDelete,
    handleDeletePage,
    handleSplit,
    handleSplitAll,
    handlePageBreak,
    handlePageBreakAll,
    handleInsertFiles,
    handleReorderPages,
    closePdf,
  } = usePageEditorCommands({
    displayDocument,
    getEditedDocument,
    setEditedDocument,
    splitPositions,
    setSplitPositions,
    selectedPageIds,
    setSelectedPageIds,
    getPageNumbersFromIds,
    executeCommandWithTracking,
    updateFileOrderFromPages,
    actions,
    selectors,
    setSelectionMode,
    clearUndoHistory,
  });

  const { onExportSelected, onExportAll, applyChanges } = usePageEditorExport({
    displayDocument,
    selectedPageIds,
    splitPositions,
    selectedFileIds,
    selectors,
    actions,
    setHasUnsavedChanges,
    exportLoading,
    setExportLoading,
    setSplitPositions,
    clearPersistedDocument,
    updateCurrentPages,
  });

  // Register navigation warning handlers for the global modal
  useEffect(() => {
    if (!viewActive) return;
    registerNavigationWarningHandlers({
      onApplyAndContinue: async () => {
        await applyChanges();
      },
      onExportAndContinue: async () => {
        await onExportAll();
      },
      onDiscardAndContinue: async () => {
        // Retention must still honor an explicit discard: rebuild source pages.
        clearPersistedDocument();
        clearReorderedPages();
        clearUndoHistory();
        setSelectedPageIds([]);
        setSplitPositions(new Set());
        setDiscardRevision((revision) => revision + 1);
      },
    });
    return () => unregisterNavigationWarningHandlers();
  }, [
    viewActive,
    clearPersistedDocument,
    clearReorderedPages,
    clearUndoHistory,
    setSelectedPageIds,
    setSplitPositions,
    applyChanges,
    onExportAll,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  ]);

  // Derived values for usePageEditorWorkbenchBarButtons (must be after displayDocument)
  const selectedPageCount = selectedPageIds.length;

  usePageEditorWorkbenchBarButtons({
    totalPages,
    selectedPageCount,
    csvInput,
    setCsvInput,
    selectedPageIds,
    displayDocument: displayDocument || undefined,
    updatePagesFromCSV,
    handleSelectAll,
    handleDeselectAll,
    handleDelete,
    onExportSelected,
    onSaveChanges: applyChanges,
    exportLoading,
  });

  // Export preview function - defined after export functions to avoid circular dependency
  const handleExportPreview = useCallback(
    (selectedOnly: boolean = false) => {
      if (!displayDocument) return;

      // For now, trigger the actual export directly
      // In the original, this would show a preview modal first
      if (selectedOnly) {
        onExportSelected();
      } else {
        onExportAll();
      }
    },
    [displayDocument, onExportSelected, onExportAll],
  );

  // Expose functions to parent component
  useEffect(() => {
    if (onFunctionsReady) {
      onFunctionsReady({
        handleUndo,
        handleRedo,
        canUndo,
        canRedo,
        handleRotate,
        handleDelete,
        handleSplit,
        handleSplitAll,
        handlePageBreak,
        handlePageBreakAll,
        handleSelectAll,
        handleDeselectAll,
        handleSetSelectedPages,
        showExportPreview: handleExportPreview,
        onExportSelected,
        onExportAll,
        applyChanges,
        exportLoading,
        selectionMode,
        selectedPageIds,
        displayDocument: displayDocument || undefined,
        splitPositions,
        totalPages,
        closePdf,
      });
    }
  }, [
    onFunctionsReady,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    handleRotate,
    handleDelete,
    handleSplit,
    handleSplitAll,
    handlePageBreak,
    handlePageBreakAll,
    handleSelectAll,
    handleDeselectAll,
    handleSetSelectedPages,
    handleExportPreview,
    onExportSelected,
    onExportAll,
    applyChanges,
    exportLoading,
    selectionMode,
    selectedPageIds,
    splitPositions,
    displayDocument?.pages.length,
    totalPages,
    closePdf,
  ]);

  useWheelZoom({
    ref: containerRef,
    onZoomIn: zoomIn,
    onZoomOut: zoomOut,
    enabled: !!displayDocument,
  });

  // Handle keyboard zoom shortcuts
  useEffect(() => {
    if (!viewActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;

      const target = event.target as Element | null;
      const isInTextInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        (target as HTMLElement | null)?.isContentEditable === true;
      if (isInTextInput) return;

      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        setZoomLevel(1.0);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [viewActive, zoomIn, zoomOut, setZoomLevel]);

  // Display all pages - use edited or original document
  const displayedPages = displayDocument?.pages || [];

  // Track color assignments by insertion order (files keep their color)

  // Memoize renderItem to prevent DragDropGrid's React.memo from blocking updates
  // when selectedPageIds changes
  const renderItemCallback = useCallback(
    (
      page: PDFPage,
      index: number,
      refs: React.MutableRefObject<Map<string, HTMLDivElement>>,
      boxSelectedIds: string[],
      clearBoxSelection: () => void,
      activeDragIds: string[],
      justMoved: boolean,
      dragHandleProps?: DragHandleProps,
      zoomLevelParam?: number,
      isOverTarget?: boolean,
    ) => {
      gridItemRefsRef.current = refs;
      const fileColorIndex = page.originalFileId
        ? (fileColorIndexMap.get(page.originalFileId) ?? 0)
        : 0;
      const isBoxSelected = boxSelectedIds.includes(page.id);
      return (
        <PageThumbnail
          key={page.id}
          page={page}
          index={index}
          totalPages={displayDocument?.pages.length || 0}
          fileColorIndex={fileColorIndex}
          selectedPageIds={selectedPageIds}
          selectionMode={selectionMode}
          movingPage={movingPage}
          isAnimating={isAnimating}
          isBoxSelected={isBoxSelected}
          clearBoxSelection={clearBoxSelection}
          activeDragIds={activeDragIds}
          justMoved={justMoved}
          pageRefs={refs}
          dragHandleProps={dragHandleProps}
          isOverTarget={isOverTarget}
          onReorderPages={handleReorderPages}
          onTogglePage={togglePage}
          onAnimateReorder={animateReorder}
          onExecuteCommand={executeCommand}
          onSetStatus={() => {}}
          onSetMovingPage={setMovingPage}
          onDeletePage={handleDeletePage}
          createRotateCommand={createRotateCommand}
          createDeleteCommand={createDeleteCommand}
          createSplitCommand={createSplitCommand}
          pdfDocument={displayDocument!}
          setPdfDocument={setEditedDocument}
          splitPositions={splitPositions}
          onInsertFiles={handleInsertFiles}
          zoomLevel={zoomLevelParam || zoomLevel}
        />
      );
    },
    [
      selectedPageIds,
      selectionMode,
      movingPage,
      isAnimating,
      displayDocument,
      fileColorIndexMap,
      handleReorderPages,
      togglePage,
      animateReorder,
      executeCommand,
      setMovingPage,
      handleDeletePage,
      createRotateCommand,
      createDeleteCommand,
      createSplitCommand,
      setEditedDocument,
      splitPositions,
      handleInsertFiles,
      zoomLevel,
    ],
  );

  return (
    <div
      ref={containerRef}
      data-scrolling-container="true"
      style={{
        height: "100%",
        overflow: "auto",
        position: "relative",
        width: "100%",
      }}
    >
      <LoadingOverlay visible={hasPdfFiles && isLoading && !initialDocument} />

      {!hasPdfFiles && (
        <Center h="100%">
          <Stack align="center" gap="md">
            <Icon
              name="file"
              size={32}
              style={{ color: "var(--c-text-subtle)" }}
            />
            <Text c="dimmed">
              {t("pageEditor.emptyState.title", "No PDF files selected")}
            </Text>
            <Text size="sm" c="dimmed">
              {t(
                "pageEditor.emptyState.body",
                "Select PDF files using the checkboxes on the left to start editing pages.",
              )}
            </Text>
          </Stack>
        </Center>
      )}

      {!initialDocument && hasPdfFiles && (
        <Box p={0}>
          <SkeletonLoader type="controls" />
          <SkeletonLoader type="pageGrid" count={8} />
        </Box>
      )}

      {hasPdfFiles && displayDocument && (
        <Box
          ref={gridContainerRef}
          p={0}
          pt="2rem"
          pb="4rem"
          style={{ position: "relative" }}
        >
          {/* Split Lines Overlay */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            {(() => {
              const refsMap = gridItemRefsRef.current?.current;
              const containerEl = gridContainerRef.current;
              if (!refsMap || !containerEl) {
                return null;
              }

              const containerRect = containerEl.getBoundingClientRect();
              const splitIndexes = convertSplitPageIdsToIndexes(
                displayDocument,
                splitPositions,
              );

              return Array.from(splitIndexes).map((position) => {
                const currentPage = displayedPages[position];
                if (!currentPage) {
                  return null;
                }

                const currentEl = refsMap.get(currentPage.id);
                if (!currentEl) {
                  return null;
                }

                const currentRect = currentEl.getBoundingClientRect();
                const nextPage = displayedPages[position + 1];
                let lineLeft;

                if (nextPage) {
                  const nextEl = refsMap.get(nextPage.id);
                  if (nextEl) {
                    const nextRect = nextEl.getBoundingClientRect();
                    const sameRow =
                      Math.abs(nextRect.top - currentRect.top) <
                      currentRect.height / 2;
                    if (sameRow) {
                      lineLeft = (currentRect.right + nextRect.left) / 2;
                    } else {
                      lineLeft = currentRect.right + itemGapPx / 2;
                    }
                  } else {
                    lineLeft = currentRect.right + itemGapPx / 2;
                  }
                } else {
                  lineLeft = currentRect.right + itemGapPx / 2;
                }

                return (
                  <div
                    key={`split-${position}`}
                    style={{
                      position: "absolute",
                      left: `${lineLeft - containerRect.left}px`,
                      top: `${currentRect.top - containerRect.top}px`,
                      width: "1px",
                      height: `${currentRect.height}px`,
                      borderLeft: "1px dashed #3b82f6",
                    }}
                  />
                );
              });
            })()}
          </div>

          {/* Pages Grid */}
          <DragDropGrid
            items={displayedPages}
            onReorderPages={handleReorderPages}
            zoomLevel={zoomLevel}
            selectedFileIds={selectedFileIds}
            selectedPageIds={selectedPageIds}
            onVisibleItemsChange={handleVisibleItemsChange}
            getThumbnailData={(pageId) => {
              const page = displayDocument.pages.find((p) => p.id === pageId);
              if (!page?.thumbnail) return null;
              return {
                src: page.thumbnail,
                rotation: page.rotation || 0,
              };
            }}
            renderItem={renderItemCallback}
          />
        </Box>
      )}
    </div>
  );
};

export default PageEditor;
