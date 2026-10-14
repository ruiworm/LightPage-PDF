import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  cardLicenseSupported,
  clearCardLicense,
  readCardLicense,
  verifyCardLicense,
  type CardLicenseStatus,
} from "@app/services/cardLicenseService";

interface CardLicenseContextValue {
  supported: boolean;
  ready: boolean;
  busy: boolean;
  status: CardLicenseStatus | null;
  error: string;
  refresh: () => Promise<void>;
  activate: (key?: string) => Promise<boolean>;
  clear: () => Promise<void>;
}

const CardLicenseContext = createContext<CardLicenseContextValue | null>(null);

function errorMessage(error: unknown): string {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "无法检查卡密授权，请重试";
}

/** Local signed authorization controls desktop access; browser development never invokes licensing. */
export function CardLicenseProvider({ children }: { children: ReactNode }) {
  const [supported] = useState(cardLicenseSupported);
  const [ready, setReady] = useState(!supported);
  const [status, setStatus] = useState<CardLicenseStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const mounted = useRef(false);

  const refresh = useCallback(async () => {
    if (!supported || pending.current) return;
    try {
      const result = await readCardLicense();
      if (mounted.current && !pending.current) {
        setStatus(result);
        setError("");
      }
    } catch (error) {
      if (mounted.current && !pending.current) {
        setStatus(null);
        setError(errorMessage(error));
      }
    } finally {
      if (mounted.current) setReady(true);
    }
  }, [supported]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    if (!supported)
      return () => {
        mounted.current = false;
      };
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, supported]);

  useEffect(() => {
    if (!status?.activated || status.permanent || !status.expiresAt) return;
    const delay = status.expiresAt * 1000 - Date.now();
    const timer = window.setTimeout(
      () => {
        setStatus((current) =>
          current
            ? {
                ...current,
                activated: false,
                message: "卡密已到期，请联网激活新卡密",
              }
            : current,
        );
      },
      Math.max(0, Math.min(delay, 2_147_483_647)),
    );
    // Long-lived cards use the minute poll to reschedule before the timer's platform limit.
    if (delay > 2_147_483_647) {
      window.clearTimeout(timer);
      return;
    }
    return () => window.clearTimeout(timer);
  }, [status]);

  const activate = useCallback(
    async (key?: string) => {
      if (pending.current || !supported) return false;
      pending.current = true;
      setBusy(true);
      setError("");
      try {
        const result = await verifyCardLicense(key);
        if (!mounted.current) return false;
        setStatus(result);
        const accepted =
          result.activated &&
          result.source === "server" &&
          (!key || result.licenseKey === key.trim());
        if (!accepted) setError(result.message);
        return accepted;
      } catch (error) {
        if (mounted.current) setError(errorMessage(error));
        return false;
      } finally {
        pending.current = false;
        if (mounted.current) {
          setBusy(false);
          setReady(true);
        }
      }
    },
    [supported],
  );

  const clear = useCallback(async () => {
    if (pending.current || !supported) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await clearCardLicense();
      if (mounted.current) setStatus(null);
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
      return;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
    await refresh();
  }, [refresh, supported]);

  return (
    <CardLicenseContext.Provider
      value={{
        supported,
        ready,
        busy,
        status,
        error,
        refresh,
        activate,
        clear,
      }}
    >
      {children}
    </CardLicenseContext.Provider>
  );
}

/** Must be called inside CardLicenseProvider. */
export function useCardLicense() {
  const value = useContext(CardLicenseContext);
  if (!value) throw new Error("CardLicenseProvider is missing");
  return value;
}

/** Settings can also render alone in flavor-specific tests and previews. */
export function useOptionalCardLicense() {
  return useContext(CardLicenseContext);
}
