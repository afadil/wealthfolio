import type {
  AdanosPlatformId,
  CompareResponse,
  CompareStockRow,
  PlatformSnapshot,
  PortfolioSentimentResult,
  PortfolioSentimentRow,
  TrackedHolding,
} from "../types";
import { PLATFORM_ORDER } from "./utils";

const ADANOS_BASE_URL = "https://api.adanos.org";

const PLATFORM_CONFIG: Record<
  AdanosPlatformId,
  {
    label: string;
    path: string;
    primaryMetricLabel: string;
    primaryMetricKey: keyof CompareStockRow;
    secondaryMetricLabel: string | null;
    secondaryMetricKey: keyof CompareStockRow | null;
  }
> = {
  reddit: {
    label: "Reddit",
    path: "/reddit/stocks/v1/compare",
    primaryMetricLabel: "Mentions",
    primaryMetricKey: "mentions",
    secondaryMetricLabel: "Upvotes",
    secondaryMetricKey: "upvotes",
  },
  x: {
    label: "X",
    path: "/x/stocks/v1/compare",
    primaryMetricLabel: "Mentions",
    primaryMetricKey: "mentions",
    secondaryMetricLabel: "Likes",
    secondaryMetricKey: "upvotes",
  },
  news: {
    label: "News",
    path: "/news/stocks/v1/compare",
    primaryMetricLabel: "Mentions",
    primaryMetricKey: "mentions",
    secondaryMetricLabel: "Sources",
    secondaryMetricKey: "source_count",
  },
  polymarket: {
    label: "Polymarket",
    path: "/polymarket/stocks/v1/compare",
    primaryMetricLabel: "Trades",
    primaryMetricKey: "trade_count",
    secondaryMetricLabel: "Liquidity",
    secondaryMetricKey: "total_liquidity",
  },
};

interface FetchPortfolioSentimentArgs {
  apiKey: string;
  holdings: TrackedHolding[];
  days: number;
  enabledPlatforms: AdanosPlatformId[];
}

export async function fetchPortfolioSentiment({
  apiKey,
  holdings,
  days,
  enabledPlatforms,
}: FetchPortfolioSentimentArgs): Promise<PortfolioSentimentResult> {
  const tickers = holdings.map((holding) => holding.symbol);
  const platforms = PLATFORM_ORDER.filter((platformId) => enabledPlatforms.includes(platformId));

  const settledResponses = await Promise.allSettled(
    platforms.map(async (platformId) => {
      const response = await fetchCompare(apiKey, platformId, tickers, days);
      return {
        platformId,
        response,
      };
    }),
  );

  const platformRows = new Map<AdanosPlatformId, Map<string, CompareStockRow>>();
  const errors: string[] = [];

  for (const settledResponse of settledResponses) {
    if (settledResponse.status === "fulfilled") {
      const rows = new Map<string, CompareStockRow>();

      for (const stock of settledResponse.value.response.stocks) {
        rows.set(stock.ticker.toUpperCase(), stock);
      }

      platformRows.set(settledResponse.value.platformId, rows);
      continue;
    }

    errors.push(
      settledResponse.reason instanceof Error ? settledResponse.reason.message : "Request failed",
    );
  }

  const rows: PortfolioSentimentRow[] = holdings.map((holding) => {
    const snapshots: PlatformSnapshot[] = platforms.map((platformId) => {
      const config = PLATFORM_CONFIG[platformId];
      const stock = platformRows.get(platformId)?.get(holding.symbol);

      return {
        platformId,
        label: config.label,
        buzzScore: stock?.buzz_score ?? null,
        sentiment: stock?.sentiment ?? null,
        primaryMetricLabel: config.primaryMetricLabel,
        primaryMetricValue: asNumber(stock?.[config.primaryMetricKey]),
        secondaryMetricLabel: config.secondaryMetricLabel,
        secondaryMetricValue: config.secondaryMetricKey
          ? asNumber(stock?.[config.secondaryMetricKey])
          : null,
      };
    });

    const buzzValues = snapshots
      .map((snapshot) => snapshot.buzzScore)
      .filter((value): value is number => value !== null);
    const sentimentValues = snapshots
      .map((snapshot) => snapshot.sentiment)
      .filter((value): value is number => value !== null);

    return {
      ...holding,
      compositeBuzz: buzzValues.length ? average(buzzValues) : null,
      compositeSentiment: sentimentValues.length ? average(sentimentValues) : null,
      coverage: buzzValues.length,
      platforms: snapshots,
    };
  });

  return {
    holdings: rows,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchCompare(
  apiKey: string,
  platformId: AdanosPlatformId,
  tickers: string[],
  days: number,
): Promise<CompareResponse> {
  const config = PLATFORM_CONFIG[platformId];
  const url = new URL(`${ADANOS_BASE_URL}${config.path}`);
  url.searchParams.set("tickers", tickers.join(","));
  url.searchParams.set("days", String(days));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
  });

  if (!response.ok) {
    const errorPayload = await readJsonSafely(response);
    throw new Error(`${config.label}: ${extractErrorMessage(errorPayload, response.status)}`);
  }

  const payload = (await response.json()) as CompareResponse;
  return payload;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (!payload || typeof payload !== "object") {
    return `HTTP ${status}`;
  }

  const detail = (payload as { detail?: unknown }).detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (detail && typeof detail === "object" && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return `HTTP ${status}`;
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
