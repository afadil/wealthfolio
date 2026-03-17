import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPortfolioSentiment,
  fetchAccountStatus,
  mergeAccountStatuses,
  parseAccountStatusFromError,
  parseAccountStatusFromHeaders,
} from "./adanos-client";

describe("adanos account status headers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses unlimited professional headers", () => {
    const response = new Response(null, {
      headers: {
        "X-Account-Type": "professional",
        "X-RateLimit-Limit-Monthly": "unlimited",
        "X-RateLimit-Remaining-Monthly": "unlimited",
        "X-RateLimit-Used-Monthly": "39875",
      },
    });

    expect(parseAccountStatusFromHeaders(response)).toMatchObject({
      status: "active",
      accountType: "professional",
      monthlyLimit: null,
      monthlyRemaining: null,
      monthlyUsed: 39875,
      hasUnlimitedRequests: true,
    });
  });

  it("parses free-tier monthly quota headers", () => {
    const response = new Response(null, {
      headers: {
        "X-Account-Type": "free",
        "X-RateLimit-Limit-Monthly": "250",
        "X-RateLimit-Remaining-Monthly": "127",
        "X-RateLimit-Used-Monthly": "123",
      },
    });

    expect(parseAccountStatusFromHeaders(response)).toMatchObject({
      status: "active",
      accountType: "free",
      monthlyLimit: 250,
      monthlyRemaining: 127,
      monthlyUsed: 123,
      hasUnlimitedRequests: false,
    });
  });

  it("parses monthly limit exceeded payloads", () => {
    const status = parseAccountStatusFromError({
      detail: {
        message: "Free tier limit of 250 requests per month exceeded",
        limit: "250",
        used: "250",
        account_type: "free",
      },
    });

    expect(status).toMatchObject({
      status: "monthly_limit_exceeded",
      accountType: "free",
      monthlyLimit: 250,
      monthlyRemaining: 0,
      monthlyUsed: 250,
      hasUnlimitedRequests: false,
    });
  });

  it("prefers exhausted quota states when merging", () => {
    const merged = mergeAccountStatuses([
      {
        status: "active",
        accountType: "free",
        monthlyLimit: 250,
        monthlyUsed: 120,
        monthlyRemaining: 130,
        hasUnlimitedRequests: false,
        pricingUrl: "https://adanos.org/pricing",
        apiKeyPersistsAfterUpgrade: true,
        checkedAt: "2026-03-16T20:00:00.000Z",
      },
      {
        status: "monthly_limit_exceeded",
        accountType: "free",
        monthlyLimit: 250,
        monthlyUsed: 250,
        monthlyRemaining: 0,
        hasUnlimitedRequests: false,
        pricingUrl: "https://adanos.org/pricing",
        apiKeyPersistsAfterUpgrade: true,
        checkedAt: "2026-03-16T20:00:01.000Z",
      },
    ]);

    expect(merged?.status).toBe("monthly_limit_exceeded");
    expect(merged?.monthlyRemaining).toBe(0);
  });

  it("returns parsed quota status instead of throwing on a 429 status check", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              message: "Free tier limit of 250 requests per month exceeded",
              limit: 250,
              used: 250,
              account_type: "free",
            },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "X-Account-Type": "free",
              "X-RateLimit-Limit-Monthly": "250",
              "X-RateLimit-Remaining-Monthly": "0",
              "X-RateLimit-Used-Monthly": "250",
            },
          },
        ),
      ),
    );

    await expect(fetchAccountStatus("sk_live_test")).resolves.toMatchObject({
      status: "monthly_limit_exceeded",
      accountType: "free",
      monthlyLimit: 250,
      monthlyRemaining: 0,
    });
  });

  it("checks account status through the compare endpoint to avoid cached trending headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          period_days: 1,
          stocks: [],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Account-Type": "free",
            "X-RateLimit-Limit-Monthly": "250",
            "X-RateLimit-Remaining-Monthly": "244",
            "X-RateLimit-Used-Monthly": "6",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await fetchAccountStatus("sk_live_test");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.adanos.org/reddit/stocks/v1/compare?tickers=TSLA&days=1",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          "X-API-Key": "sk_live_test",
        }),
      }),
    );
  });

  it("builds source cards from stock detail endpoints with bullish percent and trend", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);

      if (url.includes("/reddit/stocks/v1/stock/TSLA")) {
        return new Response(
          JSON.stringify({
            ticker: "TSLA",
            company_name: "Tesla, Inc.",
            found: true,
            buzz_score: 75.2,
            sentiment_score: -0.01,
            bullish_pct: 32,
            total_mentions: 650,
            trend: "falling",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Account-Type": "free",
              "X-RateLimit-Limit-Monthly": "250",
              "X-RateLimit-Remaining-Monthly": "245",
              "X-RateLimit-Used-Monthly": "5",
            },
          },
        );
      }

      if (url.includes("/polymarket/stocks/v1/stock/TSLA")) {
        return new Response(
          JSON.stringify({
            ticker: "TSLA",
            company_name: "Tesla, Inc.",
            found: true,
            buzz_score: 82.9,
            sentiment_score: 0.3,
            bullish_pct: 30,
            trade_count: 3485,
            trend: "falling",
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Account-Type": "free",
              "X-RateLimit-Limit-Monthly": "250",
              "X-RateLimit-Remaining-Monthly": "244",
              "X-RateLimit-Used-Monthly": "6",
            },
          },
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPortfolioSentiment({
      apiKey: "sk_live_test",
      holdings: [
        {
          symbol: "TSLA",
          name: "Tesla, Inc.",
          weight: 12.5,
          marketValueBase: 6900,
          baseCurrency: "EUR",
        },
      ],
      days: 7,
      enabledPlatforms: ["reddit", "polymarket"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.adanos.org/reddit/stocks/v1/stock/TSLA?days=7",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "sk_live_test",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.adanos.org/polymarket/stocks/v1/stock/TSLA?days=7",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-API-Key": "sk_live_test",
        }),
      }),
    );

    expect(result.holdings[0].platforms).toEqual([
      expect.objectContaining({
        platformId: "reddit",
        buzzScore: 75.2,
        bullishPct: 32,
        activityMetricLabel: "Mentions",
        activityMetricValue: 650,
        trend: "falling",
      }),
      expect.objectContaining({
        platformId: "polymarket",
        buzzScore: 82.9,
        bullishPct: 30,
        activityMetricLabel: "Trades",
        activityMetricValue: 3485,
        trend: "falling",
      }),
    ]);
    expect(result.holdings[0].compositeSignal).toMatchObject({
      bullishAverage: 31,
      sourceAlignment: {
        label: "High agreement",
        className: "aligned",
      },
      recommendation: {
        label: "Sell",
        className: "sell",
      },
    });
    expect(result.quota).toMatchObject({
      accountType: "free",
      monthlyRemaining: 244,
    });
  });
});
