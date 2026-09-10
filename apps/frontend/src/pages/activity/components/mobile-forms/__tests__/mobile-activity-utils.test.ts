import { ActivityType } from "@/lib/constants";
import type { ActivityDetails } from "@/lib/types";
import { describe, expect, it } from "vitest";
import { hasStoredCustomTradeAmount } from "../mobile-activity-utils";

function trade(overrides: Partial<ActivityDetails> = {}): Partial<ActivityDetails> {
  return {
    activityType: ActivityType.BUY,
    amount: "125",
    quantity: "2",
    unitPrice: "60",
    fee: "3",
    tax: "2",
    instrumentType: "EQUITY",
    ...overrides,
  };
}

describe("hasStoredCustomTradeAmount", () => {
  it("recognizes a custom total when mobile edit opens", () => {
    expect(hasStoredCustomTradeAmount(trade({ amount: "99" }))).toBe(true);
  });

  it("keeps a matching stored total in calculated mode", () => {
    expect(hasStoredCustomTradeAmount(trade())).toBe(false);
  });

  it("uses the asset multiplier for option edits", () => {
    expect(
      hasStoredCustomTradeAmount(
        trade({
          amount: "105",
          unitPrice: "5",
          instrumentType: "OPTION",
          assetContractMultiplier: "10",
        }),
      ),
    ).toBe(false);
  });

  it("does not claim ownership for non-trade activity amounts", () => {
    expect(
      hasStoredCustomTradeAmount(trade({ activityType: ActivityType.DEPOSIT, amount: "99" })),
    ).toBe(false);
  });
});
