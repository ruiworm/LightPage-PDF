import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import {
  useOpenWorkspaceFolder,
  useRemoveWorkspaceFolder,
} from "@app/hooks/useOpenWorkspaceFolder";
import type { FileId } from "@app/types/file";
import type { FolderId } from "@app/types/folder";

const mocks = vi.hoisted(() => ({
  folder: vi.fn(),
  remove: vi.fn(),
  selection: vi.fn(),
  active: vi.fn(),
  reader: vi.fn(),
  workbench: vi.fn(),
  remembered: new Map<string, FileId>(),
  loaded: [] as FileId[],
  guard: vi.fn(),
}));
vi.mock("@app/contexts/FilesPageContext", () => ({
  useFilesPage: () => ({
    setWorkspaceFolderId: mocks.folder,
    removeWorkspaceFolder: mocks.remove,
    workspaceFiles: { current: mocks.remembered },
  }),
}));
vi.mock("@app/contexts/file/fileHooks", () => ({
  useFileActions: () => ({ actions: { setSelectedFiles: mocks.selection } }),
  useFileSelectors: () => ({ getAllFileIds: () => mocks.loaded }),
}));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationActions: () => ({
    actions: { restoreWorkbench: mocks.workbench },
  }),
  useNavigationGuard: () => ({ requestNavigation: mocks.guard }),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({ setActiveFileId: mocks.active }),
}));
vi.mock("@app/contexts/ToolWorkflowContext", () => ({
  useToolWorkflowActions: () => ({ setReaderMode: mocks.reader }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.remembered.clear();
  mocks.loaded = [];
  mocks.guard.mockImplementation((go: () => void) => go());
});

it("replaces the folder scope, clears batch selection, and restores only a loaded document", () => {
  mocks.remembered.set("contracts", "agreement" as FileId);
  mocks.loaded = ["agreement" as FileId];
  const { result } = renderHook(useOpenWorkspaceFolder);
  act(() => result.current("contracts" as FolderId));
  expect(mocks.folder).toHaveBeenCalledWith("contracts");
  expect(mocks.selection).toHaveBeenCalledWith([]);
  expect(mocks.active).toHaveBeenCalledWith("agreement");
  expect(mocks.workbench).toHaveBeenCalledWith("viewer");
  act(() => result.current("people" as FolderId));
  expect(mocks.active).toHaveBeenLastCalledWith(null);
});

it("leaves the folder, document and selection intact when unsaved edits block navigation", () => {
  mocks.guard.mockImplementation(() => {});
  const { result } = renderHook(useOpenWorkspaceFolder);
  act(() => result.current("people" as FolderId));
  expect(mocks.folder).not.toHaveBeenCalled();
  expect(mocks.selection).not.toHaveBeenCalled();
  expect(mocks.active).not.toHaveBeenCalled();
});

it("keeps the active folder visible when the unsaved-edit guard blocks its removal", () => {
  mocks.guard.mockImplementation(() => {});
  const { result } = renderHook(() =>
    useRemoveWorkspaceFolder("contracts" as FolderId),
  );
  act(() => result.current("contracts" as FolderId));
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.folder).not.toHaveBeenCalled();
  expect(mocks.selection).not.toHaveBeenCalled();
  expect(mocks.active).not.toHaveBeenCalled();
});

it("clears the active scope after confirmed removal without closing stored documents", () => {
  const { result } = renderHook(() =>
    useRemoveWorkspaceFolder("contracts" as FolderId),
  );
  act(() => result.current("contracts" as FolderId));
  expect(mocks.remove).toHaveBeenCalledWith("contracts");
  expect(mocks.folder).toHaveBeenCalledWith("");
  expect(mocks.selection).toHaveBeenCalledWith([]);
  expect(mocks.active).toHaveBeenCalledWith(null);
  expect(mocks.workbench).toHaveBeenCalledWith("viewer");
});

it("removes an inactive shortcut without navigating or clearing the active document", () => {
  const { result } = renderHook(() =>
    useRemoveWorkspaceFolder("contracts" as FolderId),
  );
  act(() => result.current("people" as FolderId));
  expect(mocks.remove).toHaveBeenCalledWith("people");
  expect(mocks.guard).not.toHaveBeenCalled();
  expect(mocks.folder).not.toHaveBeenCalled();
  expect(mocks.active).not.toHaveBeenCalled();
});
