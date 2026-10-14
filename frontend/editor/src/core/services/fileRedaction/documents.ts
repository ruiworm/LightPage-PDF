import type { PDFDocumentProxy } from "pdfjs-dist";
import JSZip from "jszip";
import type {
  RedactionDocument,
  RedactionHit,
  RedactionPage,
  RedactionRect,
  RedactionSettings,
} from "@app/types/fileRedaction";
import {
  LocalRedactionOcr,
  throwIfAborted,
  type ProgressCallback,
} from "@app/services/fileRedaction/ocr";
import { exportWord, openWord } from "@app/services/fileRedaction/word";
import {
  appendImageText,
  imageRegions,
} from "@app/services/fileRedaction/hybridOcr";

const pdfs = new WeakMap<RedactionDocument, PDFDocumentProxy>();
const archives = new WeakMap<RedactionDocument, JSZip>();
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_PIXELS = 32_000_000;
export const REDACTION_ACCEPT =
  ".pdf,.docx,.doc,.xlsx,.csv,.png,.jpg,.jpeg,.webp,.bmp";

export function supportedRedactionFile(file: File): boolean {
  return /\.(pdf|docx?|xlsx|csv|png|jpe?g|webp|bmp)$/i.test(file.name);
}

export async function disposeRedactionDocument(
  document: RedactionDocument,
): Promise<void> {
  const pdf = pdfs.get(document);
  if (pdf) {
    const { pdfWorkerManager } = await import("@app/services/pdfWorkerManager");
    pdfs.delete(document);
    await pdfWorkerManager.destroyDocument(pdf);
  }
  archives.delete(document);
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  if (width * height > MAX_PIXELS || width < 1 || height < 1)
    throw new Error("IMAGE_TOO_LARGE");
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  return canvas;
}

async function imageCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const image = await createImageBitmap(blob);
  try {
    const canvas = makeCanvas(image.width, image.height);
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas;
  } finally {
    image.close();
  }
}

async function renderPdfPage(
  pdf: PDFDocumentProxy,
  index: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(index + 1);
  const viewport = page.getViewport({ scale });
  const canvas = makeCanvas(viewport.width, viewport.height);
  await page.render({
    canvas,
    canvasContext: canvas.getContext("2d")!,
    viewport,
  }).promise;
  return canvas;
}

async function pdfTextPages(
  file: File,
  signal: AbortSignal,
  progress: ProgressCallback,
): Promise<{ pages: RedactionPage[]; pdf: PDFDocumentProxy }> {
  const { pdfWorkerManager } = await import("@app/services/pdfWorkerManager");
  const { getPdfiumModule, openRawDocumentSafe, closeRawDocument } =
    await import("@app/services/pdfiumService");
  const { runPdfiumScan } = await import("@app/services/pdfiumScanQueue");
  const data = await file.arrayBuffer();
  const pdf = await pdfWorkerManager.createDocument(data.slice(0), {
    openTimeoutMs: 30_000,
    cMapUrl: new URL("vendor/redaction-pdf/cmaps/", document.baseURI).href,
    cMapPacked: true,
    standardFontDataUrl: new URL(
      "vendor/redaction-pdf/standard_fonts/",
      document.baseURI,
    ).href,
    useSystemFonts: true,
  });
  try {
    const pages = await runPdfiumScan(async () => {
      const m = await getPdfiumModule();
      const doc = await openRawDocumentSafe(data);
      const boxPointer = m.pdfium.wasmExports.malloc(32);
      const output: RedactionPage[] = [];
      try {
        for (let index = 0; index < pdf.numPages; index++) {
          throwIfAborted(signal);
          const pdfPage = await pdf.getPage(index + 1);
          const viewport = pdfPage.getViewport({ scale: 1 });
          const pagePointer = m.FPDF_LoadPage(doc, index);
          if (!pagePointer) throw new Error("PDF_PAGE_UNAVAILABLE");
          const textPointer = m.FPDFText_LoadPage(pagePointer);
          try {
            let text = "";
            const spans: RedactionPage["spans"] = [];
            const count = textPointer ? m.FPDFText_CountChars(textPointer) : 0;
            for (let i = 0; i < count; i++) {
              const code = m.FPDFText_GetUnicode(textPointer, i);
              if (!code || code > 0x10ffff) continue;
              const start = text.length;
              text += String.fromCodePoint(code);
              // Loose bounds include font-wide ascenders and descenders; embedded
              // CJK fonts can make that box several times taller than the glyph.
              const tight = m.FPDFText_GetCharBox(
                textPointer,
                i,
                boxPointer,
                boxPointer + 8,
                boxPointer + 16,
                boxPointer + 24,
              );
              if (
                tight ||
                m.FPDFText_GetLooseCharBox(textPointer, i, boxPointer)
              ) {
                const left = m.pdfium.getValue(
                  boxPointer,
                  tight ? "double" : "float",
                );
                const right = m.pdfium.getValue(
                  boxPointer + 8,
                  tight ? "double" : "float",
                );
                const bottom = m.pdfium.getValue(
                  boxPointer + (tight ? 16 : 12),
                  tight ? "double" : "float",
                );
                const top = m.pdfium.getValue(
                  boxPointer + (tight ? 24 : 4),
                  tight ? "double" : "float",
                );
                const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([
                  left,
                  bottom,
                  right,
                  top,
                ]);
                if (Math.abs(x2 - x1) > 0 && Math.abs(y2 - y1) > 0)
                  spans.push({
                    start,
                    end: text.length,
                    rect: {
                      x: Math.min(x1, x2),
                      y: Math.min(y1, y2),
                      width: Math.abs(x2 - x1),
                      height: Math.abs(y2 - y1),
                    },
                  });
              }
            }
            output.push({
              index,
              width: viewport.width,
              height: viewport.height,
              text,
              spans,
              source: "text",
            });
          } finally {
            if (textPointer) m.FPDFText_ClosePage(textPointer);
            m.FPDF_ClosePage(pagePointer);
          }
          progress({
            stage: "reading",
            file: file.name,
            page: index + 1,
            total: pdf.numPages,
          });
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        return output;
      } finally {
        m.pdfium.wasmExports.free(boxPointer);
        await closeRawDocument(doc);
      }
    });
    return { pages, pdf };
  } catch (error) {
    await pdfWorkerManager.destroyDocument(pdf);
    throw error;
  }
}

async function ocrPage(
  canvas: HTMLCanvasElement,
  page: RedactionPage,
  ocr: LocalRedactionOcr,
  signal: AbortSignal,
  progress: ProgressCallback,
  file: string,
  total: number,
): Promise<void> {
  progress({ stage: "ocr", file, page: page.index + 1, total, fraction: 0 });
  const recognized = await ocr.recognize(canvas, signal, (fraction) =>
    progress({ stage: "ocr", file, page: page.index + 1, total, fraction }),
  );
  const scaleX = page.width / canvas.width;
  const scaleY = page.height / canvas.height;
  page.text = recognized.text;
  page.spans = recognized.spans.map((span) => ({
    ...span,
    rect: span.rect
      ? {
          x: span.rect.x * scaleX,
          y: span.rect.y * scaleY,
          width: span.rect.width * scaleX,
          height: span.rect.height * scaleY,
        }
      : undefined,
  }));
  page.source = "ocr";
  canvas.width = 0;
  canvas.height = 0;
}

export async function analyseRedactionFile(
  file: File,
  id: string,
  settings: RedactionSettings,
  ocr: LocalRedactionOcr,
  signal: AbortSignal,
  progress: ProgressCallback,
): Promise<RedactionDocument> {
  throwIfAborted(signal);
  if (file.size > MAX_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
  if (!supportedRedactionFile(file)) throw new Error("FILE_UNSUPPORTED");
  if (/\.(xlsx|csv)$/i.test(file.name)) {
    const { openTable } = await import("@app/services/fileRedaction/table");
    const result = await openTable(file, id);
    throwIfAborted(signal);
    return result;
  }
  if (/\.doc$/i.test(file.name)) {
    const { convertLocalWordToPdf } =
      await import("@app/services/localWordConversion");
    const normalized = await convertLocalWordToPdf(file, signal);
    const result = await analyseRedactionFile(
      normalized,
      id,
      settings,
      ocr,
      signal,
      progress,
    );
    result.warnings.push("legacyWordPdf");
    return result;
  }
  if (/\.docx$/i.test(file.name)) {
    const { document: result, archive } = await openWord(file, id);
    archives.set(result, archive);
    for (const media of Object.keys(archive.files).filter((name) =>
      /^word\/media\/.*\.(?:png|jpe?g|webp|bmp)$/i.test(name),
    )) {
      throwIfAborted(signal);
      const canvas = await imageCanvas(
        await archive.file(media)!.async("blob"),
      );
      const page: RedactionPage = {
        index: result.pages.length,
        width: canvas.width,
        height: canvas.height,
        text: "",
        spans: [],
        source: "ocr",
        media,
      };
      result.pages.push(page);
      if (settings.ocr)
        await ocrPage(
          canvas,
          page,
          ocr,
          signal,
          progress,
          file.name,
          result.pages.length,
        );
      else {
        canvas.width = 0;
        result.warnings.push("ocrDisabled");
      }
    }
    if (
      Object.keys(archive.files).some((name) =>
        /^word\/media\/.*\.(?:emf|wmf|svg)$/i.test(name),
      )
    )
      result.warnings.push("wordVectorImages");
    return result;
  }
  if (/\.pdf$/i.test(file.name)) {
    const { pages, pdf } = await pdfTextPages(file, signal, progress);
    const result: RedactionDocument = {
      id,
      file,
      kind: "pdf",
      pages,
      warnings: ["pdfFlattened"],
    };
    pdfs.set(result, pdf);
    try {
      const { OPS } = await import("pdfjs-dist");
      const imageOperations = new Set([
        OPS.paintImageXObject,
        OPS.paintInlineImageXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintInlineImageXObjectGroup,
      ]);
      for (const page of pages) {
        const pdfPage = await pdf.getPage(page.index + 1);
        const operators = await pdfPage.getOperatorList();
        const needsOcr =
          page.text.replace(/\s/g, "").length < 8 ||
          operators.fnArray.some((operation) => imageOperations.has(operation));
        if (!needsOcr) continue;
        if (settings.ocr && page.text.replace(/\s/g, "").length >= 8) {
          const viewport = pdfPage.getViewport({ scale: 1 });
          const regions = imageRegions(operators, OPS, (x, y) =>
            viewport.convertToViewportPoint(x, y),
          ) ?? [{ x: 0, y: 0, width: page.width, height: page.height }];
          const full = await renderPdfPage(pdf, page.index, 2);
          try {
            for (const image of regions) {
              throwIfAborted(signal);
              const region = clampRect(
                {
                  x: image.x - 2,
                  y: image.y - 2,
                  width: image.width + 4,
                  height: image.height + 4,
                },
                page,
              );
              if (region.width < 2 || region.height < 2) continue;
              const crop = document.createElement("canvas");
              crop.width = Math.ceil(region.width * 2);
              crop.height = Math.ceil(region.height * 2);
              try {
                crop
                  .getContext("2d")!
                  .drawImage(
                    full,
                    region.x * 2,
                    region.y * 2,
                    region.width * 2,
                    region.height * 2,
                    0,
                    0,
                    crop.width,
                    crop.height,
                  );
                progress({
                  stage: "ocr",
                  file: file.name,
                  page: page.index + 1,
                  total: pages.length,
                });
                const recognized = await ocr.recognize(crop, signal);
                appendImageText(page, recognized, region, crop);
              } finally {
                crop.width = 0;
                crop.height = 0;
              }
            }
          } finally {
            full.width = 0;
            full.height = 0;
          }
        } else if (settings.ocr)
          await ocrPage(
            await renderPdfPage(pdf, page.index, 2),
            page,
            ocr,
            signal,
            progress,
            file.name,
            pages.length,
          );
        else result.warnings.push("ocrDisabled");
      }
      result.warnings = [...new Set(result.warnings)];
      return result;
    } catch (error) {
      await disposeRedactionDocument(result);
      throw error;
    }
  }
  const canvas = await imageCanvas(file);
  const page: RedactionPage = {
    index: 0,
    width: canvas.width,
    height: canvas.height,
    text: "",
    spans: [],
    source: "ocr",
  };
  if (settings.ocr)
    await ocrPage(canvas, page, ocr, signal, progress, file.name, 1);
  else {
    canvas.width = 0;
  }
  return {
    id,
    file,
    kind: "image",
    pages: [page],
    warnings: settings.ocr ? [] : ["ocrDisabled"],
  };
}

export async function renderRedactionPage(
  document: RedactionDocument,
  page: RedactionPage,
  scale = 1,
): Promise<HTMLCanvasElement> {
  if (document.kind === "pdf") {
    const pdf = pdfs.get(document);
    if (!pdf) throw new Error("PDF_PAGE_UNAVAILABLE");
    return renderPdfPage(pdf, page.index, scale);
  }
  if (page.media) {
    const archive = archives.get(document);
    if (!archive?.file(page.media)) throw new Error("WORD_XML_INVALID");
    return imageCanvas(await archive.file(page.media)!.async("blob"));
  }
  return imageCanvas(document.file);
}

export function paintRedactions(
  canvas: HTMLCanvasElement,
  page: RedactionPage,
  hits: RedactionHit[],
  replacements: Map<string, string>,
  method: RedactionSettings["method"],
): void {
  const context = canvas.getContext("2d")!;
  const sx = canvas.width / page.width,
    sy = canvas.height / page.height;
  for (const hit of hits.filter((hit) => hit.selected)) {
    if (!hit.rects.length) throw new Error("HIT_COORDINATES_UNAVAILABLE");
    const ownSpans = page.spans.filter(
      (span) => span.start < hit.end && span.end > hit.start && span.rect,
    );
    const measuredInk =
      ownSpans.length > 0 && ownSpans.every((span) => span.inkBounds);
    const ocr = page.source === "ocr" || ownSpans.some((span) => span.ocr);
    for (const rect of hit.rects) {
      const manual = hit.category === "region";
      const paddingY = manual
        ? 0
        : measuredInk
          ? 1.5
          : Math.max(1.5, rect.height * 0.12);
      const paddingX = manual
        ? 0
        : measuredInk
          ? 1.5
          : Math.max(1.5, rect.height * (ocr ? 0.55 : 0.12));
      let left = Math.max(0, rect.x - paddingX);
      let right = Math.min(page.width, rect.x + rect.width + paddingX);
      let top = Math.max(0, rect.y - paddingY);
      let bottom = Math.min(page.height, rect.y + rect.height + paddingY);
      if (!manual)
        for (const span of page.spans) {
          if (!span.rect || (span.start < hit.end && span.end > hit.start))
            continue;
          const neighbor = span.rect;
          const neighborRight = neighbor.x + neighbor.width;
          const neighborBottom = neighbor.y + neighbor.height;
          const overlapY =
            Math.min(rect.y + rect.height, neighborBottom) -
            Math.max(rect.y, neighbor.y);
          if (overlapY > Math.min(rect.height, neighbor.height) * 0.4) {
            if (neighborRight <= rect.x) left = Math.max(left, neighborRight);
            if (neighbor.x >= rect.x + rect.width)
              right = Math.min(right, neighbor.x);
          }
          if (neighbor.x < rect.x + rect.width && neighborRight > rect.x) {
            if (neighborBottom <= rect.y) top = Math.max(top, neighborBottom);
            if (neighbor.y >= rect.y + rect.height)
              bottom = Math.min(bottom, neighbor.y);
          }
        }
      context.fillStyle =
        method === "blackout" || hit.category === "region" ? "black" : "white";
      context.fillRect(
        left * sx,
        top * sy,
        (right - left) * sx,
        (bottom - top) * sy,
      );
    }
    const value = replacements.get(hit.id);
    if (value && method !== "blackout" && hit.category !== "region") {
      const rect = hit.rects[0];
      let size = Math.max(7, rect.height * sy * 0.85);
      context.font = `${size}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
      size *= Math.min(
        1,
        Math.max(1, rect.width * sx) /
          Math.max(1, context.measureText(value).width),
      );
      context.font = `${size}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
      context.fillStyle = "black";
      context.textBaseline = "middle";
      context.fillText(value, rect.x * sx, (rect.y + rect.height / 2) * sy);
    }
  }
}

async function canvasBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("EXPORT_FAILED"))),
      type,
      0.98,
    ),
  );
}

export async function exportRedactionDocument(
  document: RedactionDocument,
  hits: RedactionHit[],
  replacements: Map<string, string>,
  settings: RedactionSettings,
  signal: AbortSignal,
  progress: ProgressCallback,
): Promise<File> {
  const ownHits = hits.filter((hit) => hit.documentId === document.id);
  const basename = document.file.name.replace(/\.[^.]+$/, "");
  if (document.table) {
    throwIfAborted(signal);
    const { exportTable } = await import("@app/services/fileRedaction/table");
    const result = await exportTable(
      document,
      ownHits,
      replacements,
      settings.method,
    );
    throwIfAborted(signal);
    return result;
  }
  if (document.kind === "docx") {
    const media = new Map<string, Blob>();
    for (const page of document.pages.filter((p) => p.media)) {
      const pageHits = ownHits.filter(
        (hit) => hit.pageIndex === page.index && hit.selected,
      );
      throwIfAborted(signal);
      const canvas = await renderRedactionPage(document, page);
      paintRedactions(canvas, page, pageHits, replacements, settings.method);
      const type = /\.jpe?g$/i.test(page.media!)
        ? "image/jpeg"
        : /\.webp$/i.test(page.media!)
          ? "image/webp"
          : "image/png";
      media.set(page.media!, await canvasBlob(canvas, type));
      canvas.width = 0;
    }
    throwIfAborted(signal);
    return new File(
      [
        await exportWord(
          document,
          ownHits,
          replacements,
          settings.method,
          media,
        ),
      ],
      `${basename}_脱敏.docx`,
      {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    );
  }
  if (document.kind === "image") {
    const canvas = await renderRedactionPage(document, document.pages[0]);
    paintRedactions(
      canvas,
      document.pages[0],
      ownHits,
      replacements,
      settings.method,
    );
    const blob = await canvasBlob(canvas);
    canvas.width = 0;
    throwIfAborted(signal);
    return new File([blob], `${basename}_脱敏.png`, { type: "image/png" });
  }
  const { PDFDocument } = await import("@cantoo/pdf-lib");
  const output = await PDFDocument.create();
  // Fresh raster pages carry no source text layer, attachments, revisions, or metadata.
  for (const page of document.pages) {
    throwIfAborted(signal);
    progress({
      stage: "export",
      file: document.file.name,
      page: page.index + 1,
      total: document.pages.length,
    });
    const canvas = await renderRedactionPage(document, page, 2);
    paintRedactions(
      canvas,
      page,
      ownHits.filter((hit) => hit.pageIndex === page.index),
      replacements,
      settings.method,
    );
    const image = await output.embedPng(
      await (await canvasBlob(canvas)).arrayBuffer(),
    );
    output
      .addPage([page.width, page.height])
      .drawImage(image, { x: 0, y: 0, width: page.width, height: page.height });
    canvas.width = 0;
    canvas.height = 0;
  }
  throwIfAborted(signal);
  const bytes = await output.save();
  return new File([new Uint8Array(bytes).buffer], `${basename}_脱敏.pdf`, {
    type: "application/pdf",
  });
}

export function clampRect(
  rect: RedactionRect,
  page: RedactionPage,
): RedactionRect {
  const x = Math.max(0, Math.min(page.width, rect.x));
  const y = Math.max(0, Math.min(page.height, rect.y));
  return {
    x,
    y,
    width: Math.max(0, Math.min(page.width - x, rect.width)),
    height: Math.max(0, Math.min(page.height - y, rect.height)),
  };
}
