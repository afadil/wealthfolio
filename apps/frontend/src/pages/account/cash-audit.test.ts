import { ActivityType } from "@/lib/constants";
import type { AccountValuation, ActivityDetails } from "@/lib/types";
import { buildCashAuditReviewTarget, getCurrentNegativeCashRun, toDateKey } from "./cash-audit";

describe("cash audit helpers", () => {
  it("maps instants to date keys in the configured user timezone", () => {
    expect(toDateKey(new Date("2025-01-01T01:30:00.000Z"), "America/Toronto")).toBe("2024-12-31");
    expect(toDateKey("2025-01-01T01:30:00.000Z", "America/Toronto")).toBe("2024-12-31");
    expect(toDateKey("2026-03-09")).toBe("2026-03-09");
    expect(toDateKey("2025-01-01T01:30:00.000Z", "Mars/Phobos")).toBe("2025-01-01");
  });

  it("targets the cash-impacting activity date when valuation carried forward later", () => {
    const target = buildCashAuditReviewTarget(
      createRun(createValuation("2026-03-09", -320), createValuation("2026-03-05", 500)),
      [
        createActivity({
          id: "buy-aapl",
          activityType: ActivityType.BUY,
          date: new Date("2026-03-06T15:30:00.000Z"),
          quantity: "10",
          unitPrice: "82",
          amount: "820",
        }),
      ],
    );

    expect(target?.valuationDate).toBe("2026-03-09");
    expect(target?.activityDate).toBe("2026-03-06");
    expect(target?.endingCashBalance).toBe(-320);
    expect(target?.crossingActivityId).toBe("buy-aapl");
    expect(target?.hasExplainingActivity).toBe(true);
    expect(target?.isCarryForwardDate).toBe(true);
  });

  it("selects the first valuation in the current negative cash run", () => {
    const run = getCurrentNegativeCashRun([
      createValuation("2024-10-15", -100),
      createValuation("2024-10-16", -50),
      createValuation("2026-03-08", 100),
      createValuation("2026-03-09", 50),
      createValuation("2026-03-10", -50),
      createValuation("2026-03-11", -25),
    ]);

    expect(run?.firstNegativeValuation.valuationDate).toBe("2026-03-10");
    expect(run?.previousNonNegativeValuation?.valuationDate).toBe("2026-03-09");
  });

  it("does not return a run when latest cash is non-negative", () => {
    const run = getCurrentNegativeCashRun([
      createValuation("2026-03-09", 100),
      createValuation("2026-03-10", -50),
      createValuation("2026-03-11", 25),
    ]);

    expect(run).toBeNull();
  });

  it("uses the end-of-day cash balance for the selected activity date", () => {
    const target = buildCashAuditReviewTarget(
      createRun(createValuation("2026-03-09", -50), createValuation("2026-03-07", 20)),
      [
        createActivity({
          id: "withdrawal",
          activityType: ActivityType.WITHDRAWAL,
          date: new Date("2026-03-08T10:00:00.000Z"),
          amount: "100",
        }),
        createActivity({
          id: "deposit",
          activityType: ActivityType.DEPOSIT,
          date: new Date("2026-03-08T12:00:00.000Z"),
          amount: "30",
        }),
      ],
    );

    expect(target?.activityDate).toBe("2026-03-08");
    expect(target?.endingCashBalance).toBe(-50);
    expect(target?.crossingActivityId).toBe("withdrawal");
  });

  it("ignores older activities before the current negative run", () => {
    const target = buildCashAuditReviewTarget(
      createRun(createValuation("2026-03-09", -50), createValuation("2026-03-07", 100)),
      [
        createActivity({
          id: "old-buy",
          activityType: ActivityType.BUY,
          date: new Date("2024-10-15T10:00:00.000Z"),
          quantity: "10",
          unitPrice: "100",
          amount: "1000",
        }),
        createActivity({
          id: "current-buy",
          activityType: ActivityType.BUY,
          date: new Date("2026-03-08T10:00:00.000Z"),
          quantity: "3",
          unitPrice: "50",
          amount: "150",
        }),
      ],
    );

    expect(target?.crossingActivityId).toBe("current-buy");
  });

  it("does not blame an activity when the loaded ledger never crosses below zero", () => {
    const target = buildCashAuditReviewTarget(
      createRun(createValuation("2026-03-09", -20), createValuation("2026-03-08", 100)),
      [
        createActivity({
          id: "buy-with-missing-cash-adjustment",
          activityType: ActivityType.BUY,
          date: new Date("2026-03-09T10:00:00.000Z"),
          quantity: "1",
          unitPrice: "50",
          amount: "50",
        }),
      ],
    );

    expect(target?.activityDate).toBe("2026-03-09");
    expect(target?.endingCashBalance).toBe(-20);
    expect(target?.crossingActivityId).toBeUndefined();
    expect(target?.hasExplainingActivity).toBe(false);
  });

  it("falls back to the valuation date when no explaining activity is loaded", () => {
    const target = buildCashAuditReviewTarget(
      createRun(createValuation("2026-03-09", -50), createValuation("2026-03-08", 100)),
      [],
    );

    expect(target?.activityDate).toBe("2026-03-09");
    expect(target?.endingCashBalance).toBe(-50);
    expect(target?.hasExplainingActivity).toBe(false);
  });
});

function createValuation(valuationDate: string, cashBalance: number): AccountValuation {
  return {
    valuationDate,
    cashBalance,
    accountCurrency: "USD",
  } as AccountValuation;
}

function createRun(
  firstNegativeValuation: AccountValuation,
  previousNonNegativeValuation: AccountValuation | null,
) {
  return {
    firstNegativeValuation,
    previousNonNegativeValuation,
  };
}

function createActivity(overrides: Partial<ActivityDetails> = {}): ActivityDetails {
  return {
    id: "activity",
    activityType: ActivityType.DEPOSIT,
    date: new Date("2026-03-09T12:00:00.000Z"),
    quantity: "0",
    unitPrice: "0",
    amount: "0",
    fee: "0",
    currency: "USD",
    needsReview: false,
    createdAt: new Date("2026-03-09T12:00:00.000Z"),
    assetId: "",
    updatedAt: new Date("2026-03-09T12:00:00.000Z"),
    accountId: "account-1",
    accountName: "Test Account",
    accountCurrency: "USD",
    assetSymbol: "",
    ...overrides,
  };
}
