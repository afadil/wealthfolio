import { describe, it, expect } from "vitest";
import { ACTIVITY_FORM_CONFIG } from "../activity-form-config";
import type { ActivityDetails } from "@/lib/types";
import type {
  BuyFormValues,
  SellFormValues,
  DepositFormValues,
  WithdrawalFormValues,
  DividendFormValues,
  TransferFormValues,
  SplitFormValues,
  FeeFormValues,
  InterestFormValues,
  TaxFormValues,
} from "../../components/forms/schemas";

/**
 * Tests for activity-form-config.ts
 *
 * These tests verify the contract between:
 * 1. Form values (frontend) and payload fields (sent to backend)
 * 2. Activity data (from backend) and form defaults (for editing)
 *
 * This prevents field mapping bugs like using `quantity` instead of `amount`
 * for split ratio, which would cause the backend to ignore the split.
 */
describe("activity-form-config", () => {
  const mockAccounts = [{ value: "acc-1", label: "Test Account" }];

  describe("BUY config", () => {
    it("toPayload maps fields correctly", () => {
      const formData: BuyFormValues = {
        accountId: "acc-1",
        assetId: "AAPL",
        activityDate: new Date("2024-01-15"),
        quantity: 10,
        unitPrice: 150,
        fee: 5,
        comment: "Buy AAPL",
        pricingMode: "MARKET",
      };

      const payload = ACTIVITY_FORM_CONFIG.BUY.toPayload(formData);

      expect(payload.accountId).toBe("acc-1");
      expect(payload.assetId).toBe("AAPL");
      expect(payload.quantity).toBe(10);
      expect(payload.unitPrice).toBe(150);
      expect(payload.fee).toBe(5);
      expect(payload.comment).toBe("Buy AAPL");
    });

    it("getDefaults extracts values from activity", () => {
      const activity: Partial<ActivityDetails> = {
        accountId: "acc-1",
        assetSymbol: "AAPL",
        quantity: 10,
        unitPrice: 150,
        amount: 1500,
        fee: 5,
        currency: "USD",
      };

      const defaults = ACTIVITY_FORM_CONFIG.BUY.getDefaults(activity, mockAccounts);

      expect(defaults.accountId).toBe("acc-1");
      expect(defaults.assetId).toBe("AAPL");
      expect(defaults.quantity).toBe(10);
      expect(defaults.unitPrice).toBe(150);
      expect(defaults.fee).toBe(5);
    });
  });

  describe("SELL config", () => {
    it("toPayload maps fields correctly", () => {
      const formData: SellFormValues = {
        accountId: "acc-1",
        assetId: "AAPL",
        activityDate: new Date("2024-01-15"),
        quantity: 5,
        unitPrice: 160,
        fee: 5,
        comment: "Sell AAPL",
        pricingMode: "MARKET",
      };

      const payload = ACTIVITY_FORM_CONFIG.SELL.toPayload(formData);

      expect(payload.quantity).toBe(5);
      expect(payload.unitPrice).toBe(160);
      expect(payload.fee).toBe(5);
    });
  });

  describe("DEPOSIT config", () => {
    it("toPayload maps amount correctly", () => {
      const formData: DepositFormValues = {
        accountId: "acc-1",
        activityDate: new Date("2024-01-15"),
        amount: 1000,
        comment: "Deposit",
      };

      const payload = ACTIVITY_FORM_CONFIG.DEPOSIT.toPayload(formData);

      expect(payload.amount).toBe(1000);
      expect(payload).not.toHaveProperty("quantity");
    });

    it("getDefaults extracts amount from activity", () => {
      const activity: Partial<ActivityDetails> = {
        accountId: "acc-1",
        amount: 1000,
      };

      const defaults = ACTIVITY_FORM_CONFIG.DEPOSIT.getDefaults(activity, mockAccounts);

      expect(defaults.amount).toBe(1000);
    });
  });

  describe("WITHDRAWAL config", () => {
    it("toPayload maps amount correctly", () => {
      const formData: WithdrawalFormValues = {
        accountId: "acc-1",
        activityDate: new Date("2024-01-15"),
        amount: 500,
        comment: "Withdrawal",
      };

      const payload = ACTIVITY_FORM_CONFIG.WITHDRAWAL.toPayload(formData);

      expect(payload.amount).toBe(500);
    });
  });

  describe("DIVIDEND config", () => {
    it("toPayload maps amount correctly for cash dividend", () => {
      const formData: DividendFormValues = {
        accountId: "acc-1",
        symbol: "AAPL",
        activityDate: new Date("2024-01-15"),
        amount: 50,
        comment: "Dividend",
      };

      const payload = ACTIVITY_FORM_CONFIG.DIVIDEND.toPayload(formData);

      expect(payload.amount).toBe(50);
      expect(payload.assetId).toBe("AAPL");
    });

    it("getDefaults extracts amount from activity", () => {
      const activity: Partial<ActivityDetails> = {
        accountId: "acc-1",
        assetSymbol: "AAPL",
        amount: 50,
      };

      const defaults = ACTIVITY_FORM_CONFIG.DIVIDEND.getDefaults(activity, mockAccounts);

      expect(defaults.amount).toBe(50);
      expect(defaults.symbol).toBe("AAPL");
    });
  });

  describe("SPLIT config", () => {
    /**
     * CRITICAL: Split ratio must be sent as `amount`, not `quantity`.
     * The backend (snapshot_service.rs:1046) reads activity.amount for split ratio.
     * Using quantity would cause the split to be ignored with warning:
     * "Missing amount for Split activity..."
     */
    it("toPayload maps splitRatio to amount field (not quantity)", () => {
      const formData: SplitFormValues = {
        accountId: "acc-1",
        symbol: "AAPL",
        activityDate: new Date("2024-01-15"),
        splitRatio: 4, // 4:1 split
        comment: "4:1 stock split",
      };

      const payload = ACTIVITY_FORM_CONFIG.SPLIT.toPayload(formData);

      // Split ratio MUST be in amount field
      expect(payload.amount).toBe(4);
      // Should NOT have quantity field for splits
      expect(payload).not.toHaveProperty("quantity");
      expect(payload.assetId).toBe("AAPL");
    });

    it("toPayload maps reverse split ratio correctly", () => {
      const formData: SplitFormValues = {
        accountId: "acc-1",
        symbol: "AAPL",
        activityDate: new Date("2024-01-15"),
        splitRatio: 0.5, // 1:2 reverse split
        comment: "1:2 reverse split",
      };

      const payload = ACTIVITY_FORM_CONFIG.SPLIT.toPayload(formData);

      expect(payload.amount).toBe(0.5);
    });

    it("getDefaults extracts splitRatio from amount field (not quantity)", () => {
      const activity: Partial<ActivityDetails> = {
        accountId: "acc-1",
        assetSymbol: "AAPL",
        amount: 4, // Split ratio stored in amount
        quantity: undefined, // quantity should be ignored for splits
      };

      const defaults = ACTIVITY_FORM_CONFIG.SPLIT.getDefaults(activity, mockAccounts);

      // Should read from amount, not quantity
      expect(defaults.splitRatio).toBe(4);
    });

    it("getDefaults handles activity with both amount and quantity (prefers amount)", () => {
      const activity: Partial<ActivityDetails> = {
        accountId: "acc-1",
        assetSymbol: "AAPL",
        amount: 4,
        quantity: 100, // This should be ignored for splits
      };

      const defaults = ACTIVITY_FORM_CONFIG.SPLIT.getDefaults(activity, mockAccounts);

      // Should use amount (4), not quantity (100)
      expect(defaults.splitRatio).toBe(4);
    });
  });

  describe("FEE config", () => {
    it("toPayload maps amount correctly", () => {
      const formData: FeeFormValues = {
        accountId: "acc-1",
        activityDate: new Date("2024-01-15"),
        amount: 25,
        comment: "Account fee",
      };

      const payload = ACTIVITY_FORM_CONFIG.FEE.toPayload(formData);

      expect(payload.amount).toBe(25);
    });
  });

  describe("INTEREST config", () => {
    it("toPayload maps amount correctly", () => {
      const formData: InterestFormValues = {
        accountId: "acc-1",
        activityDate: new Date("2024-01-15"),
        amount: 15,
        comment: "Interest income",
      };

      const payload = ACTIVITY_FORM_CONFIG.INTEREST.toPayload(formData);

      expect(payload.amount).toBe(15);
    });
  });

  describe("TAX config", () => {
    it("toPayload maps amount correctly", () => {
      const formData: TaxFormValues = {
        accountId: "acc-1",
        activityDate: new Date("2024-01-15"),
        amount: 100,
        comment: "Tax payment",
      };

      const payload = ACTIVITY_FORM_CONFIG.TAX.toPayload(formData);

      expect(payload.amount).toBe(100);
    });
  });

  describe("TRANSFER config", () => {
    it("toPayload maps cash transfer amount correctly", () => {
      const formData: TransferFormValues = {
        isExternal: true,
        direction: "out",
        accountId: "acc-1",
        fromAccountId: "",
        toAccountId: "",
        activityDate: new Date("2024-01-15"),
        transferMode: "cash",
        amount: 1000,
        assetId: null,
        quantity: null,
        comment: "Cash transfer",
        pricingMode: "MARKET",
      };

      const payload = ACTIVITY_FORM_CONFIG.TRANSFER.toPayload(formData);

      expect(payload.amount).toBe(1000);
    });

    it("toPayload maps securities transfer correctly", () => {
      const formData: TransferFormValues = {
        isExternal: true,
        direction: "in",
        accountId: "acc-1",
        fromAccountId: "",
        toAccountId: "",
        activityDate: new Date("2024-01-15"),
        transferMode: "securities",
        amount: undefined,
        assetId: "AAPL",
        quantity: 50,
        comment: "Securities transfer",
        pricingMode: "MARKET",
      };

      const payload = ACTIVITY_FORM_CONFIG.TRANSFER.toPayload(formData);

      expect(payload.quantity).toBe(50);
      expect(payload.assetId).toBe("AAPL");
    });
  });

  describe("roundtrip consistency", () => {
    /**
     * For each activity type, verify that:
     * getDefaults(activity) -> toPayload(formValues) produces consistent field mapping
     */
    it("SPLIT: roundtrip preserves split ratio in amount field", () => {
      const originalActivity: Partial<ActivityDetails> = {
        accountId: "acc-1",
        assetSymbol: "AAPL",
        amount: 4,
        date: "2024-01-15",
      };

      // Load into form
      const defaults = ACTIVITY_FORM_CONFIG.SPLIT.getDefaults(originalActivity, mockAccounts);

      // Submit form
      const payload = ACTIVITY_FORM_CONFIG.SPLIT.toPayload({
        ...defaults,
        activityDate: new Date("2024-01-15"),
      } as SplitFormValues);

      // Verify roundtrip
      expect(payload.amount).toBe(originalActivity.amount);
    });

    it("DIVIDEND: roundtrip preserves amount", () => {
      const originalActivity: Partial<ActivityDetails> = {
        accountId: "acc-1",
        assetSymbol: "AAPL",
        amount: 50,
        date: "2024-01-15",
      };

      const defaults = ACTIVITY_FORM_CONFIG.DIVIDEND.getDefaults(originalActivity, mockAccounts);
      const payload = ACTIVITY_FORM_CONFIG.DIVIDEND.toPayload({
        ...defaults,
        activityDate: new Date("2024-01-15"),
      } as DividendFormValues);

      expect(payload.amount).toBe(originalActivity.amount);
    });
  });
});
