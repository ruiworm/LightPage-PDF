import type { CardLicenseStatus } from "@app/services/cardLicenseService";

/** Browser builds have no hardware-bound authorization host. */
export function cardLicenseSupported(): boolean {
  return false;
}

export async function readCardLicense(): Promise<CardLicenseStatus | null> {
  return null;
}

/** Activation requires a native host that owns the machine identity and signed cache. */
export async function verifyCardLicense(
  _key?: string,
): Promise<CardLicenseStatus> {
  throw new Error("CARD_NATIVE_UNAVAILABLE");
}

export async function clearCardLicense(): Promise<void> {
  throw new Error("CARD_NATIVE_UNAVAILABLE");
}
