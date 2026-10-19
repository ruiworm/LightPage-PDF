import JSZip from "jszip";
import { File as NativeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAliasRecovery,
  restoreAliasFiles,
} from "@app/services/fileRedaction/recovery";

beforeEach(() => {
  vi.stubGlobal("File", NativeFile);
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

const input = (
  name = "document.docx",
  original = "张三",
  redacted = "姓名1",
) => ({
  original: new File([original], name, { type: "application/octet-stream" }),
  redacted: new File([redacted], `${name}.redacted`),
  aliases: [{ original, alias: redacted }],
});

describe("separate alias recovery files", () => {
  it.each(["pdf", "docx", "xlsx", "csv", "png"])(
    "restores the exact original bytes and name for %s, even when the output was renamed",
    async (extension) => {
      const entry = input(`source.${extension}`, "原文\u0000\u00ff保留格式");
      const recovery = await createAliasRecovery([entry]);
      const result = await restoreAliasFiles(recovery, [
        new File([await entry.redacted.arrayBuffer()], "renamed"),
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(entry.original.name);
      expect(result[0].type).toBe(entry.original.type);
      expect(await result[0].arrayBuffer()).toEqual(
        await entry.original.arrayBuffer(),
      );
      const archive = await JSZip.loadAsync(
        new Uint8Array(await recovery.arrayBuffer()),
      );
      const manifest = JSON.parse(
        await archive.file("manifest.json")!.async("string"),
      );
      expect(manifest.entries[0].aliases).toEqual(entry.aliases);
    },
  );

  it("rejects mismatched or edited outputs without returning any partial originals", async () => {
    const entry = input();
    const recovery = await createAliasRecovery([entry]);
    await expect(
      restoreAliasFiles(recovery, [
        entry.redacted,
        new File(["改过的姓名1"], entry.redacted.name),
      ]),
    ).rejects.toThrow("RECOVERY_MISMATCH");
  });

  it("restores duplicate source names independently in a batch", async () => {
    const a = input("same.docx", "张三", "人员1");
    const b = input("same.docx", "李四", "人员2");
    const recovery = await createAliasRecovery([a, b]);
    const result = await restoreAliasFiles(recovery, [b.redacted, a.redacted]);
    expect(await result[0].text()).toBe("李四");
    expect(await result[1].text()).toBe("张三");
  });

  it("rejects ambiguous identical outputs rather than guessing an original", async () => {
    const a = input("same.docx", "张三");
    const b = input("same.docx", "李四");
    const recovery = await createAliasRecovery([a, b]);
    await expect(restoreAliasFiles(recovery, [a.redacted])).rejects.toThrow(
      "RECOVERY_MISMATCH",
    );
  });

  it("detects a corrupted original stored in the recovery file", async () => {
    const entry = input();
    const recovery = await createAliasRecovery([entry]);
    const archive = await JSZip.loadAsync(
      new Uint8Array(await recovery.arrayBuffer()),
    );
    archive.file("originals/0", "被篡改的原文件");
    const bytes = await archive.generateAsync({ type: "arraybuffer" });
    await expect(
      restoreAliasFiles(new File([bytes], "bad.lp-restore"), [entry.redacted]),
    ).rejects.toThrow("RECOVERY_INVALID");
  });

  it("rejects invalid manifests, archive paths and empty selections", async () => {
    const entry = input();
    const recovery = await createAliasRecovery([entry]);
    const archive = await JSZip.loadAsync(
      new Uint8Array(await recovery.arrayBuffer()),
    );
    const manifest = JSON.parse(
      await archive.file("manifest.json")!.async("string"),
    );
    manifest.entries[0].path = "../../secret";
    archive.file("manifest.json", JSON.stringify(manifest));
    await expect(
      restoreAliasFiles(
        new File(
          [await archive.generateAsync({ type: "arraybuffer" })],
          "bad.lp-restore",
        ),
        [entry.redacted],
      ),
    ).rejects.toThrow("RECOVERY_INVALID");
    await expect(
      restoreAliasFiles(new File(["{}"], "bad.lp-restore"), [entry.redacted]),
    ).rejects.toThrow("RECOVERY_INVALID");
    await expect(restoreAliasFiles(recovery, [])).rejects.toThrow(
      "RECOVERY_INVALID",
    );
  });
});
