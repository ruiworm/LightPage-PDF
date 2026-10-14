import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@app/services/backendHealthMonitor");
vi.mock("@app/services/apiClient", () => ({ default: { get: vi.fn() } }));

import apiClient from "@app/services/apiClient";
import { WebBackendHealthMonitor } from "@app/services/backendHealthMonitor";

const get = vi.mocked(apiClient.get);
let monitor: WebBackendHealthMonitor;
let subscriptions: Array<() => void>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T00:00:00Z"));
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  get.mockReset();
  get.mockResolvedValue({ data: { status: "UP" } });
  monitor = new WebBackendHealthMonitor();
  subscriptions = [];
});

afterEach(() => {
  subscriptions.forEach((unsubscribe) => unsubscribe());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function subscribe() {
  const listener = vi.fn();
  subscriptions.push(monitor.subscribe(listener));
  return listener;
}

describe("web backend health", () => {
  it("shares a bounded request across mounted tool buttons", async () => {
    expect(monitor.getSnapshot()).toMatchObject({
      status: "starting",
      isOnline: false,
    });
    subscribe();
    subscribe();
    expect(await monitor.checkNow()).toBe(true);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      "/api/v1/info/status",
      expect.objectContaining({
        timeout: 3_000,
        signal: expect.any(AbortSignal),
        suppressErrorToast: true,
        skipAuthRedirect: true,
      }),
    );
    expect(monitor.getSnapshot()).toMatchObject({
      status: "healthy",
      isOnline: true,
      error: null,
    });
  });

  it("reports a failed request and recovers when connectivity returns", async () => {
    get.mockRejectedValueOnce(new Error("Network Error"));
    subscribe();
    expect(await monitor.checkNow()).toBe(false);
    expect(monitor.getSnapshot()).toMatchObject({
      status: "unhealthy",
      isOnline: false,
    });
    window.dispatchEvent(new Event("online"));
    expect(await monitor.checkNow()).toBe(true);
    expect(monitor.getSnapshot()).toMatchObject({
      status: "healthy",
      error: null,
    });
  });

  it("does not treat a reachable but unhealthy response as online", async () => {
    get.mockResolvedValue({ data: { status: "DOWN" } });
    subscribe();
    expect(await monitor.checkNow()).toBe(false);
    expect(monitor.getSnapshot().isOnline).toBe(false);
  });

  it("reuses a recent healthy snapshot on view remount and focus", async () => {
    subscribe();
    await monitor.checkNow();
    subscriptions.pop()!();
    subscribe();
    window.dispatchEvent(new Event("focus"));
    expect(get).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("pauses background polling and rechecks on returning to the visible tab", async () => {
    subscribe();
    await monitor.checkNow();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(get).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await monitor.checkNow();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("cancels a request and ignores its late result when all buttons unmount", async () => {
    let finish!: (value: { data: { status: string } }) => void;
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    subscribe();
    const pending = monitor.checkNow();
    const signal = get.mock.calls[0][1]!.signal as AbortSignal;
    subscriptions.pop()!();
    expect(signal.aborted).toBe(true);
    finish({ data: { status: "UP" } });
    await pending;
    expect(monitor.getSnapshot().status).toBe("starting");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still checks a reachable local backend when browser connectivity is offline", async () => {
    subscribe();
    await monitor.checkNow();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    window.dispatchEvent(new Event("offline"));
    await monitor.checkNow();
    expect(monitor.getSnapshot().isOnline).toBe(true);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
