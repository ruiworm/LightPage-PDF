import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../../../", import.meta.url));
const bundle = join(root, "frontend/editor/src-tauri");
const { version } = JSON.parse(
  await readFile(join(bundle, "tauri.conf.json"), "utf8"),
);
assert(
  typeof version === "string" &&
    /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(version),
  "Invalid desktop version",
);
const source = join(root, `app/core/build/libs/stirling-pdf-${version}.jar`);
assert((await stat(source)).isFile(), "Expected the matching backend JAR");
const libs = join(bundle, "libs");
const filename = `lightpage-pdf-${version}.jar`;
const target = join(libs, filename);
const pending = `${target}.pending`;
await mkdir(libs, { recursive: true });
try {
  await copyFile(source, pending);
  await rename(pending, target);
} finally {
  await rm(pending, { force: true });
}
// Stale generated JARs can otherwise be bundled alongside the current backend.
for (const entry of await readdir(libs, { withFileTypes: true })) {
  if (
    entry.isFile() &&
    entry.name !== filename &&
    /^(?:lightpage|stirling)-pdf-.*\.jar$/i.test(entry.name)
  ) {
    await rm(join(libs, entry.name));
  }
}
console.log(`Staged desktop backend: libs/${filename}`);
