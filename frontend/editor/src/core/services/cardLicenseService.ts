export {
  cardLicenseSupported,
  readCardLicense,
  verifyCardLicense,
  clearCardLicense,
} from "@app/services/cardLicenseHost";

export interface CardLicenseStatus {
  activated: boolean;
  licenseKey: string;
  machineId: string;
  expiresAt: number | null;
  permanent: boolean;
  lastVerifiedAt: number | null;
  message: string;
  source: "cache" | "server" | "offline" | "none";
}

export type CardLicenseRemaining =
  | { kind: "permanent" }
  | { kind: "expired" }
  | { kind: "hours"; hours: number }
  | { kind: "days"; days: number };

/** Remaining time is display-only; the native signed expiry decides access. */
export function cardLicenseRemaining(
  status: CardLicenseStatus | null,
  now = Date.now(),
): CardLicenseRemaining | null {
  if (!status) return null;
  if (status.permanent) return { kind: "permanent" };
  if (!status.expiresAt || !Number.isFinite(status.expiresAt)) return null;
  const remaining = status.expiresAt * 1000 - now;
  if (remaining <= 0) return { kind: "expired" };
  const rounded = remaining + 60_000;
  if (rounded < 48 * 3_600_000)
    return {
      kind: "hours",
      hours: Math.max(1, Math.round(rounded / 3_600_000)),
    };
  return { kind: "days", days: Math.floor(rounded / 86_400_000) };
}

/** Keeps enough of a key to identify it without exposing it in screenshots. */
export function maskCardLicense(key: string): string {
  const value = key.trim();
  if (!value) return "";
  if (value.length <= 8)
    return `${value.slice(0, 2)}${"•".repeat(Math.max(2, value.length - 2))}`;
  return `${value.slice(0, 8)}${"•".repeat(6)}${value.slice(-4)}`;
}

export function formatCardMachineId(machineId: string): string {
  return machineId.replace(/(.{4})/g, "$1 ").trim();
}
