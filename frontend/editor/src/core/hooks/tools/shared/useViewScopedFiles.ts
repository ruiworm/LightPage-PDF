import { useMemo } from "react";
import { useAllFiles, useFileSelection } from "@app/contexts/FileContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { StirlingFile, StirlingFileStub } from "@app/types/fileContext";

export function useViewScopedFiles(ignoreViewerScope = false): StirlingFile[] {
  const { activeFileId } = useViewer();
  const { selectedFileIds } = useFileSelection();
  const { files: allFiles } = useAllFiles();
  const { workbench } = useNavigationState();

  return useMemo(() => {
    if (workbench === "viewer" && !ignoreViewerScope) {
      const viewerFile = allFiles.find((file) => file.fileId === activeFileId);
      return viewerFile ? [viewerFile] : [];
    }
    const filesById = new Map(allFiles.map((file) => [file.fileId, file]));
    return selectedFileIds.flatMap((id) => {
      const file = filesById.get(id);
      return file ? [file] : [];
    });
  }, [workbench, allFiles, activeFileId, selectedFileIds, ignoreViewerScope]);
}

/**
 * The stubs for {@link useViewScopedFiles} — the same scoping rule, for UI that
 * needs stub-only metadata (thumbnails, page counts) rather than file bytes.
 * A tool's preview must read from here, not from the raw file list: indexing
 * that list pins the preview to whichever file was added first, so it keeps
 * showing the original document after the viewer switches files.
 *
 * Resolved by id rather than by position, because the file and stub lists are
 * filtered independently — a stub exists before its bytes finish loading, so
 * the two arrays can hold different indices for the same document.
 */
export function useViewScopedFileStubs(
  ignoreViewerScope = false,
): StirlingFileStub[] {
  const scopedFiles = useViewScopedFiles(ignoreViewerScope);
  const { fileStubs } = useAllFiles();

  return useMemo(() => {
    const stubsById = new Map(fileStubs.map((stub) => [stub.id, stub]));
    return scopedFiles
      .map((file) => stubsById.get(file.fileId))
      .filter((stub): stub is StirlingFileStub => stub != null);
  }, [scopedFiles, fileStubs]);
}
