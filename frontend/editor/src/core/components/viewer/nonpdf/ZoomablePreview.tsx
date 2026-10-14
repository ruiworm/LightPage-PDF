import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import "@app/components/viewer/nonpdf/ZoomablePreview.css";

/** Scales the display only; children and redaction coordinates retain their original dimensions. */
export function ZoomablePreview({
  children,
  width,
  fit = "page",
}: {
  children: ReactNode;
  width?: number;
  fit?: "page" | "width";
}) {
  const { t } = useTranslation();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (content.current)
        setSize({
          width: content.current.offsetWidth,
          height: content.current.offsetHeight,
        });
      if (viewport.current)
        setAvailable({
          width: Math.max(1, viewport.current.clientWidth - 48),
          height: Math.max(1, viewport.current.clientHeight - 48),
        });
    });
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  const fitted =
    size.width && available.width
      ? Math.min(
          1,
          available.width / size.width,
          fit === "page" && size.height ? available.height / size.height : 1,
        )
      : 1;
  const scale = zoom ?? fitted;
  return (
    <div className="nonpdf-zoom-preview">
      <div className="nonpdf-zoom-viewport" ref={viewport}>
        <div className="nonpdf-zoom-center">
          <div
            className="nonpdf-zoom-footprint"
            style={{ width: size.width * scale, height: size.height * scale }}
          >
            <div
              ref={content}
              className="nonpdf-zoom-content"
              style={{
                width: width ?? "max-content",
                transform: `scale(${scale})`,
              }}
            >
              {children}
            </div>
          </div>
        </div>
      </div>
      <div className="nonpdf-zoom-controls">
        <ActionIcon
          variant="tertiary"
          size="sm"
          aria-label={t("viewer.zoomOut")}
          disabled={!size.width || scale <= 0.1}
          onClick={() => setZoom(Math.max(0.1, scale / 1.25))}
        >
          <Icon name="zoom-out" size={16} />
        </ActionIcon>
        <output aria-live="polite">{Math.round(scale * 100)}%</output>
        <ActionIcon
          variant="tertiary"
          size="sm"
          aria-label={t("viewer.zoomIn")}
          disabled={!size.width || scale >= 4}
          onClick={() => setZoom(Math.min(4, scale * 1.25))}
        >
          <Icon name="zoom-in" size={16} />
        </ActionIcon>
        <Button
          variant="tertiary"
          size="sm"
          disabled={!size.width}
          onClick={() => setZoom(1)}
        >
          100%
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          disabled={!size.width}
          onClick={() => setZoom(null)}
        >
          {t(
            `settings.general.zoomLevel.${fit === "page" ? "fitPage" : "fitWidth"}`,
          )}
        </Button>
      </div>
    </div>
  );
}
