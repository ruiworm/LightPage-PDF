import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  openWord,
  exportWord,
  parseWordXml,
  paragraphText,
  wordParagraphs,
  replaceParagraph,
} from "@app/services/fileRedaction/word";
import {
  defaultRedactionSettings,
  findHits,
  replacementsFor,
} from "@app/services/fileRedaction/rules";

const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
function body(content: string): string {
  return `<w:document xmlns:w="${ns}"><w:body>${content}</w:body></w:document>`;
}
function p(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}
async function fixture(content: string): Promise<File> {
  const zip = new JSZip();
  zip.file("word/document.xml", body(content));
  zip.file("word/header1.xml", body(p("邮箱：qa@example.test")));
  zip.file("word/comments.xml", body(p("批注秘密13900000000")));
  zip.file("docProps/core.xml", "<properties>原作者13900000000</properties>");
  zip.file("customXml/item1.xml", "<hidden>13900000000</hidden>");
  zip.file("word/embeddings/object.bin", "13900000000");
  zip.file("word/afchunk1.html", "13900000000");
  zip.file(
    "word/_rels/document.xml.rels",
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="comments.xml" Type="comments"/><Relationship Id="r2" Target="https://example.test/13900000000" Type="hyperlink" TargetMode="External"/></Relationships>',
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const file = new File([new Uint8Array(bytes).buffer], "fixture.docx");
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new Uint8Array(bytes).buffer,
  });
  return file;
}
async function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}

describe("Word redaction export", () => {
  it("keeps a wrapped address across adjacent paragraphs while excluding the following prose", async () => {
    const { document } = await openWord(
      await fixture(
        p("通讯地址：浙江省杭州市滨江区青禾路88号") +
          p("3栋502室") +
          p("3栋楼已完成交付，公开正文保留。"),
      ),
      "doc",
    );
    const hits = findHits(document, defaultRedactionSettings);
    expect(
      hits
        .filter((hit) => hit.category === "address")
        .map((hit) => hit.original),
    ).toEqual(["浙江省杭州市滨江区青禾路88号", "3栋502室"]);
    const zip = await JSZip.loadAsync(
      await readBlob(await exportWord(document, hits, new Map(), "blackout")),
    );
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("3栋502室");
    expect(xml).toContain("3栋楼已完成交付，公开正文保留。");
  });
  it("redacts names and addresses in separate form cells and their repeats in the body", async () => {
    const cell = (text: string) => `<w:tc>${p(text)}</w:tc>`;
    const table = `<w:tbl><w:tr>${cell("姓名")}${cell("陈宁")}${cell("性别")}${cell("女")}</w:tr><w:tr>${cell("通讯地址")}${cell("浙江省杭州市滨江区示例路18号")}</w:tr><w:tr>${cell("姓名")}${cell("性别")}</w:tr><w:tr>${cell("李四")}${cell("男")}</w:tr></w:tbl>`;
    const { document } = await openWord(
      await fixture(
        table + p("陈宁和李四到访浙江省杭州市滨江区示例路18号。公开内容保留。"),
      ),
      "doc",
    );
    const hits = findHits(document, defaultRedactionSettings);
    expect(
      hits.filter((hit) => hit.category === "name").map((hit) => hit.original),
    ).toEqual(["陈宁", "李四", "陈宁", "李四"]);
    expect(hits.filter((hit) => hit.category === "address")).toHaveLength(2);
    const exported = await JSZip.loadAsync(
      await readBlob(await exportWord(document, hits, new Map(), "blackout")),
    );
    const xml = await exported.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("陈宁");
    expect(xml).not.toContain("李四");
    expect(xml).not.toContain("浙江省杭州市滨江区示例路18号");
    expect(xml).toContain("公开内容保留。");
    expect(xml).toContain("性别");
  });
  it("replaces sensitive text spanning multiple styled runs and preserves surrounding text", async () => {
    const file = await fixture(
      "<w:p><w:r><w:t>电话：1390</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>0000000，正文保留</w:t></w:r></w:p>",
    );
    const { document } = await openWord(file, "doc");
    const hits = findHits(document, defaultRedactionSettings);
    const exported = await exportWord(
      document,
      hits,
      replacementsFor(hits, "alias", { phone: "电话", email: "邮箱" }),
      "alias",
    );
    const zip = await JSZip.loadAsync(await readBlob(exported));
    const xml = parseWordXml(
      await zip.file("word/document.xml")!.async("string"),
    );
    expect(paragraphText(wordParagraphs(xml)[0])).toBe("电话：电话1，正文保留");
    expect(xml.getElementsByTagNameNS(ns, "b")).toHaveLength(1);
    expect(await zip.file("word/header1.xml")!.async("string")).not.toContain(
      "qa@example.test",
    );
  });
  it("clears comments, metadata, custom data, embedded objects, and external links", async () => {
    const { document } = await openWord(
      await fixture(p("电话：13900000000")),
      "doc",
    );
    const hits = findHits(document, defaultRedactionSettings);
    const zip = await JSZip.loadAsync(
      await readBlob(
        await exportWord(
          document,
          hits,
          replacementsFor(hits, "full", {}),
          "full",
        ),
      ),
    );
    const entries = Object.keys(zip.files).filter(
      (name) => !zip.files[name].dir,
    );
    expect(entries).toEqual([
      "word/document.xml",
      "word/header1.xml",
      "word/_rels/document.xml.rels",
    ]);
    for (const name of entries) {
      const text = await zip.file(name)!.async("string");
      expect(text).not.toContain("13900000000");
      expect(text).not.toContain("qa@example.test");
    }
  });
  it("accepts revisions and removes hidden/deleted text before both analysis and export", async () => {
    const content =
      p("电话：13900000000") +
      "<w:p><w:del><w:r><w:delText>已删除秘密</w:delText></w:r></w:del><w:r><w:rPr><w:vanish/></w:rPr><w:t>隐藏秘密</w:t></w:r><w:ins><w:r><w:t>当前正文</w:t></w:r></w:ins></w:p>";
    const { document } = await openWord(await fixture(content), "doc");
    expect(document.pages.map((page) => page.text)).toEqual([
      "电话：13900000000",
      "当前正文",
      "邮箱：qa@example.test",
    ]);
    const zip = await JSZip.loadAsync(
      await readBlob(await exportWord(document, [], new Map(), "blackout")),
    );
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).not.toContain("隐藏秘密");
    expect(xml).not.toContain("已删除秘密");
    expect(xml).toContain("当前正文");
  });
  it("preserves excluded occurrences while removing selected occurrences", async () => {
    const { document } = await openWord(
      await fixture(p("邮箱：qa@example.test") + p("邮箱：qa@example.test")),
      "doc",
    );
    const hits = findHits(document, defaultRedactionSettings);
    hits[0].selected = false;
    const zip = await JSZip.loadAsync(
      await readBlob(
        await exportWord(
          document,
          hits,
          replacementsFor(hits, "full", {}),
          "full",
        ),
      ),
    );
    const paragraphs = wordParagraphs(
      parseWordXml(await zip.file("word/document.xml")!.async("string")),
    ).map(paragraphText);
    expect(paragraphs).toEqual(["邮箱：qa@example.test", "邮箱：***"]);
  });
  it("does not count nested textbox text twice", () => {
    const paragraphs = wordParagraphs(
      parseWordXml(
        body(
          "<w:p><w:r><w:t>外部文字</w:t><w:txbxContent>" +
            p("内部文字") +
            "</w:txbxContent></w:r></w:p>",
        ),
      ),
    );
    expect(paragraphs.map(paragraphText)).toEqual(["外部文字", "内部文字"]);
  });
  it("supports multiple replacements within one run without offset drift", async () => {
    const { document } = await openWord(
      await fixture(p("qa@example.test 13900000000")),
      "doc",
    );
    const hits = findHits(document, defaultRedactionSettings).filter(
      (hit) => hit.pageIndex === 0,
    );
    const paragraph = wordParagraphs(
      parseWordXml(body(p(document.pages[0].text))),
    )[0];
    replaceParagraph(
      paragraph,
      hits,
      replacementsFor(hits, "full", {}),
      "full",
    );
    expect(paragraphText(paragraph)).toBe("*** ***");
  });
  it("rejects external entities and malformed XML", () => {
    expect(() =>
      parseWordXml(
        '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///secret">]><a>&x;</a>',
      ),
    ).toThrow("WORD_XML_UNSUPPORTED");
    expect(() => parseWordXml("<broken>")).toThrow("WORD_XML_INVALID");
  });
  it("updates image relationships and content types when a BMP is replaced with PNG", async () => {
    const file = await fixture(p("公开正文"));
    const archive = await JSZip.loadAsync(await file.arrayBuffer());
    archive.file("word/media/image1.bmp", "original bitmap");
    archive.file(
      "word/_rels/document.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="media/image1.bmp" Type="image"/></Relationships>',
    );
    archive.file(
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="bmp" ContentType="image/bmp"/></Types>',
    );
    const { document } = await openWord(file, "doc");
    const data = await archive.generateAsync({ type: "uint8array" });
    document.file = new File([new Uint8Array(data).buffer], "fixture.docx");
    Object.defineProperty(document.file, "arrayBuffer", {
      value: async () => new Uint8Array(data).buffer,
      configurable: true,
    });
    const image = new Blob(["redacted pixels"], { type: "image/png" });
    Object.defineProperty(image, "arrayBuffer", {
      value: async () => new TextEncoder().encode("redacted pixels").buffer,
    });
    const exported = await JSZip.loadAsync(
      await readBlob(
        await exportWord(
          document,
          [],
          new Map(),
          "blackout",
          new Map([["word/media/image1.bmp", image]]),
        ),
      ),
    );
    expect(exported.file("word/media/image1.bmp")).toBeNull();
    expect(exported.file("word/media/image1.redacted.png")).not.toBeNull();
    expect(
      await exported.file("word/_rels/document.xml.rels")!.async("string"),
    ).toContain("media/image1.redacted.png");
    expect(
      await exported.file("[Content_Types].xml")!.async("string"),
    ).toContain('ContentType="image/png"');
  });
});
