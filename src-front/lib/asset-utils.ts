/**
 * Constructs a canonical asset ID in the format used by the backend.
 *
 * Format: `{TYPE}:{symbol}:{qualifier}`
 * Examples:
 * - Securities: `SEC:AAPL:XNAS`
 * - Crypto: `CRYPTO:BTC:USD`
 * - Indices: `SEC:^GSPC:INDEX` (INDEX is used as a pseudo-MIC for indices)
 *
 * @param symbol - The ticker symbol (e.g., "AAPL", "^GSPC")
 * @param exchangeMic - The exchange MIC code (e.g., "XNAS", "XTSE") or undefined for indices
 * @returns The canonical asset ID
 */
export function buildSecurityAssetId(symbol: string, exchangeMic?: string): string {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const mic = exchangeMic?.trim().toUpperCase() || "INDEX";
  return `SEC:${normalizedSymbol}:${mic}`;
}

/**
 * Determines if a symbol represents an index (starts with ^ or ends with exchange suffix like .SS)
 */
export function isIndexSymbol(symbol: string): boolean {
  return symbol.startsWith("^") || /\.\w{2}$/.test(symbol);
}
