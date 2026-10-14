import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { useFileState } from "@app/contexts/FileContext";
import { useThumbnailGeneration } from "@app/hooks/useThumbnailGeneration";
import type { PDFDocument } from "@app/types/pageEditor";
import { useViewActive } from "@app/components/layout/RetainedView";

/** Loads visible pages and the first eight pages, with at most two requests in
 * flight. Failed pages are retried when the source document changes. */
export function usePageThumbnailLoader({
  document,
  visiblePageIds,
  setDocument,
  contentRevision,
}: {
  document: PDFDocument | null;
  visiblePageIds: string[];
  setDocument: Dispatch<SetStateAction<PDFDocument | null>>;
  contentRevision: number;
}) {
  const viewActive = useViewActive();
  const { selectors } = useFileState();
  const { requestThumbnail, getThumbnailFromCache } = useThumbnailGeneration();
  const documentRef = useRef(document);
  const visiblePageIdsRef = useRef(visiblePageIds);
  const pumpRef = useRef<() => void>(() => {});
  const sourceSignature =
    document?.pages
      .map(
        (page) =>
          `${page.id}:${page.originalFileId}:${page.originalPageNumber}`,
      )
      .join(",") ?? "";

  useEffect(() => {
    documentRef.current = document;
    visiblePageIdsRef.current = visiblePageIds;
  }, [document, visiblePageIds]);

  useEffect(() => {
    if (!viewActive) {
      pumpRef.current = () => {};
      return;
    }
    let disposed = false;
    const attempted = new Set<string>();
    const pending = new Set<string>();

    const pump = () => {
      const current = documentRef.current;
      if (disposed || !current) return;
      const pagesById = new Map(current.pages.map((page) => [page.id, page]));
      const candidates = new Set([
        ...visiblePageIdsRef.current,
        ...current.pages.slice(0, 8).map((page) => page.id),
      ]);

      for (const pageId of candidates) {
        if (pending.size >= 2) break;
        if (attempted.has(pageId)) continue;
        const page = pagesById.get(pageId);
        if (!page || page.thumbnail || !page.originalFileId) continue;
        const file = selectors.getFile(page.originalFileId);
        if (!file) continue;

        attempted.add(pageId);
        pending.add(pageId);
        const cached = getThumbnailFromCache(pageId);
        Promise.resolve(
          cached ?? requestThumbnail(pageId, file, page.originalPageNumber),
        )
          .then((thumbnail) => {
            if (disposed || !thumbnail) return;
            setDocument((previous) => {
              if (disposed || !previous) return previous;
              const index = previous.pages.findIndex(
                (item) => item.id === pageId,
              );
              if (index < 0 || previous.pages[index].thumbnail === thumbnail)
                return previous;
              const pages = [...previous.pages];
              pages[index] = { ...pages[index], thumbnail };
              return { ...previous, pages };
            });
          })
          .catch((error) => console.error("[Thumbnail Loading] Error:", error))
          .finally(() => {
            pending.delete(pageId);
            // React may render before this request settles. Advance the queue
            // here instead of relying on a later document or scroll update.
            pump();
          });
      }
    };

    pumpRef.current = pump;
    pump();
    return () => {
      disposed = true;
    };
  }, [
    viewActive,
    sourceSignature,
    contentRevision,
    selectors,
    requestThumbnail,
    getThumbnailFromCache,
    setDocument,
  ]);

  useEffect(() => {
    pumpRef.current();
  }, [document, visiblePageIds]);
}
