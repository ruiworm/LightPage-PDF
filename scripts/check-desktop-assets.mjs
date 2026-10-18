import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] ?? "frontend/editor/dist");
const required = [
  "index.html",
  "pdfium/pdfium.wasm",
  "vendor/redaction-ocr/worker.min.js",
  "vendor/redaction-ocr/lang/chi_sim.traineddata",
  "vendor/redaction-ocr/lang/eng.traineddata",
  "vendor/redaction-ocr/LICENSE-TESSDATA.txt",
];
for (const name of required) {
  assert((await stat(join(root, name))).size > 0, `Missing desktop asset: ${name}`);
}

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await checkDirectory(file);
    else assert(!/\.(gz|br)$/.test(entry.name), `Unused HTTP encoding sidecar: ${file}`);
  }
}

await checkDirectory(root);
for (const directory of ["fonts", "pdfjs/cmaps", "pdfjs/standard_fonts"]) {
  assert((await readdir(join(root, directory))).length > 0, `Missing rendering data: ${directory}`);
}
console.log("Desktop assets retain offline OCR and font data without HTTP encoding sidecars");
