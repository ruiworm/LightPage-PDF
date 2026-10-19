import JSZip from "jszip";

export interface AliasRecoveryInput {
  original: File;
  redacted: File;
  aliases: { original: string; alias: string }[];
}

interface RecoveryEntry {
  name: string;
  type: string;
  path: string;
  originalHash: string;
  redactedHash: string;
  redactedName: string;
  aliases: AliasRecoveryInput["aliases"];
}

async function digest(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Contains original files: save separately from the redacted documents being shared. */
export async function createAliasRecovery(
  inputs: AliasRecoveryInput[],
): Promise<File> {
  if (!inputs.length) throw new Error("RECOVERY_INVALID");
  const archive = new JSZip();
  const entries: RecoveryEntry[] = [];
  for (const [index, input] of inputs.entries()) {
    const original = await input.original.arrayBuffer();
    const path = `originals/${index}`;
    archive.file(path, new Uint8Array(original));
    entries.push({
      name: input.original.name,
      type: input.original.type,
      path,
      originalHash: await digest(original),
      redactedHash: await digest(await input.redacted.arrayBuffer()),
      redactedName: input.redacted.name,
      aliases: input.aliases,
    });
  }
  archive.file(
    "manifest.json",
    JSON.stringify({ format: "lightpage-alias-recovery", version: 1, entries }),
  );
  const bytes = await archive.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  return new File(
    [new Uint8Array(bytes).buffer],
    "lightpage-alias.lp-restore",
    { type: "application/zip" },
  );
}

function recoveryEntry(value: unknown, index: number): value is RecoveryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<RecoveryEntry>;
  return (
    typeof entry.name === "string" &&
    !!entry.name &&
    !/[\\/]/.test(entry.name) &&
    !entry.name.includes("\u0000") &&
    typeof entry.type === "string" &&
    entry.path === `originals/${index}` &&
    typeof entry.originalHash === "string" &&
    /^[a-f0-9]{64}$/.test(entry.originalHash) &&
    typeof entry.redactedHash === "string" &&
    /^[a-f0-9]{64}$/.test(entry.redactedHash) &&
    typeof entry.redactedName === "string" &&
    Array.isArray(entry.aliases) &&
    entry.aliases.every(
      (alias: unknown) =>
        !!alias &&
        typeof alias === "object" &&
        "original" in alias &&
        typeof alias.original === "string" &&
        "alias" in alias &&
        typeof alias.alias === "string",
    )
  );
}

/** Restores byte-identical originals only for unchanged outputs paired with this recovery file. */
export async function restoreAliasFiles(
  recovery: File,
  files: File[],
): Promise<File[]> {
  if (!files.length) throw new Error("RECOVERY_INVALID");
  let archive: JSZip;
  let entries: RecoveryEntry[];
  try {
    archive = await JSZip.loadAsync(
      new Uint8Array(await recovery.arrayBuffer()),
    );
    const manifest = archive.file("manifest.json");
    if (!manifest) throw new Error();
    const value: unknown = JSON.parse(await manifest.async("string"));
    if (
      !value ||
      typeof value !== "object" ||
      !("format" in value) ||
      value.format !== "lightpage-alias-recovery" ||
      !("version" in value) ||
      value.version !== 1 ||
      !("entries" in value) ||
      !Array.isArray(value.entries) ||
      !value.entries.length ||
      !value.entries.every(recoveryEntry)
    )
      throw new Error();
    entries = value.entries;
  } catch {
    throw new Error("RECOVERY_INVALID");
  }
  const restored: File[] = [];
  for (const file of files) {
    const hash = await digest(await file.arrayBuffer());
    const matches = entries.filter((entry) => entry.redactedHash === hash);
    const named = matches.filter(
      (candidate) => candidate.redactedName === file.name,
    );
    const entry =
      matches.length === 1
        ? matches[0]
        : named.length === 1
          ? named[0]
          : undefined;
    if (!entry) throw new Error("RECOVERY_MISMATCH");
    const source = archive.file(entry.path);
    if (!source) throw new Error("RECOVERY_INVALID");
    const bytes = await source.async("arraybuffer");
    if ((await digest(bytes)) !== entry.originalHash)
      throw new Error("RECOVERY_INVALID");
    restored.push(new File([bytes], entry.name, { type: entry.type }));
  }
  return restored;
}
