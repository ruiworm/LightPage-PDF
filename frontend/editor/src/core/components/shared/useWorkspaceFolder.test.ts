import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceFolder } from "@app/components/shared/useWorkspaceFolder";
import { createNewStirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import type { FolderId, FolderRecord } from "@app/types/folder";

const mocks = vi.hoisted(() => ({
  folders: [] as FolderRecord[],
  currentFolderId: null as FolderId | null,
  read: vi.fn(),
  list: vi.fn(),
  hidden: new Set<FolderId>(),
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => ({
    folders: mocks.folders,
    currentFolderId: mocks.currentFolderId,
    setError: vi.fn(),
  }),
}));
vi.mock("@app/contexts/FilesPageContext", () => ({
  useFilesPage: () => {
    const [workspaceFolderId, setWorkspaceFolderId] = useState<
      FolderId | "" | null
    >(null);
    return {
      diskRevision: 0,
      workspaceFolderId,
      setWorkspaceFolderId,
      hiddenWorkspaceFolderIds: mocks.hidden,
    };
  },
}));
vi.mock("@app/components/filesPage/useDiskFolder", () => ({
  useDiskFolder: (...args: unknown[]) => mocks.list(...args),
}));
vi.mock("@app/services/localFolderContents", () => ({
  canListDirectory: true,
  readDiskFile: mocks.read,
}));
const folder = {
  id: "folder" as FolderId,
  kind: "local" as const,
  name: "本地文档",
  directory: "C:/docs",
  parentFolderId: null,
  createdAt: 0,
  updatedAt: 0,
};
const entries = [
  { name: "one.pdf", path: "C:/docs/one.pdf", sizeBytes: 100, lastModified: 1 },
  { name: "two.pdf", path: "C:/docs/two.pdf", sizeBytes: 200, lastModified: 2 },
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.folders = [folder];
  mocks.currentFolderId = null;
  mocks.hidden = new Set();
  mocks.list.mockReturnValue({ diskEntries: entries, diskLoading: false });
});

describe("workspace library folder", () => {
  it("hides removed shortcuts without losing their library identity or reading disk files", () => {
    mocks.hidden = new Set([folder.id]);
    const { result } = renderHook(() => useWorkspaceFolder([]));
    expect(result.current.choices).toEqual([]);
    expect(result.current.allChoices).toEqual([folder]);
    expect(result.current.selected).toBe("");
    expect(mocks.list.mock.lastCall?.[0]).toBeUndefined();
    expect(mocks.folders).toEqual([folder]);
  });

  it("lists PDFs that have never been opened without reading their contents", () => {
    const { result } = renderHook(() => useWorkspaceFolder([]));
    expect(result.current.selected).toBe(folder.id);
    expect(result.current.stubs.map((stub) => stub.name)).toEqual([
      "one.pdf",
      "two.pdf",
    ]);
    expect([...result.current.entries.values()]).toEqual(entries);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("reuses the stored identity after a disk file is opened, including Windows path casing", () => {
    const cached = {
      ...createNewStirlingFileStub(
        new File(["pdf"], "one.pdf"),
        "saved" as FileId,
      ),
      localFilePath: "c:\\docs\\ONE.pdf",
    };
    const { result } = renderHook(() => useWorkspaceFolder([cached]));
    expect(result.current.stubs[0]).toBe(cached);
    expect(result.current.entries.has(cached.id)).toBe(false);
    expect(result.current.entries.size).toBe(1);
  });

  it("keeps unsaved tool results visible in the library folder", () => {
    const output = {
      ...createNewStirlingFileStub(new File(["pdf"], "converted.pdf")),
      folderId: folder.id,
      derivedFromTool: true,
    };
    const { result } = renderHook(() => useWorkspaceFolder([output]));
    expect(result.current.stubs.map((stub) => stub.name)).toContain(
      "converted.pdf",
    );
  });

  it("shows loose opened files without listing a mounted folder", () => {
    const cached = createNewStirlingFileStub(new File(["pdf"], "older.pdf"));
    const { result } = renderHook(() => useWorkspaceFolder([cached]));
    act(() => result.current.setChosen(""));
    expect(result.current.stubs).toEqual([cached]);
    expect(result.current.entries.size).toBe(0);
    expect(mocks.list.mock.lastCall?.[0]).toBeUndefined();
  });

  it("scopes browser folders to their own files instead of appending previous folders", () => {
    const browser = {
      ...folder,
      id: "browser" as FolderId,
      kind: "virtual" as const,
      directory: undefined,
    };
    mocks.folders.push(browser);
    const file = {
      ...createNewStirlingFileStub(new File(["pdf"], "browser.pdf")),
      folderId: browser.id,
    };
    const other = {
      ...createNewStirlingFileStub(new File(["pdf"], "other.pdf")),
      folderId: folder.id,
    };
    const { result } = renderHook(() => useWorkspaceFolder([file, other]));
    act(() => result.current.setChosen(browser.id));
    expect(result.current.stubs).toEqual([file]);
    expect(result.current.entries.size).toBe(0);
  });

  it("uses the library's current folder and recovers when it is removed", () => {
    const second = {
      ...folder,
      id: "second" as FolderId,
      directory: "D:/papers",
    };
    mocks.folders = [folder, second];
    mocks.currentFolderId = second.id;
    const { result, rerender } = renderHook(() => useWorkspaceFolder([]));
    expect(result.current.selected).toBe(second.id);
    act(() => result.current.setChosen(second.id));
    mocks.folders = [folder];
    rerender();
    expect(result.current.selected).toBe("");
    expect(result.current.stubs).toEqual([]);
  });
});
