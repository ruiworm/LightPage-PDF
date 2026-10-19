import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useFileRedaction } from "@app/contexts/FileRedactionContext";
import type { RedactionRect } from "@app/types/fileRedaction";
import "@app/components/tools/redact/FileRedaction.css";

/** The preview is a display layer; only the export service removes source content. */
export default function FileRedactionLayer({
  fileId,
  pageIndex,
  width,
  height,
  rotation = 0,
  style,
}: {
  fileId: string;
  pageIndex: number;
  width: number;
  height: number;
  rotation?: number;
  style?: CSSProperties;
}) {
  const session = useFileRedaction();
  const { t } = useTranslation();
  const doc = session.documents.find((entry) => entry.id === fileId);
  const page = doc?.pages.find((entry) => entry.index === pageIndex);
  const canvas = useRef<HTMLCanvasElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<RedactionRect | null>(null);
  const hits = useMemo(
    () =>
      session.hits.filter(
        (hit) => hit.documentId === fileId && hit.pageIndex === pageIndex,
      ),
    [session.hits, fileId, pageIndex],
  );
  const enabled = !!page && session.activeDocumentId === fileId;
  const drawing =
    enabled && session.drawing && !session.preview && !session.busy;

  useEffect(() => {
    const element = canvas.current;
    if (!element || !page || !enabled || !session.preview) return;
    let current = true;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.ceil(width * scale);
    element.height = Math.ceil(height * scale);
    void import("@app/services/fileRedaction/documents").then(
      ({ paintRedactions }) => {
        if (current)
          paintRedactions(
            element,
            page,
            hits,
            session.replacements,
            session.settings.method,
          );
      },
    );
    return () => {
      current = false;
      element.width = 0;
    };
  }, [
    enabled,
    page,
    hits,
    width,
    height,
    session.preview,
    session.replacements,
    session.settings.method,
  ]);

  useEffect(() => {
    origin.current = null;
    setDrag(null);
  }, [drawing, fileId, pageIndex]);

  if (!enabled || !page) return null;
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / bounds.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (event.clientY - bounds.top) / bounds.height),
    );
    const [u, v] =
      rotation === 1
        ? [y, 1 - x]
        : rotation === 2
          ? [1 - x, 1 - y]
          : rotation === 3
            ? [1 - y, x]
            : [x, y];
    return { x: u * page.width, y: v * page.height };
  };
  const rectangle = (end: { x: number; y: number }): RedactionRect => ({
    x: Math.min(origin.current!.x, end.x),
    y: Math.min(origin.current!.y, end.y),
    width: Math.abs(origin.current!.x - end.x),
    height: Math.abs(origin.current!.y - end.y),
  });
  const position = (rect: RedactionRect): CSSProperties => ({
    left: `${(rect.x / page.width) * 100}%`,
    top: `${(rect.y / page.height) * 100}%`,
    width: `${(rect.width / page.width) * 100}%`,
    height: `${(rect.height / page.height) * 100}%`,
  });
  return (
    <div
      className={`file-redaction-layer ${drawing ? "is-drawing" : ""} ${session.preview ? "is-preview" : ""}`}
      data-redaction-file-id={fileId}
      data-redaction-page={pageIndex}
      style={{ width, height, ...style }}
      onPointerDown={(event) => {
        if (!drawing || event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        origin.current = point(event);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (origin.current) {
          event.stopPropagation();
          setDrag(rectangle(point(event)));
        }
      }}
      onPointerUp={(event) => {
        if (!origin.current) return;
        event.stopPropagation();
        session.addRegion(rectangle(point(event)), pageIndex);
        origin.current = null;
        setDrag(null);
      }}
      onPointerCancel={() => {
        origin.current = null;
        setDrag(null);
      }}
    >
      {session.preview && (
        <canvas ref={canvas} aria-label={t("fileRedaction.preview")} />
      )}
      {hits.flatMap((hit) =>
        hit.rects.map((rect, index) => (
          <button
            type="button"
            key={`${hit.id}:${index}`}
            className={`file-redaction-box ${session.preview ? "is-preview" : ""} ${hit.selected ? "is-selected" : "is-excluded"} ${hit.id === session.focusHitId ? "is-focused" : ""}`}
            style={position(rect)}
            aria-label={hit.original || t("fileRedaction.categories.region")}
            aria-pressed={hit.selected}
            title={hit.original || t("fileRedaction.categories.region")}
            onPointerDown={(event) => {
              if (!drawing) event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              session.changeHits([hit.id], { selected: !hit.selected });
              session.focusHit(hit);
            }}
            disabled={drawing || session.busy}
          />
        )),
      )}
      {drag && <div className="file-redaction-drag" style={position(drag)} />}
    </div>
  );
}
