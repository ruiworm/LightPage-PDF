import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAllFiles, useFileSelection } from "@app/contexts/FileContext";
import type { FileId } from "@app/types/file";
import { useNavigationState } from "@app/contexts/NavigationContext";
import { useViewer } from "@app/contexts/ViewerContext";
import { useViewActive } from "@app/components/layout/RetainedView";

type Loader = (file: File) => unknown;
// The workbench fileId is what lets save write the edit back to the
// same file rather than only producing a download.
type OnFileChosen = (name: string, fileId?: FileId) => void;

type WorkbenchFile = File & { fileId?: FileId; quickKey?: string };

function fileKey(file: File): string {
  const f = file as WorkbenchFile;
  return `${f.fileId ?? f.quickKey ?? f.name}|${f.size}|${f.lastModified}`;
}

interface AutoLoad {
  /** Open a workbench file deliberately. */
  openFile: (file: File) => void;
  /** Record a document the editor loaded by other means, so auto-open stands down. */
  adopt: (file: File) => void;
}

/** The slice of the editor's state that decides whether it needs a file. */
export interface EditorLoadState {
  hasDocument: boolean;
  loading: boolean;
  error: string | null;
  dirty?: boolean;
}

/**
 * Open the file the user most likely wants.
 *
 * Selection changes alone do not replace the open document. A clean retained
 * session follows a deliberate reader file change on re-entry, and reloads
 * changed source bytes. Dirty edits are left alone. An empty store can recover
 * after the entire editor workspace has released its document resources.
 */
export function useAutoLoadFile(
  load: Loader,
  onFileChosen: OnFileChosen,
  currentFileId: FileId | null,
  /** Saving is swapping the workbench file under us; do not re-pick mid-swap. */
  hold: boolean,
  /** The editor's live state, so "is a document open" is asked, not remembered. */
  editor: EditorLoadState,
): AutoLoad {
  const viewActive = useViewActive();
  const navigationState = useNavigationState();
  const { selectedFiles } = useFileSelection();
  const { files: allFiles } = useAllFiles();
  const { activeFileId } = useViewer();

  const autoLoadFile = useMemo(() => {
    // Prefer the open document while it is still selected so a reordering
    // selection cannot nudge the editor onto a different file.
    if (currentFileId) {
      const held = selectedFiles.find(
        (f) => (f as WorkbenchFile).fileId === currentFileId,
      );
      if (held) return held;
    }
    if (selectedFiles[0]) return selectedFiles[0];
    if (activeFileId) {
      const viewerFile = allFiles.find(
        (f) => (f as WorkbenchFile).fileId === activeFileId,
      );
      if (viewerFile) return viewerFile;
    }
    if (allFiles.length === 1) return allFiles[0];
    return null;
  }, [selectedFiles, activeFileId, allFiles, currentFileId]);

  // The open document left the workbench, so the editor is free to pick again.
  const documentGone =
    currentFileId != null &&
    !allFiles.some((f) => (f as WorkbenchFile).fileId === currentFileId);

  const lastKeyRef = useRef<string | null>(null);
  const lastReaderFileRef = useRef<string | null | undefined>(undefined);
  const adopt = useCallback((file: File) => {
    lastKeyRef.current = fileKey(file);
  }, []);
  const openFile = useCallback(
    (file: File) => {
      adopt(file);
      onFileChosen(file.name, (file as WorkbenchFile).fileId);
      void load(file);
    },
    [adopt, load, onFileChosen],
  );

  useEffect(() => {
    if (!viewActive || !autoLoadFile || hold) return;
    if (navigationState.selectedTool !== "pdfTextEditor") return;
    if (editor.loading) return;
    const readerChanged =
      lastReaderFileRef.current !== undefined &&
      activeFileId !== lastReaderFileRef.current;
    lastReaderFileRef.current = activeFileId;
    // While the editor is retained, another PDF can be opened in Reading. On
    // re-entry follow that deliberate file change, but never replace dirty edits.
    if (readerChanged && activeFileId && !editor.dirty) {
      const readerFile = allFiles.find(
        (file) => (file as WorkbenchFile).fileId === activeFileId,
      );
      if (
        readerFile &&
        (readerFile as WorkbenchFile).fileId !== currentFileId
      ) {
        openFile(readerFile);
        return;
      }
    }
    const currentFile = allFiles.find(
      (file) => (file as WorkbenchFile).fileId === currentFileId,
    );
    if (
      editor.hasDocument &&
      currentFile &&
      !editor.dirty &&
      lastKeyRef.current &&
      lastKeyRef.current !== fileKey(currentFile)
    ) {
      openFile(currentFile);
      return;
    }
    // A document is open: leave it, and the user's unsaved edits, alone.
    if (editor.hasDocument && !documentGone) return;
    // Recovery: the store dropped a document this hook had already opened.
    // Re-open THAT file, and do it quietly - no pin, no filename change. The
    // canvas can be dropped because the user went to Active Files, and pinning
    // it back would yank them out of the list they just asked for.
    const recovering = lastKeyRef.current !== null;
    if (recovering) {
      const same = allFiles.find(
        (f) => (f as WorkbenchFile).fileId === currentFileId,
      );
      // Nothing to recover to: the file left the workbench, so fall through
      // and pick a candidate the normal way.
      if (same) {
        if (editor.error && lastKeyRef.current === fileKey(same)) return;
        adopt(same);
        void load(same);
        return;
      }
    }

    // This exact file already failed to open. Retrying it is a loop, not a fix.
    if (editor.error && lastKeyRef.current === fileKey(autoLoadFile)) return;
    openFile(autoLoadFile);
  }, [
    viewActive,
    autoLoadFile,
    documentGone,
    editor.error,
    editor.dirty,
    editor.hasDocument,
    editor.loading,
    hold,
    navigationState.selectedTool,
    openFile,
    adopt,
    allFiles,
    activeFileId,
    currentFileId,
    load,
  ]);

  return useMemo(() => ({ openFile, adopt }), [openFile, adopt]);
}
