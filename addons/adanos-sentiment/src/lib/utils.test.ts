import { describe, expect, it } from "vitest";
import {
  buildTrackedHoldings,
  buildCompositeSignal,
  formatDashboardRequestEstimate,
  formatBullishPercent,
  formatDetailedBuzzScore,
  formatBuzzScore,
  formatTrendLabel,
  getEstimatedDashboardRequestCount,
  getBullishValueClass,
  getTrendValueClass,
} from "./utils";

describe("formatBuzzScore", () => {
  it("formats buzz as a score out of 100", () => {
    expect(formatBuzzScore(84.2)).toBe("84/100");
    expect(formatBuzzScore(84.8)).toBe("85/100");
  });

  it("returns no data for missing values", () => {
    expect(formatBuzzScore(null)).toBe("No data");
    expect(formatBuzzScore(undefined)).toBe("No data");
    expect(formatBuzzScore(Number.NaN)).toBe("No data");
  });
});

describe("formatDetailedBuzzScore", () => {
  it("formats composite buzz with one decimal place", () => {
    expect(formatDetailedBuzzScore(73.94)).toBe("73.9/100");
    expect(formatDetailedBuzzScore(84)).toBe("84.0/100");
  });

  it("returns no data for missing values", () => {
    expect(formatDetailedBuzzScore(null)).toBe("No data");
    expect(formatDetailedBuzzScore(undefined)).toBe("No data");
    expect(formatDetailedBuzzScore(Number.NaN)).toBe("No data");
  });
});

describe("formatBullishPercent", () => {
  it("formats bullish percentage without decimal noise", () => {
    expect(formatBullishPercent(32)).toBe("32%");
    expect(formatBullishPercent(59.4)).toBe("59%");
  });

  it("returns no data for missing values", () => {
    expect(formatBullishPercent(null)).toBe("No data");
    expect(formatBullishPercent(undefined)).toBe("No data");
    expect(formatBullishPercent(Number.NaN)).toBe("No data");
  });
});

describe("trend helpers", () => {
  it("formats trend labels", () => {
    expect(formatTrendLabel("rising")).toBe("Rising");
    expect(formatTrendLabel("falling")).toBe("Falling");
    expect(formatTrendLabel("stable")).toBe("Stable");
    expect(formatTrendLabel(null)).toBe("No data");
  });

  it("maps bullish and trend values to semantic classes", () => {
    expect(getBullishValueClass(60)).toContain("text-success");
    expect(getBullishValueClass(30)).toContain("text-destructive");
    expect(getBullishValueClass(48)).toContain("text-warning");
    expect(getTrendValueClass("rising")).toContain("text-success");
    expect(getTrendValueClass("falling")).toContain("text-destructive");
    expect(getTrendValueClass("stable")).toContain("text-warning");
  });
});

describe("request estimate helpers", () => {
  it("calculates the upper-bound dashboard request count", () => {
    expect(getEstimatedDashboardRequestCount(4)).toBe(40);
    expect(getEstimatedDashboardRequestCount(2, 5)).toBe(10);
    expect(getEstimatedDashboardRequestCount(0, 10)).toBe(0);
  });

  it("formats the request estimate copy for settings", () => {
    expect(formatDashboardRequestEstimate(4)).toBe(
      "Up to 40 API requests per full dashboard refresh (10 holdings x 4 platforms).",
    );
    expect(formatDashboardRequestEstimate(1, 1)).toBe(
      "Up to 1 API request per full dashboard refresh (1 holding x 1 platform).",
    );
  });
});

describe("composite signal", () => {
  it("matches the stock page composite logic for mixed multi-source setups", () => {
    const composite = buildCompositeSignal([
      {
        platformId: "reddit",
        label: "Reddit",
        buzzScore: 74.1,
        bullishPct: 31,
        trend: "rising",
        sentiment: -0.1,
        activityMetricLabel: "Mentions",
        activityMetricValue: 647,
      },
      {
        platformId: "x",
        label: "X.com",
        buzzScore: 86.1,
        bullishPct: 56,
        trend: "falling",
        sentiment: 0.2,
        activityMetricLabel: "Mentions",
        activityMetricValue: 2650,
      },
      {
        platformId: "news",
        label: "News",
        buzzScore: 52,
        bullishPct: 48,
        trend: "stable",
        sentiment: 0.1,
        activityMetricLabel: "Mentions",
        activityMetricValue: 332,
      },
      {
        platformId: "polymarket",
        label: "Polymarket",
        buzzScore: 83.3,
        bullishPct: 30,
        trend: "falling",
        sentiment: 0.3,
        activityMetricLabel: "Trades",
        activityMetricValue: 3731,
      },
    ]);

    expect(composite).toMatchObject({
      score: -4,
      conviction: 70,
      bullishAverage: 41.3,
      sourceAlignment: {
        label: "Wide divergence",
        className: "divergent",
      },
      recommendation: {
        label: "Hold",
        className: "hold",
        score: -4,
        conviction: 70,
      },
      sourceCount: 4,
  });
});

describe("buildTrackedHoldings", () => {
  it("recomputes grouped weights from aggregated market value instead of summing raw weights", () => {
    const holdings = buildTrackedHoldings([
      {
        instrument: {
          symbol: "TSLA",
          name: "Tesla, Inc.",
          classifications: {
            assetType: {
              key: "stock",
            },
          },
        },
        marketValue: { base: 400 },
        weight: 0.8,
        baseCurrency: "EUR",
      },
      {
        instrument: {
          symbol: "TSLA",
          name: "Tesla, Inc.",
          classifications: {
            assetType: {
              key: "stock",
            },
          },
        },
        marketValue: { base: 290 },
        weight: 0.538,
        baseCurrency: "EUR",
      },
      {
        instrument: {
          symbol: "MSFT",
          name: "Microsoft Corporation",
          classifications: {
            assetType: {
              key: "stock",
            },
          },
        },
        marketValue: { base: 310 },
        weight: 0.2,
        baseCurrency: "EUR",
      },
      {
        instrument: {
          symbol: "USD",
          name: "Cash (USD)",
          classifications: {
            assetType: {
              key: "cash",
            },
          },
        },
        marketValue: { base: 1000 },
        weight: 1.0,
        baseCurrency: "EUR",
      },
    ]);

    expect(holdings).toHaveLength(2);
    expect(holdings[0]).toMatchObject({
      symbol: "TSLA",
      marketValueBase: 690,
      weight: 0.69,
    });
    expect(holdings[1]).toMatchObject({
      symbol: "MSFT",
      marketValueBase: 310,
      weight: 0.31,
    });
  });
});

});
