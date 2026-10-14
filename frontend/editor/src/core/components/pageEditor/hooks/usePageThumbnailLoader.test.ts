import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePageThumbnailLoader } from "@app/components/pageEditor/hooks/usePageThumbnailLoader";
import type { PDFDocument } from "@app/types/pageEditor";
import type { FileId } from "@app/types/file";

const requestThumbnail = vi.fn();
const getThumbnailFromCache = vi.fn<(pageId: string) => string | null>(
  () => null,
);
const sourceFile = new File(["%PDF"], "source.pdf", {
  type: "application/pdf",
});
const selectors = { getFile: () => sourceFile };
let viewActive = true;
vi.mock("@app/components/layout/RetainedView", () => ({
  useViewActive: () => viewActive,
}));
const requests: {
  id: string;
  resolve: (value: string | null) => void;
  reject: (error: Error) => void;
}[] = [];

vi.mock("@app/contexts/FileContext", () => ({
  useFileState: () => ({ selectors }),
}));
vi.mock("@app/hooks/useThumbnailGeneration", () => ({
  useThumbnailGeneration: () => ({ requestThumbnail, getThumbnailFromCache }),
}));

function makeDocument(count: number, id = "A"): PDFDocument {
  return {
    id,
    name: `${id}.pdf`,
    file: sourceFile,
    totalPages: count,
    pages: Array.from({ length: count }, (_, index) => ({
      id: `${id}-${index + 1}`,
      originalFileId: id as FileId,
      originalPageNumber: index + 1,
      pageNumber: index + 1,
      thumbnail: null,
      rotation: 0,
      selected: false,
    })),
  };
}

function mount(count = 6, visiblePageIds: string[] = []) {
  return renderHook(
    ({ visibleIds }) => {
      const [document, setDocument] = useState<PDFDocument | null>(() =>
        makeDocument(count),
      );
      usePageThumbnailLoader({
        document,
        setDocument,
        visiblePageIds: visibleIds,
        contentRevision: 0,
      });
      return { document, setDocument };
    },
    { initialProps: { visibleIds: visiblePageIds } },
  );
}

async function finish(
  id: string,
  value: string | null | Error = `thumbnail:${id}`,
) {
  const index = requests.findIndex((request) => request.id === id);
  expect(index).toBeGreaterThanOrEqual(0);
  const [request] = requests.splice(index, 1);
  await act(async () => {
    if (value instanceof Error) request.reject(value);
    else request.resolve(value);
  });
}

describe("page thumbnail loading", () => {
  beforeEach(() => {
    viewActive = true;
    requests.length = 0;
    requestThumbnail.mockReset();
    getThumbnailFromCache.mockReset();
    getThumbnailFromCache.mockReturnValue(null);
    requestThumbnail.mockImplementation(
      (id: string) =>
        new Promise<string | null>((resolve, reject) => {
          requests.push({ id, resolve, reject });
        }),
    );
  });

  it("pauses the thumbnail queue when the retained organizer is hidden", async () => {
    const view = mount();
    viewActive = false;
    view.rerender({ visibleIds: [] });
    await finish("A-1");
    await finish("A-2");
    expect(requestThumbnail).toHaveBeenCalledTimes(2);
    getThumbnailFromCache.mockImplementation((id) =>
      id === "A-1" || id === "A-2" ? `cached:${id}` : null,
    );
    viewActive = true;
    view.rerender({ visibleIds: [] });
    await act(async () => {});
    for (let page = 3; page <= 6; page++) await finish(`A-${page}`);
    expect(requestThumbnail).toHaveBeenCalledTimes(6);
    expect(
      view.result.current.document?.pages.every((page) => page.thumbnail),
    ).toBe(true);
  });

  it("drains all six pages without needing a scroll or another UI event", async () => {
    const view = mount();
    expect(requests.map((request) => request.id)).toEqual(["A-1", "A-2"]);
    for (let page = 1; page <= 6; page++) {
      expect(requests.length).toBeLessThanOrEqual(2);
      await finish(`A-${page}`);
    }
    expect(requestThumbnail).toHaveBeenCalledTimes(6);
    expect(
      view.result.current.document?.pages.every((page) => page.thumbnail),
    ).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it("prioritizes the visible page and loads further pages when scrolling", async () => {
    const view = mount(10, ["A-10"]);
    expect(requests.map((request) => request.id)).toEqual(["A-10", "A-1"]);
    await finish("A-10");
    for (let page = 1; page <= 8; page++) await finish(`A-${page}`);
    expect(requestThumbnail).toHaveBeenCalledTimes(9);
    expect(view.result.current.document?.pages[8].thumbnail).toBeNull();
    view.rerender({ visibleIds: ["A-9"] });
    await finish("A-9");
    expect(view.result.current.document?.pages[8].thumbnail).toBe(
      "thumbnail:A-9",
    );
  });

  it("keeps advancing when the first two thumbnails come from the cache", async () => {
    getThumbnailFromCache
      .mockReturnValueOnce("cached:1")
      .mockReturnValueOnce("cached:2");
    const view = mount();
    await act(async () => {});
    for (let page = 3; page <= 6; page++) await finish(`A-${page}`);
    expect(requestThumbnail).toHaveBeenCalledTimes(4);
    expect(
      view.result.current.document?.pages
        .slice(0, 2)
        .map((page) => page.thumbnail),
    ).toEqual(["cached:1", "cached:2"]);
    expect(
      view.result.current.document?.pages.every((page) => page.thumbnail),
    ).toBe(true);
  });

  it("continues after missing or failed thumbnails without repeatedly retrying them", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const view = mount();
      await finish("A-1", null);
      await finish("A-2", new Error("render failed"));
      for (let page = 3; page <= 6; page++) await finish(`A-${page}`);
      view.rerender({ visibleIds: ["A-1", "A-2"] });
      expect(requestThumbnail).toHaveBeenCalledTimes(6);
      expect(
        view.result.current.document?.pages
          .slice(2)
          .every((page) => page.thumbnail),
      ).toBe(true);
      expect(requests).toHaveLength(0);
    } finally {
      errorLog.mockRestore();
    }
  });

  it("does not apply old results or dispatch old pages after switching documents", async () => {
    const view = mount();
    act(() => view.result.current.setDocument(makeDocument(2, "B")));
    await finish("A-1");
    await finish("A-2");
    expect(requestThumbnail).toHaveBeenCalledTimes(4);
    expect(
      view.result.current.document?.pages.every(
        (page) => page.thumbnail === null,
      ),
    ).toBe(true);
    await finish("B-1");
    await finish("B-2");
    expect(
      view.result.current.document?.pages.map((page) => page.thumbnail),
    ).toEqual(["thumbnail:B-1", "thumbnail:B-2"]);
  });

  it("stops dispatching more requests after the page editor unmounts", async () => {
    const view = mount();
    view.unmount();
    await finish("A-1");
    await finish("A-2");
    expect(requestThumbnail).toHaveBeenCalledTimes(2);
  });
});
