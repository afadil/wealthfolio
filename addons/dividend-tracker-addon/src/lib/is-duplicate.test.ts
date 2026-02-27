import type { ActivityDetails } from "@wealthfolio/addon-sdk";
import { describe, expect, it } from "vitest";
import { isDuplicate, THREE_DAYS_MS } from "./is-duplicate";

/** Helper to create a minimal ActivityDetails stub for testing. */
function makeActivity(
  overrides: Partial<ActivityDetails> & Pick<ActivityDetails, "assetSymbol" | "accountId" | "date">,
): ActivityDetails {
  return {
    id: "test",
    activityType: "DIVIDEND",
    date: overrides.date,
    quantity: null,
    unitPrice: null,
    amount: "1.00",
    fee: null,
    currency: "USD",
    needsReview: false,
    createdAt: overrides.date,
    updatedAt: overrides.date,
    accountId: overrides.accountId,
    accountName: "Test Account",
    accountCurrency: "USD",
    assetId: "test-asset",
    assetSymbol: overrides.assetSymbol,
    ...overrides,
  } as ActivityDetails;
}

describe("isDuplicate", () => {
  const baseDate = new Date("2025-06-15T00:00:00Z");
  const baseDateMs = baseDate.getTime();

  const existing = [
    makeActivity({
      assetSymbol: "AAPL",
      accountId: "acct1",
      date: baseDate,
    }),
  ];

  it("returns true for exact match (same symbol, account, date)", () => {
    expect(isDuplicate("AAPL", baseDateMs, "acct1", existing)).toBe(true);
  });

  it("returns true within 3-day window (1 day before)", () => {
    const oneDayBefore = baseDateMs - 1 * 24 * 60 * 60 * 1000;
    expect(isDuplicate("AAPL", oneDayBefore, "acct1", existing)).toBe(true);
  });

  it("returns true within 3-day window (2 days after)", () => {
    const twoDaysAfter = baseDateMs + 2 * 24 * 60 * 60 * 1000;
    expect(isDuplicate("AAPL", twoDaysAfter, "acct1", existing)).toBe(true);
  });

  it("returns true at exact boundary (exactly 3 days)", () => {
    const exactBoundary = baseDateMs + THREE_DAYS_MS;
    expect(isDuplicate("AAPL", exactBoundary, "acct1", existing)).toBe(true);
  });

  it("returns false just past boundary (3 days + 1ms)", () => {
    const pastBoundary = baseDateMs + THREE_DAYS_MS + 1;
    expect(isDuplicate("AAPL", pastBoundary, "acct1", existing)).toBe(false);
  });

  it("returns false outside 3-day window (4 days)", () => {
    const fourDaysAfter = baseDateMs + 4 * 24 * 60 * 60 * 1000;
    expect(isDuplicate("AAPL", fourDaysAfter, "acct1", existing)).toBe(false);
  });

  it("returns false for different symbol", () => {
    expect(isDuplicate("MSFT", baseDateMs, "acct1", existing)).toBe(false);
  });

  it("returns false for different account", () => {
    expect(isDuplicate("AAPL", baseDateMs, "acct2", existing)).toBe(false);
  });

  it("matches symbols case-insensitively", () => {
    expect(isDuplicate("aapl", baseDateMs, "acct1", existing)).toBe(true);
    expect(isDuplicate("Aapl", baseDateMs, "acct1", existing)).toBe(true);
  });

  it("returns false for empty existing array", () => {
    expect(isDuplicate("AAPL", baseDateMs, "acct1", [])).toBe(false);
  });

  it("returns false when existing activity has null assetSymbol", () => {
    const withNull = [
      makeActivity({
        assetSymbol: null as unknown as string,
        accountId: "acct1",
        date: baseDate,
      }),
    ];
    expect(isDuplicate("AAPL", baseDateMs, "acct1", withNull)).toBe(false);
  });

  it("handles multiple existing activities correctly", () => {
    const multi = [
      makeActivity({ assetSymbol: "MSFT", accountId: "acct1", date: baseDate }),
      makeActivity({ assetSymbol: "AAPL", accountId: "acct2", date: baseDate }),
      makeActivity({ assetSymbol: "AAPL", accountId: "acct1", date: baseDate }),
    ];
    expect(isDuplicate("AAPL", baseDateMs, "acct1", multi)).toBe(true);
    expect(isDuplicate("AAPL", baseDateMs, "acct2", multi)).toBe(true);
    expect(isDuplicate("MSFT", baseDateMs, "acct1", multi)).toBe(true);
    expect(isDuplicate("MSFT", baseDateMs, "acct2", multi)).toBe(false);
  });
});
