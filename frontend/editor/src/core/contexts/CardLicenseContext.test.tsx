import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { CardLicenseGate } from "@app/components/license/CardLicensePanel";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import {
  CardLicenseProvider,
  useCardLicense,
} from "@app/contexts/CardLicenseContext";
import {
  cardLicenseSupported,
  clearCardLicense,
  readCardLicense,
  verifyCardLicense,
  type CardLicenseStatus,
} from "@app/services/cardLicenseService";

vi.mock("@app/services/cardLicenseService", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@app/services/cardLicenseService")
  >()),
  cardLicenseSupported: vi.fn(),
  readCardLicense: vi.fn(),
  verifyCardLicense: vi.fn(),
  clearCardLicense: vi.fn(),
}));

const saved: CardLicenseStatus = {
  activated: true,
  licenseKey: "OLD-CARD",
  machineId: "FAKE-MACHINE",
  expiresAt: null,
  permanent: true,
  lastVerifiedAt: 1000,
  message: "本机授权有效",
  source: "cache",
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <CardLicenseProvider>{children}</CardLicenseProvider>
);

beforeEach(() => {
  vi.mocked(cardLicenseSupported).mockReturnValue(true);
  vi.mocked(readCardLicense).mockResolvedValue({ ...saved });
  vi.mocked(clearCardLicense).mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("desktop card authorization", () => {
  it("shows activation before the workbench and opens after a valid signed result", async () => {
    vi.mocked(readCardLicense).mockResolvedValue(null);
    vi.mocked(verifyCardLicense).mockResolvedValue({
      ...saved,
      licenseKey: "NEW-CARD",
      source: "server",
    });
    render(
      <MantineProvider>
        <CardLicenseProvider>
          <CardLicenseGate>
            <p>WORKBENCH</p>
          </CardLicenseGate>
        </CardLicenseProvider>
      </MantineProvider>,
    );
    await screen.findByLabelText("卡密");
    expect(screen.queryByText("WORKBENCH")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("卡密"), {
      target: { value: "NEW-CARD" },
    });
    fireEvent.click(screen.getByRole("button", { name: "联网激活" }));
    await screen.findByText("WORKBENCH");
    expect(verifyCardLicense).toHaveBeenCalledWith("NEW-CARD");
  });

  it("opens from local authorization without making an online request", async () => {
    const { result } = renderHook(useCardLicense, { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.status?.activated).toBe(true);
    expect(verifyCardLicense).not.toHaveBeenCalled();
  });

  it("keeps browser development independent of native authorization", () => {
    vi.mocked(cardLicenseSupported).mockReturnValue(false);
    const { result } = renderHook(useCardLicense, { wrapper });
    expect(result.current.ready).toBe(true);
    expect(result.current.supported).toBe(false);
    expect(readCardLicense).not.toHaveBeenCalled();
  });

  it("does not unlock after a native storage error and allows a local retry", async () => {
    vi.mocked(readCardLicense).mockRejectedValueOnce("无法读取授权缓存");
    const { result } = renderHook(useCardLicense, { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.status).toBeNull();
    expect(result.current.error).toBe("无法读取授权缓存");
    await act(() => result.current.refresh());
    expect(result.current.status?.activated).toBe(true);
    expect(result.current.error).toBe("");
  });

  it("rejects duplicate submissions and only accepts the requested signed card", async () => {
    let resolve!: (status: CardLicenseStatus) => void;
    vi.mocked(verifyCardLicense).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(useCardLicense, { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    let first!: Promise<boolean>;
    act(() => {
      first = result.current.activate("NEW-CARD");
    });
    await act(async () => {
      expect(await result.current.activate("NEW-CARD")).toBe(false);
    });
    expect(verifyCardLicense).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({
        ...saved,
        source: "cache",
        message: "新卡密无效，原授权继续有效",
      });
      expect(await first).toBe(false);
    });
    expect(result.current.status?.licenseKey).toBe("OLD-CARD");
    expect(result.current.error).toContain("新卡密无效");
  });

  it("reports failed clearing without losing the existing authorization or its error", async () => {
    vi.mocked(clearCardLicense).mockRejectedValue("无法清除本机授权缓存");
    const { result } = renderHook(useCardLicense, { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.clear());
    expect(result.current.status?.activated).toBe(true);
    expect(result.current.error).toBe("无法清除本机授权缓存");
  });

  it("locks at expiry while the application remains open", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1000_000));
    vi.mocked(readCardLicense).mockResolvedValue({
      ...saved,
      permanent: false,
      expiresAt: 1002,
    });
    const { result } = renderHook(useCardLicense, { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status?.activated).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.status?.activated).toBe(false);
    expect(verifyCardLicense).not.toHaveBeenCalled();
  });
});
