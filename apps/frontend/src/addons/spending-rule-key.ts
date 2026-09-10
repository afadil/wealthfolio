/**
 * Derives a stable categorization-rule id from an addon-supplied `ruleKey`.
 * The `addonId` prefix keeps ids from different addons distinct even when
 * they pick the same ruleKey text, and is readable provenance when a user
 * browses rules in Wealthfolio's own Settings UI. Hashing only `ruleKey`
 * (not the addonId too) keeps the id compact regardless of ruleKey length
 * without needing a delimiter between the two.
 */
export async function deriveRuleId(addonId: string, ruleKey: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ruleKey));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `addon:${addonId}:${hex.slice(0, 24)}`;
}
