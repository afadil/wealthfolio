/**
 * ISIN (International Securities Identification Number) validator.
 *
 * Format: {CC}{NSIN9}{check} — 12 characters total.
 * Example: "US0378331005" (Apple Inc.)
 */

export interface ParsedIsin {
  countryCode: string;
  nsin: string;
  checkDigit: number;
}

/**
 * Parse and validate an ISIN string (including Luhn check digit).
 * Returns null if invalid.
 */
export function parseIsin(s: string): ParsedIsin | null {
  const trimmed = s.trim().toUpperCase();
  if (trimmed.length !== 12) return null;

  const countryCode = trimmed.slice(0, 2);
  if (!/^[A-Z]{2}$/.test(countryCode)) return null;

  const nsin = trimmed.slice(2, 11);
  if (!/^[A-Z0-9]{9}$/.test(nsin)) return null;

  const checkChar = trimmed[11];
  if (!/^\d$/.test(checkChar)) return null;

  const actual = parseInt(checkChar, 10);
  const expected = computeIsinCheckDigit(trimmed.slice(0, 11));

  if (actual !== expected) return null;

  return { countryCode, nsin, checkDigit: actual };
}

/**
 * Heuristic check if a string looks like an ISIN.
 * Checks format only — does NOT verify the Luhn check digit.
 */
export function looksLikeIsin(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length !== 12) return false;
  if (!/^[A-Za-z]{2}/.test(trimmed)) return false;
  if (!/^[A-Za-z0-9]{11}\d$/.test(trimmed)) return false;
  return true;
}

/**
 * Compute the ISIN Luhn check digit for the first 11 characters.
 */
function computeIsinCheckDigit(first11: string): number {
  // Convert characters to digit array (A=10, B=11, ..., Z=35)
  const digits: number[] = [];
  for (const c of first11) {
    if (c >= "0" && c <= "9") {
      digits.push(parseInt(c, 10));
    } else {
      const val = c.charCodeAt(0) - "A".charCodeAt(0) + 10;
      digits.push(Math.floor(val / 10));
      digits.push(val % 10);
    }
  }

  // Luhn algorithm (from right to left)
  let sum = 0;
  for (let i = digits.length - 1; i >= 0; i--) {
    const pos = digits.length - 1 - i; // 0 = rightmost
    let val = digits[i];
    if (pos % 2 === 0) {
      val *= 2;
      if (val > 9) val -= 9;
    }
    sum += val;
  }

  return (10 - (sum % 10)) % 10;
}
