import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { useDesktopOs } from "@app/hooks/useDesktopOs";
import { DesktopOs } from "@app/services/platformService";
import styles from "@app/components/layout/TitleBarStrip.module.css";

/** Only blank caption areas drag the window; navigation controls keep their normal clicks. */
export function WindowControls({
  placement = "navigation",
}: {
  placement?: "navigation" | "caption";
}) {
  const { t } = useTranslation();
  const os = useDesktopOs();
  const native = isTauri();
  const isWindows = os === DesktopOs.Windows;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!native || !isWindows) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const updateMaximized = () => {
      void appWindow.isMaximized().then((value) => {
        if (!disposed) setMaximized(value);
      });
    };
    updateMaximized();
    void appWindow.onResized(updateMaximized).then((release) => {
      if (disposed) release();
      else unlisten = release;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [native, isWindows]);

  useEffect(() => {
    if (!native || (placement === "navigation" && !isWindows)) return;
    const selector =
      placement === "caption"
        ? "[data-title-bar-strip]"
        : ".app-navigation-bar";
    const interactive =
      "button, a[href], input, textarea, select, label, summary," +
      '[role="button"], [role="tab"], [role="menuitem"], [role="switch"],' +
      '[role="slider"], [contenteditable="true"], [data-no-window-drag]';
    let pending: { x: number; y: number } | null = null;
    let lastDownAt = 0;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (
        event.button !== 0 ||
        !target?.closest(selector) ||
        target.closest(interactive)
      ) {
        pending = null;
        lastDownAt = 0;
        return;
      }
      const now = Date.now();
      if (now - lastDownAt < 500) {
        pending = null;
        lastDownAt = 0;
        void getCurrentWindow().toggleMaximize();
        return;
      }
      lastDownAt = now;
      pending = { x: event.clientX, y: event.clientY };
    };
    const onMouseMove = (event: MouseEvent) => {
      if (
        pending &&
        (Math.abs(event.clientX - pending.x) > 4 ||
          Math.abs(event.clientY - pending.y) > 4)
      ) {
        pending = null;
        lastDownAt = 0;
        void getCurrentWindow().startDragging();
      }
    };
    const onMouseUp = () => {
      pending = null;
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [native, isWindows, placement]);

  if (!native || !isWindows) return null;
  const minimizeLabel = t("desktop.titleBar.minimize", "Minimize");
  const maximizeLabel = maximized
    ? t("desktop.titleBar.restore", "Restore")
    : t("desktop.titleBar.maximize", "Maximize");
  const closeLabel = t("common.close", "Close");
  return (
    <div
      className={`${styles.controls} ${placement === "navigation" ? styles.inlineControls : ""}`}
    >
      <button
        type="button"
        className={styles.button}
        onClick={() => void getCurrentWindow().minimize()}
        aria-label={minimizeLabel}
        title={minimizeLabel}
      >
        <Icon name="minus" size="1em" />
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={() => void getCurrentWindow().toggleMaximize()}
        aria-label={maximizeLabel}
        title={maximizeLabel}
      >
        <Icon
          name={maximized ? "copy" : "square"}
          size="1em"
          className={maximized ? styles.restoreIcon : undefined}
        />
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.close}`}
        onClick={() => void getCurrentWindow().close()}
        aria-label={closeLabel}
        title={closeLabel}
      >
        <Icon name="x" size="1em" />
      </button>
    </div>
  );
}
