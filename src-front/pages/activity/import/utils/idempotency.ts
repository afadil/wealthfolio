/**
 * Idempotency key computation for activity deduplication.
 *
 * This mirrors the backend implementation in crates/core/src/activities/idempotency.rs
 * to allow frontend duplicate detection before import.
 */

/**
 * Normalize a number to a consistent string format (removes trailing zeros)
 */
function normalizeNumber(n: number | undefined): string {
  if (n === undefined || n === null || isNaN(n)) return "";
  // Use toString which removes trailing zeros
  return n.toString();
}

/**
 * Normalize description by trimming and collapsing whitespace
 */
function normalizeDescription(s: string | undefined): string {
  if (!s) return "";
  return s.trim().split(/\s+/).join(" ");
}

/**
 * Compute SHA-256 hash of a string
 * Uses Web Crypto API which is available in modern browsers
 */
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface IdempotencyKeyInput {
  accountId: string;
  activityType: string;
  activityDate: string; // YYYY-MM-DD format
  assetId?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  currency: string;
  providerReferenceId?: string;
  description?: string;
}

/**
 * Compute an idempotency key for an activity.
 *
 * This matches the backend computation in crates/core/src/activities/idempotency.rs
 * The key is a SHA-256 hash of the activity's semantic content.
 */
export async function computeIdempotencyKey(
  input: IdempotencyKeyInput
): Promise<string> {
  // Build the same string format as the backend
  const parts: string[] = [
    input.accountId,
    "|",
    input.activityType,
    "|",
    // Extract date only (YYYY-MM-DD) - handle both date strings and ISO strings
    input.activityDate.split("T")[0],
    "|",
    input.assetId || "",
    "|",
    normalizeNumber(input.quantity),
    "|",
    normalizeNumber(input.unitPrice),
    "|",
    normalizeNumber(input.amount),
    "|",
    input.currency,
    "|",
    input.providerReferenceId || "",
    "|",
    normalizeDescription(input.description),
  ];

  const message = parts.join("");
  return sha256(message);
}

/**
 * Compute idempotency keys for multiple activities in parallel
 */
export async function computeIdempotencyKeys(
  inputs: IdempotencyKeyInput[]
): Promise<Map<number, string>> {
  const results = new Map<number, string>();

  const promises = inputs.map(async (input, index) => {
    const key = await computeIdempotencyKey(input);
    return { index, key };
  });

  const computed = await Promise.all(promises);
  for (const { index, key } of computed) {
    results.set(index, key);
  }

  return results;
}
