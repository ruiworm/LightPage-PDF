import type { ReactNode } from "react";
import { useDesktopOs } from "@app/hooks/useDesktopOs";
import { WindowControls } from "@app/components/layout/WindowControls";
import styles from "@app/components/layout/TitleBarStrip.module.css";

/** Caption fallback for activation screens and native macOS traffic lights. */
export function TitleBarStrip({ children }: { children?: ReactNode }) {
  const os = useDesktopOs();
  return (
    <div className={styles.strip} data-title-bar-strip data-os={os}>
      {children}
      <WindowControls placement="caption" />
    </div>
  );
}
