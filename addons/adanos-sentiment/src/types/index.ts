export type AdanosPlatformId = "reddit" | "x" | "news" | "polymarket";
export type AdanosAccountType = "free" | "hobby" | "professional" | "premium";
export type AdanosTrend = "rising" | "falling" | "stable";
export type CompositeAlignmentClass = "aligned" | "mixed" | "divergent";
export type CompositeRecommendationClass = "buy" | "hold" | "sell";

export interface AdanosPreferences {
  days: 1 | 7 | 14 | 30;
  enabledPlatforms: AdanosPlatformId[];
}

export interface TrackedHolding {
  symbol: string;
  name: string;
  weight: number;
  marketValueBase: number;
  baseCurrency: string;
}

export interface StockDetailRow {
  ticker: string;
  company_name: string | null;
  found?: boolean;
  buzz_score?: number | null;
  sentiment_score?: number | null;
  bullish_pct?: number | null;
  mentions?: number | null;
  total_mentions?: number | null;
  trade_count?: number | null;
  trend?: AdanosTrend | null;
}

export interface AdanosAccountStatus {
  status: "active" | "monthly_limit_exceeded";
  accountType: AdanosAccountType;
  monthlyLimit: number | null;
  monthlyUsed: number;
  monthlyRemaining: number | null;
  hasUnlimitedRequests: boolean;
  pricingUrl: string;
  apiKeyPersistsAfterUpgrade: boolean;
  checkedAt: string;
}

export interface PlatformSnapshot {
  platformId: AdanosPlatformId;
  label: string;
  buzzScore: number | null;
  bullishPct: number | null;
  trend: AdanosTrend | null;
  sentiment: number | null;
  activityMetricLabel: string;
  activityMetricValue: number | null;
}

export interface CompositeAlignment {
  label: string;
  className: CompositeAlignmentClass;
}

export interface CompositeRecommendation {
  label: "Buy" | "Hold" | "Sell";
  className: CompositeRecommendationClass;
  score: number;
  conviction: number;
}

export interface CompositeSignal {
  score: number;
  conviction: number;
  bullishAverage: number;
  sourceAlignment: CompositeAlignment;
  recommendation: CompositeRecommendation;
  sourceCount: number;
}

export interface PortfolioSentimentRow extends TrackedHolding {
  compositeBuzz: number | null;
  compositeSentiment: number | null;
  coverage: number;
  compositeSignal: CompositeSignal | null;
  platforms: PlatformSnapshot[];
}

export interface PortfolioSentimentResult {
  holdings: PortfolioSentimentRow[];
  errors: string[];
  fetchedAt: string;
  quota: AdanosAccountStatus | null;
}
