import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { Loader } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useFileRedaction } from "@app/contexts/FileRedactionContext";
import type {
  RedactionDocument,
  RedactionPage,
  RedactionRect,
} from "@app/types/fileRedaction";
import { wordPreviewText } from "@app/services/fileRedaction/word";
import { ZoomablePreview } from "@app/components/viewer/nonpdf/ZoomablePreview";
import DocxViewer from "@app/components/viewer/nonpdf/DocxViewer";
const TableRedactionPreview = lazy(
  () => import("@app/components/tools/redact/TableRedactionPreview"),
);
import "@app/components/tools/redact/FileRedaction.css";
function PagePreview({
  document: source,
  page,
  drawing,
}: {
  document: RedactionDocument;
  page: RedactionPage;
  drawing: boolean;
}) {
  const session = useFileRedaction();
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const original = useRef<HTMLCanvasElement | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<RedactionRect | null>(null);
  const [loaded, setLoaded] = useState(0);
  const [error, setError] = useState(false);
  const pageHits = useMemo(
    () =>
      session.hits.filter(
        (hit) => hit.documentId === source.id && hit.pageIndex === page.index,
      ),
    [session.hits, source.id, page.index],
  );

  useEffect(() => {
    let active = true;
    setError(false);
    setLoaded(0);
    void import("@app/services/fileRedaction/documents")
      .then(({ renderRedactionPage }) => renderRedactionPage(source, page, 2))
      .then((canvas) => {
        if (!active) {
          canvas.width = 0;
          return;
        }
        original.current = canvas;
        setLoaded(1);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      if (original.current) original.current.width = 0;
      original.current = null;
    };
  }, [source, page]);

  useEffect(() => {
    let current = true;
    const canvas = canvasRef.current,
      raster = original.current;
    if (!canvas || !raster || !loaded) return;
    canvas.width = raster.width;
    canvas.height = raster.height;
    canvas.getContext("2d")!.drawImage(raster, 0, 0);
    if (session.preview)
      void import("@app/services/fileRedaction/documents").then(
        ({ paintRedactions }) => {
          if (
            current &&
            canvasRef.current === canvas &&
            original.current === raster
          )
            paintRedactions(
              canvas,
              page,
              pageHits,
              session.replacements,
              session.settings.method,
            );
        },
      );
    return () => {
      current = false;
    };
  }, [
    loaded,
    page,
    pageHits,
    session.preview,
    session.replacements,
    session.settings.method,
  ]);

  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          page.width,
          ((event.clientX - bounds.left) / bounds.width) * page.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          page.height,
          ((event.clientY - bounds.top) / bounds.height) * page.height,
        ),
      ),
    };
  };
  if (error) return <p role="alert">{t("fileRedaction.errors.READ_FAILED")}</p>;
  return (
    <div className="file-redaction-image-wrap">
      {!loaded && (
        <div className="file-redaction-preview-loading">
          <Loader size="sm" />
        </div>
      )}
      <div
        className={`file-redaction-image ${drawing ? "is-drawing" : ""}`}
        ref={shell}
        style={{ aspectRatio: `${page.width}/${page.height}` }}
        onPointerDown={(event) => {
          if (!drawing || session.busy || !loaded) return;
          origin.current = point(event);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!origin.current) return;
          const current = point(event);
          setDrag({
            x: Math.min(origin.current.x, current.x),
            y: Math.min(origin.current.y, current.y),
            width: Math.abs(origin.current.x - current.x),
            height: Math.abs(origin.current.y - current.y),
          });
        }}
        onPointerUp={(event) => {
          if (!origin.current) return;
          const current = point(event);
          session.addRegion(
            {
              x: Math.min(origin.current.x, current.x),
              y: Math.min(origin.current.y, current.y),
              width: Math.abs(origin.current.x - current.x),
              height: Math.abs(origin.current.y - current.y),
            },
            page.index,
          );
          origin.current = null;
          setDrag(null);
        }}
        onPointerCancel={() => {
          origin.current = null;
          setDrag(null);
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label={t(
            session.preview
              ? "fileRedaction.preview"
              : "fileRedaction.original",
          )}
        />
        {pageHits.map((hit) =>
          hit.rects.map((rect, index) => (
            <button
              type="button"
              key={`${hit.id}:${index}`}
              className={`file-redaction-box ${session.preview ? "is-preview" : ""} ${hit.selected ? "is-selected" : "is-excluded"} ${hit.id === session.focusHitId ? "is-focused" : ""}`}
              style={{
                left: `${(rect.x / page.width) * 100}%`,
                top: `${(rect.y / page.height) * 100}%`,
                width: `${(rect.width / page.width) * 100}%`,
                height: `${(rect.height / page.height) * 100}%`,
              }}
              aria-label={hit.original || t("fileRedaction.categories.region")}
              aria-pressed={hit.selected}
              title={hit.original || t("fileRedaction.categories.region")}
              onClick={() => {
                if (!drawing && !session.busy) {
                  session.changeHits([hit.id], { selected: !hit.selected });
                  session.focusHit(hit);
                }
              }}
              disabled={drawing || session.busy}
            />
          )),
        )}
        {drag && (
          <div
            className="file-redaction-drag"
            style={{
              left: `${(drag.x / page.width) * 100}%`,
              top: `${(drag.y / page.height) * 100}%`,
              width: `${(drag.width / page.width) * 100}%`,
              height: `${(drag.height / page.height) * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
}

function WordLayoutPreview({
  document: source,
}: {
  document: RedactionDocument;
}) {
  const session = useFileRedaction();
  const { t } = useTranslation();
  const [blob, setBlob] = useState<Blob>(source.file);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const hits = session.preview ? session.hits : undefined;
  const replacements = session.preview ? session.replacements : undefined;
  const settings = session.preview ? session.settings : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    if (!hits || !replacements || !settings) {
      setBlob(source.file);
      setLoading(false);
      return;
    }
    setLoading(true);
    void import("@app/services/fileRedaction/documents")
      .then(({ exportRedactionDocument }) =>
        exportRedactionDocument(
          source,
          hits,
          replacements,
          settings,
          controller.signal,
          () => {},
        ),
      )
      .then((file) => {
        if (!controller.signal.aborted) {
          setBlob(file);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [source, hits, replacements, settings]);
  if (loading) return <Loader size="sm" />;
  if (failed)
    return <p role="alert">{t("fileRedaction.wordLayoutUnavailable")}</p>;
  return <DocxViewer file={blob} />;
}

function WordTextPreview({
  document: source,
}: {
  document: RedactionDocument;
}) {
  const session = useFileRedaction();
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    container.current
      ?.querySelector(`[data-paragraph="${session.activePageIndex}"]`)
      ?.scrollIntoView({ block: "center" });
  }, [session.activePageIndex]);
  return (
    <div ref={container} className="file-redaction-word-audit">
      {source.pages
        .filter((page) => page.source === "word")
        .map((page) => {
          const hits = session.hits
            .filter(
              (hit) =>
                hit.documentId === source.id && hit.pageIndex === page.index,
            )
            .sort((a, b) => a.start - b.start);
          const chunks: React.ReactNode[] = [];
          let offset = 0;
          for (const hit of hits) {
            chunks.push(page.text.slice(offset, hit.start));
            chunks.push(
              <button
                type="button"
                key={hit.id}
                className={`file-redaction-word-hit ${hit.selected ? "is-selected" : ""} ${hit.id === session.focusHitId ? "is-focused" : ""}`}
                aria-pressed={hit.selected}
                disabled={session.busy}
                onClick={() => {
                  session.changeHits([hit.id], { selected: !hit.selected });
                  session.focusHit(hit);
                }}
              >
                {hit.original}
              </button>,
            );
            offset = hit.end;
          }
          chunks.push(page.text.slice(offset));
          return (
            <div
              className={`file-redaction-word-paragraph ${page.index === session.activePageIndex ? "is-current" : ""}`}
              data-paragraph={page.index}
              key={page.index}
            >
              <small>
                {t("fileRedaction.paragraph", { index: page.index + 1 })}
                {page.part !== "word/document.xml"
                  ? ` · ${t("fileRedaction.wordOtherPart")}`
                  : ""}
              </small>
              <p>
                {session.preview
                  ? wordPreviewText(
                      page,
                      session.hits.filter(
                        (hit) => hit.documentId === source.id,
                      ),
                      session.replacements,
                      session.settings.method,
                    )
                  : chunks}
              </p>
            </div>
          );
        })}
    </div>
  );
}

export default function NonPdfRedactionPreview({
  document,
}: {
  document: RedactionDocument;
}) {
  const session = useFileRedaction();
  if (document.table)
    return (
      <Suspense fallback={<Loader size="sm" />}>
        <TableRedactionPreview key={document.id} document={document} />
      </Suspense>
    );
  const page =
    document.pages.find((entry) => entry.index === session.activePageIndex) ??
    document.pages[0];
  if (!page) return null;
  if (document.kind === "docx" && !page.media) {
    return session.wordView === "layout" ? (
      <WordLayoutPreview document={document} />
    ) : (
      <div className="file-redaction-canvas-scroll">
        <WordTextPreview document={document} />
      </div>
    );
  }
  return (
    <ZoomablePreview key={`${document.id}:${page.index}`} width={page.width}>
      <PagePreview
        key={`${document.id}:${page.index}`}
        document={document}
        page={page}
        drawing={session.drawing}
      />
    </ZoomablePreview>
  );
}
