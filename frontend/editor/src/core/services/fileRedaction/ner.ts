import type {
  RedactionDocument,
  RedactionEntityCandidate,
  RedactionProgress,
} from "@app/types/fileRedaction";
import { throwIfAborted } from "@app/services/fileRedaction/ocr";

function serviceUrl(): URL {
  const url = new URL(import.meta.env.VITE_LOCAL_REDACTION_URL);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("NER_LOCAL_ONLY");
  return url;
}

function candidates(value: unknown): RedactionEntityCandidate[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("entities" in value) ||
    !Array.isArray(value.entities)
  )
    throw new Error("NER_INVALID_RESPONSE");
  return value.entities.filter(
    (entry): entry is RedactionEntityCandidate =>
      entry &&
      typeof entry === "object" &&
      Number.isInteger(entry.pageIndex) &&
      Number.isInteger(entry.start) &&
      Number.isInteger(entry.end) &&
      entry.start >= 0 &&
      entry.end > entry.start &&
      typeof entry.original === "string" &&
      ["name", "company", "address"].includes(entry.category) &&
      (entry.confidence == null ||
        (Number.isFinite(entry.confidence) &&
          entry.confidence >= 0 &&
          entry.confidence <= 1)),
  );
}

/** Only text goes to a loopback service; returned offsets are checked against the original page. */
export async function recognizeDocumentEntities(
  document: RedactionDocument,
  signal: AbortSignal,
  progress: (value: RedactionProgress) => void,
): Promise<void> {
  try {
    const url = serviceUrl();
    const health = await fetch(new URL("/health", url), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(2500)]),
    });
    if (!health.ok) throw new Error("NER_UNAVAILABLE");
    const found: RedactionEntityCandidate[] = [];
    for (const page of document.pages) {
      throwIfAborted(signal);
      progress({
        stage: "recognition",
        file: document.file.name,
        page: page.index + 1,
        total: document.pages.length,
      });
      for (let offset = 0; offset < page.text.length; offset += 49872) {
        const text = page.text.slice(offset, offset + 50000);
        if (!text.trim()) continue;
        const response = await fetch(new URL("/entities", url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pages: [{ index: page.index, text }] }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(120000)]),
        });
        if (!response.ok) throw new Error("NER_UNAVAILABLE");
        for (const item of candidates(await response.json())) {
          if (
            item.pageIndex !== page.index ||
            text.slice(item.start, item.end) !== item.original
          )
            continue;
          found.push({
            ...item,
            start: item.start + offset,
            end: item.end + offset,
          });
        }
      }
    }
    document.entities = found;
  } catch {
    throwIfAborted(signal);
    document.warnings.push("nerUnavailable");
  }
}
