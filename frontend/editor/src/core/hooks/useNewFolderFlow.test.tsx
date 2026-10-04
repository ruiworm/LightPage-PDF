import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useNewFolderFlow } from "@app/hooks/useNewFolderFlow";

const state = vi.hoisted(() => ({
  storageEnabled: false,
  isAnonymous: true,
  currentTab: "all",
  openNewFolderDialog: vi.fn(),
}));
vi.mock("@app/contexts/AppConfigContext", () => ({
  useAppConfig: () => ({ config: { storageEnabled: state.storageEnabled } }),
}));
vi.mock("@app/auth/UseSession", () => ({
  useAuth: () => ({ isAnonymous: state.isAnonymous }),
}));
vi.mock("@app/contexts/FolderContext", () => ({
  useFolders: () => ({
    currentFolderId: null,
    foldersById: new Map(),
    serverReachable: false,
  }),
}));
vi.mock("@app/contexts/FilesPageContext", () => ({
  useFilesPage: () => ({
    currentTab: state.currentTab,
    openNewFolderDialog: state.openNewFolderDialog,
  }),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));

beforeEach(() => {
  state.storageEnabled = false;
  state.isAnonymous = true;
  state.currentTab = "all";
  vi.clearAllMocks();
});

it("opens a local creation dialog when server storage is disabled", () => {
  const { result } = renderHook(useNewFolderFlow);
  expect(result.current.createFolderHereBlockedReason).toBeNull();
  act(() => result.current.createFolderHere());
  expect(state.openNewFolderDialog).toHaveBeenCalledWith(null, "virtual");
});

it("keeps authenticated server creation blocked during an outage", () => {
  state.storageEnabled = true;
  state.isAnonymous = false;
  const { result } = renderHook(useNewFolderFlow);
  expect(result.current.createFolderHereBlockedReason).not.toBeNull();
  act(() => result.current.createFolderHere());
  expect(state.openNewFolderDialog).not.toHaveBeenCalled();
});
