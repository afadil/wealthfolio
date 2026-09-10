import { describe, expect, it } from "vitest";
import { estimateDraftAmount } from "./activity-table-utils";

describe("estimateDraftAmount", () => {
  it("shows a stated amount verbatim", () => {
    expect(
      estimateDraftAmount({ activityType: "BUY", amount: 123, quantity: 10, unitPrice: 100 }),
    ).toBe(123);
  });

  it("previews trade totals with the shared trade-final mirror", () => {
    expect(estimateDraftAmount({ activityType: "BUY", quantity: 10, unitPrice: 100, fee: 5 })).toBe(
      1005,
    );
    // SELL subtracts charges - the defect the old draft-side synthesis had.
    expect(
      estimateDraftAmount({ activityType: "SELL", quantity: 10, unitPrice: 100, fee: 5 }),
    ).toBe(995);
    // Options price at their contract multiplier.
    expect(estimateDraftAmount({ activityType: "BUY", quantity: 1, unitPrice: 2 }, "OPTION")).toBe(
      200,
    );
  });

  it("never invents a total for non-trades", () => {
    expect(
      estimateDraftAmount({ activityType: "DEPOSIT", quantity: 1, unitPrice: 100 }),
    ).toBeUndefined();
  });
});
