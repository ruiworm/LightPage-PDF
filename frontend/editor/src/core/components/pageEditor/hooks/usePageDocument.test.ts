import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePageDocument } from "@app/components/pageEditor/hooks/usePageDocument";
import type { FileId, StirlingFileStub } from "@app/types/fileContext";

const files = new Map<FileId, File>();
const fileState = {
  state: {
    ui: { selectedFileIds: [] as FileId[], isProcessing: true },
    files: { byId: {} as Record<FileId, Partial<StirlingFileStub>> },
  },
  selectors: {
    getFilesSignature: () => Object.keys(fileState.state.files.byId).join(","),
    getStirlingFileStub: (id: FileId) => fileState.state.files.byId[id],
    getFile: (id: FileId) => files.get(id),
  },
};
const pageEditor = {
  fileOrder: [] as FileId[],
  currentPages: null,
  persistedDocument: null,
  persistedDocumentSignature: null,
};

vi.mock("@app/contexts/FileContext", () => ({
  useFileState: () => fileState,
}));
vi.mock("@app/contexts/PageEditorContext", () => ({
  usePageEditor: () => pageEditor,
}));

const pdfId = "pdf" as FileId;
const imageId = "image" as FileId;

describe("page document workspace loading", () => {
  beforeEach(() => {
    files.clear();
    files.set(
      pdfId,
      new File(["%PDF-1.7"], "A.pdf", { type: "application/pdf" }),
    );
    fileState.state = {
      ui: { selectedFileIds: [], isProcessing: true },
      files: {
        byId: {
          [pdfId]: {
            name: "A.pdf",
            processedFile: { totalPages: 6, pages: [] },
          },
          [imageId]: { name: "image.png" },
        },
      },
    };
    pageEditor.fileOrder = [pdfId, imageId];
  });

  it("does not wait for unrelated processing when no files are checked", () => {
    const { result } = renderHook(() => usePageDocument());
    expect(result.current.document).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("does not wait for a PDF when only a non-PDF file is checked", () => {
    fileState.state.ui.selectedFileIds = [imageId];
    const { result } = renderHook(() => usePageDocument());
    expect(result.current.document).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("builds the checked PDF and returns to an idle empty state when unchecked", () => {
    fileState.state.ui.selectedFileIds = [pdfId];
    const { result, rerender } = renderHook(() => usePageDocument());
    expect(result.current.document?.totalPages).toBe(6);
    expect(result.current.isLoading).toBe(false);
    act(() => {
      fileState.state.ui.selectedFileIds = [];
      rerender();
    });
    expect(result.current.document).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(files.has(pdfId)).toBe(true);
  });

  it("keeps the document reference stable during unrelated UI renders", () => {
    fileState.state.ui.selectedFileIds = [pdfId];
    const { result, rerender } = renderHook(() => usePageDocument());
    const document = result.current.document;
    rerender();
    expect(result.current.document).toBe(document);
  });
});
