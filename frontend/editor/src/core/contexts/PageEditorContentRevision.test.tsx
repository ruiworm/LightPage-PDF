import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FileId, StirlingFileStub } from "@app/types/fileContext";
import type { WorkbenchType } from "@app/types/workbench";
import type { PDFDocument } from "@app/types/pageEditor";

const navigation = { workbench: "viewer" as WorkbenchType };
const viewer = { activeFileId: null as string | null };
const fileActions = { setSelectedFiles: vi.fn() };

const fileState = {
  state: {
    ui: { selectedFileIds: [] as FileId[] },
    files: {
      ids: [] as FileId[],
      byId: {} as Record<FileId, Partial<StirlingFileStub>>,
    },
  },
};

vi.mock("@app/contexts/FileContext", () => ({
  useFileActions: () => ({ actions: fileActions }),
  useFileState: () => fileState,
}));

vi.mock("@app/contexts/NavigationContext", () => ({
  useNavigationState: () => navigation,
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => viewer,
}));

const { PageEditorProvider, usePageEditor } =
  await import("@app/contexts/PageEditorContext");

const stub = (size: number, lastModified: number) =>
  ({ size, lastModified }) as Partial<StirlingFileStub>;

const setFiles = (entries: [string, Partial<StirlingFileStub>][]) => {
  fileState.state = {
    ui: { selectedFileIds: entries.map(([id]) => id as FileId) },
    files: {
      ids: entries.map(([id]) => id as FileId),
      byId: Object.fromEntries(entries),
    },
  };
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <PageEditorProvider>{children}</PageEditorProvider>
);

describe("PageEditorContext contentRevision", () => {
  beforeEach(() => {
    navigation.workbench = "viewer";
    viewer.activeFileId = null;
    fileActions.setSelectedFiles.mockClear();
    setFiles([["A", stub(100, 1)]]);
  });

  it("keeps the same page document when leaving and returning without file changes", () => {
    navigation.workbench = "pageEditor";
    const view = renderHook(() => usePageEditor(), { wrapper });
    const document = {
      id: "A",
      pages: [{ id: "A-1", originalFileId: "A" }],
    } as PDFDocument;
    act(() => {
      view.result.current.updateCurrentPages(document.pages);
      view.result.current.savePersistedDocument(document, "A-1");
    });
    for (const workbench of [
      "viewer",
      "custom:pdfTextEditor",
      "pageEditor",
    ] as WorkbenchType[]) {
      act(() => {
        navigation.workbench = workbench;
        view.rerender();
      });
      expect(view.result.current.persistedDocument).toBe(document);
      expect(view.result.current.currentPages).toBe(document.pages);
    }
    act(() => {
      setFiles([["A", stub(555, 9)]]);
      view.rerender();
    });
    expect(view.result.current.persistedDocument).toBeNull();
  });

  it("does not bump when another file is added", () => {
    const view = renderHook(() => usePageEditor(), { wrapper });
    const before = view.result.current.contentRevision;

    act(() => {
      setFiles([
        ["A", stub(100, 1)],
        ["B", stub(200, 2)],
      ]);
      view.rerender();
    });

    expect(view.result.current.contentRevision).toBe(before);
  });

  it("does not bump when a file is removed", () => {
    setFiles([
      ["A", stub(100, 1)],
      ["B", stub(200, 2)],
    ]);
    const view = renderHook(() => usePageEditor(), { wrapper });
    const before = view.result.current.contentRevision;

    act(() => {
      setFiles([["A", stub(100, 1)]]);
      view.rerender();
    });

    expect(view.result.current.contentRevision).toBe(before);
  });

  it("bumps when the bytes behind an open file are replaced", () => {
    const view = renderHook(() => usePageEditor(), { wrapper });
    const before = view.result.current.contentRevision;

    act(() => {
      setFiles([["A", stub(555, 9)]]);
      view.rerender();
    });

    expect(view.result.current.contentRevision).toBe(before + 1);
  });

  it("still bumps on a replacement that arrives alongside an addition", () => {
    const view = renderHook(() => usePageEditor(), { wrapper });
    const before = view.result.current.contentRevision;

    act(() => {
      setFiles([
        ["A", stub(555, 9)],
        ["B", stub(200, 2)],
      ]);
      view.rerender();
    });

    expect(view.result.current.contentRevision).toBe(before + 1);
  });

  it("keeps only the checked files when entering the page editor", () => {
    setFiles([
      ["A", stub(100, 1)],
      ["B", stub(200, 2)],
      ["C", stub(300, 3)],
    ]);
    fileState.state.ui.selectedFileIds = ["A", "B"] as FileId[];
    const view = renderHook(() => usePageEditor(), { wrapper });
    act(() => {
      navigation.workbench = "pageEditor";
      view.rerender();
    });
    expect(view.result.current.fileOrder).toEqual(["A", "B"]);
    expect(fileActions.setSelectedFiles).not.toHaveBeenCalled();
  });

  it("removes an unchecked source without unloading its file", () => {
    setFiles([
      ["A", stub(100, 1)],
      ["B", stub(200, 2)],
    ]);
    const view = renderHook(() => usePageEditor(), { wrapper });
    act(() => {
      fileState.state = {
        ...fileState.state,
        ui: { selectedFileIds: ["A"] as FileId[] },
      };
      view.rerender();
    });
    expect(view.result.current.fileOrder).toEqual(["A"]);
    expect(fileState.state.files.ids).toEqual(["A", "B"]);
  });

  it("opens the reader PDF when entering with no checked files", () => {
    setFiles([
      ["A", { name: "A.pdf" }],
      ["B", { name: "B.pdf" }],
    ]);
    fileState.state.ui.selectedFileIds = [];
    viewer.activeFileId = "B";
    const view = renderHook(() => usePageEditor(), { wrapper });
    act(() => {
      navigation.workbench = "pageEditor";
      view.rerender();
    });
    expect(fileActions.setSelectedFiles).toHaveBeenCalledWith(["B"]);
    act(() => {
      fileState.state.ui.selectedFileIds = ["B"] as FileId[];
      view.rerender();
    });
    expect(view.result.current.fileOrder).toEqual(["B"]);

    fileActions.setSelectedFiles.mockClear();
    act(() => {
      fileState.state.ui.selectedFileIds = [];
      view.rerender();
    });
    expect(view.result.current.fileOrder).toEqual([]);
    expect(fileActions.setSelectedFiles).not.toHaveBeenCalled();
  });

  it("preserves checked PDFs instead of replacing them with the reader file", () => {
    setFiles([
      ["A", { name: "A.pdf" }],
      ["B", { name: "B.pdf" }],
      ["C", { name: "C.pdf" }],
    ]);
    fileState.state.ui.selectedFileIds = ["A", "B"] as FileId[];
    viewer.activeFileId = "C";
    const view = renderHook(() => usePageEditor(), { wrapper });
    act(() => {
      navigation.workbench = "pageEditor";
      view.rerender();
    });
    expect(view.result.current.fileOrder).toEqual(["A", "B"]);
    expect(fileActions.setSelectedFiles).not.toHaveBeenCalled();
  });

  it.each(["missing", "image"])(
    "does not add the reader file %s when it is not an available PDF",
    (activeFileId) => {
      setFiles([["image", { name: "image.png" }]]);
      fileState.state.ui.selectedFileIds = [];
      viewer.activeFileId = activeFileId;
      const view = renderHook(() => usePageEditor(), { wrapper });
      act(() => {
        navigation.workbench = "pageEditor";
        view.rerender();
      });
      expect(view.result.current.fileOrder).toEqual([]);
      expect(fileActions.setSelectedFiles).not.toHaveBeenCalled();
    },
  );
});
