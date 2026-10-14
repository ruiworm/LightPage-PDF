import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileRedactionProvider,
  useFileRedaction,
} from "@app/contexts/FileRedactionContext";
import type { RedactionDocument } from "@app/types/fileRedaction";

const mocks = vi.hoisted(() => ({
  analyse: vi.fn(),
  dispose: vi.fn(),
  activeFileId: "doc" as string | null,
  setActiveFileId: vi.fn(),
  scrollToPage: vi.fn(),
  disposeOcr: vi.fn(),
}));
vi.mock("@app/contexts/ViewerContext", () => ({
  useViewer: () => ({
    activeFileId: mocks.activeFileId,
    setActiveFileId: mocks.setActiveFileId,
    scrollActions: { scrollToPage: mocks.scrollToPage },
  }),
}));
vi.mock("@app/services/fileRedaction/documents", () => ({
  analyseRedactionFile: mocks.analyse,
  disposeRedactionDocument: mocks.dispose,
}));
vi.mock("@app/services/fileRedaction/ocr", () => ({
  LocalRedactionOcr: class {
    dispose = () => mocks.disposeOcr();
  },
}));
vi.mock("@app/services/fileRedaction/ner", () => ({
  recognizeDocumentEntities: vi.fn(async () => {}),
}));

const file = new File([], "fixture.pdf");
const doc: RedactionDocument = {
  id: "doc",
  file,
  kind: "pdf",
  warnings: [],
  pages: [
    {
      index: 0,
      width: 100,
      height: 100,
      text: "姓名：张三\n自定义秘密\n电话：13900000000",
      spans: [],
      source: "text",
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.activeFileId = "doc";
  localStorage.clear();
  mocks.analyse.mockResolvedValue(doc);
  mocks.disposeOcr.mockResolvedValue(undefined);
});

describe("file redaction review session", () => {
  it("allows retry after an OCR worker fails to shut down", async () => {
    mocks.disposeOcr.mockRejectedValueOnce(new Error("terminate failed"));
    const { result } = renderHook(useFileRedaction, {
      wrapper: FileRedactionProvider,
    });
    await act(async () => {
      await expect(
        result.current.analyse([{ file, id: "doc" }]),
      ).rejects.toThrow("terminate failed");
    });
    expect(result.current.busy).toBe(false);
    await act(() => result.current.analyse([{ file, id: "doc" }]));
    expect(mocks.analyse).toHaveBeenCalledTimes(2);
  });
  it("redacts a whole column without the header, supports undo and keeps manual column choices when rules change", async () => {
    const table: RedactionDocument = {
      id: "doc",
      file: new File([], "table.csv"),
      kind: "csv",
      warnings: [],
      pages: ["姓名", "张三", "李四"].map((text, index) => ({
        index,
        width: 0,
        height: 0,
        text,
        spans: [],
        source: "table",
        tableCell: {
          sheet: 0,
          row: index,
          column: 0,
          reference: `A${index + 1}`,
        },
      })),
      table: {
        sheets: [
          { name: "人员", hidden: false, header: true, rows: [[0], [1], [2]] },
        ],
      },
    };
    mocks.analyse.mockResolvedValue(table);
    const { result } = renderHook(useFileRedaction, {
      wrapper: FileRedactionProvider,
    });
    await act(() => result.current.analyse([{ file: table.file, id: "doc" }]));
    const original = result.current.hits;
    act(() => result.current.redactColumn("doc", 0, 0, "name", true));
    expect(result.current.hits.map((hit) => hit.original)).toEqual([
      "张三",
      "李四",
    ]);
    expect(result.current.hits.every((hit) => hit.selected)).toBe(true);
    act(() => result.current.undo());
    expect(result.current.hits).toEqual(original);
    act(() => result.current.redo());
    act(() => result.current.updateSettings({ categories: ["phone"] }));
    expect(result.current.hits.map((hit) => hit.original)).toEqual([
      "张三",
      "李四",
    ]);
    act(() => result.current.focusHit(result.current.hits[0]));
    expect(mocks.scrollToPage).not.toHaveBeenCalled();
    act(() => result.current.redactColumn("doc", 0, 0, "custom", false));
    expect(result.current.hits.map((hit) => hit.original)).toEqual([
      "姓名",
      "张三",
      "李四",
    ]);
  });
  it("clears the current results when opening an unanalysed file, and restores them on return", async () => {
    const { result, rerender } = renderHook(useFileRedaction, {
      wrapper: FileRedactionProvider,
    });
    await act(() => result.current.analyse([{ file, id: "doc" }]));
    act(() => result.current.setPreview(true));
    act(() => result.current.setDrawing(true));
    mocks.activeFileId = "another-pdf";
    rerender();
    expect(result.current.activeDocumentId).toBeNull();
    expect(result.current.drawing).toBe(false);
    expect(result.current.documents).toHaveLength(1);
    mocks.activeFileId = "doc";
    rerender();
    expect(result.current.activeDocumentId).toBe("doc");
  });
  it("does not reopen an old file when detection completes after the reader switches files", async () => {
    let complete!: (value: RedactionDocument) => void;
    mocks.analyse.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { result, rerender } = renderHook(useFileRedaction, {
      wrapper: FileRedactionProvider,
    });
    let pending!: Promise<void>;
    await act(async () => {
      pending = result.current.analyse([{ file, id: "doc" }]);
    });
    mocks.activeFileId = "another-pdf";
    rerender();
    await act(async () => {
      complete(doc);
      await pending;
    });
    expect(result.current.activeDocumentId).toBeNull();
    expect(mocks.setActiveFileId).not.toHaveBeenCalled();
  });
  it("adds a manual region to the rendered page and locates results in the native reader", async () => {
    const { result } = renderHook(useFileRedaction, {
      wrapper: FileRedactionProvider,
    });
    await act(() => result.current.analyse([{ file, id: "doc" }]));
    act(() =>
      result.current.addRegion({ x: 2, y: 3, width: 20, height: 10 }, 1),
    );
    const hit = result.current.hits.at(-1)!;
    expect(hit.pageIndex).toBe(1);
    act(() => result.current.focusHit(hit));
    expect(mocks.setActiveFileId).toHaveBeenCalledWith("doc");
    expect(mocks.scrollToPage).toHaveBeenCalledWith(2, "smooth");
  });
  it("keeps manual search and regions when categories and dictionaries change", async () => {
    const { result } = renderHook(useFileRedaction, {
      wrapper: FileRedactionProvider,
    });
    await act(() => result.current.analyse([{ file, id: "doc" }]));
    act(() => {
      result.current.addSearch("自定义秘密");
    });
    act(() => {
      result.current.addRegion({ x: 1, y: 1, width: 10, height: 10 });
    });
    act(() =>
      result.current.updateSettings({
        categories: ["phone"],
        requiredWords: ["自定义秘密"],
      }),
    );
    expect(result.current.hits.map((hit) => hit.original).sort()).toEqual(
      ["", "13900000000", "自定义秘密"].sort(),
    );
    expect(
      result.current.hits.filter((hit) => hit.original === "自定义秘密"),
    ).toHaveLength(1);
  });
  it("undoes and redoes exclusions and preserves them when automatic rules refresh", async () => {
    const { result } = renderHook(useFileRedaction, {
      wrapper: FileRedactionProvider,
    });
    await act(() => result.current.analyse([{ file, id: "doc" }]));
    const id = result.current.hits.find((hit) => hit.category === "phone")!.id;
    act(() =>
      result.current.changeHits([id], { selected: false, review: false }),
    );
    act(() => result.current.undo());
    expect(result.current.hits.find((hit) => hit.id === id)?.selected).toBe(
      true,
    );
    act(() => result.current.redo());
    expect(result.current.hits.find((hit) => hit.id === id)?.selected).toBe(
      false,
    );
    act(() => result.current.updateSettings({ requiredWords: ["其他词语"] }));
    expect(result.current.hits.find((hit) => hit.id === id)?.selected).toBe(
      false,
    );
  });
  it("uses selected reader regions without adding unrelated automatically detected fields", async () => {
    const { result } = renderHook(useFileRedaction, {
      wrapper: FileRedactionProvider,
    });
    await act(() =>
      result.current.analyse(
        [{ file, id: "doc" }],
        [{ pageIndex: 0, rect: { x: 4, y: 6, width: 30, height: 10 } }],
      ),
    );
    expect(result.current.hits).toHaveLength(1);
    expect(result.current.hits[0].category).toBe("region");
    expect(mocks.analyse.mock.calls[0][2].ocr).toBe(false);
  });
});
