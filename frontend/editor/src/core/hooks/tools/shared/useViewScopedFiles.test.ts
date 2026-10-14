import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const viewer = { activeFileId: "c" };
const navigation = { workbench: "viewer" };
const files = ["a", "b", "c"].map((id) => ({ fileId: id, name: `${id}.pdf` }));
const selection = { selectedFileIds: ["a", "b"] };
const fileStubs = ["a", "b", "c", "orphan"].map((id) => ({
  id,
  name: `${id}.pdf`,
}));

vi.mock("@app/contexts/ViewerContext", () => ({ useViewer: () => viewer }));
vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => navigation,
}));
vi.mock("@app/contexts/FileContext", () => ({
  useAllFiles: () => ({ files, fileStubs }),
  useFileSelection: () => selection,
}));

import {
  useViewScopedFiles,
  useViewScopedFileStubs,
} from "@app/hooks/tools/shared/useViewScopedFiles";

describe("independent viewing and workspace selection", () => {
  it("single-file tools use viewed C while multi-file tools use selected A and B", () => {
    navigation.workbench = "viewer";
    selection.selectedFileIds = ["a", "b"];
    viewer.activeFileId = "c";
    const { result } = renderHook(() => ({
      viewed: useViewScopedFiles(),
      selected: useViewScopedFiles(true),
    }));
    expect(result.current.viewed.map((file) => file.fileId)).toEqual(["c"]);
    expect(result.current.selected.map((file) => file.fileId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("switching the viewed file leaves the workspace order intact", () => {
    navigation.workbench = "viewer";
    selection.selectedFileIds = ["b", "a"];
    viewer.activeFileId = "c";
    const { result, rerender } = renderHook(() => ({
      viewed: useViewScopedFileStubs(),
      selected: useViewScopedFileStubs(true),
    }));
    viewer.activeFileId = "a";
    rerender();
    expect(result.current.viewed.map((stub) => stub.id)).toEqual(["a"]);
    expect(result.current.selected.map((stub) => stub.id)).toEqual(["b", "a"]);
  });

  it("never falls back to all loaded files when selection is empty", () => {
    navigation.workbench = "viewer";
    selection.selectedFileIds = [];
    viewer.activeFileId = "c";
    expect(renderHook(() => useViewScopedFiles(true)).result.current).toEqual(
      [],
    );
    navigation.workbench = "pageEditor";
    expect(renderHook(() => useViewScopedFiles()).result.current).toEqual([]);
  });

  it("removing C from the workspace does not stop viewing it", () => {
    navigation.workbench = "viewer";
    viewer.activeFileId = "c";
    selection.selectedFileIds = ["a", "b", "c"];
    const { result, rerender } = renderHook(() => ({
      viewed: useViewScopedFiles(),
      selected: useViewScopedFiles(true),
    }));
    selection.selectedFileIds = ["a", "b"];
    rerender();
    expect(result.current.viewed[0]?.fileId).toBe("c");
    expect(result.current.selected.map((file) => file.fileId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("does not select another loaded file when no viewer file is open", () => {
    navigation.workbench = "viewer";
    viewer.activeFileId = "missing";
    expect(renderHook(() => useViewScopedFiles()).result.current).toEqual([]);
  });

  it("resolves selected stubs by id and drops files with no bytes", () => {
    navigation.workbench = "pageEditor";
    selection.selectedFileIds = ["c", "orphan", "a"];
    expect(
      renderHook(() => useViewScopedFileStubs()).result.current.map(
        (stub) => stub.id,
      ),
    ).toEqual(["c", "a"]);
  });
});
