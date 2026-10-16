import { useMemo } from "react";
import { useFolders } from "@app/contexts/FolderContext";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useDiskFolder } from "@app/components/filesPage/useDiskFolder";
import {
  canListDirectory,
  type DiskFileEntry,
} from "@app/services/localFolderContents";
import {
  folderKind,
  type FolderId,
  type FolderRecord,
} from "@app/types/folder";
import type { FileId } from "@app/types/file";
import type { StirlingFileStub } from "@app/types/fileContext";

const pathKey = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith("//")
    ? normalized.toLowerCase()
    : normalized;
};

/** Resolves older disk-backed records that predate explicit folder metadata. */
export function workspaceFolderForFile(
  file: StirlingFileStub,
  folders: FolderRecord[],
): FolderId | "" {
  if (file.folderId && folders.some((folder) => folder.id === file.folderId))
    return file.folderId;
  const path = file.localFilePath && pathKey(file.localFilePath);
  return path
    ? (folders
        .filter(
          (folder) =>
            folder.directory &&
            path.startsWith(`${pathKey(folder.directory).replace(/\/$/, "")}/`),
        )
        .sort(
          (a, b) => (b.directory?.length ?? 0) - (a.directory?.length ?? 0),
        )[0]?.id ?? "")
    : "";
}

/** Lists one library folder without reading file contents or registering its files in the workspace. */
export function useWorkspaceFolder(stored: StirlingFileStub[]) {
  const { folders, currentFolderId, setError } = useFolders();
  const {
    diskRevision,
    workspaceFolderId: chosen,
    setWorkspaceFolderId: setChosen,
  } = useFilesPage();
  const choices = useMemo(
    () =>
      folders.filter(
        (folder) =>
          folderKind(folder) !== "local" ||
          (canListDirectory && folder.directory),
      ),
    [folders],
  );
  const initial =
    choices.find((folder) => folder.id === currentFolderId) ?? choices[0];
  const selected = chosen == null ? (initial?.id ?? "") : chosen;
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
    const onDisk = folder && folderKind(folder) === "local";
    const stubs = onDisk
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
            folderId: folder.id,
          };
        })
      : folder
        ? stored.filter((stub) => stub.folderId === folder.id)
        : stored.filter((stub) => !stub.folderId);
    if (onDisk)
      stubs.push(
        ...stored.filter(
          (stub) => stub.folderId === folder.id && !stub.localFilePath,
        ),
      );
    return { stubs, entries };
  }, [stored, diskEntries, folder]);
  const selectedFolder: FolderId | "" = folder?.id ?? "";
  return {
    choices,
    selected: selectedFolder,
    setChosen,
    stubs,
    entries,
    loading: !!folder && diskLoading,
  };
}
