import type { RedactionRect, RedactionSpan } from "@app/types/fileRedaction";

interface OcrLineBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Refines an OCR row only when its raster glyphs can be matched one-to-one to the recognized symbols. */
export function refineOcrLine(
  canvas: HTMLCanvasElement,
  bounds: OcrLineBox | undefined,
  text: string,
  spans: RedactionSpan[],
): RedactionSpan[] {
  if (
    !bounds ||
    !spans.length ||
    bounds.x1 - bounds.x0 <= bounds.y1 - bounds.y0
  )
    return spans;
  const values = spans.map((span) => text.slice(span.start, span.end));
  if (
    values.some((value) => [...value].length !== 1) ||
    values.filter((value) => /\p{Script=Han}/u.test(value)).length <
      Math.max(2, spans.length * 0.6)
  )
    return spans;

  const left = Math.max(0, Math.floor(bounds.x0) - 1);
  const top = Math.max(0, Math.floor(bounds.y0) - 1);
  const right = Math.min(canvas.width, Math.ceil(bounds.x1) + 1);
  const bottom = Math.min(canvas.height, Math.ceil(bounds.y1) + 1);
  if (right <= left || bottom <= top) return spans;
  let pixels: ImageData;
  try {
    const context = canvas.getContext("2d");
    if (!context) return spans;
    pixels = context.getImageData(left, top, right - left, bottom - top);
  } catch {
    return spans;
  }
  const runs: RedactionRect[] = [];
  let run: RedactionRect | undefined;
  let inkCount = 0;
  for (let x = 0; x < pixels.width; x++) {
    let minY = pixels.height;
    let maxY = -1;
    for (let y = 0; y < pixels.height; y++) {
      const offset = (y * pixels.width + x) * 4;
      if (
        pixels.data[offset + 3] >= 128 &&
        (pixels.data[offset] +
          pixels.data[offset + 1] +
          pixels.data[offset + 2]) /
          3 <
          180
      ) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        inkCount++;
      }
    }
    if (maxY < 0) {
      run = undefined;
      continue;
    }
    if (!run) {
      run = { x: left + x, y: top + minY, width: 1, height: maxY - minY + 1 };
      runs.push(run);
    } else {
      const runBottom = Math.max(run.y + run.height, top + maxY + 1);
      run.y = Math.min(run.y, top + minY);
      run.height = runBottom - run.y;
      run.width++;
    }
  }
  if (inkCount > pixels.width * pixels.height * 0.35) return spans;
  const glyphs: RedactionRect[] = [];
  const height = bounds.y1 - bounds.y0;
  for (const next of runs) {
    const previous = glyphs.at(-1);
    const end = next.x + next.width;
    if (
      previous &&
      next.x - previous.x - previous.width <=
        Math.max(1, Math.round(height * 0.1)) &&
      end - previous.x <= height * 1.3
    ) {
      const glyphBottom = Math.max(
        previous.y + previous.height,
        next.y + next.height,
      );
      previous.y = Math.min(previous.y, next.y);
      previous.height = glyphBottom - previous.y;
      previous.width = end - previous.x;
    } else glyphs.push({ ...next });
  }

  // Chinese OCR sometimes inserts a quote inside the following character's box.
  const duplicates = new Set<number>();
  spans.forEach((span, index) => {
    const next = spans[index + 1];
    if (
      /^[“”"'‘’]$/u.test(values[index]) &&
      next?.rect &&
      span.rect &&
      /\p{Script=Han}/u.test(values[index + 1]) &&
      span.rect.x >= next.rect.x &&
      span.rect.x + span.rect.width <= next.rect.x + next.rect.width
    )
      duplicates.add(index);
  });
  if (glyphs.length !== spans.length - duplicates.size) return spans;
  let glyphIndex = 0;
  return spans.map((span, index) =>
    duplicates.has(index)
      ? { ...span, rect: undefined }
      : { ...span, rect: glyphs[glyphIndex++], inkBounds: true },
  );
}
