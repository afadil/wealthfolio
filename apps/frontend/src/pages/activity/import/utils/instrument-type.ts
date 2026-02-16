const INSTRUMENT_TYPE_ALIASES: Record<string, string> = {
  EQUITY: "EQUITY",
  STOCK: "EQUITY",
  ETF: "EQUITY",
  MUTUALFUND: "EQUITY",
  MUTUAL_FUND: "EQUITY",
  INDEX: "EQUITY",
  BOND: "BOND",
  FIXEDINCOME: "BOND",
  FIXED_INCOME: "BOND",
  DEBT: "BOND",
  OPTION: "OPTION",
  OPT: "OPTION",
  CRYPTO: "CRYPTO",
  CRYPTOCURRENCY: "CRYPTO",
  FX: "FX",
  FOREX: "FX",
  CURRENCY: "FX",
  METAL: "METAL",
  COMMODITY: "METAL",
};

function normalizeToken(raw: string): string {
  return raw.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

export function normalizeInstrumentType(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const normalized = normalizeToken(raw);
  if (!normalized) return undefined;
  return INSTRUMENT_TYPE_ALIASES[normalized] ?? INSTRUMENT_TYPE_ALIASES[normalized.replace(/_/g, "")];
}

/**
 * Parse optional typed symbol prefixes:
 * - bond:US037833DU14
 * - option:AAPL240621C00190000
 * - crypto:BTC-USD
 */
export function splitInstrumentPrefixedSymbol(
  rawSymbol: string | undefined,
): { symbol: string | undefined; instrumentType?: string } {
  if (!rawSymbol) return { symbol: undefined };

  const trimmed = rawSymbol.trim();
  if (!trimmed) return { symbol: undefined };

  const match = /^([A-Za-z][A-Za-z0-9_\-\s]{0,20})\s*:\s*(.+)$/.exec(trimmed);
  if (!match) {
    return { symbol: trimmed };
  }

  const inferredType = normalizeInstrumentType(match[1]);
  if (!inferredType) {
    return { symbol: trimmed };
  }

  const symbol = match[2]?.trim();
  if (!symbol) {
    return { symbol: trimmed };
  }

  return { symbol, instrumentType: inferredType };
}

