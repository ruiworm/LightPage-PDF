import JSZip from "jszip";
import Papa from "papaparse";
import type {
  RedactionCategory,
  RedactionDocument,
  RedactionHit,
  RedactionPage,
  RedactionSettings,
  RedactionTableSheet,
} from "@app/types/fileRedaction";
import { fieldLabelCategory } from "@app/services/fileRedaction/fields";
import { replaceRanges } from "@app/services/fileRedaction/rules";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_CELLS = 50_000;
const MAX_COLUMNS = 256;
const MAX_BYTES = 20 * 1024 * 1024;
const UNSUPPORTED_PARTS =
  /^xl\/(?:media\/|drawings\/|charts\/|embeddings\/|activeX\/|pivot|externalLinks\/|connections\.xml|vbaProject)/i;
const REMOVED_PARTS =
  /^(?:docProps\/|customXml\/|_xmlsignatures\/|xl\/(?:comments|threadedComments|persons|printerSettings\/|calcChain))/i;

function xml(text: string): Document {
  if (text.length > MAX_BYTES || /<!DOCTYPE|<!ENTITY/i.test(text))
    throw new Error("TABLE_TOO_LARGE");
  const parsed = new DOMParser().parseFromString(text, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error("TABLE_INVALID");
  return parsed;
}
function elements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(NS, name));
}
function textOf(element: Element | undefined): string {
  return element
    ? elements(element, "t")
        .map((node) => node.textContent ?? "")
        .join("")
    : "";
}
export function columnLabel(column: number): string {
  let label = "";
  for (let value = column + 1; value > 0; value = Math.floor((value - 1) / 26))
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}
function headerCategory(value: string): RedactionCategory | undefined {
  const name = value
    .trim()
    .replace(/[\s:：]/g, "")
    .toLowerCase();
  return (
    fieldLabelCategory(value) ??
    (
      {
        手机号: "phone",
        手机: "phone",
        电话: "phone",
        联系电话: "phone",
        phone: "phone",
        mobile: "phone",
        邮箱: "email",
        电子邮箱: "email",
        email: "email",
        身份证号: "identity",
        身份证号码: "identity",
        证件号码: "identity",
        银行卡号: "account",
        账号: "account",
        帐号: "account",
        单位名称: "company",
        公司名称: "company",
        company: "company",
      } as Record<string, RedactionCategory>
    )[name]
  );
}
function addCell(
  document: RedactionDocument,
  sheet: number,
  row: number,
  column: number,
  text: string,
  reference: string,
): number {
  if (
    document.pages.length >= MAX_CELLS ||
    column >= MAX_COLUMNS ||
    row >= 20_000
  )
    throw new Error("TABLE_TOO_LARGE");
  const index = document.pages.length;
  document.pages.push({
    index,
    width: 0,
    height: 0,
    text,
    spans: [],
    source: "table",
    tableCell: { sheet, row, column, reference },
  });
  return index;
}
function detectHeaders(document: RedactionDocument): void {
  for (const sheet of document.table!.sheets) {
    const first = sheet.rows[0] ?? [];
    const categories = new Map(
      first
        .filter((index) => index >= 0)
        .map((index) => {
          const page = document.pages[index];
          return [page.tableCell!.column, headerCategory(page.text)] as const;
        }),
    );
    sheet.header = [...categories.values()].some(Boolean);
    if (!sheet.header) continue;
    for (const row of sheet.rows.slice(1))
      for (const index of row) {
        if (index < 0) continue;
        const page = document.pages[index];
        page.tableCategory = categories.get(page.tableCell!.column);
      }
  }
}

/** Cell text remains a string. Preview accepts saved formula values, never executes formulas, and cannot be exported as redacted. */
export async function openTable(
  file: File,
  id: string,
  options: { previewOnly?: boolean } = {},
): Promise<RedactionDocument> {
  if (file.size > MAX_BYTES) throw new Error("TABLE_TOO_LARGE");
  const kind = /\.csv$/i.test(file.name) ? "csv" : "xlsx";
  const document: RedactionDocument = {
    id,
    file,
    kind,
    pages: [],
    warnings: options.previewOnly ? [] : ["tableExport"],
    table: { sheets: [], previewOnly: options.previewOnly },
  };
  const bytes = await file.arrayBuffer();
  if (kind === "csv") {
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      content = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
    }
    const parsed = Papa.parse<string[]>(content.replace(/^\uFEFF/, ""), {
      dynamicTyping: false,
      skipEmptyLines: false,
    });
    if (parsed.errors.some((error) => error.code !== "UndetectableDelimiter"))
      throw new Error("TABLE_INVALID");
    const rows = parsed.data;
    if (
      rows.at(-1)?.length === 1 &&
      rows.at(-1)?.[0] === "" &&
      /(?:\r\n|\r|\n)$/.test(content)
    )
      rows.pop();
    if (!rows.some((row) => row.some((value) => value.trim())))
      throw new Error("TABLE_EMPTY");
    const sheet: RedactionTableSheet = {
      name: file.name,
      hidden: false,
      header: false,
      rows: [],
    };
    sheet.rows = rows.map((row, rowIndex) =>
      row.map((value, column) =>
        addCell(
          document,
          0,
          rowIndex,
          column,
          value,
          `${columnLabel(column)}${rowIndex + 1}`,
        ),
      ),
    );
    document.table = {
      sheets: [sheet],
      previewOnly: options.previewOnly,
      delimiter: parsed.meta.delimiter,
      newline: parsed.meta.linebreak,
    };
  } else {
    const archive = await JSZip.loadAsync(bytes);
    if (
      !options.previewOnly &&
      Object.keys(archive.files).some((name) => UNSUPPORTED_PARTS.test(name))
    )
      throw new Error("TABLE_COMPLEX");
    const workbookFile = archive.file("xl/workbook.xml");
    const relationshipsFile = archive.file("xl/_rels/workbook.xml.rels");
    if (!workbookFile || !relationshipsFile) throw new Error("TABLE_INVALID");
    const workbook = xml(await workbookFile.async("string"));
    const relationships = xml(await relationshipsFile.async("string"));
    const targets = new Map(
      Array.from(relationships.getElementsByTagName("Relationship")).map(
        (node) => [node.getAttribute("Id"), node.getAttribute("Target") ?? ""],
      ),
    );
    const stringsFile = archive.file("xl/sharedStrings.xml");
    const strings = stringsFile
      ? elements(xml(await stringsFile.async("string")), "si")
      : [];
    for (const [sheetIndex, entry] of elements(workbook, "sheet").entries()) {
      const target = targets.get(
        entry.getAttributeNS(
          "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
          "id",
        ),
      );
      if (!target || target.includes("..") || target.includes(":"))
        throw new Error("TABLE_INVALID");
      const part = target.startsWith("/")
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, "")}`;
      const source = archive.file(part);
      if (!source) throw new Error("TABLE_INVALID");
      const worksheet = xml(await source.async("string"));
      if (!options.previewOnly && elements(worksheet, "f").length)
        throw new Error("TABLE_FORMULAS");
      const sheet: RedactionTableSheet = {
        name: entry.getAttribute("name") ?? `Sheet ${sheetIndex + 1}`,
        hidden:
          entry.getAttribute("state") !== null &&
          entry.getAttribute("state") !== "visible",
        header: false,
        part,
        rows: [],
      };
      for (const row of elements(worksheet, "row")) {
        const indices: number[] = [];
        for (const cell of elements(row, "c")) {
          const reference = cell.getAttribute("r") ?? "";
          const match = /^([A-Z]+)([1-9]\d*)$/.exec(reference);
          if (!match) throw new Error("TABLE_INVALID");
          const column =
            [...match[1]].reduce(
              (value, char) => value * 26 + char.charCodeAt(0) - 64,
              0,
            ) - 1;
          const type = cell.getAttribute("t");
          const value = elements(cell, "v")[0]?.textContent ?? "";
          const shared = strings[Number(value)];
          if (type === "s" && (!/^\d+$/.test(value) || !shared))
            throw new Error("TABLE_INVALID");
          const formula = elements(cell, "f")[0]?.textContent;
          const text =
            type === "s"
              ? textOf(shared)
              : type === "inlineStr"
                ? textOf(cell)
                : value ||
                  (options.previewOnly && formula ? `=${formula}` : "");
          const pageIndex = addCell(
            document,
            sheetIndex,
            Number(match[2]) - 1,
            column,
            text,
            reference,
          );
          while (indices.length < column) indices.push(-1);
          indices[column] = pageIndex;
        }
        if (indices.length) sheet.rows.push(indices);
      }
      document.table!.sheets.push(sheet);
    }
    if (!document.pages.some((page) => page.text.trim()))
      throw new Error("TABLE_EMPTY");
  }
  detectHeaders(document);
  return document;
}

export async function exportTable(
  document: RedactionDocument,
  hits: RedactionHit[],
  replacements: Map<string, string>,
  method: RedactionSettings["method"],
): Promise<File> {
  if (document.table?.previewOnly) throw new Error("TABLE_PREVIEW_ONLY");
  const selected = hits.filter(
    (hit) => hit.documentId === document.id && hit.selected,
  );
  const byPage = new Map<number, RedactionHit[]>();
  for (const hit of selected)
    byPage.set(hit.pageIndex, [...(byPage.get(hit.pageIndex) ?? []), hit]);
  const value = (page: RedactionPage) =>
    replaceRanges(
      page.text,
      byPage.get(page.index) ?? [],
      replacements,
      method === "blackout",
    );
  const basename = document.file.name.replace(/\.[^.]+$/, "");
  if (document.kind === "csv") {
    const rows = document.table!.sheets[0].rows.map((row) =>
      row.map((index) => (index < 0 ? "" : value(document.pages[index]))),
    );
    const csv = Papa.unparse(rows, {
      delimiter: document.table!.delimiter,
      newline: document.table!.newline,
      escapeFormulae: true,
    });
    return new File(["\uFEFF", csv], `${basename}_脱敏.csv`, {
      type: "text/csv;charset=utf-8",
    });
  }
  const archive = await JSZip.loadAsync(await document.file.arrayBuffer());
  const stringsFile = archive.file("xl/sharedStrings.xml");
  const strings = stringsFile
    ? elements(xml(await stringsFile.async("string")), "si")
    : [];
  for (const [sheetIndex, sheet] of document.table!.sheets.entries()) {
    const worksheet = xml(await archive.file(sheet.part!)!.async("string"));
    const pages = new Map(
      document.pages
        .filter((page) => page.tableCell?.sheet === sheetIndex)
        .map((page) => [page.tableCell!.reference, page]),
    );
    for (const cell of elements(worksheet, "c")) {
      const page = pages.get(cell.getAttribute("r") ?? "");
      if (!page) continue;
      const shared = cell.getAttribute("t") === "s";
      if (!shared && !byPage.has(page.index)) continue;
      const original = shared
        ? strings[Number(elements(cell, "v")[0]?.textContent)]
        : elements(cell, "is")[0];
      const inline = worksheet.createElementNS(NS, "is");
      if (!byPage.has(page.index) && original)
        for (const child of Array.from(original.childNodes))
          inline.append(child.cloneNode(true));
      else {
        const text = worksheet.createElementNS(NS, "t");
        text.setAttributeNS(
          "http://www.w3.org/XML/1998/namespace",
          "xml:space",
          "preserve",
        );
        text.textContent = value(page);
        inline.append(text);
      }
      cell.replaceChildren(inline);
      cell.setAttribute("t", "inlineStr");
    }
    for (const name of [
      "hyperlinks",
      "legacyDrawing",
      "extLst",
      "dataValidations",
      "autoFilter",
    ])
      for (const node of elements(worksheet, name)) node.remove();
    archive.file(sheet.part!, new XMLSerializer().serializeToString(worksheet));
  }
  archive.remove("xl/sharedStrings.xml");
  const removed = new Set(
    Object.keys(archive.files).filter((name) => REMOVED_PARTS.test(name)),
  );
  removed.add("xl/sharedStrings.xml");
  for (const name of removed) archive.remove(name);
  for (const name of Object.keys(archive.files)) {
    if (
      !/\.xml$|\.rels$/.test(name) ||
      document.table!.sheets.some((sheet) => sheet.part === name)
    )
      continue;
    const parsed = xml(await archive.file(name)!.async("string"));
    for (const node of Array.from(
      parsed.getElementsByTagName("Relationship"),
    )) {
      const type = node.getAttribute("Type") ?? "";
      if (
        /sharedStrings|comments|threadedComment|person|metadata\/|custom-properties|core-properties|extended-properties|customXml|digital-signature|printerSettings|hyperlink|calcChain/i.test(
          type,
        ) ||
        node.getAttribute("TargetMode") === "External"
      )
        node.remove();
    }
    for (const node of Array.from(parsed.getElementsByTagName("Override")))
      if (removed.has((node.getAttribute("PartName") ?? "").replace(/^\//, "")))
        node.remove();
    for (const name of [
      "definedNames",
      "extLst",
      "externalReferences",
      "autoFilter",
    ])
      for (const node of elements(parsed, name)) node.remove();
    for (const node of Array.from(parsed.getElementsByTagName("*"))) {
      for (const attribute of [
        "name",
        "displayName",
        "tooltip",
        "description",
        "author",
      ]) {
        const original = node.getAttribute(attribute);
        if (!original) continue;
        let next = original;
        for (const hit of selected)
          if (hit.original) next = next.replaceAll(hit.original, "Redacted");
        if (next !== original) node.setAttribute(attribute, next);
      }
      if (node.children.length) continue;
      for (const hit of selected)
        if (hit.original && node.textContent?.includes(hit.original))
          node.textContent = node.textContent.replaceAll(hit.original, "***");
    }
    archive.file(name, new XMLSerializer().serializeToString(parsed));
  }
  const bytes = await archive.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  return new File([new Uint8Array(bytes).buffer], `${basename}_脱敏.xlsx`, {
    type: MIME,
  });
}
