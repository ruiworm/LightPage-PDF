import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";
import type { FontRef } from "@app/tools/pdfTextEditor/model/FontRef";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import { parseTrueTypeCmap } from "@app/tools/pdfTextEditor/charcode/CmapResolver";

const fontsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../public/fonts",
);
const fontBytes = (name: string) =>
  new Uint8Array(readFileSync(resolve(fontsDirectory, name)));
const latin = fontBytes("NotoSans-Regular.ttf");
const chinese = fontBytes("NotoSansSC-Regular.ttf");
const fill = { r: 0, g: 0, b: 0, a: 255 };

function harness() {
  const owned = new Map<string, FontRef>();
  const module = {
    pdfium: {
      HEAPU8: new Uint8Array(16 * 1024 * 1024),
      stringToUTF16: vi.fn(),
      getValue: () => 1000,
      wasmExports: { malloc: () => 16, free: vi.fn() },
    },
    FPDFText_LoadFont: vi.fn(() => owned.size + 100),
    FPDFFont_Close: vi.fn(),
    FPDFPageObj_CreateTextObj: vi.fn(() => 200),
    FPDFText_SetText: vi.fn(),
    FPDFPageObj_SetFillColor: vi.fn(),
    FPDFPageObj_Transform: vi.fn(),
    FPDFPage_InsertObject: vi.fn(),
    FPDFPageObj_GetBounds: () => true,
  };
  const doc = {
    module,
    docPtr: 1,
    ownedFont: (id: string) => owned.get(id),
    registerOwnedFont: (font: FontRef) => owned.set(font.id, font),
  } as unknown as EditorDocument;
  const page = new Page({ index: 0, pagePtr: 2, width: 612, height: 792 });
  return { doc, page, owned, module };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      arrayBuffer: async () =>
        (url.endsWith("NotoSansSC-Regular.ttf") ? chinese : latin).slice()
          .buffer,
    })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("bundled Chinese fallback", () => {
  it("covers new Chinese characters, punctuation and mixed text that the Latin font lacks", () => {
    const latinCmap = parseTrueTypeCmap(latin)!;
    const chineseCmap = parseTrueTypeCmap(chinese)!;
    expect(latinCmap.has("问".codePointAt(0)!)).toBe(false);
    for (const ch of "通讯地址：浙江省杭州市滨江区青禾路77号问问，张蕴桐 ABC") {
      expect(chineseCmap.has(ch.codePointAt(0)!)).toBe(true);
    }
  });

  it("loads both faces once and waits for Chinese bytes before resolving", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        arrayBuffer: async () => {
          if (url.endsWith("NotoSansSC-Regular.ttf")) await pending;
          return (
            url.endsWith("NotoSansSC-Regular.ttf") ? chinese : latin
          ).slice().buffer;
        },
      })),
    );
    const fallback = await import("@app/tools/pdfTextEditor/util/fallbackFont");
    let ready = false;
    const first = fallback.preloadFallbackFontBytes().then(() => {
      ready = true;
    });
    const second = fallback.preloadFallbackFontBytes();
    await Promise.resolve();
    expect(ready).toBe(false);
    expect(fallback.isFallbackFontReady()).toBe(false);
    release();
    await Promise.all([first, second]);
    expect(fallback.isFallbackFontReady()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("embeds the Chinese face for mixed text and reuses it on subsequent edits", async () => {
    const fallback = await import("@app/tools/pdfTextEditor/util/fallbackFont");
    await fallback.preloadFallbackFontBytes();
    const { doc, page, owned, module } = harness();
    expect(
      fallback.emitFallbackTextObject(
        doc,
        page,
        "地址：77号问问",
        14,
        fill,
        40,
        620,
      ),
    ).toBe(200);
    expect(
      fallback.emitFallbackTextObject(
        doc,
        page,
        "中文  空格 123",
        14,
        fill,
        40,
        620,
      ),
    ).toBe(200);
    expect(owned.get("__chinese_fallback")?.descriptor.family).toBe(
      "Noto Sans SC",
    );
    expect(module.FPDFText_LoadFont).toHaveBeenCalledTimes(1);
    expect(module.FPDFText_LoadFont).toHaveBeenCalledWith(
      1,
      16,
      chinese.length,
      2,
      true,
    );
    expect(
      module.pdfium.stringToUTF16.mock.calls.map(([text]) => text),
    ).toEqual(["地址：77号问问", "中文  空格 123"]);
    owned.get("__chinese_fallback")!.dispose();
    expect(module.FPDFFont_Close).toHaveBeenCalledWith(100);
    expect(module.pdfium.wasmExports.free).toHaveBeenCalledWith(16);
  });

  it("keeps the original Latin fallback for supported non-Chinese text", async () => {
    const fallback = await import("@app/tools/pdfTextEditor/util/fallbackFont");
    await fallback.preloadFallbackFontBytes();
    const { doc, owned, module } = harness();
    expect(fallback.loadFallbackFontInto(doc, "Καλημέρα café")).toBe(100);
    expect(owned.has("__unicode_fallback")).toBe(true);
    expect(module.FPDFText_LoadFont).toHaveBeenCalledWith(
      1,
      16,
      latin.length,
      2,
      true,
    );
  });

  it("does not emit a font whose cmap lacks the requested glyph", async () => {
    const fallback = await import("@app/tools/pdfTextEditor/util/fallbackFont");
    await fallback.preloadFallbackFontBytes();
    const { doc, page, module } = harness();
    expect(
      fallback.emitFallbackTextObject(doc, page, "中文😀", 14, fill, 40, 620),
    ).toBe(0);
    expect(module.FPDFText_LoadFont).not.toHaveBeenCalled();
  });

  it("retries a temporary failed Chinese-font fetch", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce(
      async () =>
        ({
          ok: true,
          arrayBuffer: async () => latin.slice().buffer,
        }) as Response,
    );
    fetchMock.mockImplementationOnce(async () => ({ ok: false }) as Response);
    const fallback = await import("@app/tools/pdfTextEditor/util/fallbackFont");
    await fallback.preloadFallbackFontBytes();
    expect(fallback.isFallbackFontReady()).toBe(false);
    await fallback.preloadFallbackFontBytes();
    expect(fallback.isFallbackFontReady()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
