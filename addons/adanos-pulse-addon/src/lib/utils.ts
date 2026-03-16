import type { Holding } from "@wealthfolio/addon-sdk";
import type {
  AdanosPlatformId,
  AdanosPreferences,
  PlatformSnapshot,
  TrackedHolding,
} from "../types";

export const DEFAULT_PREFERENCES: AdanosPreferences = {
  days: 7,
  enabledPlatforms: ["reddit", "x", "news", "polymarket"],
};

const FIAT_SYMBOLS = new Set([
  "AUD",
  "CAD",
  "CHF",
  "CNY",
  "DKK",
  "EUR",
  "GBP",
  "HKD",
  "JPY",
  "NOK",
  "NZD",
  "SEK",
  "USD",
]);

export const PLATFORM_ORDER: AdanosPlatformId[] = ["reddit", "x", "news", "polymarket"];

export function buildTrackedHoldings(holdings: Holding[], maxSymbols = 10): TrackedHolding[] {
  const bySymbol = new Map<string, TrackedHolding>();

  for (const holding of holdings) {
    const symbol = holding.instrument?.symbol?.trim().toUpperCase();
    const assetTypeKey = holding.instrument?.classifications?.assetType?.key?.toLowerCase();

    if (!symbol || !isTickerCandidate(symbol)) {
      continue;
    }

    if (holding.assetKind === "FX") {
      continue;
    }

    if (
      assetTypeKey?.includes("cash") ||
      assetTypeKey?.includes("currency") ||
      assetTypeKey?.includes("crypto")
    ) {
      continue;
    }

    const marketValueBase = holding.marketValue?.base ?? 0;

    if (marketValueBase <= 0) {
      continue;
    }

    const existing = bySymbol.get(symbol);

    if (existing) {
      existing.marketValueBase += marketValueBase;
      existing.weight += holding.weight ?? 0;
      continue;
    }

    bySymbol.set(symbol, {
      symbol,
      name: holding.instrument?.name || symbol,
      weight: holding.weight ?? 0,
      marketValueBase,
      baseCurrency: holding.baseCurrency || "USD",
    });
  }

  return Array.from(bySymbol.values())
    .sort((left, right) => right.marketValueBase - left.marketValueBase)
    .slice(0, maxSymbols);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  return `${(value * 100).toFixed(digits)}%`;
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

export function formatCurrency(
  value: number | null | undefined,
  currency = "USD",
  compact = true,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    notation: compact && Math.abs(value) >= 1000 ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

export function getSentimentLabel(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No signal";
  }

  if (value >= 0.15) {
    return "Bullish";
  }

  if (value <= -0.15) {
    return "Bearish";
  }

  return "Neutral";
}

export function getSentimentClasses(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "bg-muted text-muted-foreground";
  }

  if (value >= 0.15) {
    return "bg-emerald-100 text-emerald-800";
  }

  if (value <= -0.15) {
    return "bg-rose-100 text-rose-800";
  }

  return "bg-amber-100 text-amber-800";
}

export function getCoverageLabel(coverage: number, totalPlatforms: number): string {
  if (coverage === 0) {
    return "No platform data";
  }

  return `${coverage}/${totalPlatforms} platforms`;
}

export function getStrongestHoldingLabel(platforms: PlatformSnapshot[]): string {
  const strongest = [...platforms]
    .filter((platform) => platform.buzzScore !== null)
    .sort((left, right) => (right.buzzScore ?? 0) - (left.buzzScore ?? 0))[0];

  return strongest ? `${strongest.label} ${Math.round(strongest.buzzScore ?? 0)}` : "No data";
}

function isTickerCandidate(symbol: string): boolean {
  if (FIAT_SYMBOLS.has(symbol)) {
    return false;
  }

  if (symbol.includes("/") || symbol.includes(":") || symbol.includes("_")) {
    return false;
  }

  return /^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol);
}
