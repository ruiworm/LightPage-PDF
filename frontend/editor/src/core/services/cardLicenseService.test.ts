import { expect, it } from "vitest";
import {
  cardLicenseRemaining,
  clearCardLicense,
  formatCardMachineId,
  maskCardLicense,
  readCardLicense,
  verifyCardLicense,
  type CardLicenseStatus,
} from "@app/services/cardLicenseService";

const status: CardLicenseStatus = {
  activated: true,
  licenseKey: "FIXTURE-ONLY-KEY",
  machineId: "0011223344556677",
  expiresAt: 1_800_000_000,
  permanent: false,
  lastVerifiedAt: 1_799_900_000,
  message: "fixture",
  source: "server",
};

it("keeps browser development out of native activation", async () => {
  expect(await readCardLicense()).toBeNull();
  await expect(verifyCardLicense("fixture")).rejects.toThrow(
    "CARD_NATIVE_UNAVAILABLE",
  );
  await expect(clearCardLicense()).rejects.toThrow("CARD_NATIVE_UNAVAILABLE");
});
it("recognizes permanent licenses even without a numeric expiry", () => {
  expect(
    cardLicenseRemaining({ ...status, permanent: true, expiresAt: null }),
  ).toEqual({ kind: "permanent" });
});
it("displays a one-day card in hours without rounding it up to two days", () => {
  expect(
    cardLicenseRemaining(status, status.expiresAt! * 1000 - 86_401_000),
  ).toEqual({ kind: "hours", hours: 24 });
});
it("does not let display rounding delay expiration", () => {
  expect(cardLicenseRemaining(status, status.expiresAt! * 1000)).toEqual({
    kind: "expired",
  });
  expect(cardLicenseRemaining(status, status.expiresAt! * 1000 + 1)).toEqual({
    kind: "expired",
  });
});
it("masks full and short keys while keeping a machine code readable", () => {
  expect(maskCardLicense("1234567890abcdef")).toBe("12345678••••••cdef");
  expect(maskCardLicense("abcd")).toBe("ab••");
  expect(maskCardLicense(" ")).toBe("");
  expect(formatCardMachineId("0011223344556677")).toBe("0011 2233 4455 6677");
});
