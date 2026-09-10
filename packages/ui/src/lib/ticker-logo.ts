const CASH_AVATAR_LABELS: Record<string, string> = {
  USD: "$",
  CAD: "C$",
  AUD: "A$",
  NZD: "NZ$",
};

const CASH_SYMBOL_PATTERN = /^\$?CASH[-_:]([A-Z]{3})$/;

export const getCashAvatarLabel = (symbol: string): string | null => {
  const normalized = symbol.trim().toUpperCase();
  if (normalized === "$CASH" || normalized === "CASH") return "$";

  const currency = CASH_SYMBOL_PATTERN.exec(normalized)?.[1];
  if (!currency) return null;

  return CASH_AVATAR_LABELS[currency] ?? currency;
};

const CANONICAL_MARKET_SUFFIX = /^(.*)-([A-Z0-9]{4})$/;
const PROVIDER_SUFFIX_TO_PACK_MIC: Record<string, string> = {
  AS: "XAMS",
  AX: "XASX",
  DE: "XETR",
  L: "XLON",
  NZ: "XNZE",
  PA: "XPAR",
  T: "XTKS",
  TO: "XTSE",
};

export function normalizeTickerLogoSymbol(symbol: unknown): string | undefined {
  if (typeof symbol !== "string") return undefined;

  const normalized = symbol.trim().toUpperCase();
  if (
    !normalized ||
    normalized.includes("..") ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    !/^[A-Z0-9$^._:-]+$/.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
}

function normalizeExchangeMic(exchangeMic: unknown): string | undefined {
  if (typeof exchangeMic !== "string") return undefined;
  const normalized = exchangeMic.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(normalized) ? normalized : undefined;
}

function normalizeFilenameSymbol(symbol: string): string {
  return symbol.replace(/[.^_:]+/g, "-").replace(/-+/g, "-");
}

function getProviderSuffixCompatibilityFilenames(symbol: string): string[] {
  const separatorIndex = symbol.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === symbol.length - 1) return [];

  const baseSymbol = normalizeFilenameSymbol(symbol.slice(0, separatorIndex));
  const providerSuffix = symbol.slice(separatorIndex + 1);
  const marketMic = PROVIDER_SUFFIX_TO_PACK_MIC[providerSuffix];
  return baseSymbol && marketMic ? [`${baseSymbol}-${marketMic}`, baseSymbol] : [];
}

function getCryptoProviderCompatibilityFilenames(symbol: string): string[] {
  const pairMatch = /^(.+)-([A-Z]{3,5})$/.exec(symbol);
  if (!pairMatch) return [];

  const baseSymbol = normalizeFilenameSymbol(pairMatch[1]);
  return baseSymbol ? [`crypto/${baseSymbol}`] : [];
}

function isCryptoInstrument(instrumentType: unknown): boolean {
  if (typeof instrumentType !== "string") return false;
  const normalized = instrumentType.trim().toUpperCase();
  return normalized === "CRYPTO" || normalized === "CRYPTOCURRENCY";
}

function encodeLogoFilename(filename: string): string {
  return filename.split("/").map(encodeURIComponent).join("/");
}

/** Resolve an asset identity to the exact market-specific filename stem. */
export function resolveTickerLogoFilename(
  symbol: unknown,
  exchangeMic?: unknown,
  instrumentType?: unknown,
): string | undefined {
  const normalized = normalizeTickerLogoSymbol(symbol);
  if (!normalized) return undefined;

  if (isCryptoInstrument(instrumentType)) {
    return `crypto/${normalizeFilenameSymbol(normalized)}`;
  }

  if (CANONICAL_MARKET_SUFFIX.test(normalized)) return normalized;

  const filenameSymbol = normalizeFilenameSymbol(normalized);
  const marketMic = normalizeExchangeMic(exchangeMic);
  return marketMic ? `${filenameSymbol}-${marketMic}` : filenameSymbol;
}

/** Exact market logo first, then the unsuffixed logo used by US and shared listings. */
export function resolveTickerLogoFilenames(
  symbol: unknown,
  exchangeMic?: unknown,
  instrumentType?: unknown,
): string[] {
  const exactFilename = resolveTickerLogoFilename(symbol, exchangeMic, instrumentType);
  if (!exactFilename) return [];

  const normalizedSymbol = normalizeTickerLogoSymbol(symbol) ?? "";
  if (isCryptoInstrument(instrumentType)) {
    return [exactFilename, ...getCryptoProviderCompatibilityFilenames(normalizedSymbol)].filter(
      (filename, index, filenames) => filenames.indexOf(filename) === index,
    );
  }

  const providerCompatibilityFilenames = getProviderSuffixCompatibilityFilenames(normalizedSymbol);

  const canonicalMatch = CANONICAL_MARKET_SUFFIX.exec(exactFilename);
  const bareFilename = canonicalMatch
    ? canonicalMatch[1]
    : normalizeFilenameSymbol(normalizedSymbol);

  return [exactFilename, ...providerCompatibilityFilenames, bareFilename].filter(
    (filename, index, filenames) => !!filename && filenames.indexOf(filename) === index,
  );
}

export function getTickerLogoPath(
  symbol: unknown,
  exchangeMic?: unknown,
  instrumentType?: unknown,
): string {
  const filename = resolveTickerLogoFilename(symbol, exchangeMic, instrumentType);
  return filename ? `/ticker-logos/${encodeLogoFilename(filename)}.png` : "";
}

export function getTickerLogoPaths(
  symbol: unknown,
  exchangeMic?: unknown,
  instrumentType?: unknown,
): string[] {
  return resolveTickerLogoFilenames(symbol, exchangeMic, instrumentType).map(
    (filename) => `/ticker-logos/${encodeLogoFilename(filename)}.png`,
  );
}
