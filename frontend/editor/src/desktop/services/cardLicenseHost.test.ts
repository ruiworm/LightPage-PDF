import { beforeEach, expect, it, vi } from "vitest";
import {
  clearCardLicense,
  readCardLicense,
  verifyCardLicense,
  type CardLicenseStatus,
} from "@app/services/cardLicenseService";

const native = vi.hoisted(() => ({ supported: false, invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => native.supported,
  invoke: native.invoke,
}));
const status: CardLicenseStatus = {
  activated: true,
  licenseKey: "FIXTURE-ONLY-KEY",
  machineId: "FAKE-DEVICE",
  expiresAt: null,
  permanent: true,
  lastVerifiedAt: 1000,
  message: "fixture",
  source: "server",
};

beforeEach(() => {
  vi.clearAllMocks();
  native.supported = false;
  native.invoke.mockResolvedValue(status);
});

it("keeps browser previews out of native activation", async () => {
  expect(await readCardLicense()).toBeNull();
  await expect(verifyCardLicense("fixture")).rejects.toThrow(
    "CARD_NATIVE_UNAVAILABLE",
  );
  await expect(clearCardLicense()).rejects.toThrow("CARD_NATIVE_UNAVAILABLE");
  expect(native.invoke).not.toHaveBeenCalled();
});

it("uses the native host for activation and cached-key revalidation", async () => {
  native.supported = true;
  expect(await readCardLicense()).toBe(status);
  expect(native.invoke).toHaveBeenLastCalledWith("card_license_state");
  expect(await verifyCardLicense("  FIXTURE-ONLY-KEY  ")).toBe(status);
  expect(native.invoke).toHaveBeenLastCalledWith("card_license_verify", {
    licenseKey: "FIXTURE-ONLY-KEY",
  });
  await verifyCardLicense();
  expect(native.invoke).toHaveBeenLastCalledWith("card_license_verify", {
    licenseKey: null,
  });
  await clearCardLicense();
  expect(native.invoke).toHaveBeenLastCalledWith("card_license_clear");
});

it("does not turn a failed native read into an activated status", async () => {
  native.supported = true;
  native.invoke.mockRejectedValueOnce(new Error("cache failed"));
  await expect(readCardLicense()).rejects.toThrow("cache failed");
});
