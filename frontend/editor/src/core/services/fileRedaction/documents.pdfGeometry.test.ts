import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyseRedactionFile,
  disposeRedactionDocument,
} from "@app/services/fileRedaction/documents";
import {
  defaultRedactionSettings,
  hitRects,
} from "@app/services/fileRedaction/rules";
import { LocalRedactionOcr } from "@app/services/fileRedaction/ocr";

const mocks = vi.hoisted(() => {
  const values = new Map<number, number>();
  const text = "浙江省杭州市滨江区青禾路77号";
  return {
    text,
    values,
    tight: vi.fn(
      (
        _page: number,
        index: number,
        l: number,
        r: number,
        b: number,
        t: number,
      ) => {
        values.set(l, 102 + index * 14);
        values.set(r, 115 + index * 14);
        values.set(b, 629);
        values.set(t, 642);
        return true;
      },
    ),
    loose: vi.fn((_page: number, index: number, pointer: number) => {
      [100 + index * 14, 655, 114 + index * 14, 615].forEach((value, offset) =>
        values.set(pointer + offset * 4, value),
      );
      return true;
    }),
    free: vi.fn(),
    closePage: vi.fn(),
    closeText: vi.fn(),
    closeDocument: vi.fn(),
    destroyDocument: vi.fn(),
  };
});

vi.mock("@app/services/pdfWorkerManager", () => ({
  pdfWorkerManager: {
    createDocument: vi.fn(async () => ({
      numPages: 1,
      getPage: async () => ({
        getViewport: () => ({
          width: 600,
          height: 800,
          convertToViewportRectangle: ([l, b, r, t]: number[]) => [
            l,
            800 - b,
            r,
            800 - t,
          ],
        }),
        getOperatorList: async () => ({ fnArray: [], argsArray: [] }),
      }),
    })),
    destroyDocument: mocks.destroyDocument,
  },
}));
vi.mock("@app/services/pdfiumScanQueue", () => ({
  runPdfiumScan: async (scan: () => Promise<unknown>) => scan(),
}));
vi.mock("pdfjs-dist", () => ({
  OPS: {
    paintImageXObject: 1,
    paintInlineImageXObject: 2,
    paintImageXObjectRepeat: 3,
    paintInlineImageXObjectGroup: 4,
  },
}));
vi.mock("@app/services/pdfiumService", () => ({
  openRawDocumentSafe: vi.fn(async () => 1),
  closeRawDocument: mocks.closeDocument,
  getPdfiumModule: vi.fn(async () => ({
    pdfium: {
      wasmExports: { malloc: () => 64, free: mocks.free },
      getValue: (pointer: number) => mocks.values.get(pointer),
    },
    FPDF_LoadPage: () => 2,
    FPDFText_LoadPage: () => 3,
    FPDFText_CountChars: () => mocks.text.length,
    FPDFText_GetUnicode: (_page: number, index: number) =>
      mocks.text.charCodeAt(index),
    FPDFText_GetCharBox: mocks.tight,
    FPDFText_GetLooseCharBox: mocks.loose,
    FPDFText_ClosePage: mocks.closeText,
    FPDF_ClosePage: mocks.closePage,
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.values.clear();
});

async function analyse() {
  const file = {
    name: "edited-address.pdf",
    size: 4,
    arrayBuffer: async () => new ArrayBuffer(4),
  } as File;
  return analyseRedactionFile(
    file,
    "edited-address",
    { ...defaultRedactionSettings, ocr: false },
    new LocalRedactionOcr(),
    new AbortController().signal,
    vi.fn(),
  );
}

describe("PDF redaction glyph geometry", () => {
  it("uses visible glyph bounds instead of an oversized embedded-font line box", async () => {
    const doc = await analyse();
    const page = doc.pages[0];
    expect(page.text).toBe(mocks.text);
    expect(hitRects(page, 0, page.text.length)).toEqual([
      { x: 102, y: 158, width: mocks.text.length * 14 - 1, height: 13 },
    ]);
    expect(mocks.loose).not.toHaveBeenCalled();
    expect(mocks.free).toHaveBeenCalledWith(64);
    expect(mocks.closeText).toHaveBeenCalledWith(3);
    expect(mocks.closePage).toHaveBeenCalledWith(2);
    expect(mocks.closeDocument).toHaveBeenCalledWith(1);
    await disposeRedactionDocument(doc);
    expect(mocks.destroyDocument).toHaveBeenCalledOnce();
  });

  it("retains the loose fallback when a PDF does not expose glyph bounds", async () => {
    mocks.tight.mockReturnValueOnce(false);
    const doc = await analyse();
    expect(doc.pages[0].spans[0].rect).toEqual({
      x: 100,
      y: 145,
      width: 14,
      height: 40,
    });
    expect(mocks.loose).toHaveBeenCalledOnce();
    await disposeRedactionDocument(doc);
  });

  it("keeps text offsets without enlarging the hit for a zero-area character", async () => {
    mocks.tight.mockImplementationOnce((_page, _index, l, r, b, t) => {
      mocks.values.set(l, 100);
      mocks.values.set(r, 100);
      mocks.values.set(b, 630);
      mocks.values.set(t, 630);
      return true;
    });
    const doc = await analyse();
    expect(doc.pages[0].text).toBe(mocks.text);
    expect(doc.pages[0].spans[0].start).toBe(1);
    expect(mocks.loose).not.toHaveBeenCalled();
    await disposeRedactionDocument(doc);
  });
});
