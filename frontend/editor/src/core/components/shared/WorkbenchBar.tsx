import React, {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Icon } from "@app/ui/Icon";
import {
  clearFilesPageReturnRoute,
  getFilesPageReturnRoute,
  subscribeFilesPageReturnRoute,
} from "@app/components/filesPage/filesPageReturnRoute";
import { useWorkbenchBar } from "@app/contexts/WorkbenchBarContext";
import {
  useAllFiles,
  useFileSelectors,
  useFileSelection,
  useFileActions,
} from "@app/contexts/FileContext";
import { isStirlingFile } from "@app/types/fileContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { ViewerContext, useViewer } from "@app/contexts/ViewerContext";
import { WorkbenchType, isBaseWorkbench } from "@app/types/workbench";
import { useTitleBarStrip } from "@app/contexts/TitleBarStripContext";
import ViewerShareButton from "@app/components/viewer/ViewerShareButton";
import { useSharingEnabled } from "@app/hooks/useSharingEnabled";
import { usePolicyFileBadges } from "@app/hooks/usePolicyFileBadges";
import {
  POLICY_IN_FLIGHT_STATUSES,
  usePolicyRuns,
} from "@app/components/policies/policyRunStore";
import { downloadFileWithPolicy as downloadFile } from "@app/services/exportWithPolicy";
import { enforceExportPolicies } from "@app/services/policyExport";
import { downloadFile as downloadRaw } from "@app/services/downloadService";
import { alert as showAlert } from "@app/components/toast";
import {
  WorkbenchBarButtonConfig,
  WorkbenchBarRenderContext,
  WorkbenchBarSection,
} from "@app/types/workbenchBar";
import WorkbenchBarDesktopActions from "@app/components/shared/workbenchBar/WorkbenchBarDesktopActions";
import WorkbenchBarMobileActions from "@app/components/shared/workbenchBar/WorkbenchBarMobileActions";
import WorkbenchBarToolbarHandle from "@app/components/shared/workbenchBar/WorkbenchBarToolbarHandle";
import { renderWithTooltip } from "@app/components/shared/workbenchBar/workbenchBarTooltip";
import { WorkbenchBarActionsProps } from "@app/components/shared/workbenchBar/types";
import { useIsMobile } from "@app/hooks/useIsMobile";
import { CompactWorkspaceButton } from "@app/components/layout/CompactWorkspace";
import "@app/components/shared/WorkbenchBar.css";

const SECTION_ORDER: WorkbenchBarSection[] = ["top", "middle", "bottom"];
const PDF_EDITOR_WORKBENCH = "custom:pdfTextEditor" as const;

interface ViewOption {
  value: WorkbenchType;
  label: string;
  icon: React.ReactNode;
}

interface WorkbenchBarProps {
  currentView: WorkbenchType;
  setCurrentView: (view: WorkbenchType) => void;
  hasFiles: boolean;
  /** Whether the viewer's tool row is currently retracted. */
  viewerToolbarCollapsed?: boolean;
  /** Setter for the viewer tool-row retract state (owned by Workbench). */
  onCollapseViewerToolbar?: (collapsed: boolean) => void;
}

export default function WorkbenchBar({
  currentView,
  setCurrentView,
  hasFiles,
  viewerToolbarCollapsed = false,
  onCollapseViewerToolbar,
}: WorkbenchBarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const strip = useTitleBarStrip();
  const returnRoute = useSyncExternalStore(
    subscribeFilesPageReturnRoute,
    getFilesPageReturnRoute,
    () => null,
  );
  const handleBackToFiles = useCallback(() => {
    if (!returnRoute) return;
    const target = returnRoute.route;
    clearFilesPageReturnRoute();
    navigate(target);
  }, [returnRoute, navigate]);
  const { buttons, actions, allButtonsDisabled } = useWorkbenchBar();
  const {
    pageEditorFunctions,
    customWorkbenchViews,
    handleToolSelect,
    leftPanelView,
  } = useToolWorkflow();
  const { selectedTool } = useNavigationState();
  const isCustomView = !isBaseWorkbench(currentView);
  const isViewer = currentView === "viewer";
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const { sharingEnabled } = useSharingEnabled();
  const viewerContext = React.useContext(ViewerContext);
  const isMobile = useIsMobile();
  const [mobileToolsExpanded, setMobileToolsExpanded] = useState(false);

  const selectors = useFileSelectors();
  const { selectedFiles, selectedFileIds } = useFileSelection();
  const { actions: fileActions } = useFileActions();
  const { files: activeFiles } = useAllFiles();
  const { activeFileId, setActiveFileId } = useViewer();
  const policyFileBadges = usePolicyFileBadges();
  // Block print/export while any file the export would touch is under active
  // policy enforcement: the viewer exports its active file, every other view
  // exports the selection (or all files when nothing is selected).
  const exportTargetIds: string[] =
    currentView === "viewer"
      ? activeFileId
        ? [activeFileId]
        : []
      : selectedFileIds.length > 0
        ? selectedFileIds
        : activeFiles.filter(isStirlingFile).map((f) => f.fileId);
  const enforcingFileId = exportTargetIds.find((id) =>
    (policyFileBadges.get(id) ?? []).some((p) => p.enforcing),
  );
  const policyEnforcing = enforcingFileId != null;
  const policyRuns = usePolicyRuns();
  const enforcingRun = policyEnforcing
    ? policyRuns.find(
        (r) =>
          r.fileId === enforcingFileId &&
          (POLICY_IN_FLIGHT_STATUSES as readonly string[]).includes(r.status),
      )
    : undefined;
  const enforcingProgress =
    enforcingRun?.currentStep != null && enforcingRun.stepCount
      ? Math.round((enforcingRun.currentStep / enforcingRun.stepCount) * 100)
      : undefined;
  const pageEditorTotalPages = pageEditorFunctions?.totalPages ?? 0;
  const pageEditorSelectedCount =
    pageEditorFunctions?.selectedPageIds?.length ?? 0;

  const totalItems = useMemo(() => {
    if (currentView === "pageEditor") return pageEditorTotalPages;
    if (currentView === "viewer") return activeFileId ? 1 : 0;
    return activeFiles.length;
  }, [currentView, pageEditorTotalPages, activeFiles.length, activeFileId]);

  const selectedCount = useMemo(() => {
    if (currentView === "pageEditor") return pageEditorSelectedCount;
    return selectedFileIds.length;
  }, [currentView, pageEditorSelectedCount, selectedFileIds.length]);

  // Registered into the bar's own row rather than the tool row below it. Already
  // sorted by order when registered.
  const barRowButtons = useMemo(
    () =>
      buttons.filter((btn) => btn.section === "bar" && (btn.visible ?? true)),
    [buttons],
  );

  // Beside the view switcher rather than among the actions: what the view is showing
  // reads as part of the view, not as something to do to it.
  const barLeadButtons = useMemo(
    () =>
      buttons.filter(
        (btn) => btn.section === "bar-lead" && (btn.visible ?? true),
      ),
    [buttons],
  );

  const sectionsWithButtons = useMemo(() => {
    return SECTION_ORDER.map((section) => {
      const sectionButtons = buttons.filter(
        (btn) => (btn.section ?? "top") === section && (btn.visible ?? true),
      );
      return { section, buttons: sectionButtons };
    }).filter((entry) => entry.buttons.length > 0);
  }, [buttons]);

  const toolLeadButtons = useMemo(
    () =>
      buttons.filter(
        (btn) => btn.section === "tool-lead" && (btn.visible ?? true),
      ),
    [buttons],
  );

  const handleExportAll = useCallback(
    async (forceNewFile = false) => {
      if (currentView === "viewer") {
        const buffer = await viewerContext?.exportActions?.saveAsCopy?.();
        if (!buffer) return;
        const fileToExport = activeFiles.find(
          (file) => isStirlingFile(file) && file.fileId === activeFileId,
        );
        if (!fileToExport) return;
        const stub = isStirlingFile(fileToExport)
          ? selectors.getStirlingFileStub(fileToExport.fileId)
          : undefined;
        try {
          const result = await downloadFile({
            data: new Blob([buffer], { type: "application/pdf" }),
            // Stub name, not File.name: a rename only writes the stub.
            filename: stub?.name ?? fileToExport.name,
            localPath: forceNewFile ? undefined : stub?.localFilePath,
            fileId: stub?.id,
          });
          if (!forceNewFile && !result.cancelled && stub && result.savedPath) {
            fileActions.updateStirlingFileStub(stub.id, {
              localFilePath: stub.localFilePath ?? result.savedPath,
              isDirty: false,
            });
          }
        } catch (error) {
          console.error("[WorkbenchBar] Failed to export viewer file:", error);
        }
        return;
      }

      if (currentView === "pageEditor") {
        pageEditorFunctions?.onExportAll?.();
        return;
      }

      const filesToExport =
        selectedFiles.length > 0 ? selectedFiles : activeFiles;
      const stubs = filesToExport.map((file) =>
        isStirlingFile(file)
          ? selectors.getStirlingFileStub(file.fileId)
          : undefined,
      );

      // Enforce all files in one batch so the toast shows progress across the
      // whole set (e.g. "report.pdf (2 of 5)") rather than N invisible solo runs.
      let enforced: File[];
      try {
        enforced = await enforceExportPolicies(
          filesToExport,
          stubs.map((s) => s?.id),
        );
      } catch {
        enforced = filesToExport;
        showAlert({
          alertType: "warning",
          title: t("policies.enforcement.exportFailureTitle"),
          body: t("policies.enforcement.exportFailureBody"),
        });
      }

      for (let idx = 0; idx < filesToExport.length; idx++) {
        const file = filesToExport[idx];
        const stub = stubs[idx];
        try {
          const result = await downloadRaw({
            data: enforced[idx],
            // Stub name, not File.name: a rename only writes the stub.
            filename: stub?.name ?? file.name,
            localPath: forceNewFile ? undefined : stub?.localFilePath,
            fileId: stub?.id,
          });
          if (result.cancelled) continue;
          if (!forceNewFile && stub && result.savedPath) {
            fileActions.updateStirlingFileStub(stub.id, {
              localFilePath: stub.localFilePath ?? result.savedPath,
              isDirty: false,
            });
          }
        } catch (error) {
          console.error(
            "[WorkbenchBar] Failed to export file:",
            file.name,
            error,
          );
        }
      }
    },
    [
      currentView,
      selectedFiles,
      activeFiles,
      activeFileId,
      pageEditorFunctions,
      viewerContext,
      selectors,
      fileActions,
    ],
  );

  const handlePrint = useCallback(() => {
    viewerContext?.printActions?.print?.();
  }, [viewerContext]);

  const handleClose = useCallback(async () => {
    if (currentView === "viewer" || currentView === "fileEditor") {
      setActiveFileId(null);
    } else if (currentView === "pageEditor") {
      pageEditorFunctions?.closePdf?.();
    }
  }, [currentView, setActiveFileId, pageEditorFunctions]);

  const downloadTooltip = useMemo(() => {
    if (currentView === "pageEditor")
      return t("workbenchBar.exportAll", "Export PDF");
    if (currentView === "viewer") return terminology.download;
    if (selectedCount > 0) return terminology.downloadSelected;
    return terminology.downloadAll;
  }, [currentView, selectedCount, t, terminology]);

  const actionsDisabled = totalItems === 0 || allButtonsDisabled;

  // Shared by the mobile overflow menu and the desktop icon cluster so the two
  // stay in step; each renders the same actions in its own shape.
  const globalActionProps: WorkbenchBarActionsProps = {
    currentView,
    // Save, Save As and Close act on an open document. The library has none: it
    // lists files, and opening one is what the other views are for.
    showsFileActions: !isCustomView && currentView !== "myFiles",
    actionsDisabled,
    policyEnforcing,
    downloadLabel: downloadTooltip,
    downloadIconName: icons.download,
    saveAsIconName: icons.saveAs,
    onPrint: handlePrint,
    onExport: handleExportAll,
    onClose: handleClose,
  };

  const toggleMobileTools = useCallback(
    () => setMobileToolsExpanded((v) => !v),
    [],
  );
  const handleRetractToolbar = useCallback(
    () => onCollapseViewerToolbar?.(true),
    [onCollapseViewerToolbar],
  );

  const renderButton = useCallback(
    (btn: WorkbenchBarButtonConfig) => {
      const action = actions[btn.id];
      const disabled = Boolean(btn.disabled || allButtonsDisabled);
      const isActive = Boolean(btn.active);

      const triggerAction = () => {
        if (!disabled) action?.();
      };

      if (btn.render) {
        const context: WorkbenchBarRenderContext = {
          id: btn.id,
          disabled,
          allButtonsDisabled,
          action,
          triggerAction,
          active: isActive,
        };
        return btn.render(context) ?? null;
      }

      if (!btn.icon) return null;

      const ariaLabel =
        btn.ariaLabel ||
        (typeof btn.tooltip === "string" ? btn.tooltip : btn.id);
      const buttonNode = (
        <ActionIcon
          variant={isActive ? "primary" : "quiet"}
          className="workbench-bar-action-icon"
          onClick={triggerAction}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-pressed={isActive ? true : undefined}
          hover={isActive ? true : false}
        >
          {btn.icon}
        </ActionIcon>
      );
      return renderWithTooltip(buttonNode, btn.tooltip);
    },
    [actions, allButtonsDisabled],
  );

  const handleViewChange = (view: WorkbenchType) => {
    if (view === "pageEditor" && selectedTool !== "multiTool") {
      handleToolSelect("multiTool");
    } else if (
      view === PDF_EDITOR_WORKBENCH &&
      (selectedTool !== "pdfTextEditor" ||
        leftPanelView === "toolPicker" ||
        !customWorkbenchViews.some(
          (customView) =>
            customView.workbenchId === view && customView.data != null,
        ))
    ) {
      handleToolSelect("pdfTextEditor");
    } else {
      setCurrentView(view);
    }
  };

  const viewOptions: ViewOption[] = [
    {
      value: "viewer",
      label: t("workbenchBar.read", "Read"),
      icon: <Icon name="file" size={20} />,
    },
    {
      value: "pageEditor",
      label: t("workbenchBar.organize", "Organize"),
      icon: <Icon name="grid-2x2-plus" size="1rem" />,
    },
    {
      value: PDF_EDITOR_WORKBENCH,
      label: t("workbenchBar.edit", "Edit"),
      icon: <Icon name="file-text" size="1rem" />,
    },
    ...customWorkbenchViews
      .filter((v) => v.data != null && v.workbenchId !== PDF_EDITOR_WORKBENCH)
      .map((v) => ({
        value: v.workbenchId,
        label: v.label,
        icon: v.icon ?? <Icon name="file" size={20} />,
      })),
  ];

  const leadingCluster = (
    <div className="workbench-bar-leading">
      <CompactWorkspaceButton panel="files" />
      {returnRoute && hasFiles && (
        <>
          <Button
            variant="tertiary"
            className="workbench-bar-view-btn workbench-bar-back-btn"
            onClick={handleBackToFiles}
            aria-label={t(
              returnRoute.label
                ? "filesPage.backToFolder"
                : "filesPage.backToMyFiles",
              returnRoute.label
                ? `Back to ${returnRoute.label}`
                : "Back to File library",
              { folder: returnRoute.label ?? "" },
            )}
            leftSection={<Icon name="arrow-left" size={"1.1rem"} />}
          >
            <span className="workbench-bar-view-label">
              {returnRoute.label
                ? t("filesPage.backToFolder", "Back to {{folder}}", {
                    folder: returnRoute.label,
                  })
                : t("filesPage.backToMyFiles", "Back to File library")}
            </span>
          </Button>
          <div className="workbench-bar-divider" />
        </>
      )}
      {barLeadButtons.map((btn) => {
        const content = renderButton(btn);
        if (!content) return null;
        return (
          <div className="workbench-bar-lead" key={btn.id}>
            <div className="workbench-bar-divider" />
            {content}
          </div>
        );
      })}
    </div>
  );

  const viewsCluster = (
    <div className="workbench-bar-views" data-tour="view-switcher">
      {/* Not in the library: it browses files rather than showing one, and the
          rail is what moves between surfaces. */}
      {currentView !== "myFiles" && (
        <SegmentedControl<WorkbenchType>
          className="workbench-bar-views"
          size="sm"
          value={currentView}
          onChange={handleViewChange}
          variant="secondary"
          options={viewOptions.map((opt) => ({
            value: opt.value,
            label: (
              <>
                {opt.icon}
                <span className="workbench-bar-view-label">{opt.label}</span>
              </>
            ),
          }))}
        />
      )}
    </div>
  );

  // Tool buttons - second row, only rendered when buttons exist. In the viewer
  // the row is retractable: a handle on its right edge hides the whole row;
  // Workbench then shows a tab below the bar to bring it back.
  const toolRow =
    (sectionsWithButtons.length > 0 || toolLeadButtons.length > 0) &&
    !(isViewer && viewerToolbarCollapsed) ? (
      <div
        className={`workbench-bar-center${isMobile && mobileToolsExpanded ? " workbench-bar-center--expanded" : ""}`}
      >
        {toolLeadButtons.length > 0 && (
          <div className="workbench-bar-tool-lead">
            {toolLeadButtons.map((btn) => (
              <div key={btn.id} className="workbench-bar-action-wrapper">
                {renderButton(btn)}
              </div>
            ))}
          </div>
        )}
        <div className="workbench-bar-center-scroll">
          {sectionsWithButtons.map(
            ({ section, buttons: sectionButtons }, idx) => (
              <React.Fragment key={section}>
                {idx > 0 && <div className="workbench-bar-divider" />}
                {sectionButtons.map((btn) => {
                  const content = renderButton(btn);
                  if (!content) return null;
                  return (
                    <div key={btn.id} className="workbench-bar-action-wrapper">
                      {content}
                    </div>
                  );
                })}
              </React.Fragment>
            ),
          )}
        </div>
        <WorkbenchBarToolbarHandle
          isMobile={isMobile}
          expanded={mobileToolsExpanded}
          onToggleExpanded={toggleMobileTools}
          onRetract={
            isViewer && onCollapseViewerToolbar
              ? handleRetractToolbar
              : undefined
          }
        />
      </div>
    ) : null;

  // Right: global buttons - export group left, close anchored right.
  const globalsCluster = (
    <div className="workbench-bar-globals">
      <CompactWorkspaceButton panel="tools" />
      {/* A view's own controls, ahead of the globals every view shares. */}
      {barRowButtons.map((btn) => {
        const content = renderButton(btn);
        if (!content) return null;
        return (
          <div key={btn.id} className="workbench-bar-action-wrapper">
            {content}
          </div>
        );
      })}
      {barRowButtons.length > 0 && (
        <div className="workbench-bar-divider workbench-bar-globals-sep" />
      )}
      {/* Share (viewer only; opens the same modal as My Files "Manage sharing") */}
      {currentView === "viewer" && sharingEnabled && (
        <ViewerShareButton disabled={actionsDisabled} />
      )}

      {isMobile ? (
        <WorkbenchBarMobileActions {...globalActionProps} />
      ) : (
        <WorkbenchBarDesktopActions
          {...globalActionProps}
          enforcingProgress={enforcingProgress}
        />
      )}
    </div>
  );

  // With a title-bar strip, the top row lives in it: portal the view switcher and
  // globals into its slots and keep the tool row inline.
  if (strip.enabled) {
    return (
      <>
        {strip.viewsSlot &&
          createPortal(
            <div className="workbench-bar-strip-views">
              {leadingCluster}
              {viewsCluster}
            </div>,
            strip.viewsSlot,
          )}
        {strip.globalsSlot && createPortal(globalsCluster, strip.globalsSlot)}
        {toolRow && (
          <div
            className="workbench-bar"
            data-wrapped={isMobile}
            data-portaled="true"
          >
            {toolRow}
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="workbench-bar"
      data-wrapped={isMobile}
      data-tour="workbench-bar"
    >
      <div className="workbench-bar-top-row">
        {leadingCluster}
        {viewsCluster}
        {globalsCluster}
      </div>
      {toolRow}
    </div>
  );
}
