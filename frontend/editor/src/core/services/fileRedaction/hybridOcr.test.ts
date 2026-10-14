import { describe, expect, it } from "vitest";
import {
  appendImageText,
  imageRegions,
} from "@app/services/fileRedaction/hybridOcr";
import type { RedactionPage } from "@app/types/fileRedaction";

const ops = {
  save: 1,
  restore: 2,
  transform: 3,
  paintImageXObject: 4,
  paintInlineImageXObject: 5,
  paintImageXObjectRepeat: 6,
  paintInlineImageXObjectGroup: 7,
  paintFormXObjectBegin: 8,
  paintFormXObjectEnd: 9,
};
describe("hybrid PDF image recognition", () => {
  it("tracks image bounds through nested transforms and restores", () => {
    const result = imageRegions(
      {
        fnArray: [
          ops.save,
          ops.transform,
          ops.paintImageXObject,
          ops.restore,
          ops.transform,
          ops.paintInlineImageXObject,
        ],
        argsArray: [
          [],
          [200, 0, 0, 100, 30, 50],
          [],
          [],
          [20, 0, 0, 10, 10, 20],
          [],
        ],
      },
      ops,
      (x, y) => [x, 800 - y],
    );
    expect(result).toEqual([
      { x: 30, y: 650, width: 200, height: 100 },
      { x: 10, y: 770, width: 20, height: 10 },
    ]);
  });
  it("uses a whole-page fallback for composite image drawing", () => {
    expect(
      imageRegions(
        { fnArray: [ops.paintImageXObjectRepeat], argsArray: [[]] },
        ops,
        (x, y) => [x, y],
      ),
    ).toBeNull();
  });
  it("keeps native text and positions while adding image text with translated coordinates", () => {
    const page: RedactionPage = {
      index: 0,
      width: 100,
      height: 100,
      source: "text",
      text: "张三",
      spans: [
        { start: 0, end: 1, rect: { x: 10, y: 10, width: 10, height: 10 } },
        { start: 1, end: 2, rect: { x: 20, y: 10, width: 10, height: 10 } },
      ],
    };
    const recognized = {
      text: "张三\n李四",
      spans: [
        { start: 0, end: 1, rect: { x: 20, y: 20, width: 20, height: 20 } },
        { start: 1, end: 2, rect: { x: 40, y: 20, width: 20, height: 20 } },
        { start: 3, end: 4, rect: { x: 20, y: 80, width: 20, height: 20 } },
        { start: 4, end: 5, rect: { x: 40, y: 80, width: 20, height: 20 } },
      ],
    };
    appendImageText(
      page,
      recognized,
      { x: 0, y: 0, width: 100, height: 100 },
      { width: 200, height: 200 },
    );
    expect(page.text).toBe("张三\n李四");
    expect(page.spans).toHaveLength(4);
    expect(page.spans[0]).toMatchObject({
      start: 0,
      end: 1,
      rect: { x: 10, y: 10, width: 10, height: 10 },
    });
    expect(page.spans[2]).toMatchObject({
      start: 3,
      end: 4,
      ocr: true,
      rect: { x: 10, y: 40, width: 10, height: 10 },
    });
    expect(page.source).toBe("text");
  });
});
