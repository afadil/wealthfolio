import { describe, expect, it } from "vitest";
import { ActivityType, InstrumentType } from "@/lib/constants";
import { mapActivityTypeToPicker } from "../utils/activity-form-utils";
import { feeFormSchema } from "../components/forms/fee-form";
import { taxFormSchema } from "../components/forms/tax-form";
import { ACTIVITY_FORM_CONFIG, hasActivityForm } from "./activity-form-config";

describe("trade asset identity defaults", () => {
  it.each(["BUY", "SELL"] as const)(
    "preserves the stored %s instrument type and quote currency without reselection",
    (type) => {
      const defaults = ACTIVITY_FORM_CONFIG[type].getDefaults(
        {
          assetId: "asset-usdt",
          assetSymbol: "USDT",
          instrumentType: InstrumentType.CRYPTO,
          assetQuoteCcy: "USD",
          currency: "CAD",
        },
        [],
      );

      expect(defaults).toMatchObject({
        assetId: "USDT",
        symbolInstrumentType: InstrumentType.CRYPTO,
        symbolQuoteCcy: "USD",
        currency: "CAD",
      });
    },
  );
});

describe("cash transfer defaults", () => {
  it.each([ActivityType.TRANSFER_OUT, ActivityType.TRANSFER_IN])(
    "derives the execution rate from actual amounts when editing %s",
    (activityType) => {
      const incoming = activityType === ActivityType.TRANSFER_IN;
      const defaults = ACTIVITY_FORM_CONFIG.TRANSFER.getDefaults(
        {
          activityType,
          accountId: incoming ? "b" : "a",
          counterpartAccountId: incoming ? "a" : "b",
          amount: incoming ? "100" : "780",
          counterpartAmount: incoming ? "780" : "100",
          currency: incoming ? "USD" : "HKD",
          counterpartCurrency: incoming ? "HKD" : "USD",
          fxRate: "0.13",
          counterpartFxRate: "7.8",
        },
        [],
      );
      expect(defaults).toMatchObject({
        fromAccountId: "a",
        toAccountId: "b",
        sourceCurrency: "HKD",
        destinationCurrency: "USD",
        sourceAmount: 780,
        destinationAmount: 100,
        transferRate: 0.12820513,
        fxRate: 0.13,
      });
    },
  );
});

describe("charge FX rate", () => {
  it.each([
    ["FEE", feeFormSchema],
    ["TAX", taxFormSchema],
  ] as const)("carries a stated FX rate from defaults to the %s payload", (type, schema) => {
    const config = ACTIVITY_FORM_CONFIG[type];
    const defaults = config.getDefaults(
      { activityType: type, accountId: "a", amount: "5", currency: "EUR", fxRate: "1.08" },
      [],
    );
    const parsed = schema.parse({ ...defaults, activityDate: new Date() });
    expect(config.toPayload(parsed)).toMatchObject({ fxRate: 1.08 });
  });
});

describe("option defaults", () => {
  const option = {
    activityType: ActivityType.BUY,
    instrumentType: "OPTION",
    assetSymbol: "AAPL270618C01234500",
    currency: "CAD",
  };

  it.each(["BUY", "SELL"] as const)(
    "starts the %s quote currency from the option's, not the activity's",
    (type) => {
      const defaults = ACTIVITY_FORM_CONFIG[type].getDefaults(
        { ...option, assetQuoteCcy: "USD" },
        [],
      );
      expect(defaults).toMatchObject({ currency: "CAD", symbolQuoteCcy: "USD" });
    },
  );

  it.each(["BUY", "SELL"] as const)(
    "starts the %s quote currency from the activity's when the option's is unknown",
    (type) => {
      const defaults = ACTIVITY_FORM_CONFIG[type].getDefaults(option, []);
      expect(defaults).toMatchObject({ symbolQuoteCcy: "CAD" });
    },
  );
});

describe("hasActivityForm", () => {
  it("accepts every type the picker can offer", () => {
    for (const pickerType of [
      ActivityType.BUY,
      ActivityType.SELL,
      ActivityType.DEPOSIT,
      ActivityType.WITHDRAWAL,
      ActivityType.DIVIDEND,
      "TRANSFER",
      ActivityType.SPLIT,
      ActivityType.FEE,
      ActivityType.INTEREST,
      ActivityType.TAX,
      ActivityType.CREDIT,
    ]) {
      expect(hasActivityForm(pickerType)).toBe(true);
    }
  });

  it("accepts ADJUSTMENT, which is editable without being offered for creation", () => {
    expect(hasActivityForm(ActivityType.ADJUSTMENT)).toBe(true);
  });

  it("rejects a stored type that has no editor", () => {
    // A needs-review row imported by sync arrives as UNKNOWN, which carries no
    // classification and so has nothing to edit — the caller must offer the
    // picker rather than pin it.
    expect(hasActivityForm(ActivityType.UNKNOWN)).toBe(false);
  });

  it("rejects an absent type", () => {
    expect(hasActivityForm(undefined)).toBe(false);
    expect(hasActivityForm("")).toBe(false);
  });

  it("agrees with the picker mapping for both transfer legs", () => {
    // TRANSFER_IN/OUT are stored types with no form of their own; the picker
    // alias is what has one, so the two helpers have to be used together.
    expect(hasActivityForm(ActivityType.TRANSFER_IN)).toBe(false);
    expect(hasActivityForm(mapActivityTypeToPicker(ActivityType.TRANSFER_IN))).toBe(true);
    expect(hasActivityForm(mapActivityTypeToPicker(ActivityType.TRANSFER_OUT))).toBe(true);
  });
});
