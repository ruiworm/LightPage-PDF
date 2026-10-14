import { afterEach, expect, it, vi } from "vitest";
import { convertLocalWordToPdf } from "@app/services/localWordConversion";
afterEach(() => vi.unstubAllGlobals());
it("uses the local origin and preserves the source Word file", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: new Headers({ "content-type": "application/pdf" }),
    blob: async () => new Blob(["%PDF-1.7"]),
  });
  vi.stubGlobal("fetch", fetch);
  const file = new File(["original"], "source.doc");
  const controller = new AbortController();
  const output = await convertLocalWordToPdf(file, controller.signal);
  expect(fetch.mock.calls[0][0].href).toBe(
    new URL("api/v1/convert/file/pdf", document.baseURI).href,
  );
  expect(fetch.mock.calls[0][1].body.get("fileInput")).toBe(file);
  expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  expect(output.name).toBe("source.pdf");
  expect(file.name).toBe("source.doc");
  expect(output.type).toBe("application/pdf");
});
it("rejects an unavailable service or a non-PDF response", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
    });
  vi.stubGlobal("fetch", fetch);
  const file = new File(["doc"], "source.doc");
  await expect(convertLocalWordToPdf(file)).rejects.toThrow(
    "LEGACY_WORD_UNAVAILABLE",
  );
  await expect(convertLocalWordToPdf(file)).rejects.toThrow(
    "LEGACY_WORD_UNAVAILABLE",
  );
});
it("does not send documents to a remote application origin", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const uri = vi
    .spyOn(document, "baseURI", "get")
    .mockReturnValue("https://example.com/");
  try {
    await expect(
      convertLocalWordToPdf(new File(["doc"], "source.doc")),
    ).rejects.toThrow("LEGACY_WORD_UNAVAILABLE");
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    uri.mockRestore();
  }
});
