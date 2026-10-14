import JSZip from "jszip";
import type {
  RedactionDocument,
  RedactionHit,
  RedactionPage,
  RedactionSettings,
} from "@app/types/fileRedaction";
import { replaceRanges } from "@app/services/fileRedaction/rules";
import {
  fieldLabelCategory,
  findFieldMatches,
  isAddressContinuation,
} from "@app/services/fileRedaction/fields";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const WORD_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_XML_BYTES = 24 * 1024 * 1024;

export function parseWordXml(xml: string): Document {
  if (xml.length > MAX_XML_BYTES || /<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("WORD_XML_UNSUPPORTED");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error("WORD_XML_INVALID");
  return document;
}

function cleanRevisions(document: Document): void {
  for (const localName of ["vanish", "webHidden"])
    for (const element of Array.from(
      document.getElementsByTagNameNS(WORD_NS, localName),
    )) {
      let ancestor = element.parentElement;
      while (
        ancestor &&
        !(ancestor.namespaceURI === WORD_NS && ancestor.localName === "r")
      )
        ancestor = ancestor.parentElement;
      ancestor?.remove();
    }
  for (const localName of [
    "del",
    "moveFrom",
    "commentRangeStart",
    "commentRangeEnd",
    "commentReference",
    "delText",
    "instrText",
    "object",
    "altChunk",
  ]) {
    for (const element of Array.from(
      document.getElementsByTagNameNS(WORD_NS, localName),
    ))
      element.remove();
  }
  for (const localName of ["ins", "moveTo"])
    for (const element of Array.from(
      document.getElementsByTagNameNS(WORD_NS, localName),
    ))
      element.replaceWith(...Array.from(element.childNodes));
}

export function wordParagraphs(xml: Document): Element[] {
  return Array.from(xml.getElementsByTagNameNS(WORD_NS, "p"));
}
export function paragraphText(paragraph: Element): string {
  return paragraphNodes(paragraph)
    .map((node) => node.textContent ?? "")
    .join("");
}

function paragraphNodes(paragraph: Element): Element[] {
  return Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "t")).filter(
    (node) => {
      let ancestor = node.parentElement;
      while (
        ancestor &&
        !(ancestor.namespaceURI === WORD_NS && ancestor.localName === "p")
      )
        ancestor = ancestor.parentElement;
      return ancestor === paragraph;
    },
  );
}

export async function openWord(
  file: File,
  id: string,
): Promise<{ document: RedactionDocument; archive: JSZip }> {
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const body = archive.file("word/document.xml");
  if (!body) throw new Error("WORD_XML_INVALID");
  const parts = Object.keys(archive.files)
    .filter((name) =>
      /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(
        name,
      ),
    )
    .sort(
      (a, b) =>
        Number(b === "word/document.xml") - Number(a === "word/document.xml") ||
        a.localeCompare(b),
    );
  const pages: RedactionPage[] = [];
  for (const part of parts) {
    const xml = parseWordXml(await archive.file(part)!.async("string"));
    cleanRevisions(xml);
    const cells = Array.from(xml.getElementsByTagNameNS(WORD_NS, "tc"));
    const cellCategories = new Map<Element, "name" | "address">();
    for (const cell of cells) {
      const row = cell.parentElement;
      const siblings = Array.from(row?.children ?? []).filter(
        (node) => node.localName === "tc",
      );
      const column = siblings.indexOf(cell);
      const previousRow = row?.previousElementSibling;
      const above = Array.from(previousRow?.children ?? []).filter(
        (node) => node.localName === "tc",
      )[column];
      const before = siblings[column - 1];
      const category =
        fieldLabelCategory(before?.textContent ?? "") ??
        fieldLabelCategory(above?.textContent ?? "");
      if (category && !fieldLabelCategory(cell.textContent ?? ""))
        cellCategories.set(cell, category);
    }
    let previousParagraph: Element | undefined;
    let previousAddress = false;
    let continuationCount = 0;
    wordParagraphs(xml).forEach((paragraph, paragraphIndex) => {
      const text = paragraphText(paragraph);
      const cell = paragraph.closest("tc");
      const continuation =
        previousAddress &&
        continuationCount < 2 &&
        paragraph.parentElement === previousParagraph?.parentElement &&
        paragraph.previousElementSibling === previousParagraph &&
        isAddressContinuation(text);
      continuationCount = continuation ? continuationCount + 1 : 0;
      previousParagraph = paragraph;
      previousAddress = false;
      if (text) {
        const page: RedactionPage = {
          index: pages.length,
          width: 0,
          height: 0,
          text,
          spans: [],
          source: "word",
          part,
          paragraph: paragraphIndex,
          fieldCategory:
            (cell ? cellCategories.get(cell) : undefined) ??
            (continuation ? "address" : undefined),
        };
        pages.push(page);
        previousAddress = findFieldMatches(page).some(
          (match) =>
            match.category === "address" && match.end === text.trimEnd().length,
        );
      }
    });
  }
  return {
    document: { id, file, kind: "docx", pages, warnings: ["wordPreview"] },
    archive,
  };
}

/** Ranges refer to joined paragraph text, including words split across styled runs. */
export function replaceParagraph(
  paragraph: Element,
  hits: RedactionHit[],
  replacements: Map<string, string>,
  method: RedactionSettings["method"],
): void {
  const nodes = paragraphNodes(paragraph);
  const ranges: { node: Element; start: number; end: number }[] = [];
  let offset = 0;
  for (const node of nodes) {
    const start = offset;
    offset += node.textContent?.length ?? 0;
    ranges.push({ node, start, end: offset });
  }
  for (const hit of [...hits]
    .filter((hit) => hit.selected)
    .sort((a, b) => b.start - a.start)) {
    let inserted = false;
    for (const range of ranges) {
      if (range.end <= hit.start || range.start >= hit.end) continue;
      const text = range.node.textContent ?? "";
      const start = Math.max(0, hit.start - range.start);
      const end = Math.min(range.end - range.start, hit.end - range.start);
      const replacement = inserted
        ? ""
        : method === "blackout"
          ? "█".repeat(
              Math.min(12, Math.max(3, Array.from(hit.original).length)),
            )
          : (replacements.get(hit.id) ?? "***");
      range.node.textContent =
        text.slice(0, start) + replacement + text.slice(end);
      range.node.setAttributeNS(
        "http://www.w3.org/XML/1998/namespace",
        "xml:space",
        "preserve",
      );
      inserted = true;
    }
  }
}

export async function exportWord(
  document: RedactionDocument,
  hits: RedactionHit[],
  replacements: Map<string, string>,
  method: RedactionSettings["method"],
  media: Map<string, Blob> = new Map(),
): Promise<Blob> {
  const archive = await JSZip.loadAsync(await document.file.arrayBuffer());
  const renamedMedia = new Map(
    [...media.keys()]
      .filter((name) => /\.bmp$/i.test(name))
      .map((name) => [name, name.replace(/\.bmp$/i, ".redacted.png")]),
  );
  const selected = hits.filter(
    (hit) => hit.selected && hit.documentId === document.id,
  );
  const secrets = [
    ...new Set(
      selected.filter((hit) => hit.original).map((hit) => hit.original),
    ),
  ];
  for (const page of document.pages.filter((page) => page.source === "word")) {
    const file = archive.file(page.part!);
    if (!file) throw new Error("WORD_XML_INVALID");
  }
  for (const name of Object.keys(archive.files)) {
    if (archive.files[name].dir) continue;
    if (
      /^(?:docProps\/|customXml\/|word\/(?:comments|people|embeddings\/|activeX\/|afchunk|vbaProject)|_xmlsignatures\/)/i.test(
        name,
      )
    ) {
      archive.remove(name);
      continue;
    }
    if (!/\.xml$|\.rels$/i.test(name)) continue;
    const xml = parseWordXml(await archive.file(name)!.async("string"));
    cleanRevisions(xml);
    for (const node of Array.from(xml.getElementsByTagName("Relationship"))) {
      const target = node.getAttribute("Target") ?? "";
      for (const [original, renamed] of renamedMedia) {
        const basename = original.slice(original.lastIndexOf("/") + 1);
        if (target.endsWith(`/${basename}`))
          node.setAttribute(
            "Target",
            target.slice(0, -basename.length) +
              renamed.slice(renamed.lastIndexOf("/") + 1),
          );
      }
      if (
        /comments|people|docProps|customXml|embeddings|activeX|aFChunk|vbaProject|_xmlsignatures/i.test(
          `${node.getAttribute("Type")} ${target}`,
        ) ||
        node.getAttribute("TargetMode") === "External"
      )
        node.remove();
    }
    for (const node of Array.from(xml.getElementsByTagName("Override"))) {
      if (
        /docProps|customXml|comments|people|embeddings|activeX|afchunk|vbaProject|_xmlsignatures/i.test(
          node.getAttribute("PartName") ?? "",
        )
      )
        node.remove();
    }
    if (
      name === "[Content_Types].xml" &&
      renamedMedia.size &&
      !Array.from(xml.getElementsByTagName("Default")).some(
        (node) => node.getAttribute("Extension") === "png",
      )
    ) {
      const type = xml.createElementNS(
        xml.documentElement.namespaceURI,
        "Default",
      );
      type.setAttribute("Extension", "png");
      type.setAttribute("ContentType", "image/png");
      xml.documentElement.append(type);
    }
    const paragraphs = wordParagraphs(xml);
    for (const page of document.pages.filter(
      (page) => page.part === name && page.source === "word",
    )) {
      const paragraph = paragraphs[page.paragraph!];
      if (!paragraph) throw new Error("WORD_XML_INVALID");
      replaceParagraph(
        paragraph,
        selected.filter((hit) => hit.pageIndex === page.index),
        replacements,
        method,
      );
    }
    // Non-rendered properties and attribute values cannot carry an original secret.
    for (const element of Array.from(xml.getElementsByTagName("*"))) {
      for (const attr of Array.from(element.attributes))
        for (const secret of secrets)
          if (attr.value.includes(secret))
            attr.value = attr.value.replaceAll(secret, "***");
      if (!element.children.length && element.namespaceURI !== WORD_NS)
        for (const secret of secrets)
          if (element.textContent?.includes(secret))
            element.textContent = element.textContent.replaceAll(secret, "***");
    }
    archive.file(name, new XMLSerializer().serializeToString(xml));
  }
  for (const [name, blob] of media) {
    const renamed = renamedMedia.get(name);
    if (renamed) archive.remove(name);
    archive.file(renamed ?? name, new Uint8Array(await blob.arrayBuffer()));
  }
  return archive.generateAsync({
    type: "blob",
    mimeType: WORD_MIME,
    compression: "DEFLATE",
  });
}

export function wordPreviewText(
  page: RedactionPage,
  hits: RedactionHit[],
  replacements: Map<string, string>,
  method: RedactionSettings["method"],
): string {
  return replaceRanges(
    page.text,
    hits.filter((hit) => hit.pageIndex === page.index),
    replacements,
    method === "blackout",
  );
}
