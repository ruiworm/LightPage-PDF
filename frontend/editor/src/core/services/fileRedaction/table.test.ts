import JSZip from "jszip";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { openTable, exportTable } from "@app/services/fileRedaction/table";
import {
  defaultRedactionSettings,
  findHits,
  replacementsFor,
} from "@app/services/fileRedaction/rules";
import {
  analyseRedactionFile,
  exportRedactionDocument,
} from "@app/services/fileRedaction/documents";
import type { LocalRedactionOcr } from "@app/services/fileRedaction/ocr";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
function file(bytes: Uint8Array, name: string): File {
  const value = new File([new Uint8Array(bytes).buffer], name);
  Object.defineProperty(value, "arrayBuffer", {
    value: async () => new Uint8Array(bytes).buffer,
  });
  return value;
}
function csv(text: string): File {
  return file(new TextEncoder().encode(text), "人员.csv");
}
function xmlCell(reference: string, text: string): string {
  return `<c r="${reference}" t="inlineStr"><is><t>${text}</t></is></c>`;
}
async function fixture(extra = "", formula = false): Promise<File> {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="员工" sheetId="1" r:id="rId1"/><sheet name="隐藏表" sheetId="2" state="hidden" r:id="rId2"/></sheets><definedNames><definedName name="Cached">张三</definedName></definedNames></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="sharedStrings" Target="sharedStrings.xml"/></Relationships>',
  );
  zip.file(
    "xl/sharedStrings.xml",
    `<sst xmlns="${ns}"><si><t>姓名</t></si><si><r><rPr><b/></rPr><t>张</t></r><r><t>三</t></r></si><si><t>未使用的旧秘密13900000000</t></si></sst>`,
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    `<worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c>${xmlCell("B1", "联系电话")}${xmlCell("C1", "身份证号")}${xmlCell("D1", "地址")}</row><row r="2"><c r="A2" t="s" s="1"><v>1</v></c>${xmlCell("B2", "13900000000")}${xmlCell("C2", "001234567890123456")}${xmlCell("D2", "浙江省杭州市滨江区青禾路77号")}${formula ? '<c r="E2"><f>1+1</f><v>2</v></c>' : ""}</row><row r="4"><c r="A4" t="s" s="1"><v>1</v></c></row></sheetData><mergeCells><mergeCell ref="D2:E2"/></mergeCells></worksheet>`,
  );
  zip.file(
    "xl/worksheets/sheet2.xml",
    `<worksheet xmlns="${ns}"><sheetData><row r="1">${xmlCell("A1", "手机号")}</row><row r="2">${xmlCell("A2", "13800000000")}</row></sheetData></worksheet>`,
  );
  zip.file(
    "xl/styles.xml",
    `<styleSheet xmlns="${ns}"><fonts count="1"><font><name val="Calibri"/><sz val="11"/></font></fonts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="49"/></cellXfs></styleSheet>`,
  );
  zip.file("docProps/core.xml", "<properties>张三13900000000</properties>");
  zip.file(
    "xl/comments1.xml",
    `<comments xmlns="${ns}"><comment>13900000000</comment></comments>`,
  );
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/sharedStrings.xml" ContentType="strings"/><Override PartName="/docProps/core.xml" ContentType="properties"/></Types>',
  );
  if (extra) zip.file(extra, "unsupported");
  return file(await zip.generateAsync({ type: "uint8array" }), "员工.xlsx");
}
async function read(value: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(value);
  });
}
describe("table redaction", () => {
  it("previews cached formulas in workbooks with drawings without widening redaction support", async () => {
    const input = await fixture("xl/charts/chart1.xml", true);
    const preview = await openTable(input, "preview", { previewOnly: true });
    expect(
      preview.pages.find((page) => page.tableCell?.reference === "E2")?.text,
    ).toBe("2");
    expect(preview.pages.some((page) => page.text === "张三")).toBe(true);
    await expect(
      exportTable(preview, [], new Map(), "blackout"),
    ).rejects.toThrow("TABLE_PREVIEW_ONLY");
    await expect(openTable(input, "redact")).rejects.toThrow("TABLE_COMPLEX");
  });
  it("shows an uncached formula as text without evaluating it", async () => {
    const archive = await JSZip.loadAsync(
      await (await fixture("", true)).arrayBuffer(),
    );
    const part = "xl/worksheets/sheet1.xml";
    archive.file(
      part,
      (await archive.file(part)!.async("string")).replace(
        "<f>1+1</f><v>2</v>",
        "<f>1+1</f>",
      ),
    );
    const input = file(
      await archive.generateAsync({ type: "uint8array" }),
      "formulas.xlsx",
    );
    const preview = await openTable(input, "preview", { previewOnly: true });
    expect(
      preview.pages.find((page) => page.tableCell?.reference === "E2")?.text,
    ).toBe("=1+1");
    await expect(openTable(input, "redact")).rejects.toThrow("TABLE_FORMULAS");
  });
  it("reads CSV quotes, multiline cells and long identifiers as text and detects entire field values", async () => {
    const document = await openTable(
      csv(
        '姓名,手机号,身份证号,地址,备注\r\n张三,13900000000,001234567890123456,"浙江省杭州市,青禾路77号","第一行\n第二行"',
      ),
      "doc",
    );
    expect(document.pages.map((page) => page.text)).toContain(
      "001234567890123456",
    );
    expect(document.pages.map((page) => page.text)).toContain("第一行\n第二行");
    const hits = findHits(document, {
      ...defaultRedactionSettings,
      ner: false,
    });
    expect(
      hits.filter((hit) => hit.selected).map((hit) => hit.original),
    ).toEqual(
      expect.arrayContaining([
        "张三",
        "13900000000",
        "001234567890123456",
        "浙江省杭州市,青禾路77号",
      ]),
    );
    expect(hits.some((hit) => hit.original === "姓名")).toBe(false);
    const output = await exportTable(document, hits, new Map(), "blackout");
    const text = new TextDecoder().decode(await read(output));
    expect(text).not.toContain("13900000000");
    expect(Papa.parse<string[]>(text).data[1][4]).toBe("第一行\n第二行");
    expect(output.name).toBe("人员_脱敏.csv");
  });
  it("supports one-column CSV, UTF-8 BOM and GBK input", async () => {
    expect(
      (await openTable(csv("\uFEFF姓名\r\n张三\r\n"), "doc")).table!.sheets[0]
        .rows,
    ).toHaveLength(2);
    const gbk = file(
      new Uint8Array([0xd0, 0xd5, 0xc3, 0xfb, 0x0a, 0xd5, 0xc5, 0xc8, 0xfd]),
      "gbk.csv",
    );
    expect(
      (await openTable(gbk, "doc")).pages.map((page) => page.text),
    ).toEqual(["姓名", "张三"]);
  });
  it("preserves semicolon delimiter and leading zeros and escapes formula-like CSV values", async () => {
    const document = await openTable(
      csv("姓名;编号;备注\n张三;0000123;=SUM(1+1)"),
      "doc",
    );
    const hits = findHits(document, defaultRedactionSettings);
    const replacements = replacementsFor(hits, "alias", { name: "人员" });
    const output = await exportTable(document, hits, replacements, "alias");
    const rows = Papa.parse<string[]>(
      new TextDecoder().decode(await read(output)),
      { delimiter: ";" },
    ).data;
    expect(rows[1]).toEqual(["人员1", "0000123", "'=SUM(1+1)"]);
  });
  it("handles sparse cells, shared rich text and hidden sheets while preserving style, merge and unselected values", async () => {
    const document = await openTable(await fixture(), "doc");
    expect(document.table!.sheets[1].hidden).toBe(true);
    expect(
      document.pages.find((page) => page.tableCell?.reference === "C2")?.text,
    ).toBe("001234567890123456");
    const hits = findHits(document, {
      ...defaultRedactionSettings,
      ner: false,
    });
    for (const hit of hits)
      if (document.pages[hit.pageIndex].tableCell?.reference === "A4")
        hit.selected = false;
    const output = await exportTable(document, hits, new Map(), "blackout");
    const archive = await JSZip.loadAsync(await read(output));
    expect(archive.file("xl/sharedStrings.xml")).toBeNull();
    expect(archive.file("docProps/core.xml")).toBeNull();
    expect(archive.file("xl/comments1.xml")).toBeNull();
    const sheet = await archive
      .file("xl/worksheets/sheet1.xml")!
      .async("string");
    expect(sheet).toContain('s="1"');
    expect(sheet).toContain('ref="D2:E2"');
    expect(sheet).toContain("<b");
    expect(sheet).not.toContain("13900000000");
    expect(
      await archive.file("xl/worksheets/sheet2.xml")!.async("string"),
    ).not.toContain("13800000000");
    expect(
      await archive.file("xl/workbook.xml")!.async("string"),
    ).not.toContain("张三");
    expect(
      await archive.file("[Content_Types].xml")!.async("string"),
    ).not.toContain("sharedStrings");
    const roundTrip = await openTable(
      file(new Uint8Array(await read(output)), "round-trip.xlsx"),
      "after",
    );
    expect(
      roundTrip.pages.find((page) => page.tableCell?.reference === "A4")?.text,
    ).toBe("张三");
    expect(
      roundTrip.pages.find((page) => page.tableCell?.reference === "A2")?.text,
    ).not.toBe("张三");
  });
  it.each([
    "xl/media/photo.png",
    "xl/charts/chart1.xml",
    "xl/vbaProject.bin",
    "xl/pivotCache/cache.xml",
  ])("rejects unsupported hidden payload %s", async (part) => {
    await expect(openTable(await fixture(part), "doc")).rejects.toThrow(
      "TABLE_COMPLEX",
    );
  });
  it("rejects formulas, broken quotes and empty files with explicit errors", async () => {
    await expect(openTable(await fixture("", true), "doc")).rejects.toThrow(
      "TABLE_FORMULAS",
    );
    await expect(
      openTable(csv('姓名,备注\n张三,"未闭合'), "doc"),
    ).rejects.toThrow("TABLE_INVALID");
    await expect(openTable(csv("\n"), "doc")).rejects.toThrow("TABLE_EMPTY");
  });
  it.each(["IW1", "ZZZZZZZZZZZZ1", "A20001"])(
    "rejects out-of-range cell %s before allocating a sparse row",
    async (reference) => {
      const archive = await JSZip.loadAsync(
        await (await fixture()).arrayBuffer(),
      );
      archive.file(
        "xl/worksheets/sheet1.xml",
        `<worksheet xmlns="${ns}"><sheetData><row r="1">${xmlCell(reference, "张三")}</row></sheetData></worksheet>`,
      );
      await expect(
        openTable(
          file(
            await archive.generateAsync({ type: "uint8array" }),
            "bounds.xlsx",
          ),
          "doc",
        ),
      ).rejects.toThrow("TABLE_TOO_LARGE");
    },
  );
  it("uses the application's analysis and export entry points without OCR", async () => {
    const document = await analyseRedactionFile(
      csv("姓名,电话\n张三,13900000000"),
      "doc",
      defaultRedactionSettings,
      {} as LocalRedactionOcr,
      new AbortController().signal,
      () => {},
    );
    const hits = findHits(document, defaultRedactionSettings);
    const output = await exportRedactionDocument(
      document,
      hits,
      new Map(),
      { ...defaultRedactionSettings, method: "full" },
      new AbortController().signal,
      () => {},
    );
    expect(new TextDecoder().decode(await read(output))).not.toContain("张三");
  });
});
