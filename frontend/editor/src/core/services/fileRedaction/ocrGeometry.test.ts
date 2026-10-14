import { describe, expect, it } from "vitest";
import { refineOcrLine } from "@app/services/fileRedaction/ocrGeometry";
import { paintRedactions } from "@app/services/fileRedaction/documents";
import { hitRects } from "@app/services/fileRedaction/rules";
import type {
  RedactionHit,
  RedactionPage,
  RedactionRect,
  RedactionSpan,
} from "@app/types/fileRedaction";

function raster(glyphs: RedactionRect[]) {
  const width = 500;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (const glyph of glyphs) {
    for (let y = glyph.y; y < glyph.y + glyph.height; y++) {
      for (let x = glyph.x; x < glyph.x + glyph.width; x++) {
        if (
          x !== glyph.x &&
          x !== glyph.x + glyph.width - 1 &&
          y !== glyph.y &&
          y !== glyph.y + glyph.height - 1
        )
          continue;
        const offset = (y * width + x) * 4;
        data.fill(30, offset, offset + 3);
      }
    }
  }
  const context = {
    fillStyle: "",
    getImageData(x: number, y: number, w: number, h: number) {
      const sample = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row++)
        sample.set(
          data.subarray(
            ((y + row) * width + x) * 4,
            ((y + row) * width + x + w) * 4,
          ),
          row * w * 4,
        );
      return { data: sample, width: w, height: h } as ImageData;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      for (let row = Math.ceil(y); row < y + h; row++) {
        for (let col = Math.ceil(x); col < x + w; col++) {
          const offset = (row * width + col) * 4;
          data.fill(0, offset, offset + 3);
        }
      }
    },
  };
  return {
    canvas: {
      width,
      height,
      getContext: () => context,
    } as unknown as HTMLCanvasElement,
    data,
  };
}

describe("OCR redaction boundaries", () => {
  it("covers the complete name while leaving the following Chinese text unchanged despite shifted OCR boxes", () => {
    const glyphs = [82, 112, 142, 172, 202].map((x) => ({
      x,
      y: 20,
      width: 27,
      height: 28,
    }));
    const { canvas, data } = raster(glyphs);
    const original = data.slice();
    const text = "陈列桐昨天";
    const spans = [82, 112, 172, 201, 215].map((x, index) => ({
      start: index,
      end: index + 1,
      rect: { x, y: 20, width: index === 2 ? 16 : 27, height: 28 },
    }));
    const corrected = refineOcrLine(
      canvas,
      { x0: 82, x1: 229, y0: 20, y1: 48 },
      text,
      spans,
    );
    expect(corrected.map((span) => span.rect)).toEqual(glyphs);
    const page: RedactionPage = {
      index: 0,
      width: canvas.width,
      height: canvas.height,
      source: "ocr",
      text,
      spans: corrected,
    };
    const hit: RedactionHit = {
      id: "name",
      documentId: "doc",
      pageIndex: 0,
      category: "name",
      original: text.slice(0, 3),
      start: 0,
      end: 3,
      rects: hitRects(page, 0, 3),
      selected: true,
      review: true,
    };
    paintRedactions(canvas, page, [hit], new Map(), "blackout");
    for (let y = 20; y < 48; y++)
      for (let x = 172; x < 229; x++) {
        const offset = (y * canvas.width + x) * 4;
        expect(data.subarray(offset, offset + 4)).toEqual(
          original.subarray(offset, offset + 4),
        );
      }
    for (const glyph of glyphs.slice(0, 3))
      for (let y = glyph.y; y < glyph.y + glyph.height; y++)
        for (let x = glyph.x; x < glyph.x + glyph.width; x++) {
          const offset = (y * canvas.width + x) * 4;
          if (original[offset] < 180) expect(data[offset]).toBe(0);
        }
  });

  it("does not shift the following label when OCR inserts a quote inside its glyph", () => {
    const glyphs = [172, 202, 261, 292].map((x) => ({
      x,
      y: 20,
      width: 27,
      height: 28,
    }));
    const { canvas } = raster(glyphs);
    const text = "张三”被告";
    const spans: RedactionSpan[] = [
      { start: 0, end: 1, rect: { x: 185, y: 15, width: 36, height: 44 } },
      { start: 1, end: 2, rect: { x: 221, y: 15, width: 22, height: 44 } },
      { start: 2, end: 3, rect: { x: 261, y: 20, width: 10, height: 28 } },
      { start: 3, end: 4, rect: { x: 261, y: 20, width: 146, height: 28 } },
      { start: 4, end: 5, rect: { x: 309, y: 15, width: 25, height: 44 } },
    ];
    const corrected = refineOcrLine(
      canvas,
      { x0: 172, x1: 319, y0: 20, y1: 48 },
      text,
      spans,
    );
    expect(corrected[2].rect).toBeUndefined();
    expect(
      corrected.filter((span) => span.rect).map((span) => span.rect),
    ).toEqual(glyphs);
  });

  it("keeps the supplied coordinates when raster glyphs cannot be unambiguously matched", () => {
    const { canvas } = raster(
      [10, 40, 70].map((x) => ({ x, y: 20, width: 27, height: 28 })),
    );
    const spans = [10, 40].map((x, index) => ({
      start: index,
      end: index + 1,
      rect: { x, y: 20, width: 27, height: 28 },
    }));
    expect(
      refineOcrLine(canvas, { x0: 10, x1: 97, y0: 20, y1: 48 }, "张三", spans),
    ).toBe(spans);
  });

  it("keeps vertical text in the original coordinate system", () => {
    const { canvas } = raster([
      { x: 20, y: 10, width: 27, height: 28 },
      { x: 20, y: 45, width: 27, height: 28 },
    ]);
    const spans = [10, 45].map((y, index) => ({
      start: index,
      end: index + 1,
      rect: { x: 20, y, width: 27, height: 28 },
    }));
    expect(
      refineOcrLine(canvas, { x0: 20, x1: 47, y0: 10, y1: 73 }, "张三", spans),
    ).toBe(spans);
  });
});
