import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const JSZip = require("jszip");
const { PDFDocument, StandardFonts } = require("@cantoo/pdf-lib");
const base = new URL(process.argv[2]);
assert(["127.0.0.1", "localhost"].includes(base.hostname), "Smoke tests require a loopback backend");

async function post(path, name, bytes, fields = {}) {
  const started = performance.now();
  const body = new FormData();
  body.append("fileInput", new File([bytes], name, { type: name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream" }));
  for (const [key, values] of Object.entries(fields)) {
    for (const value of Array.isArray(values) ? values : [values]) body.append(key, String(value));
  }
  const response = await fetch(new URL(path, base), { method: "POST", body, signal: AbortSignal.timeout(180_000) });
  const result = new Uint8Array(await response.arrayBuffer());
  assert(response.ok, `${path}: ${response.status} ${new TextDecoder().decode(result).slice(0, 500)}`);
  console.log(`${name} → ${path}: ${Math.round(performance.now() - started)} ms`);
  return result;
}

async function checkPdf(bytes, label) {
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF", label);
  const pdf = await PDFDocument.load(bytes);
  assert(pdf.getPageCount() > 0, label);
  console.log(`${label}: valid PDF (${pdf.getPageCount()} page(s))`);
  return pdf;
}

const office = new JSZip();
office.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
office.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
office.file("word/document.xml", '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>LIGHTPAGE 文档转换测试</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>');
const wordPdf = await post("/api/v1/convert/file/pdf", "sample.docx", await office.generateAsync({ type: "uint8array" }));
await checkPdf(wordPdf, "Word to PDF");
const workbook = new JSZip();
workbook.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
workbook.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
workbook.file("xl/workbook.xml", '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
workbook.file("xl/_rels/workbook.xml.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
workbook.file("xl/worksheets/sheet1.xml", '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>姓名</t></is></c><c r="B1" t="inlineStr"><is><t>金额</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>测试人员</t></is></c><c r="B2"><v>123</v></c></row></sheetData></worksheet>');
await checkPdf(await post("/api/v1/convert/file/pdf", "sample.xlsx", await workbook.generateAsync({ type: "uint8array" })), "Excel to PDF");
const word = await JSZip.loadAsync(await post("/api/v1/convert/pdf/word", "sample.pdf", wordPdf, { outputFormat: "docx" }));
assert(word.file("word/document.xml"), "PDF to Word must produce a Word document");
console.log("PDF to Word: valid DOCX");

const input = await PDFDocument.create();
const page = input.addPage([595, 842]);
page.drawText("LIGHTPAGE OCR TEST", { x: 40, y: 700, size: 30, font: await input.embedFont(StandardFonts.Helvetica) });
const bytes = await input.save();
const rotated = await checkPdf(await post("/api/v1/general/rotate-pdf", "rotate.pdf", bytes, { angle: 90 }), "Rotate");
assert.equal(rotated.getPage(0).getRotation().angle, 90);
const recognized = await post("/api/v1/misc/ocr-pdf", "scan.pdf", bytes, { languages: ["eng"], ocrType: "force-ocr", ocrRenderType: "hocr" });
await checkPdf(recognized, "OCR");
const text = await post("/api/v1/convert/pdf/text", "ocr.pdf", recognized, { outputFormat: "txt" });
assert.match(new TextDecoder().decode(text), /LIGHTPAGE/);
console.log("OCR: recognized text is selectable and extractable");
