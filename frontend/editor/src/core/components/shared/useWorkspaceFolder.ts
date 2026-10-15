import { useMemo, useState } from "react";
import { useFolders } from "@app/contexts/FolderContext";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useDiskFolder } from "@app/components/filesPage/useDiskFolder";
import {
  canListDirectory,
  type DiskFileEntry,
} from "@app/services/localFolderContents";
import { folderKind, type FolderId } from "@app/types/folder";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

const pathKey = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith("//")
    ? normalized.toLowerCase()
    : normalized;
};

/** Lists one library folder without reading file contents or registering its files in the workspace. */
export function useWorkspaceFolder(stored: StirlingFileStub[]) {
  const { folders, currentFolderId, setError } = useFolders();
  const { diskRevision } = useFilesPage();
  const [chosen, setChosen] = useState<FolderId | "" | null>(null);
  const choices = useMemo(
    () =>
      folders.filter(
        (folder) =>
          canListDirectory &&
          folderKind(folder) === "local" &&
          folder.directory,
      ),
    [folders],
  );
  const initial =
    choices.find((folder) => folder.id === currentFolderId) ?? choices[0];
  const selected = chosen === null ? (initial?.id ?? "") : chosen;
  const folder = choices.find((item) => item.id === selected);
  const { diskEntries, diskLoading } = useDiskFolder(
    folder?.directory,
    folder?.id ?? null,
    diskRevision,
    setError,
  );
  const { stubs, entries } = useMemo(() => {
    const byPath = new Map(
      stored
        .filter((stub) => stub.localFilePath)
        .map((stub) => [pathKey(stub.localFilePath!), stub]),
    );
    const entries = new Map<FileId, DiskFileEntry>();
    const stubs = folder
      ? diskEntries.map((entry): StirlingFileStub => {
          const cached = byPath.get(pathKey(entry.path));
          if (cached) return cached;
          const id = `disk:${entry.path}` as FileId;
          entries.set(id, entry);
          return {
            id,
            originalFileId: id,
            versionNumber: 1,
            name: entry.name,
            size: entry.sizeBytes,
            lastModified: entry.lastModified,
            type: "",
            isLeaf: true,
          };
        })
      : stored;
    if (folder)
      stubs.push(
        ...stored.filter(
          (stub) => stub.folderId === folder.id && !stub.localFilePath,
        ),
      );
    return { stubs, entries };
  }, [stored, diskEntries, folder]);
  return {
    choices,
    selected: folder?.id ?? "",
    setChosen,
    stubs,
    entries,
    loading: !!folder && diskLoading,
  };
}
