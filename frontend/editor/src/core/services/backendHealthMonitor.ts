import apiClient from "@app/services/apiClient";
import i18n from "@app/i18n";
import type { BackendHealthState } from "@app/types/backendHealth";

const CHECK_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 3_000;
const INITIAL_STATE: BackendHealthState = {
  status: "starting",
  message: null,
  error: null,
  isOnline: false,
};

/** Shares one cancellable health request and cached status across tool buttons. */
export class WebBackendHealthMonitor {
  private state = INITIAL_STATE;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: {
    controller: AbortController;
    promise: Promise<boolean>;
  } | null = null;
  private checkedAt = 0;

  getSnapshot = (): BackendHealthState => this.state;
  getServerSnapshot = (): BackendHealthState => INITIAL_STATE;

  private update(healthy: boolean): void {
    const message = healthy
      ? i18n.t("backendHealth.online", "Backend Online")
      : i18n.t("backendHealth.offline", "Backend Offline");
    const status = healthy ? "healthy" : "unhealthy";
    if (this.state.status === status && this.state.message === message) return;
    this.state = {
      status,
      message,
      error: healthy ? null : message,
      isOnline: healthy,
    };
    this.listeners.forEach((listener) => listener());
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private cancelRequest(): void {
    this.request?.controller.abort();
    this.request = null;
  }

  private schedule(): void {
    this.clearTimer();
    if (!this.listeners.size || document.visibilityState === "hidden") return;
    this.timer = setTimeout(() => {
      void this.checkNow();
    }, CHECK_INTERVAL_MS);
  }

  private fetchHealth = async (
    controller: AbortController,
  ): Promise<boolean> => {
    let healthy = false;
    try {
      const response = await apiClient.get<{ status?: string }>(
        "/api/v1/info/status",
        {
          timeout: REQUEST_TIMEOUT_MS,
          signal: controller.signal,
          suppressErrorToast: true,
          skipAuthRedirect: true,
        },
      );
      healthy = response.data.status === "UP";
    } catch {
      healthy = false;
    }
    if (!controller.signal.aborted) {
      this.checkedAt = Date.now();
      this.update(healthy);
    }
    return healthy;
  };

  checkNow = (): Promise<boolean> => {
    if (this.request) return this.request.promise;
    this.clearTimer();
    const controller = new AbortController();
    const promise = this.fetchHealth(controller).finally(() => {
      if (this.request?.controller === controller) {
        this.request = null;
        this.schedule();
      }
    });
    this.request = { controller, promise };
    return promise;
  };

  private refreshIfStale = (): void => {
    if (document.visibilityState === "hidden") {
      this.clearTimer();
      return;
    }
    if (
      this.state.isOnline &&
      Date.now() - this.checkedAt < CHECK_INTERVAL_MS
    ) {
      this.schedule();
    } else {
      void this.checkNow();
    }
  };

  private online = (): void => {
    void this.checkNow();
  };
  private offline = (): void => {
    this.cancelRequest();
    this.clearTimer();
    // Loopback services remain usable when the operating system has no internet connection.
    void this.checkNow();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      window.addEventListener("online", this.online);
      window.addEventListener("offline", this.offline);
      window.addEventListener("focus", this.refreshIfStale);
      document.addEventListener("visibilitychange", this.refreshIfStale);
      this.refreshIfStale();
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.clearTimer();
        this.cancelRequest();
        window.removeEventListener("online", this.online);
        window.removeEventListener("offline", this.offline);
        window.removeEventListener("focus", this.refreshIfStale);
        document.removeEventListener("visibilitychange", this.refreshIfStale);
      }
    };
  };
}

export const backendHealthMonitor = new WebBackendHealthMonitor();
