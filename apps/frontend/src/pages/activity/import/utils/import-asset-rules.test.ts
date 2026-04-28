import { ACTIVITY_SUBTYPES, ActivityType } from "@/lib/constants";
import type { DraftActivity } from "../context";
import { buildImportAssetCandidateFromDraft } from "./asset-review-utils";
import { validateDraft } from "./draft-utils";

function createDraft(overrides: Partial<DraftActivity> = {}): DraftActivity {
  return {
    rowIndex: 0,
    rawRow: [],
    activityDate: "2024-01-15",
    activityType: ActivityType.BUY,
    symbol: "AAPL",
    quantity: "1",
    unitPrice: "100",
    amount: "100",
    currency: "USD",
    accountId: "acc-1",
    status: "valid",
    errors: {},
    warnings: {},
    isEdited: false,
    ...overrides,
  };
}

describe("import asset rules", () => {
  it("builds asset candidates for staking rewards", () => {
    const candidate = buildImportAssetCandidateFromDraft(
      createDraft({
        activityType: ActivityType.INTEREST,
        subtype: ACTIVITY_SUBTYPES.STAKING_REWARD,
        symbol: "SOL",
        instrumentType: "CRYPTO",
        quoteCcy: "USD",
      }),
    );

    expect(candidate).not.toBeNull();
    expect(candidate?.symbol).toBe("SOL");
  });

  it("keeps otherwise identical candidates distinct when their ISIN differs", () => {
    const first = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "SHOP",
        instrumentType: "EQUITY",
        quoteCcy: "CAD",
        isin: "ca82509l1076",
      }),
    );
    const second = buildImportAssetCandidateFromDraft(
      createDraft({
        symbol: "SHOP",
        instrumentType: "EQUITY",
        quoteCcy: "CAD",
        isin: "CA82509L1077",
      }),
    );

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.key).not.toBe(second?.key);
  });

  it("requires a symbol for DRIP dividends", () => {
    const validation = validateDraft(
      createDraft({
        activityType: ActivityType.DIVIDEND,
        subtype: ACTIVITY_SUBTYPES.DRIP,
        symbol: undefined,
        quantity: "1",
        unitPrice: "100",
        amount: "100",
      }),
    );

    expect(validation.status).toBe("error");
    expect(validation.errors.symbol).toEqual(["Symbol is required for DRIP dividends"]);
  });

  it("requires a symbol for dividend in kind", () => {
    const validation = validateDraft(
      createDraft({
        activityType: ActivityType.DIVIDEND,
        subtype: ACTIVITY_SUBTYPES.DIVIDEND_IN_KIND,
        symbol: undefined,
        quantity: "1",
        unitPrice: "100",
        amount: "100",
      }),
    );

    expect(validation.status).toBe("error");
    expect(validation.errors.symbol).toEqual([
      "Symbol is required for dividend in kind activities",
    ]);
  });
});
