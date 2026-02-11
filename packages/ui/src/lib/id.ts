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
