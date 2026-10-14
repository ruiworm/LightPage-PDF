import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { DesktopOs, getDesktopOs } from "@app/services/platformService";

const seedOs = /Windows/i.test(navigator.userAgent)
  ? DesktopOs.Windows
  : /Mac/i.test(navigator.userAgent)
    ? DesktopOs.Mac
    : DesktopOs.Unknown;

/** The UA supplies first-frame caption placement while the native OS query resolves. */
export function useDesktopOs(): DesktopOs {
  const [os, setOs] = useState(seedOs);
  useEffect(() => {
    if (!isTauri()) return;
    let mounted = true;
    void getDesktopOs().then((value) => {
      if (mounted) setOs(value);
    });
    return () => {
      mounted = false;
    };
  }, []);
  return os;
}
