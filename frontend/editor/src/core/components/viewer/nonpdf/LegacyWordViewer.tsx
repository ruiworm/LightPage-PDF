import { useEffect, useState } from "react";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { convertLocalWordToPdf } from "@app/services/localWordConversion";
import { ZoomablePreview } from "@app/components/viewer/nonpdf/ZoomablePreview";
import { Button } from "@app/ui/Button";
import { WordPreviewLoading } from "@app/components/viewer/nonpdf/WordPreviewLoading";
import {
  cacheWordPreview,
  getWordPreview,
} from "@app/services/wordPreviewCache";

/** Read-only DOC preview; conversion and page rendering do not replace the source file. */
export default function LegacyWordViewer({ file }: { file: File }) {
  const { t } = useTranslation();
  const [converted, setConverted] = useState<{
    source: File;
    pdf: File;
  } | null>(null);
  const [page, setPage] = useState(0);
  const [raster, setRaster] = useState<{ url: string; count: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setConverted(null);
    setPage(0);
    setRaster(null);
    setError(null);
    const cached = getWordPreview(file);
    if (cached?.kind === "doc") {
      setConverted({ source: file, pdf: cached.pdf });
      setRaster(cached.firstPage);
      return;
    }
    void convertLocalWordToPdf(file, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setConverted({ source: file, pdf: result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("LEGACY_WORD_UNAVAILABLE");
      });
    return () => controller.abort();
  }, [file]);
  useEffect(() => {
    if (!converted || converted.source !== file) return;
    const { pdf } = converted;
    const cached = getWordPreview(file);
    if (page === 0 && cached?.kind === "doc" && cached.pdf === pdf) {
      setRaster(cached.firstPage);
      return;
    }
    let current = true;
    setRaster(null);
    setError(null);
    void (async () => {
      const { openRawDocumentSafe, getRawPageCount, closeRawDocument } =
        await import("@app/services/pdfiumService");
      const { renderPdfiumPageDataUrl } =
        await import("@app/utils/pdfiumPageRender");
      const pointer = await openRawDocumentSafe(await pdf.arrayBuffer());
      try {
        const count = await getRawPageCount(pointer);
        const url = await renderPdfiumPageDataUrl(pointer, page, 1.5);
        if (!url || !count) throw new Error("READ_FAILED");
        if (current) {
          const ready = { url, count };
          if (page === 0)
            cacheWordPreview(file, { kind: "doc", pdf, firstPage: ready });
          setRaster(ready);
        }
      } finally {
        await closeRawDocument(pointer);
      }
    })().catch(() => {
      if (current) setError("READ_FAILED");
    });
    return () => {
      current = false;
    };
  }, [converted, page, file]);
  if (error)
    return (
      <Text role="alert" p="md">
        {t(`fileRedaction.errors.${error}`)}
      </Text>
    );
  if (!raster) return <WordPreviewLoading />;
  return (
    <>
      <ZoomablePreview key={file.name} fit="width">
        <img
          src={raster.url}
          alt={t("fileRedaction.page", { index: page + 1 })}
        />
      </ZoomablePreview>
      <div
        className="nonpdf-legacy-page-nav"
        aria-label={t("viewer.pageNavigation")}
      >
        <Button
          size="sm"
          variant="tertiary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          {t("viewer.previousPage")}
        </Button>
        <span aria-live="polite">
          {page + 1} / {raster.count}
        </span>
        <Button
          size="sm"
          variant="tertiary"
          disabled={page >= raster.count - 1}
          onClick={() => setPage(page + 1)}
        >
          {t("viewer.nextPage")}
        </Button>
      </div>
    </>
  );
}
