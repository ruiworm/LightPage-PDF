import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: bridge.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: bridge.listen }));

const available = {
  supported: true,
  installed: false,
  restartRequired: false,
  version: "test",
  downloadBytes: 100,
  installedBytes: 200,
};

describe("optional Office installation lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    bridge.listen.mockResolvedValue(bridge.unlisten);
  });

  it("shares one installation across panels and enables restart only after native verification", async () => {
    const service = await import("@app/services/officeComponentService");
    let finish!: (value: typeof available) => void;
    bridge.invoke.mockImplementation((command) =>
      command === "get_office_component_status"
        ? Promise.resolve(available)
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    const first = renderHook(service.useOfficeComponent);
    const second = renderHook(service.useOfficeComponent);
    await act(() => service.refreshOfficeComponent());
    let installation!: Promise<void>;
    act(() => {
      installation = service.installOfficeComponent();
    });
    await waitFor(() =>
      expect(bridge.invoke).toHaveBeenCalledWith("install_office_component"),
    );
    await service.installOfficeComponent();
    expect(
      bridge.invoke.mock.calls.filter(
        ([command]) => command === "install_office_component",
      ),
    ).toHaveLength(1);
    expect(second.result.current.busy).toBe(true);
    first.unmount();
    act(() =>
      bridge.listen.mock.calls[0][1]({
        payload: { phase: "verify", completed: 0, total: 0 },
      }),
    );
    expect(second.result.current.status?.installed).toBe(false);
    await act(async () => {
      finish({ ...available, installed: true, restartRequired: true });
      await installation;
    });
    expect(second.result.current.status?.restartRequired).toBe(true);
    expect(second.result.current.busy).toBe(false);
    expect(bridge.unlisten).toHaveBeenCalledOnce();
  });

  it("retains an unavailable state after failure and permits retry", async () => {
    const service = await import("@app/services/officeComponentService");
    bridge.invoke
      .mockResolvedValueOnce(available)
      .mockRejectedValueOnce("checksum mismatch")
      .mockResolvedValueOnce({
        ...available,
        installed: true,
        restartRequired: true,
      });
    const panel = renderHook(service.useOfficeComponent);
    await act(() => service.refreshOfficeComponent());
    await act(() => service.installOfficeComponent());
    expect(panel.result.current.error).toBe("checksum mismatch");
    expect(panel.result.current.status?.installed).toBe(false);
    expect(panel.result.current.busy).toBe(false);
    await act(() => service.installOfficeComponent());
    expect(panel.result.current.error).toBeNull();
    expect(panel.result.current.status?.restartRequired).toBe(true);
    expect(bridge.unlisten).toHaveBeenCalledTimes(2);
  });
});
