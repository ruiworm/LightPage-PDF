import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { usePageEditorState } from "@app/components/pageEditor/hooks/usePageEditorState";
import { usePageSelectionManager } from "@app/components/pageEditor/hooks/usePageSelectionManager";
import type { PDFDocument } from "@app/types/pageEditor";

const documentFor = (ids: string[]): PDFDocument => ({
  id: "workspace",
  name: "workspace.pdf",
  file: new File(["%PDF"], "workspace.pdf"),
  totalPages: ids.length,
  pages: ids.map((id, index) => ({
    id,
    pageNumber: index + 1,
    thumbnail: null,
    rotation: 0,
    selected: false,
  })),
});

function setup(document: PDFDocument | null) {
  return renderHook(
    ({ document }: { document: PDFDocument | null }) => {
      const state = usePageEditorState();
      const selection = usePageSelectionManager({
        ...state,
        displayDocument: document,
        activeFilesSignature:
          document?.pages.map((page) => page.id).join(",") ?? "",
      });
      return { ...state, ...selection };
    },
    { initialProps: { document } },
  );
}

describe("page selection tracks the current working document", () => {
  it("excludes hidden loading placeholders from selection, numbering and totals", () => {
    const document = documentFor(["a", "b", "loading"]);
    document.pages[2].isPlaceholder = true;
    const { result, rerender } = setup(document);
    expect(result.current.selectedPageIds).toEqual(["a", "b"]);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.getPageIdsFromNumbers([3])).toEqual([]);
    rerender({ document: documentFor(["a", "b", "c"]) });
    expect(result.current.selectedPageIds).toEqual(["a", "b", "c"]);
    expect(result.current.totalPages).toBe(3);
  });
  it("prunes a removed 50-page file and lets one select-all click clear the remaining 2 pages", () => {
    const remaining = ["first-1", "first-2"];
    const removed = Array.from(
      { length: 50 },
      (_, index) => `second-${index + 1}`,
    );
    const { result, rerender } = setup(documentFor([...remaining, ...removed]));
    expect(result.current.selectedPageIds).toHaveLength(52);

    rerender({ document: documentFor(remaining) });
    expect(result.current.selectedPageIds).toEqual(remaining);
    expect(
      result.current.getPageNumbersFromIds(result.current.selectedPageIds),
    ).toEqual([1, 2]);
    act(() => result.current.handleSelectAll());
    expect(result.current.selectedPageIds).toEqual([]);
  });

  it("preserves an explicit deselection while removing stale IDs", () => {
    const { result, rerender } = setup(documentFor(["a", "b", "c"]));
    act(() => result.current.togglePage("b"));
    rerender({ document: documentFor(["a", "b"]) });
    expect(result.current.selectedPageIds).toEqual(["a"]);
  });

  it("selects newly added pages without reselecting existing deselected pages", () => {
    const { result, rerender } = setup(documentFor(["a", "b"]));
    act(() => result.current.togglePage("b"));
    rerender({ document: documentFor(["b", "c"]) });
    expect(result.current.selectedPageIds).toEqual(["c"]);
  });

  it.each([null, documentFor([])])(
    "clears selection on an empty document and initializes the next one",
    (empty) => {
      const { result, rerender } = setup(documentFor(["a", "b"]));
      rerender({ document: empty });
      expect(result.current.selectedPageIds).toEqual([]);
      expect(result.current.selectionMode).toBe(false);
      rerender({ document: documentFor(["c"]) });
      expect(result.current.selectedPageIds).toEqual(["c"]);
      expect(result.current.selectionMode).toBe(true);
    },
  );

  it("does not reselect pages after deselect-all or an unrelated document render", () => {
    const { result, rerender } = setup(documentFor(["a", "b"]));
    act(() => result.current.handleDeselectAll());
    rerender({ document: documentFor(["a", "b"]) });
    expect(result.current.selectedPageIds).toEqual([]);
  });
});
