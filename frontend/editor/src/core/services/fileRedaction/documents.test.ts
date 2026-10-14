import { describe, expect, it, vi } from "vitest";
import { paintRedactions } from "@app/services/fileRedaction/documents";
import type { RedactionHit, RedactionPage } from "@app/types/fileRedaction";

describe("redaction pixel coverage", () => {
  it("covers CJK edge strokes outside a tight OCR box without expanding vertically by a whole line", () => {
    const fillRect = vi.fn();
    const context = { fillRect, fillStyle: "" };
    const canvas = {
      width: 1200,
      height: 900,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const page: RedactionPage = {
      index: 0,
      width: 1200,
      height: 900,
      text: "测试信息有限公司",
      spans: [],
      source: "ocr",
    };
    const hit: RedactionHit = {
      id: "hit",
      documentId: "doc",
      pageIndex: 0,
      category: "company",
      original: page.text,
      start: 0,
      end: page.text.length,
      selected: true,
      review: true,
      rects: [{ x: 177, y: 419, width: 255, height: 34 }],
    };
    paintRedactions(canvas, page, [hit], new Map(), "blackout");
    const [x, y, width, height] = fillRect.mock.calls[0];
    expect(x).toBeLessThanOrEqual(160);
    expect(x + width).toBeGreaterThanOrEqual(432);
    expect(y).toBeGreaterThan(410);
    expect(y + height).toBeLessThan(463);
    expect(context.fillStyle).toBe("black");
  });
  it("leaves excluded areas untouched", () => {
    const fillRect = vi.fn();
    paintRedactions(
      {
        width: 10,
        height: 10,
        getContext: () => ({ fillRect }),
      } as unknown as HTMLCanvasElement,
      { width: 10, height: 10 } as RedactionPage,
      [{ selected: false }] as RedactionHit[],
      new Map(),
      "blackout",
    );
    expect(fillRect).not.toHaveBeenCalled();
  });
  it("limits OCR safety margins at neighboring text on both sides and adjacent rows", () => {
    const fillRect = vi.fn();
    const page: RedactionPage = {
      index: 0,
      width: 500,
      height: 200,
      source: "ocr",
      text: "名张三后上下",
      spans: [
        { start: 0, end: 1, rect: { x: 62, y: 30, width: 27, height: 28 } },
        { start: 1, end: 3, rect: { x: 92, y: 30, width: 57, height: 28 } },
        { start: 3, end: 4, rect: { x: 152, y: 30, width: 27, height: 28 } },
        { start: 4, end: 5, rect: { x: 92, y: 0, width: 57, height: 28 } },
        { start: 5, end: 6, rect: { x: 92, y: 60, width: 57, height: 28 } },
      ],
    };
    const hit: RedactionHit = {
      id: "name",
      documentId: "doc",
      pageIndex: 0,
      category: "name",
      original: "张三",
      start: 1,
      end: 3,
      rects: [page.spans[1].rect!],
      selected: true,
      review: true,
    };
    paintRedactions(
      {
        width: 1000,
        height: 400,
        getContext: () => ({ fillRect }),
      } as unknown as HTMLCanvasElement,
      page,
      [hit],
      new Map(),
      "blackout",
    );
    expect(fillRect).toHaveBeenCalledWith(178, 56, 126, 64);
  });
  it("honors the exact hand-drawn area rather than expanding over neighboring content", () => {
    const fillRect = vi.fn();
    const page: RedactionPage = {
      index: 0,
      width: 500,
      height: 200,
      source: "ocr",
      text: "",
      spans: [],
    };
    const hit: RedactionHit = {
      id: "manual",
      documentId: "doc",
      pageIndex: 0,
      category: "region",
      original: "",
      start: 0,
      end: 0,
      rects: [{ x: 10, y: 15, width: 20, height: 25 }],
      selected: true,
      review: false,
      manual: true,
    };
    paintRedactions(
      {
        width: 500,
        height: 200,
        getContext: () => ({ fillRect }),
      } as unknown as HTMLCanvasElement,
      page,
      [hit],
      new Map(),
      "blackout",
    );
    expect(fillRect).toHaveBeenCalledWith(10, 15, 20, 25);
  });
});
