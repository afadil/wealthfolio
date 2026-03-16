export type AdanosPlatformId = "reddit" | "x" | "news" | "polymarket";

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

export interface CompareStockRow {
  ticker: string;
  company_name: string;
  buzz_score: number;
  sentiment?: number | null;
  mentions?: number | null;
  upvotes?: number | null;
  source_count?: number | null;
  trade_count?: number | null;
  market_count?: number | null;
  unique_traders?: number | null;
  total_liquidity?: number | null;
}

export interface CompareResponse {
  period_days: number;
  stocks: CompareStockRow[];
}

export interface PlatformSnapshot {
  platformId: AdanosPlatformId;
  label: string;
  buzzScore: number | null;
  sentiment: number | null;
  primaryMetricLabel: string;
  primaryMetricValue: number | null;
  secondaryMetricLabel: string | null;
  secondaryMetricValue: number | null;
}

export interface PortfolioSentimentRow extends TrackedHolding {
  compositeBuzz: number | null;
  compositeSentiment: number | null;
  coverage: number;
  platforms: PlatformSnapshot[];
}

export interface PortfolioSentimentResult {
  holdings: PortfolioSentimentRow[];
  errors: string[];
  fetchedAt: string;
}
