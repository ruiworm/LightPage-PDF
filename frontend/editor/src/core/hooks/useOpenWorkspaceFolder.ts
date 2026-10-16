import { useCallback } from "react";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useFileActions, useFileSelectors } from "@app/contexts/file/fileHooks";
import {
  useNavigationActions,
  useNavigationGuard,
} from "@app/contexts/NavigationContext";
import { useToolWorkflowActions } from "@app/contexts/ToolWorkflowContext";
import { useViewer } from "@app/contexts/ViewerContext";
import type { FolderId } from "@app/types/folder";

/** Changes folder scope without removing open documents or bypassing unsaved-edit guards. */
export function useOpenWorkspaceFolder() {
  const { setWorkspaceFolderId, workspaceFiles } = useFilesPage();
  const { actions } = useNavigationActions();
  const { requestNavigation } = useNavigationGuard();
  const { actions: files } = useFileActions();
  const selectors = useFileSelectors();
  const { setActiveFileId } = useViewer();
  const { setReaderMode } = useToolWorkflowActions();
  return useCallback(
    (id: FolderId | "") => {
      requestNavigation(() => {
        const remembered = workspaceFiles.current.get(id);
        const loaded =
          remembered && selectors.getAllFileIds().includes(remembered);
        setWorkspaceFolderId(id);
        files.setSelectedFiles([]);
        setActiveFileId(loaded ? remembered : null);
        setReaderMode(false);
        actions.restoreWorkbench("viewer");
      });
    },
    [
      requestNavigation,
      workspaceFiles,
      selectors,
      setWorkspaceFolderId,
      files,
      setActiveFileId,
      setReaderMode,
      actions,
    ],
  );
}
