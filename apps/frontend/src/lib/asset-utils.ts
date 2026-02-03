import type { SymbolSearchResult } from "./types";

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
 * Constructs a canonical crypto asset ID.
 * Format: `CRYPTO:{symbol}:{quoteCurrency}`
 *
 * @param symbol - The crypto symbol (e.g., "BTC", "ETH")
 * @param quoteCurrency - The quote currency (e.g., "USD", "EUR")
 * @returns The canonical asset ID
 */
export function buildCryptoAssetId(symbol: string, quoteCurrency: string): string {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedCurrency = quoteCurrency.trim().toUpperCase();
  return `CRYPTO:${normalizedSymbol}:${normalizedCurrency}`;
}

/**
 * Common crypto symbols for heuristic detection
 */
const COMMON_CRYPTO_SYMBOLS = new Set([
  "BTC",
  "ETH",
  "XRP",
  "SOL",
  "ADA",
  "DOGE",
  "DOT",
  "MATIC",
  "LTC",
  "AVAX",
  "LINK",
  "UNI",
  "ATOM",
  "XLM",
  "ALGO",
]);

/**
 * Infers the asset kind from a symbol search result.
 * Uses the same logic as the backend's infer_asset_kind function.
 */
export function inferAssetKind(
  symbol: string,
  quoteType?: string,
  assetKind?: string,
  exchangeMic?: string,
): "SECURITY" | "CRYPTO" | "OTHER" {
  // 1. If explicit asset kind is provided, use it
  if (assetKind) {
    const upper = assetKind.toUpperCase();
    if (upper === "SECURITY" || upper === "EQUITY") return "SECURITY";
    if (upper === "CRYPTO" || upper === "CRYPTOCURRENCY") return "CRYPTO";
    if (upper === "OTHER" || upper === "ALT") return "OTHER";
  }

  // 2. If quoteType indicates crypto
  if (quoteType) {
    const upper = quoteType.toUpperCase();
    if (upper === "CRYPTOCURRENCY" || upper === "CRYPTO") return "CRYPTO";
    if (upper === "EQUITY" || upper === "ETF" || upper === "INDEX") return "SECURITY";
  }

  // 3. If exchange MIC is provided, it's likely a security
  if (exchangeMic) {
    return "SECURITY";
  }

  // 4. Check if symbol looks like crypto
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (COMMON_CRYPTO_SYMBOLS.has(normalizedSymbol)) {
    return "CRYPTO";
  }

  // 5. Crypto pairs often have -USD, -EUR suffix
  if (normalizedSymbol.includes("-USD") || normalizedSymbol.includes("-EUR")) {
    return "CRYPTO";
  }

  // Default to security
  return "SECURITY";
}

/**
 * Builds a canonical asset ID from a symbol search result.
 * If existingAssetId is provided, returns it directly.
 * Otherwise, constructs the canonical ID based on the asset kind.
 *
 * @param searchResult - The symbol search result
 * @param defaultCurrency - Fallback currency if not in search result
 * @returns The canonical asset ID
 */
export function buildCanonicalAssetId(
  searchResult: SymbolSearchResult,
  defaultCurrency: string,
): string {
  // If we already have the canonical ID from the backend, use it
  if (searchResult.existingAssetId) {
    return searchResult.existingAssetId;
  }

  const currency = searchResult.currency ?? defaultCurrency;
  const kind = inferAssetKind(
    searchResult.symbol,
    searchResult.quoteType,
    searchResult.assetKind,
    searchResult.exchangeMic,
  );

  switch (kind) {
    case "CRYPTO":
      return buildCryptoAssetId(searchResult.symbol, currency);
    case "SECURITY":
    default:
      return buildSecurityAssetId(searchResult.symbol, searchResult.exchangeMic);
  }
}

/**
 * Determines if a symbol represents an index (starts with ^ or ends with exchange suffix like .SS)
 */
export function isIndexSymbol(symbol: string): boolean {
  return symbol.startsWith("^") || /\.\w{2}$/.test(symbol);
}
