import type { RedactionPage, RedactionRect } from "@app/types/fileRedaction";

type Matrix = [number, number, number, number, number, number];
const identity = (): Matrix => [1, 0, 0, 1, 0, 0];
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function matrix(value: unknown): Matrix | undefined {
  if (
    !Array.isArray(value) ||
    value.length !== 6 ||
    !value.every((item) => typeof item === "number" && Number.isFinite(item))
  )
    return;
  const numbers = value.map(Number);
  return [
    numbers[0],
    numbers[1],
    numbers[2],
    numbers[3],
    numbers[4],
    numbers[5],
  ];
}

/** Unknown composite image operations require whole-page OCR; simple images retain their page bounds. */
export function imageRegions(
  operations: { fnArray: number[]; argsArray: unknown[] },
  ops: {
    save: number;
    restore: number;
    transform: number;
    paintImageXObject: number;
    paintInlineImageXObject: number;
    paintImageXObjectRepeat: number;
    paintInlineImageXObjectGroup: number;
    paintFormXObjectBegin: number;
    paintFormXObjectEnd: number;
  },
  convert: (x: number, y: number) => number[],
): RedactionRect[] | null {
  let current = identity();
  const stack: Matrix[] = [];
  const regions: RedactionRect[] = [];
  for (const [index, operation] of operations.fnArray.entries()) {
    const args = operations.argsArray[index];
    if (operation === ops.save || operation === ops.paintFormXObjectBegin)
      stack.push([...current]);
    if (operation === ops.restore || operation === ops.paintFormXObjectEnd)
      current = stack.pop() ?? identity();
    if (operation === ops.transform) {
      const next = matrix(args);
      if (!next) return null;
      current = multiply(current, next);
    }
    if (operation === ops.paintFormXObjectBegin && Array.isArray(args)) {
      const next = matrix(args[0]);
      if (next) current = multiply(current, next);
    }
    if (
      operation === ops.paintImageXObjectRepeat ||
      operation === ops.paintInlineImageXObjectGroup
    )
      return null;
    if (
      operation !== ops.paintImageXObject &&
      operation !== ops.paintInlineImageXObject
    )
      continue;
    const points = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].map(([x, y]) =>
      convert(
        current[0] * x + current[2] * y + current[4],
        current[1] * x + current[3] * y + current[5],
      ),
    );
    const x = Math.min(...points.map((point) => point[0]));
    const y = Math.min(...points.map((point) => point[1]));
    const width = Math.max(...points.map((point) => point[0])) - x;
    const height = Math.max(...points.map((point) => point[1])) - y;
    if (width > 1 && height > 1) regions.push({ x, y, width, height });
  }
  return regions;
}

/** Appends only OCR glyphs not covered by native text, preserving both the text and its original coordinates. */
export function appendImageText(
  page: RedactionPage,
  recognized: Pick<RedactionPage, "text" | "spans">,
  region: RedactionRect,
  pixels: { width: number; height: number },
): void {
  const native = page.spans.filter((span) => span.rect);
  let previousEnd = -1;
  for (const span of recognized.spans) {
    if (!span.rect) continue;
    const rect = {
      x: region.x + (span.rect.x * region.width) / pixels.width,
      y: region.y + (span.rect.y * region.height) / pixels.height,
      width: (span.rect.width * region.width) / pixels.width,
      height: (span.rect.height * region.height) / pixels.height,
    };
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    if (
      native.some(
        (existing) =>
          existing.rect &&
          page.text.slice(existing.start, existing.end) ===
            recognized.text.slice(span.start, span.end) &&
          centerX >= existing.rect.x - 1 &&
          centerX <= existing.rect.x + existing.rect.width + 1 &&
          centerY >= existing.rect.y - 1 &&
          centerY <= existing.rect.y + existing.rect.height + 1,
      )
    )
      continue;
    const gap = recognized.text.slice(previousEnd, span.start);
    if (previousEnd < 0 || /\S/u.test(gap)) page.text += "\n";
    else page.text += gap;
    const start = page.text.length;
    page.text += recognized.text.slice(span.start, span.end);
    page.spans.push({ ...span, start, end: page.text.length, rect, ocr: true });
    previousEnd = span.end;
  }
}
