import { nanoid as secureNanoid } from "nanoid";
import { nanoid as nonSecureNanoid } from "nanoid/non-secure";

function hasCryptoSupport(): boolean {
  if (typeof globalThis === "undefined") return false;
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  return typeof cryptoObj?.getRandomValues === "function";
}

export function generateId(prefix?: string): string {
  const id = hasCryptoSupport() ? secureNanoid() : nonSecureNanoid();
  return prefix ? `${prefix}-${id}` : id;
}

/** UUIDs used for authentication and sandbox nonces must never fall back to Math.random. */
export function generateSecureUuid(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== "function") {
    throw new Error("Secure randomness is required to generate an ID.");
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
