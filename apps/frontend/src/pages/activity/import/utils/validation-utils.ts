import { looksLikeIsin } from "@/lib/isin";
import { looksLikeOccSymbol, normalizeOptionSymbol } from "@/lib/occ-symbol";
import { findMappedActivityType } from "./activity-type-mapping";
import { splitInstrumentPrefixedSymbol } from "./instrument-type";

// Full symbol is bounded to 100 characters by the leading lookahead.
const tickerRegex = /^(?=.{1,100}$)(CASH:[A-Z]{3}|[A-Z0-9_]+([.-][A-Z0-9_]+){0,2})$/;
const cusipRegex = /^[A-Z0-9]{8}\d$/;

export function validateTickerSymbol(symbol: string): boolean {
  const { symbol: strippedSymbol } = splitInstrumentPrefixedSymbol(symbol);
  const normalized = (strippedSymbol || "").trim();
  const upper = normalized.toUpperCase();
  if (!normalized) return false;

  return (
    tickerRegex.test(upper) ||
    looksLikeOccSymbol(normalized) ||
    normalizeOptionSymbol(normalized) !== null ||
    looksLikeIsin(normalized) ||
    cusipRegex.test(upper)
  );
}

export { findMappedActivityType };
