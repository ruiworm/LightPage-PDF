import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL("./stage-desktop-backend.mjs", import.meta.url),
);

async function fixture(t, version = "3.0.2") {
  const root = await mkdtemp(join(tmpdir(), "lightpage-staging-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bundle = join(root, "frontend/editor/src-tauri");
  const source = join(root, "app/core/build/libs");
  const libs = join(bundle, "libs");
  await mkdir(source, { recursive: true });
  await mkdir(libs, { recursive: true });
  await writeFile(join(bundle, "tauri.conf.json"), JSON.stringify({ version }));
  return {
    root,
    source,
    libs,
    run: () =>
      spawnSync(process.execPath, [script, root], { encoding: "utf8" }),
  };
}

test("stages the matching backend under the product name and removes only stale generated JARs", async (t) => {
  const f = await fixture(t);
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
  await writeFile(join(f.source, "stirling-pdf-3.0.2.jar"), bytes);
  for (const name of [
    "stirling-pdf-3.0.2.jar",
    "lightpage-pdf-3.0.1.jar",
    "dependency.jar",
  ]) {
    await writeFile(join(f.libs, name), "old");
  }
  assert.equal(f.run().status, 0);
  assert.deepEqual(
    await readFile(join(f.libs, "lightpage-pdf-3.0.2.jar")),
    bytes,
  );
  assert.deepEqual((await readdir(f.libs)).sort(), [
    "dependency.jar",
    "lightpage-pdf-3.0.2.jar",
  ]);
  assert.equal(f.run().status, 0);
});

test("does not remove the existing backend if the matching build is missing", async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.source, "stirling-pdf-3.0.1.jar"), "wrong version");
  await writeFile(join(f.libs, "lightpage-pdf-3.0.1.jar"), "working backend");
  assert.notEqual(f.run().status, 0);
  assert.equal(
    await readFile(join(f.libs, "lightpage-pdf-3.0.1.jar"), "utf8"),
    "working backend",
  );
});

test("rejects an invalid version before modifying the bundle", async (t) => {
  const f = await fixture(t, "../../outside");
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(await readdir(f.libs), []);
});
