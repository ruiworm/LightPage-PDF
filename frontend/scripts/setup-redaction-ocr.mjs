import { copyFile, cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "editor/public/vendor/redaction-ocr");
await mkdir(resolve(destination, "core"), { recursive: true });
await mkdir(resolve(destination, "lang"), { recursive: true });
const core = resolve(root, "node_modules/tesseract.js-core");
for (const file of await readdir(core)) {
  if (/lstm\.wasm(?:\.js)?$/.test(file))
    await copyFile(resolve(core, file), resolve(destination, "core", file));
}
await copyFile(
  resolve(root, "node_modules/tesseract.js/dist/worker.min.js"),
  resolve(destination, "worker.min.js"),
);
await copyFile(
  resolve(core, "LICENSE"),
  resolve(destination, "LICENSE-TESSERACT-CORE.txt"),
);
await copyFile(
  resolve(root, "node_modules/tesseract.js/LICENSE.md"),
  resolve(destination, "LICENSE-TESSERACT-JS.txt"),
);
const revision = "87416418657359cb625c412a48b6e1d6d41c29bd";
for (const language of ["chi_sim", "eng"]) {
  const response = await fetch(
    `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${revision}/${language}.traineddata`,
  );
  if (!response.ok)
    throw new Error(`Cannot download ${language}: ${response.status}`);
  await writeFile(
    resolve(destination, "lang", `${language}.traineddata`),
    Buffer.from(await response.arrayBuffer()),
  );
}
const license = await fetch(
  `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${revision}/LICENSE`,
);
if (!license.ok) throw new Error("Cannot download OCR language license");
await writeFile(
  resolve(destination, "LICENSE-TESSDATA.txt"),
  await license.text(),
);
await writeFile(
  resolve(destination, "README.md"),
  `Bundled local OCR assets. No runtime CDN requests.\n\nWorker: tesseract.js 7.0.0 (Apache-2.0).\nCore: tesseract.js-core, from the package lock.\nLanguages: tesseract-ocr/tessdata_fast ${revision} (Apache-2.0).\n\nRefresh with: node scripts/setup-redaction-ocr.mjs\n`,
);
console.log("Local Chinese and English OCR assets are ready.");

const pdfDestination = resolve(root, "editor/public/vendor/redaction-pdf");
for (const part of ["cmaps", "standard_fonts"])
  await cp(
    resolve(root, "node_modules/pdfjs-dist", part),
    resolve(pdfDestination, part),
    { recursive: true },
  );
await copyFile(
  resolve(root, "node_modules/pdfjs-dist/LICENSE"),
  resolve(pdfDestination, "LICENSE-PDFJS.txt"),
);
