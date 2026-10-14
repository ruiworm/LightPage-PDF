export type ReadyWordPreview =
  | { kind: "docx"; content: HTMLDivElement }
  | { kind: "doc"; pdf: File; firstPage: { url: string; count: number } };

const previews = new Map<Blob, { value: ReadyWordPreview; bytes: number }>();
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 2;

/** Source Blob identity invalidates changed files. DOCX templates must be cloned before mounting. */
export function getWordPreview(file: Blob): ReadyWordPreview | undefined {
  const entry = previews.get(file);
  if (!entry) return;
  previews.delete(file);
  previews.set(file, entry);
  return entry.value;
}

/** Retains at most two ready previews within 16 MiB, including their source files. */
export function cacheWordPreview(file: Blob, value: ReadyWordPreview): void {
  previews.delete(file);
  if (file.size > MAX_BYTES) return;
  const bytes =
    file.size +
    (value.kind === "docx"
      ? value.content.innerHTML.length * 2
      : value.pdf.size + value.firstPage.url.length * 2);
  if (bytes > MAX_BYTES) return;
  previews.set(file, { value, bytes });
  while (
    previews.size > MAX_ENTRIES ||
    [...previews.values()].reduce((total, entry) => total + entry.bytes, 0) >
      MAX_BYTES
  ) {
    previews.delete(previews.keys().next().value!);
  }
}
