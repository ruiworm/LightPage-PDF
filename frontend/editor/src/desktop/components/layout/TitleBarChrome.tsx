import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  TitleBarStripContext,
  type TitleBarStripSlots,
} from "@app/contexts/TitleBarStripContext";
import { TitleBarStrip } from "@app/components/layout/TitleBarStrip";
import { useQuickNavHost } from "@app/contexts/QuickNavHostContext";
import { useDesktopOs } from "@app/hooks/useDesktopOs";
import { DesktopOs } from "@app/services/platformService";
import styles from "@app/components/layout/TitleBarStrip.module.css";

/** Windows uses app navigation as its caption once it is available; other screens retain a caption row. */
export function TitleBarChrome({ children }: { children: ReactNode }) {
  const host = useQuickNavHost();
  const os = useDesktopOs();
  const integrated =
    os === DesktopOs.Windows && Boolean(host?.appMounted && !host.chromeless);
  const [viewsSlot, setViewsSlot] = useState<HTMLElement | null>(null);
  const [searchSlot, setSearchSlot] = useState<HTMLElement | null>(null);
  const [globalsSlot, setGlobalsSlot] = useState<HTMLElement | null>(null);

  const value = useMemo<TitleBarStripSlots>(
    () => ({ enabled: !integrated, viewsSlot, searchSlot, globalsSlot }),
    [integrated, viewsSlot, searchSlot, globalsSlot],
  );

  const setViews = useCallback((el: HTMLDivElement | null) => {
    setViewsSlot(el);
  }, []);
  const setSearch = useCallback((el: HTMLDivElement | null) => {
    setSearchSlot(el);
  }, []);
  const setGlobals = useCallback((el: HTMLDivElement | null) => {
    setGlobalsSlot(el);
  }, []);

  return (
    <TitleBarStripContext.Provider value={value}>
      <div className={styles.column} data-integrated-caption={integrated}>
        {!integrated && (
          <TitleBarStrip>
            <div ref={setViews} className={styles.viewsSlot} />
            <div ref={setSearch} className={styles.searchSlot} />
            <div ref={setGlobals} className={styles.globalsSlot} />
          </TitleBarStrip>
        )}
        {children}
      </div>
    </TitleBarStripContext.Provider>
  );
}
