import type { ActivityDetails } from "@wealthfolio/addon-sdk";
import { describe, expect, it } from "vitest";
import { buildQuantityTimeline, getQuantityAtDate } from "./quantity-timeline";

/** Helper to create a minimal ActivityDetails stub for testing. */
function makeActivity(
  overrides: Partial<ActivityDetails> &
    Pick<ActivityDetails, "activityType" | "date" | "accountId">,
): ActivityDetails {
  return {
    id: "test",
    activityType: overrides.activityType,
    date: overrides.date,
    quantity: overrides.quantity ?? null,
    unitPrice: null,
    amount: overrides.amount ?? null,
    fee: null,
    currency: "USD",
    needsReview: false,
    createdAt: overrides.date,
    updatedAt: overrides.date,
    accountId: overrides.accountId,
    accountName: "Test Account",
    accountCurrency: "USD",
    assetId: "AAPL",
    assetSymbol: "AAPL",
    ...overrides,
  } as ActivityDetails;
}

describe("buildQuantityTimeline", () => {
  it("returns empty for no activities", () => {
    expect(buildQuantityTimeline([], "acct1")).toEqual([]);
  });

  it("tracks BUY activities", () => {
    const activities = [
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-01-15"),
        accountId: "acct1",
        quantity: "10",
      }),
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-03-01"),
        accountId: "acct1",
        quantity: "5",
      }),
    ];
    const timeline = buildQuantityTimeline(activities, "acct1");
    expect(timeline).toEqual([
      { date: "2025-01-15", quantity: 10 },
      { date: "2025-03-01", quantity: 15 },
    ]);
  });

  it("tracks SELL activities", () => {
    const activities = [
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-01-01"),
        accountId: "acct1",
        quantity: "20",
      }),
      makeActivity({
        activityType: "SELL",
        date: new Date("2025-06-01"),
        accountId: "acct1",
        quantity: "8",
      }),
    ];
    const timeline = buildQuantityTimeline(activities, "acct1");
    expect(timeline).toEqual([
      { date: "2025-01-01", quantity: 20 },
      { date: "2025-06-01", quantity: 12 },
    ]);
  });

  it("clamps quantity to 0 on over-sell", () => {
    const activities = [
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-01-01"),
        accountId: "acct1",
        quantity: "5",
      }),
      makeActivity({
        activityType: "SELL",
        date: new Date("2025-02-01"),
        accountId: "acct1",
        quantity: "10",
      }),
    ];
    const timeline = buildQuantityTimeline(activities, "acct1");
    expect(timeline[1].quantity).toBe(0);
  });

  it("handles SPLIT (multiplies quantity by split ratio in amount)", () => {
    const activities = [
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-01-01"),
        accountId: "acct1",
        quantity: "10",
      }),
      makeActivity({
        activityType: "SPLIT",
        date: new Date("2025-06-15"),
        accountId: "acct1",
        quantity: "0",
        amount: "4",
      }),
    ];
    const timeline = buildQuantityTimeline(activities, "acct1");
    expect(timeline).toEqual([
      { date: "2025-01-01", quantity: 10 },
      { date: "2025-06-15", quantity: 40 },
    ]);
  });

  it("handles TRANSFER_IN and TRANSFER_OUT", () => {
    const activities = [
      makeActivity({
        activityType: "TRANSFER_IN",
        date: new Date("2025-01-01"),
        accountId: "acct1",
        quantity: "25",
      }),
      makeActivity({
        activityType: "TRANSFER_OUT",
        date: new Date("2025-04-01"),
        accountId: "acct1",
        quantity: "10",
      }),
    ];
    const timeline = buildQuantityTimeline(activities, "acct1");
    expect(timeline).toEqual([
      { date: "2025-01-01", quantity: 25 },
      { date: "2025-04-01", quantity: 15 },
    ]);
  });

  it("filters by accountId", () => {
    const activities = [
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-01-01"),
        accountId: "acct1",
        quantity: "10",
      }),
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-02-01"),
        accountId: "acct2",
        quantity: "50",
      }),
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-03-01"),
        accountId: "acct1",
        quantity: "5",
      }),
    ];
    const timeline = buildQuantityTimeline(activities, "acct1");
    expect(timeline).toEqual([
      { date: "2025-01-01", quantity: 10 },
      { date: "2025-03-01", quantity: 15 },
    ]);
  });

  it("handles full lifecycle: buy, split, partial sell, buy more", () => {
    const activities = [
      makeActivity({
        activityType: "BUY",
        date: new Date("2024-06-01"),
        accountId: "acct1",
        quantity: "100",
      }),
      makeActivity({
        activityType: "SPLIT",
        date: new Date("2024-09-01"),
        accountId: "acct1",
        amount: "2",
      }),
      makeActivity({
        activityType: "SELL",
        date: new Date("2025-01-15"),
        accountId: "acct1",
        quantity: "50",
      }),
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-03-01"),
        accountId: "acct1",
        quantity: "25",
      }),
    ];
    const timeline = buildQuantityTimeline(activities, "acct1");
    expect(timeline).toEqual([
      { date: "2024-06-01", quantity: 100 },
      { date: "2024-09-01", quantity: 200 }, // 100 * 2
      { date: "2025-01-15", quantity: 150 }, // 200 - 50
      { date: "2025-03-01", quantity: 175 }, // 150 + 25
    ]);
  });

  it("ignores SPLIT with zero or negative ratio", () => {
    const activities = [
      makeActivity({
        activityType: "BUY",
        date: new Date("2025-01-01"),
        accountId: "acct1",
        quantity: "10",
      }),
      makeActivity({
        activityType: "SPLIT",
        date: new Date("2025-06-01"),
        accountId: "acct1",
        amount: "0",
      }),
      makeActivity({
        activityType: "SPLIT",
        date: new Date("2025-07-01"),
        accountId: "acct1",
        amount: "-2",
      }),
    ];
    const timeline = buildQuantityTimeline(activities, "acct1");
    expect(timeline[0].quantity).toBe(10);
    expect(timeline[1].quantity).toBe(10); // unchanged, ratio 0 ignored
    expect(timeline[2].quantity).toBe(10); // unchanged, negative ratio ignored
  });
});

describe("getQuantityAtDate", () => {
  const timeline = [
    { date: "2025-01-15", quantity: 10 },
    { date: "2025-03-01", quantity: 15 },
    { date: "2025-06-01", quantity: 7 },
  ];

  it("returns 0 before any activity", () => {
    expect(getQuantityAtDate(timeline, "2024-12-31")).toBe(0);
  });

  it("returns quantity on the exact checkpoint date", () => {
    expect(getQuantityAtDate(timeline, "2025-01-15")).toBe(10);
  });

  it("returns most recent quantity between checkpoints", () => {
    expect(getQuantityAtDate(timeline, "2025-02-15")).toBe(10);
    expect(getQuantityAtDate(timeline, "2025-04-01")).toBe(15);
  });

  it("returns last quantity after all checkpoints", () => {
    expect(getQuantityAtDate(timeline, "2026-01-01")).toBe(7);
  });

  it("returns 0 for empty timeline", () => {
    expect(getQuantityAtDate([], "2025-06-01")).toBe(0);
  });
});
