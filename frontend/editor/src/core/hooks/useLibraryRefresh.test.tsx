import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useLibraryRefresh } from "@app/hooks/useLibraryRefresh";

const library = vi.hoisted(() => ({
  pullFromServer: vi.fn(),
  refreshFolders: vi.fn().mockResolvedValue(undefined),
  refreshFiles: vi.fn().mockResolvedValue(undefined),
  bumpDiskRevision: vi.fn(),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { storageEnabled: false } }),
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ isAnonymous: true }),
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => ({
    refresh: library.refreshFolders,
    pullFromServer: library.pullFromServer,
  }),
}));
vi.mock("@app/contexts/FilesPageContext", () => ({
  useFilesPage: () => ({
    refresh: library.refreshFiles,
    bumpDiskRevision: library.bumpDiskRevision,
  }),
}));

it("refreshes local folders and files without making a server sync request", async () => {
  const { result } = renderHook(useLibraryRefresh);
  await act(async () => {
    await result.current.refresh();
  });
  expect(library.refreshFolders).toHaveBeenCalledOnce();
  expect(library.refreshFiles).toHaveBeenCalledOnce();
  expect(library.pullFromServer).not.toHaveBeenCalled();
  expect(result.current.refreshing).toBe(false);
});
