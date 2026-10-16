import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useDiskFolder } from "@app/components/filesPage/useDiskFolder";
import type { DiskListing } from "@app/services/localFolderContents";
import type { FolderId } from "@app/types/folder";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  register: vi.fn(),
  error: vi.fn(),
  t: (_: string, fallback: string) => fallback,
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => ({ registerDiskSubfolders: mocks.register }),
}));
vi.mock("@app/services/localFolderContents", () => ({
  canListDirectory: true,
  listDirectory: (...args: unknown[]) => mocks.list(...args),
}));
beforeEach(() => vi.clearAllMocks());

it("never exposes the previous directory while the new one is loading, including a late old response", async () => {
  const file = (path: string) => ({
    name: path + ".pdf",
    path: path + "/one.pdf",
    sizeBytes: 1,
    lastModified: 1,
  });
  let finishOld!: (listing: DiskListing) => void;
  let finishNew!: (listing: DiskListing) => void;
  mocks.list
    .mockReturnValueOnce(
      Promise.resolve({ files: [file("A")], directories: [] }),
    )
    .mockReturnValueOnce(
      new Promise<DiskListing>((resolve) => {
        finishOld = resolve;
      }),
    )
    .mockReturnValueOnce(
      new Promise<DiskListing>((resolve) => {
        finishNew = resolve;
      }),
    );
  const { result, rerender } = renderHook(
    ({ path }) => useDiskFolder(path, path as FolderId, 0, mocks.error),
    { initialProps: { path: "A" } },
  );
  await waitFor(() => expect(result.current.diskEntries).toHaveLength(1));
  rerender({ path: "B" });
  expect(result.current.diskEntries).toEqual([]);
  rerender({ path: "C" });
  await act(async () => finishOld({ files: [file("B")], directories: [] }));
  expect(result.current.diskEntries).toEqual([]);
  await act(async () => finishNew({ files: [file("C")], directories: [] }));
  expect(result.current.diskEntries.map((entry) => entry.path)).toEqual([
    "C/one.pdf",
  ]);
  expect(result.current.diskLoading).toBe(false);
});
