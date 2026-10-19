import { beforeEach, describe, expect, it, vi } from "vitest";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import {
  applyPartialEditPlan,
  planPartialEdit,
  restorePartialEditPlan,
} from "@app/tools/pdfTextEditor/commands/partialEdit";

vi.mock("@app/services/apiClient", () => ({ default: { post: vi.fn() } }));
vi.mock("@app/tools/pdfTextEditor/pdfium/PdfiumSave", () => ({
  PdfiumSave: {},
}));
const emit = vi.hoisted(() => vi.fn());
vi.mock(
  "@app/tools/pdfTextEditor/commands/editTextHelpers",
  async (original) => ({
    ...(await original<
      typeof import("@app/tools/pdfTextEditor/commands/editTextHelpers")
    >()),
    emitTextLine: emit,
  }),
);

function mixedRun() {
  const run = new TextRun({
    id: "r",
    pageIndex: 0,
    text: "标题 FAISS 向量",
    fontId: "pdf:10:NotoSansSC",
    fontSize: 12,
    fontSubset: true,
    pdfiumObjPtr: 1,
    bounds: { x: 0, y: 100, width: 110, height: 12 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 100 },
    fill: { r: 0, g: 0, b: 0, a: 255 },
  });
  run.mergedFromPtrs = [1, 2, 3];
  run.mergedFromTexts = ["标题", "FAISS", "向量"];
  run.mergedFromCharStarts = [0, 3, 9];
  run.mergedFromBounds = [
    { x: 0, right: 24 },
    { x: 30, right: 65 },
    { x: 71, right: 95 },
  ];
  return run;
}

beforeEach(() => {
  emit.mockReset();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

describe("partial edit font and geometry preservation", () => {
  it("replaces only the edited PDF object inside a mixed-font line", () => {
    const run = mixedRun();
    const plan = planPartialEdit(run, run.text, "标题 FXISS 向量");
    expect(plan).not.toBeNull();
    expect(plan?.removePtrs.map((p) => p.ptr)).toEqual([2]);
    expect(plan?.ops).toEqual([
      { type: "keep", subRunIdx: 0, startBIdx: 0 },
      { type: "insert", anchorSubRunIdx: 1, text: "FXISS", startBIdx: 3 },
      { type: "keep", subRunIdx: 2, startBIdx: 9 },
    ]);
  });

  it("tracks the actual unequal chunks and bounds emitted for inserted text", () => {
    const run = mixedRun();
    const plan = planPartialEdit(run, run.text, run.text + " W中文 i")!;
    const heap = new Map<number, number>();
    let next = 100;
    const bounds = new Map([
      [11, { x: 100, right: 111 }],
      [12, { x: 112, right: 136 }],
      [13, { x: 140, right: 143 }],
    ]);
    const m = {
      pdfium: {
        wasmExports: { malloc: () => next++, free: vi.fn() },
        getValue: (p: number) => heap.get(p) ?? 0,
      },
      FPDFPageObj_GetBounds: (
        ptr: number,
        l: number,
        _b: number,
        r: number,
      ) => {
        const box = bounds.get(ptr);
        if (!box) return false;
        heap.set(l, box.x);
        heap.set(r, box.right);
        return true;
      },
      FPDFPage_RemoveObject: vi.fn(),
      FPDFTextObj_GetFont: (ptr: number) => ptr * 10,
    };
    const doc = {
      module: m,
      loadedPages: () => [],
      docPtr: 1,
    } as unknown as EditorDocument;
    const page = new Page({ index: 0, pagePtr: 1, width: 612, height: 792 });
    emit.mockImplementation((opts) => {
      opts.outTexts?.push("W", "中文", "i");
      return [11, 12, 13];
    });
    const result = applyPartialEditPlan(doc, page, run, plan);
    expect(result.newMergedFromTexts.slice(-3)).toEqual(["W", "中文", "i"]);
    expect(result.newMergedFromCharStarts.slice(-3)).toEqual([12, 13, 16]);
    expect(result.newMergedFromBounds.slice(-3)).toEqual([...bounds.values()]);

    const replacement = planPartialEdit(run, run.text, "标题 FXISS 向量")!;
    applyPartialEditPlan(doc, page, run, replacement);
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ originalFontPtr: 20 }),
    );
  });

  it("undo restores the original font objects and neighbouring positions", () => {
    const run = mixedRun();
    const plan = planPartialEdit(run, run.text, "标题 FXISS 向量")!;
    const heap = new Map<number, number>();
    let next = 100;
    const boxes = [
      { x: 0, right: 24 },
      { x: 30, right: 65 },
      { x: 75, right: 99 },
    ];
    const m = {
      pdfium: {
        wasmExports: { malloc: () => next++, free: vi.fn() },
        getValue: (ptr: number) => heap.get(ptr) ?? 0,
      },
      FPDFPage_CountObjects: () => 2,
      FPDFPage_GetObject: (_page: number, i: number) => [1, 3][i],
      FPDFPage_InsertObject: vi.fn(),
      FPDFPageObj_Transform: vi.fn(),
      FPDFPageObj_GetBounds: (
        ptr: number,
        l: number,
        _b: number,
        r: number,
      ) => {
        heap.set(l, boxes[ptr - 1].x);
        heap.set(r, boxes[ptr - 1].right);
        return true;
      },
    };
    const page = new Page({ index: 0, pagePtr: 7, width: 612, height: 792 });
    expect(
      restorePartialEditPlan(
        m as unknown as EditorDocument["module"],
        page,
        plan,
      ),
    ).toBe(true);
    expect(m.FPDFPage_InsertObject).toHaveBeenCalledExactlyOnceWith(7, 2);
    expect(m.FPDFPageObj_Transform).toHaveBeenCalledExactlyOnceWith(
      3,
      1,
      0,
      0,
      1,
      -4,
      0,
    );
  });

  it("keeps the pen origin separate from ink bounds when replacing a word", () => {
    const run = mixedRun();
    const plan = planPartialEdit(run, run.text, "标题 FXISS 向量")!;
    const heap = new Map<number, number>();
    let next = 100;
    const boxes = new Map(run.mergedFromBounds.map((box, i) => [i + 1, box]));
    const m = {
      pdfium: {
        wasmExports: { malloc: () => next++, free: vi.fn() },
        getValue: (ptr: number) => heap.get(ptr) ?? 0,
      },
      FPDFTextObj_GetFont: (ptr: number) => ptr * 10,
      FPDFPageObj_GetMatrix: (_ptr: number, matrix: number) => {
        heap.set(matrix + 16, 29.5);
        heap.set(matrix + 20, 100);
        return true;
      },
      FPDFPageObj_GetBounds: (
        ptr: number,
        l: number,
        _b: number,
        r: number,
      ) => {
        const box = boxes.get(ptr)!;
        heap.set(l, box.x);
        heap.set(r, box.right);
        return true;
      },
      FPDFPage_RemoveObject: vi.fn(),
      FPDFPageObj_Transform: vi.fn(),
    };
    const doc = { module: m, docPtr: 1 } as unknown as EditorDocument;
    const page = new Page({ index: 0, pagePtr: 1, width: 612, height: 792 });
    emit.mockImplementation((opts) => {
      boxes.set(4, { x: opts.x + 0.5, right: opts.x + 35.5 });
      opts.outTexts.push("FXISS");
      return [4];
    });
    const result = applyPartialEditPlan(doc, page, run, plan);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ x: 29.5, y: 100 }),
    );
    expect(result.newMergedFromBounds[2]).toEqual({ x: 71, right: 95 });
    expect(m.FPDFPageObj_Transform).not.toHaveBeenCalled();
  });
});
