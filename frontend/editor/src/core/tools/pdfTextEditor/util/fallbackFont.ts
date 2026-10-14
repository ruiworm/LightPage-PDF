import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { RGBA } from "@app/tools/pdfTextEditor/types";
import { FontRef } from "@app/tools/pdfTextEditor/model/FontRef";
import { parseTrueTypeCmap } from "@app/tools/pdfTextEditor/charcode/CmapResolver";
import { writeUtf16 } from "@app/services/pdfiumService";
import { BASE_PATH } from "@app/constants/app";

interface FallbackFont {
  file: string;
  id: string;
  family: string;
  promise: Promise<Uint8Array | null> | null;
  bytes: Uint8Array | null;
  coverage: Map<number, number> | null;
}

const fallbackFonts: FallbackFont[] = [
  {
    file: "NotoSans-Regular.ttf",
    id: "__unicode_fallback",
    family: "Noto Sans",
    promise: null,
    bytes: null,
    coverage: null,
  },
  {
    file: "NotoSansSC-Regular.ttf",
    id: "__chinese_fallback",
    family: "Noto Sans SC",
    promise: null,
    bytes: null,
    coverage: null,
  },
];
// FPDF_FONT_TRUETYPE; the trailing `true` makes it a composite (CID) font so
// FPDFText_SetText can address Unicode code points beyond 255.
const FPDF_FONT_TRUETYPE = 2;

function fallbackFontCovers(font: FallbackFont, text: string): boolean {
  if (!font.bytes || !font.coverage) return false;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    const cp = ch.codePointAt(0)!;
    if (!font.coverage.has(cp)) return false;
  }
  return true;
}

interface ExtendedPdfiumRuntime {
  HEAPU8: Uint8Array;
}

function preloadFont(font: FallbackFont): Promise<Uint8Array | null> {
  if (font.promise) return font.promise;
  font.promise = (async () => {
    try {
      const res = await fetch(`${BASE_PATH}/fonts/${font.file}`);
      if (!res.ok) {
        // Don't cache the failure: a transient 404/503 would otherwise
        // disable the Unicode fallback for the whole session.
        font.promise = null;
        return null;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const coverage = parseTrueTypeCmap(bytes);
      if (!coverage) {
        font.promise = null;
        return null;
      }
      font.bytes = bytes;
      font.coverage = coverage;
      return bytes;
    } catch {
      font.promise = null;
      return null;
    }
  })();
  return font.promise;
}

/** Warm both bundled faces before editing; neither needs device-font access. */
export async function preloadFallbackFontBytes(): Promise<Uint8Array | null> {
  const [latin] = await Promise.all(fallbackFonts.map(preloadFont));
  return latin;
}

/** Test/debug hook: bytes are loaded and a fallback emit is possible. */
export function isFallbackFontReady(): boolean {
  return fallbackFonts.every((font) => !!font.bytes?.length);
}

// Embed the Unicode fallback font into `doc` (once) and return its FPDF font
// handle, or 0 when the bytes aren't ready or the load failed.
export function loadFallbackFontInto(doc: EditorDocument, text = ""): number {
  void preloadFallbackFontBytes();
  const font = fallbackFonts.find((candidate) =>
    fallbackFontCovers(candidate, text),
  );
  if (!font) return 0;
  const existing = doc.ownedFont(font.id);
  if (existing) return existing.pointer;
  const bytes = font.bytes;
  if (!bytes || bytes.length === 0) return 0;

  const m = doc.module;
  const len = bytes.length;
  const ptr = m.pdfium.wasmExports.malloc(len);
  if (!ptr) return 0;
  try {
    (m.pdfium as typeof m.pdfium & ExtendedPdfiumRuntime).HEAPU8.set(
      bytes,
      ptr,
    );
    const fontPtr = m.FPDFText_LoadFont(
      doc.docPtr,
      ptr,
      len,
      FPDF_FONT_TRUETYPE,
      true,
    );
    if (!fontPtr) {
      m.pdfium.wasmExports.free(ptr);
      return 0;
    }
    doc.registerOwnedFont(
      new FontRef({
        id: font.id,
        descriptor: {
          id: font.id,
          family: font.family,
          style: "normal",
          weight: "normal",
          bundled: true,
        },
        pointer: fontPtr,
        owned: true,
        // Free BOTH the font handle and its backing buffer on doc dispose.
        closeFn: (p) => {
          try {
            m.FPDFFont_Close(p);
          } catch {
            /* best-effort */
          }
          try {
            m.pdfium.wasmExports.free(ptr);
          } catch {
            /* best-effort */
          }
        },
      }),
    );
    return fontPtr;
  } catch {
    try {
      m.pdfium.wasmExports.free(ptr);
    } catch {
      /* best-effort */
    }
    return 0;
  }
}

/** Right edge (PDF points) of an object's visible bbox, or 0 if unmeasurable. */
function measureRightEdge(m: EditorDocument["module"], ptr: number): number {
  const l = m.pdfium.wasmExports.malloc(4);
  const b = m.pdfium.wasmExports.malloc(4);
  const r = m.pdfium.wasmExports.malloc(4);
  const t = m.pdfium.wasmExports.malloc(4);
  try {
    if (!m.FPDFPageObj_GetBounds(ptr, l, b, r, t)) return 0;
    return m.pdfium.getValue(r, "float");
  } finally {
    m.pdfium.wasmExports.free(l);
    m.pdfium.wasmExports.free(b);
    m.pdfium.wasmExports.free(r);
    m.pdfium.wasmExports.free(t);
  }
}

interface CreateTextObjModule {
  FPDFPageObj_CreateTextObj?: (
    doc: number,
    font: number,
    size: number,
  ) => number;
}

// Emit ONE text object for `text` in the embedded Unicode fallback font, placed
// at (x, y) with `fill`, inserted into the page.
export function emitFallbackTextObject(
  doc: EditorDocument,
  page: Page,
  text: string,
  size: number,
  fill: RGBA,
  x: number,
  y: number,
): number {
  const fb = loadFallbackFontInto(doc, text);
  if (!fb) return 0;
  const m = doc.module;
  const create = (m as unknown as CreateTextObjModule)
    .FPDFPageObj_CreateTextObj;
  if (typeof create !== "function") return 0;
  const fp = create(doc.docPtr, fb, size);
  if (!fp) return 0;
  const tp = writeUtf16(m, text);
  try {
    m.FPDFText_SetText(fp, tp);
  } finally {
    m.pdfium.wasmExports.free(tp);
  }
  m.FPDFPageObj_SetFillColor(fp, fill.r, fill.g, fill.b, fill.a);
  m.FPDFPageObj_Transform(fp, 1, 0, 0, 1, x, y);
  m.FPDFPage_InsertObject(page.pagePtr, fp);
  const right = measureRightEdge(m, fp);
  const visible = text.replace(/\s+/g, "").length;
  if (visible > 0 && right - x < visible * size * 0.05) {
    try {
      m.FPDFPage_RemoveObject(page.pagePtr, fp);
    } catch {
      /* best-effort */
    }
    try {
      m.FPDFPageObj_Destroy(fp);
    } catch {
      /* best-effort */
    }
    return 0;
  }
  return fp;
}
