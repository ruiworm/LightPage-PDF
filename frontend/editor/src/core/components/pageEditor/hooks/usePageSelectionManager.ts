import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PDFDocument } from "@app/types/pageEditor";
import { parseSelection } from "@app/utils/bulkselection/parseSelection";

interface UsePageSelectionManagerParams {
  displayDocument: PDFDocument | null;
  selectedPageIds: string[];
  setSelectedPageIds: (ids: string[]) => void;
  setSelectionMode: (enabled: boolean) => void;
  toggleSelectAll: (ids: string[]) => void;
  activeFilesSignature: string;
}

export const usePageSelectionManager = ({
  displayDocument,
  selectedPageIds,
  setSelectedPageIds,
  setSelectionMode,
  toggleSelectAll,
  activeFilesSignature,
}: UsePageSelectionManagerParams) => {
  const [csvInput, setCsvInput] = useState<string>("");
  const hasInitializedSelection = useRef(false);
  const previousPageIdsRef = useRef<Set<string>>(new Set());

  const pages = useMemo(
    () => displayDocument?.pages.filter((page) => !page.isPlaceholder) ?? [],
    [displayDocument],
  );
  const totalPages = pages.length;

  const getPageNumbersFromIds = useCallback(
    (pageIds: string[]) => {
      return pageIds
        .map((id) => {
          const page = pages.find((p) => p.id === id);
          return page?.pageNumber || 0;
        })
        .filter((num) => num > 0);
    },
    [pages],
  );

  const getPageIdsFromNumbers = useCallback(
    (pageNumbers: number[]) => {
      return pageNumbers
        .map((num) => {
          const page = pages.find((p) => p.pageNumber === num);
          return page?.id || "";
        })
        .filter((id) => id !== "");
    },
    [pages],
  );

  useEffect(() => {
    if (pages.length > 0 && !hasInitializedSelection.current) {
      const allPageIds = pages.map((page) => page.id);
      setSelectedPageIds(allPageIds);
      setSelectionMode(true);
      hasInitializedSelection.current = true;
    }
  }, [pages, setSelectedPageIds, setSelectionMode]);

  useEffect(() => {
    if (pages.length === 0) {
      previousPageIdsRef.current = new Set();
      hasInitializedSelection.current = false;
      if (selectedPageIds.length > 0) setSelectedPageIds([]);
      setSelectionMode(false);
      return;
    }

    const currentIds = new Set(pages.map((page) => page.id));
    const newlyAddedPageIds: string[] = [];
    currentIds.forEach((id) => {
      if (!previousPageIdsRef.current.has(id)) {
        newlyAddedPageIds.push(id);
      }
    });

    const next = new Set(selectedPageIds.filter((id) => currentIds.has(id)));
    newlyAddedPageIds.forEach((id) => next.add(id));
    if (next.size !== selectedPageIds.length || newlyAddedPageIds.length > 0) {
      setSelectedPageIds(Array.from(next));
    }

    previousPageIdsRef.current = currentIds;
  }, [pages, selectedPageIds, setSelectedPageIds, setSelectionMode]);

  useEffect(() => {
    setCsvInput("");
  }, [activeFilesSignature]);

  const handleSelectAll = useCallback(() => {
    const allPageIds = pages.map((page) => page.id);
    toggleSelectAll(allPageIds);
  }, [pages, toggleSelectAll]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPageIds([]);
  }, [setSelectedPageIds]);

  const handleSetSelectedPages = useCallback(
    (pageNumbers: number[]) => {
      const pageIds = getPageIdsFromNumbers(pageNumbers);
      setSelectedPageIds(pageIds);
    },
    [getPageIdsFromNumbers, setSelectedPageIds],
  );

  const updatePagesFromCSV = useCallback(
    (override?: string) => {
      if (totalPages === 0) return;
      const normalized = parseSelection(override ?? csvInput, totalPages);
      handleSetSelectedPages(normalized);
    },
    [csvInput, totalPages, handleSetSelectedPages],
  );

  return {
    csvInput,
    setCsvInput,
    totalPages,
    getPageNumbersFromIds,
    getPageIdsFromNumbers,
    handleSelectAll,
    handleDeselectAll,
    handleSetSelectedPages,
    updatePagesFromCSV,
  };
};

export type UsePageSelectionManagerReturn = ReturnType<
  typeof usePageSelectionManager
>;
