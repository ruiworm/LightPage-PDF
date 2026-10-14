import { invoke, isTauri } from "@tauri-apps/api/core";
import type { CardLicenseStatus } from "@app/services/cardLicenseService";

/** Keeps desktop-mode browser previews usable without native commands. */
export function cardLicenseSupported(): boolean {
  return isTauri();
}

/** The native host verifies local signed authorization without requesting the network. */
export async function readCardLicense(): Promise<CardLicenseStatus | null> {
  if (!cardLicenseSupported()) return null;
  return invoke<CardLicenseStatus>("card_license_state");
}

/** An omitted key revalidates the saved license; a supplied key activates or replaces it. */
export async function verifyCardLicense(
  key?: string,
): Promise<CardLicenseStatus> {
  if (!cardLicenseSupported()) throw new Error("CARD_NATIVE_UNAVAILABLE");
  return invoke<CardLicenseStatus>("card_license_verify", {
    licenseKey: key?.trim() || null,
  });
}

/** Removes only this application's authorization through its native host. */
export async function clearCardLicense(): Promise<void> {
  if (!cardLicenseSupported()) throw new Error("CARD_NATIVE_UNAVAILABLE");
  await invoke("card_license_clear");
}
