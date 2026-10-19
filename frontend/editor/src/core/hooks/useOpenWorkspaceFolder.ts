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

/** Removing the active folder obeys the same unsaved-edit guard as opening another folder. */
export function useRemoveWorkspaceFolder(activeFolderId: FolderId | "") {
  const { removeWorkspaceFolder, setWorkspaceFolderId } = useFilesPage();
  const { requestNavigation } = useNavigationGuard();
  const { actions } = useNavigationActions();
  const { actions: files } = useFileActions();
  const { setActiveFileId } = useViewer();
  const { setReaderMode } = useToolWorkflowActions();
  return useCallback(
    (id: FolderId) => {
      if (id !== activeFolderId) {
        removeWorkspaceFolder(id);
        return;
      }
      requestNavigation(() => {
        removeWorkspaceFolder(id);
        setWorkspaceFolderId("");
        files.setSelectedFiles([]);
        setActiveFileId(null);
        setReaderMode(false);
        actions.restoreWorkbench("viewer");
      });
    },
    [
      activeFolderId,
      removeWorkspaceFolder,
      requestNavigation,
      setWorkspaceFolderId,
      files,
      setActiveFileId,
      setReaderMode,
      actions,
    ],
  );
}
