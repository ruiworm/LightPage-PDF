import { afterEach, describe, expect, it, vi } from "vitest";
import { recognizeDocumentEntities } from "@app/services/fileRedaction/ner";
import type { RedactionDocument } from "@app/types/fileRedaction";

function document(): RedactionDocument {
  return {
    id: "doc",
    file: new File([], "fixture.pdf"),
    kind: "pdf",
    warnings: [],
    pages: [
      {
        index: 0,
        width: 100,
        height: 100,
        source: "text",
        spans: [],
        text: "😀张三到这里",
      },
    ],
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("local recognition transport", () => {
  it("sends text only and validates returned UTF16 offsets", async () => {
    vi.stubEnv("VITE_LOCAL_REDACTION_URL", "http://127.0.0.1:5161");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            entities: [
              {
                pageIndex: 0,
                start: 2,
                end: 4,
                original: "张三",
                category: "name",
                confidence: 0.9,
              },
              {
                pageIndex: 0,
                start: 1,
                end: 3,
                original: "张三",
                category: "name",
                confidence: 0.9,
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetcher);
    const doc = document();
    await recognizeDocumentEntities(doc, new AbortController().signal, vi.fn());
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities?.[0].start).toBe(2);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      pages: [{ index: 0, text: "😀张三到这里" }],
    });
    expect(doc.warnings).toEqual([]);
  });
  it("never sends sensitive content to a remote URL", async () => {
    vi.stubEnv("VITE_LOCAL_REDACTION_URL", "https://example.com");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const doc = document();
    await recognizeDocumentEntities(doc, new AbortController().signal, vi.fn());
    expect(fetcher).not.toHaveBeenCalled();
    expect(doc.warnings).toContain("nerUnavailable");
  });
  it("reports service failures without discarding the original page", async () => {
    vi.stubEnv("VITE_LOCAL_REDACTION_URL", "http://127.0.0.1:5161");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const doc = document();
    await recognizeDocumentEntities(doc, new AbortController().signal, vi.fn());
    expect(doc.pages[0].text).toBe("😀张三到这里");
    expect(doc.warnings).toEqual(["nerUnavailable"]);
  });
  it("propagates cancellation instead of treating it as recognition failure", async () => {
    vi.stubEnv("VITE_LOCAL_REDACTION_URL", "http://127.0.0.1:5161");
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    const doc = document();
    await expect(
      recognizeDocumentEntities(doc, controller.signal, vi.fn()),
    ).rejects.toThrow();
    expect(doc.warnings).toEqual([]);
  });
});
