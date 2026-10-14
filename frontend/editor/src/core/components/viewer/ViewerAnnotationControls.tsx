import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Tooltip } from "@app/components/shared/Tooltip";
import { ViewerContext } from "@app/contexts/ViewerContext";
import { useSignature } from "@app/contexts/SignatureContext";
import {
  useAllFiles,
  useFileSelectors,
  useFileContext,
} from "@app/contexts/FileContext";
import { createStirlingFilesAndStubs } from "@app/services/fileStubHelpers";
import {
  useNavigationState,
  useNavigationGuard,
  useNavigationActions,
} from "@app/contexts/NavigationContext";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useRedaction } from "@app/contexts/RedactionContext";

import { Icon } from "@app/ui/Icon";
interface ViewerAnnotationControlsProps {
  currentView: string;
  disabled?: boolean;
}

export default function ViewerAnnotationControls({
  currentView,
  disabled = false,
}: ViewerAnnotationControlsProps) {
  const { t } = useTranslation();
  const { setLeftPanelView } = useToolWorkflow();

  // Viewer context for PDF controls - safely handle when not available
  const viewerContext = React.useContext(ViewerContext);

  // Signature context for accessing drawing API
  const { historyApiRef, isPlacementMode } = useSignature();

  // File state for save functionality
  const selectors = useFileSelectors();
  const { files: activeFiles, fileIds } = useAllFiles();
  const { actions: fileActions } = useFileContext();

  // Check if we're in sign mode or redaction mode
  const { selectedTool } = useNavigationState();
  const { actions: navActions } = useNavigationActions();
  const isSignMode = selectedTool === "sign";
  const isRedactMode = selectedTool === "redact";

  // Get redaction pending state and navigation guard
  const { requestNavigation, setHasUnsavedChanges } = useNavigationGuard();
  const { setRedactionsApplied } = useRedaction();

  // Check if we're in any annotation tool that should disable the toggle
  const isInAnnotationTool =
    selectedTool === "annotate" ||
    selectedTool === "sign" ||
    selectedTool === "addImage" ||
    selectedTool === "addText";

  // Check if we're on annotate tool to highlight the button
  const isAnnotateActive = selectedTool === "annotate";
  const annotationsHidden = viewerContext
    ? !viewerContext.isAnnotationsVisible
    : false;

  // Persist annotations to file if there are unsaved changes
  const saveAnnotationsIfNeeded = async () => {
    if (
      !viewerContext?.exportActions?.saveAsCopy ||
      currentView !== "viewer" ||
      !historyApiRef?.current?.canUndo()
    )
      return;
    if (activeFiles.length === 0 || fileIds.length === 0) return;

    try {
      const arrayBuffer = await viewerContext.exportActions.saveAsCopy();
      if (!arrayBuffer) return;

      const file = new File([new Blob([arrayBuffer])], activeFiles[0].name, {
        type: "application/pdf",
      });
      const parentStub = selectors.getStirlingFileStub(fileIds[0]);
      if (!parentStub) return;

      const { stirlingFiles, stubs } = await createStirlingFilesAndStubs(
        [file],
        parentStub,
        "redact",
      );
      await fileActions.consumeFiles([fileIds[0]], stirlingFiles, stubs);

      // Clear unsaved changes flags after successful save
      setHasUnsavedChanges(false);
      setRedactionsApplied(false);
    } catch (error) {
      console.error("Error auto-saving annotations before redaction:", error);
    }
  };

  const handleRedactionToggle = async () => {
    const enter = async () => {
      await saveAnnotationsIfNeeded();
      navActions.setToolAndWorkbench("redact", "viewer");
      setLeftPanelView("toolContent");
    };
    if (historyApiRef?.current?.canUndo()) requestNavigation(enter);
    else await enter();
  };

  const handleToggleAnnotationsVisibility = useCallback(() => {
    viewerContext?.toggleAnnotationsVisibility();
  }, [viewerContext]);

  // NOTE: This early return is placed AFTER all hooks to satisfy React's rules of hooks
  if (isSignMode) {
    return null;
  }

  return (
    <>
      <Tooltip
        content={t("workbenchBar.redact", "File Redaction")}
        position="bottom"
        offset={16}
        arrow
        portalTarget={document.body}
      >
        <ActionIcon
          variant={isRedactMode ? "primary" : "tertiary"}
          className="workbench-bar-action-icon"
          onClick={handleRedactionToggle}
          disabled={disabled || currentView !== "viewer"}
          aria-label={t("workbenchBar.redact", "File Redaction")}
        >
          <Icon name="file-x" size="1.25rem" />
        </ActionIcon>
      </Tooltip>

      <Tooltip
        content={t(
          "workbenchBar.toggleAnnotations",
          "Toggle Annotations Visibility",
        )}
        position="bottom"
        offset={16}
        arrow
        portalTarget={document.body}
      >
        <ActionIcon
          variant={annotationsHidden ? "primary" : "tertiary"}
          className="workbench-bar-action-icon"
          onClick={handleToggleAnnotationsVisibility}
          disabled={
            disabled ||
            currentView !== "viewer" ||
            (isInAnnotationTool && !isAnnotateActive) ||
            isPlacementMode
          }
          data-active={annotationsHidden ? "true" : undefined}
          aria-pressed={annotationsHidden}
          aria-label={t(
            "workbenchBar.toggleAnnotations",
            "Toggle Annotations Visibility",
          )}
        >
          <Icon
            name={viewerContext?.isAnnotationsVisible ? "eye" : "eye-off"}
            size="1.25rem"
          />
        </ActionIcon>
      </Tooltip>
    </>
  );
}
