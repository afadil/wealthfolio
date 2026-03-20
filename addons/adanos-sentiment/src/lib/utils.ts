import type {
  AdanosPlatformId,
  AdanosPreferences,
  AdanosTrend,
  CompositeAlignment,
  CompositeRecommendation,
  PlatformSnapshot,
  TrackedHolding,
} from "../types";

interface HoldingLike {
  instrument?: {
    symbol?: string | null;
    name?: string | null;
    classifications?: {
      assetType?: {
        key?: string | null;
      } | null;
    } | null;
  } | null;
  assetKind?: string | null;
  marketValue?: {
    base?: number | null;
  } | null;
  weight?: number | null;
  baseCurrency?: string | null;
}

export const DEFAULT_PREFERENCES: AdanosPreferences = {
  days: 7,
  enabledPlatforms: ["reddit", "x", "news", "polymarket"],
};

export const ADANOS_PRICING_URL = "https://adanos.org/pricing";

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

export function buildTrackedHoldings(holdings: HoldingLike[], maxSymbols = 10): TrackedHolding[] {
  const bySymbol = new Map<string, TrackedHolding>();
  let totalIncludedMarketValueBase = 0;

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

    totalIncludedMarketValueBase += marketValueBase;

    const existing = bySymbol.get(symbol);

    if (existing) {
      existing.marketValueBase += marketValueBase;
      continue;
    }

    bySymbol.set(symbol, {
      symbol,
      name: holding.instrument?.name || symbol,
      weight: 0,
      marketValueBase,
      baseCurrency: holding.baseCurrency || "USD",
    });
  }

  const trackedHoldings = Array.from(bySymbol.values())
    .sort((left, right) => right.marketValueBase - left.marketValueBase)
    .slice(0, maxSymbols);

  if (totalIncludedMarketValueBase > 0) {
    for (const holding of trackedHoldings) {
      holding.weight = holding.marketValueBase / totalIncludedMarketValueBase;
    }
  }

  return trackedHoldings;
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

export function formatBuzzScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  return `${Math.round(value)}/100`;
}

export function formatDetailedBuzzScore(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  return `${value.toFixed(1)}/100`;
}

export function formatBullishPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  return `${Math.round(value)}%`;
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
    return "border border-border/70 bg-background text-muted-foreground";
  }

  if (value >= 0.15) {
    return "border border-success/20 bg-success/10 text-success";
  }

  if (value <= -0.15) {
    return "border border-destructive/20 bg-destructive/10 text-destructive";
  }

  return "border border-warning/20 bg-warning/10 text-warning";
}

export function getCoverageLabel(coverage: number, totalPlatforms: number): string {
  if (coverage === 0) {
    return "No platform data";
  }

  return `${coverage}/${totalPlatforms} platforms`;
}

export function formatTrendLabel(value: AdanosTrend | null | undefined): string {
  if (!value) {
    return "No data";
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function formatSignedNumber(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
}

export function getBullishValueClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }

  if (value >= 55) {
    return "text-success";
  }

  if (value <= 45) {
    return "text-destructive";
  }

  return "text-warning";
}

export function getTrendValueClass(value: AdanosTrend | null | undefined): string {
  switch (value) {
    case "rising":
      return "text-success";
    case "falling":
      return "text-destructive";
    case "stable":
      return "text-warning";
    default:
      return "";
  }
}

export function buildCompositeSignal(platforms: PlatformSnapshot[]) {
  const sourceEntries = platforms.filter(
    (platform) =>
      platform.buzzScore !== null &&
      platform.bullishPct !== null &&
      platform.trend !== null,
  );

  if (sourceEntries.length === 0) {
    return null;
  }

  const avgBullish = averageFinite(sourceEntries.map((platform) => platform.bullishPct));
  const avgBuzz = averageFinite(sourceEntries.map((platform) => platform.buzzScore));
  const bullishValues = sourceEntries
    .map((platform) => platform.bullishPct)
    .filter((value): value is number => value !== null);
  const trendConsensus = averageFinite(sourceEntries.map((platform) => trendToNumber(platform.trend)));
  const bullishSourceCount = sourceEntries.filter((platform) => (platform.bullishPct ?? 0) >= 55).length;
  const bearishSourceCount = sourceEntries.filter((platform) => (platform.bullishPct ?? 0) <= 45).length;
  const alignmentRange =
    bullishValues.length > 1 ? Math.max(...bullishValues) - Math.min(...bullishValues) : 0;
  const recommendation = getCompositeRecommendation({
    avgBullish,
    avgBuzz,
    trendConsensus,
    sourceCount: sourceEntries.length,
    alignmentRange,
    bullishSourceCount,
    bearishSourceCount,
  });

  return {
    score: recommendation.score,
    conviction: recommendation.conviction,
    bullishAverage: roundTo(avgBullish, 1),
    sourceAlignment: getSourceAlignment(alignmentRange),
    recommendation,
    sourceCount: sourceEntries.length,
  };
}

export function getRecommendationValueClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }

  if (value > 0) {
    return "text-success";
  }

  if (value < 0) {
    return "text-destructive";
  }

  return "text-warning";
}

export function getAlignmentValueClass(value: CompositeAlignment | null | undefined): string {
  switch (value?.className) {
    case "aligned":
      return "text-success";
    case "mixed":
      return "text-warning";
    case "divergent":
      return "text-destructive";
    default:
      return "";
  }
}

export function getRecommendationBadgeClasses(
  recommendation: CompositeRecommendation | null | undefined,
): string {
  switch (recommendation?.className) {
    case "buy":
      return "border border-success/20 bg-success/10 text-success";
    case "sell":
      return "border border-destructive/20 bg-destructive/10 text-destructive";
    case "hold":
      return "border border-warning/20 bg-warning/10 text-warning";
    default:
      return "border border-border/70 bg-background text-muted-foreground";
  }
}

export function getStrongestHoldingLabel(platforms: PlatformSnapshot[]): string {
  const strongest = [...platforms]
    .filter((platform) => platform.buzzScore !== null)
    .sort((left, right) => (right.buzzScore ?? 0) - (left.buzzScore ?? 0))[0];

  return strongest ? `${strongest.label} ${Math.round(strongest.buzzScore ?? 0)}` : "No data";
}

function averageFinite(values: Array<number | null>): number {
  const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (clean.length === 0) {
    return 0;
  }

  return clean.reduce((total, value) => total + value, 0) / clean.length;
}

function trendToNumber(trend: AdanosTrend | null): number {
  if (trend === "rising") {
    return 1;
  }

  if (trend === "falling") {
    return -1;
  }

  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getCompositeRecommendation({
  avgBullish,
  avgBuzz,
  trendConsensus,
  sourceCount,
  alignmentRange,
  bullishSourceCount,
  bearishSourceCount,
}: {
  avgBullish: number;
  avgBuzz: number;
  trendConsensus: number;
  sourceCount: number;
  alignmentRange: number;
  bullishSourceCount: number;
  bearishSourceCount: number;
}): CompositeRecommendation {
  let score =
    (avgBullish - 50) * 1.3 +
    trendConsensus * 7 +
    clamp(avgBuzz - 60, -10, 20) * 0.2 +
    (sourceCount - 2) * 1.5;

  if (bullishSourceCount >= 3) {
    score += 3;
  }

  if (bearishSourceCount >= 3) {
    score -= 3;
  }

  if (alignmentRange >= 26 && Math.abs(score) < 12) {
    score *= 0.55;
  }

  let label: CompositeRecommendation["label"] = "Hold";
  if (score >= 8) {
    label = "Buy";
  } else if (score <= -8) {
    label = "Sell";
  }

  if (alignmentRange >= 28 && Math.abs(score) < 10) {
    label = "Hold";
  }

  const conviction = Math.round(
    clamp(
      42 +
        Math.abs(score) * 3 +
        sourceCount * 6 +
        (bullishSourceCount === 0 || bearishSourceCount === 0 ? 4 : 0) -
        (alignmentRange >= 26 ? 8 : 0),
      36,
      93,
    ),
  );

  return {
    label,
    className: label === "Buy" ? "buy" : label === "Sell" ? "sell" : "hold",
    score: roundTo(score, 1),
    conviction,
  };
}

function getSourceAlignment(range: number): CompositeAlignment {
  if (range <= 12) {
    return { label: "High agreement", className: "aligned" };
  }

  if (range <= 24) {
    return { label: "Mixed", className: "mixed" };
  }

  return { label: "Wide divergence", className: "divergent" };
}

export function formatLookbackLabel(days: 1 | 7 | 14 | 30): string {
  return days === 1 ? "Last 24 hours" : `Last ${days} days`;
}

export function formatFetchedAtLabel(value: string | null | undefined): string {
  if (!value) {
    return "Not refreshed yet";
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))}`;
}

export function getEstimatedDashboardRequestCount(
  enabledPlatformCount: number,
  trackedHoldings = 10,
): number {
  return Math.max(0, enabledPlatformCount) * Math.max(0, trackedHoldings);
}

export function formatDashboardRequestEstimate(
  enabledPlatformCount: number,
  trackedHoldings = 10,
): string {
  const platformCount = Math.max(0, enabledPlatformCount);
  const holdingCount = Math.max(0, trackedHoldings);
  const requestCount = getEstimatedDashboardRequestCount(platformCount, holdingCount);
  const requestLabel = requestCount === 1 ? "request" : "requests";
  const platformLabel = platformCount === 1 ? "platform" : "platforms";
  const holdingLabel = holdingCount === 1 ? "holding" : "holdings";

  return `Up to ${requestCount} API ${requestLabel} per full dashboard refresh (${holdingCount} ${holdingLabel} x ${platformCount} ${platformLabel}).`;
}

export function formatAccountTypeLabel(value: string): string {
  switch (value) {
    case "free":
      return "Free";
    case "hobby":
      return "Hobby";
    case "professional":
      return "Professional";
    case "premium":
      return "Premium";
    default:
      return value;
  }
}

export function isMonthlyLimitExceededMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("monthly api limit exceeded")
    || normalized.includes("free tier limit of 250 requests per month")
  );
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
