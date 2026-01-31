import { ActivityType } from "@/lib/constants";
import type { Account } from "@/lib/types";
import { describe, expect, it } from "vitest";
import {
  applyTransactionUpdate,
  buildSavePayload,
  createCurrencyResolver,
  createDraftTransaction,
  resolveAssetIdForTransaction,
  TRACKED_FIELDS,
  valuesAreEqual,
} from "./activity-utils";
import type { LocalTransaction } from "./types";

// Helper to create mock account
const createMockAccount = (overrides: Partial<Account> = {}): Account => ({
  id: "account-1",
  name: "Test Account",
  accountType: "SECURITIES",
  balance: 10000,
  currency: "USD",
  isDefault: true,
  isActive: true,
  isArchived: false,
  trackingMode: "TRANSACTIONS",
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// Helper to create mock transaction
const createMockTransaction = (overrides: Partial<LocalTransaction> = {}): LocalTransaction => ({
  id: "tx-1",
  activityType: ActivityType.BUY,
  date: new Date("2024-01-15T10:00:00Z"),
  quantity: 10,
  unitPrice: 100,
  amount: 1000,
  fee: 5,
  currency: "USD",
  needsReview: false,
  comment: "",
  createdAt: new Date(),
  assetId: "AAPL",
  updatedAt: new Date(),
  accountId: "account-1",
  accountName: "Test Account",
  accountCurrency: "USD",
  assetSymbol: "AAPL",
  assetName: "Apple Inc.",
  ...overrides,
});

describe("activity-utils", () => {
  describe("valuesAreEqual", () => {
    describe("numeric fields", () => {
      it("should compare numbers correctly", () => {
        expect(valuesAreEqual("quantity", 10, 10)).toBe(true);
        expect(valuesAreEqual("quantity", 10, 20)).toBe(false);
      });

      it("should handle string to number comparison", () => {
        expect(valuesAreEqual("quantity", "10", 10)).toBe(true);
        expect(valuesAreEqual("unitPrice", 100.5, "100.5")).toBe(true);
      });

      it("should handle undefined/null as 0", () => {
        expect(valuesAreEqual("quantity", undefined, 0)).toBe(true);
        expect(valuesAreEqual("fee", null, 0)).toBe(true);
      });

      it("should handle NaN cases", () => {
        expect(valuesAreEqual("amount", NaN, NaN)).toBe(true);
        expect(valuesAreEqual("amount", NaN, 0)).toBe(false);
      });
    });

    describe("non-numeric fields", () => {
      it("should use Object.is for comparison", () => {
        expect(valuesAreEqual("activityType", "BUY", "BUY")).toBe(true);
        expect(valuesAreEqual("activityType", "BUY", "SELL")).toBe(false);
      });

      it("should handle undefined correctly", () => {
        expect(valuesAreEqual("comment", undefined, undefined)).toBe(true);
        expect(valuesAreEqual("comment", "", undefined)).toBe(false);
      });
    });
  });

  describe("resolveAssetIdForTransaction", () => {
    it("should return existing assetId if present", () => {
      const tx = createMockTransaction({ assetId: "AAPL", assetSymbol: "AAPL" });
      expect(resolveAssetIdForTransaction(tx, "USD")).toBe("AAPL");
    });

    it("should return assetSymbol if assetId is empty", () => {
      const tx = createMockTransaction({ assetId: "", assetSymbol: "MSFT" });
      expect(resolveAssetIdForTransaction(tx, "USD")).toBe("MSFT");
    });

    it("should return undefined for cash activities (backend generates ID)", () => {
      const tx = createMockTransaction({
        activityType: ActivityType.DEPOSIT,
        assetId: "",
        assetSymbol: "",
        currency: "EUR",
      });
      // Backend now generates CASH:{currency} IDs, frontend returns undefined
      expect(resolveAssetIdForTransaction(tx, "USD")).toBeUndefined();
    });

    it("should return undefined for cash activities without currency (backend generates ID)", () => {
      const tx = createMockTransaction({
        activityType: ActivityType.WITHDRAWAL,
        assetId: "",
        assetSymbol: "",
        currency: "",
        accountCurrency: "",
      });
      // Backend now generates CASH:{currency} IDs, frontend returns undefined
      expect(resolveAssetIdForTransaction(tx, "GBP")).toBeUndefined();
    });

    it("should return undefined for non-cash activities without asset", () => {
      const tx = createMockTransaction({
        activityType: ActivityType.BUY,
        assetId: "",
        assetSymbol: "",
      });
      expect(resolveAssetIdForTransaction(tx, "USD")).toBeUndefined();
    });
  });

  describe("createDraftTransaction", () => {
    it("should create a transaction with temp ID", () => {
      const accounts = [createMockAccount()];
      const draft = createDraftTransaction(accounts, "USD");

      expect(draft.id).toMatch(/^temp-/);
      expect(draft.isNew).toBe(true);
      // needsReview should be false - it's reserved for sync service activities needing review
      expect(draft.needsReview).toBe(false);
    });

    it("should use default account values", () => {
      const accounts = [
        createMockAccount({ id: "acc-1", name: "Account 1", currency: "EUR", isActive: true }),
      ];
      const draft = createDraftTransaction(accounts, "USD");

      expect(draft.accountId).toBe("acc-1");
      expect(draft.accountName).toBe("Account 1");
      expect(draft.currency).toBe("EUR");
    });

    it("should use first active account", () => {
      const accounts = [
        createMockAccount({ id: "acc-1", isActive: false }),
        createMockAccount({ id: "acc-2", isActive: true }),
      ];
      const draft = createDraftTransaction(accounts, "USD");

      expect(draft.accountId).toBe("acc-2");
    });

    it("should use fallback currency when no accounts", () => {
      const draft = createDraftTransaction([], "GBP");

      expect(draft.currency).toBe("GBP");
      expect(draft.accountCurrency).toBe("GBP");
    });

    it("should set default activity type to BUY", () => {
      const accounts = [createMockAccount()];
      const draft = createDraftTransaction(accounts, "USD");

      expect(draft.activityType).toBe(ActivityType.BUY);
    });

    it("should initialize numeric values to 0", () => {
      const accounts = [createMockAccount()];
      const draft = createDraftTransaction(accounts, "USD");

      expect(draft.quantity).toBe(0);
      expect(draft.unitPrice).toBe(0);
      expect(draft.amount).toBe(0);
      expect(draft.fee).toBe(0);
    });
  });

  describe("createCurrencyResolver", () => {
    const assetCurrencyLookup = new Map([
      ["AAPL", "USD"],
      ["VOD.L", "GBP"],
      ["$CASH-EUR", "EUR"],
    ]);

    it("should return transaction currency if set", () => {
      const resolver = createCurrencyResolver(assetCurrencyLookup, "USD");
      const tx = createMockTransaction({ currency: "CHF" });

      expect(resolver(tx)).toBe("CHF");
    });

    it("should resolve currency from asset lookup when transaction currency is empty", () => {
      const resolver = createCurrencyResolver(assetCurrencyLookup, "USD");
      // Must also set accountCurrency to empty to test asset lookup
      const tx = createMockTransaction({
        currency: "",
        assetSymbol: "VOD.L",
        assetId: "VOD.L",
        accountCurrency: "",
      });

      expect(resolver(tx)).toBe("GBP");
    });

    it("should extract currency from cash asset symbol", () => {
      const resolver = createCurrencyResolver(assetCurrencyLookup, "USD");
      const tx = createMockTransaction({
        currency: "",
        assetId: "$CASH-EUR",
        assetSymbol: "$CASH-EUR",
        accountCurrency: "",
      });

      expect(resolver(tx)).toBe("EUR");
    });

    it("should extract currency from CASH:{currency} asset id", () => {
      const resolver = createCurrencyResolver(assetCurrencyLookup, "USD");
      const tx = createMockTransaction({
        currency: "",
        assetId: "CASH:USD",
        assetSymbol: "CASH:USD",
        accountCurrency: "",
      });

      expect(resolver(tx)).toBe("USD");
    });

    it("should not treat CASH:XTSE as a cash currency", () => {
      const resolver = createCurrencyResolver(assetCurrencyLookup, "USD");
      const tx = createMockTransaction({
        currency: "",
        assetId: "CASH:XTSE",
        assetSymbol: "CASH:XTSE",
        accountCurrency: "CAD",
      });

      expect(resolver(tx, { includeFallback: true })).toBe("CAD");
    });

    it("should use account currency as fallback", () => {
      const resolver = createCurrencyResolver(assetCurrencyLookup, "JPY");
      const tx = createMockTransaction({
        currency: "",
        assetId: "UNKNOWN",
        assetSymbol: "UNKNOWN",
        accountCurrency: "CAD",
      });

      expect(resolver(tx, { includeFallback: true })).toBe("CAD");
    });

    it("should use fallback currency when no other currency found", () => {
      const resolver = createCurrencyResolver(assetCurrencyLookup, "JPY");
      const tx = createMockTransaction({
        currency: "",
        assetId: "UNKNOWN",
        assetSymbol: "UNKNOWN",
        accountCurrency: "",
      });

      expect(resolver(tx, { includeFallback: true })).toBe("JPY");
    });

    it("should return undefined when includeFallback is false and no currency found", () => {
      const resolver = createCurrencyResolver(assetCurrencyLookup, "JPY");
      const tx = createMockTransaction({
        currency: "",
        assetSymbol: "UNKNOWN",
        assetId: "UNKNOWN",
        accountCurrency: "",
      });

      expect(resolver(tx, { includeFallback: false })).toBeUndefined();
    });
  });

  describe("buildSavePayload", () => {
    const mockResolveTransactionCurrency = () => "USD";
    const dirtyCurrencyLookup = new Map<string, string>();
    const assetCurrencyLookup = new Map<string, string>();

    it("should separate new and existing transactions", () => {
      const transactions: LocalTransaction[] = [
        createMockTransaction({ id: "existing-1", isNew: false }),
        createMockTransaction({ id: "temp-new-1", isNew: true }),
      ];
      const dirtyIds = new Set(["existing-1", "temp-new-1"]);
      const pendingDeleteIds = new Set<string>();

      const result = buildSavePayload(
        transactions,
        dirtyIds,
        pendingDeleteIds,
        mockResolveTransactionCurrency,
        dirtyCurrencyLookup,
        assetCurrencyLookup,
        "USD",
      );

      expect(result.creates).toHaveLength(1);
      expect(result.updates).toHaveLength(1);
      expect(result.creates[0].id).toBe("temp-new-1");
      expect(result.updates[0].id).toBe("existing-1");
    });

    it("should include pending delete IDs", () => {
      const transactions: LocalTransaction[] = [];
      const dirtyIds = new Set<string>();
      const pendingDeleteIds = new Set(["del-1", "del-2"]);

      const result = buildSavePayload(
        transactions,
        dirtyIds,
        pendingDeleteIds,
        mockResolveTransactionCurrency,
        dirtyCurrencyLookup,
        assetCurrencyLookup,
        "USD",
      );

      expect(result.deleteIds).toEqual(["del-1", "del-2"]);
    });

    it("should only include dirty transactions", () => {
      const transactions: LocalTransaction[] = [
        createMockTransaction({ id: "tx-1" }),
        createMockTransaction({ id: "tx-2" }),
        createMockTransaction({ id: "tx-3" }),
      ];
      const dirtyIds = new Set(["tx-1", "tx-3"]);
      const pendingDeleteIds = new Set<string>();

      const result = buildSavePayload(
        transactions,
        dirtyIds,
        pendingDeleteIds,
        mockResolveTransactionCurrency,
        dirtyCurrencyLookup,
        assetCurrencyLookup,
        "USD",
      );

      expect(result.updates).toHaveLength(2);
      expect(result.updates.map((u) => u.id)).toContain("tx-1");
      expect(result.updates.map((u) => u.id)).toContain("tx-3");
      expect(result.updates.map((u) => u.id)).not.toContain("tx-2");
    });

    it("should convert date to ISO string", () => {
      const testDate = new Date("2024-06-15T14:30:00Z");
      const transactions: LocalTransaction[] = [
        createMockTransaction({ id: "tx-1", date: testDate }),
      ];
      const dirtyIds = new Set(["tx-1"]);

      const result = buildSavePayload(
        transactions,
        dirtyIds,
        new Set(),
        mockResolveTransactionCurrency,
        dirtyCurrencyLookup,
        assetCurrencyLookup,
        "USD",
      );

      expect(result.updates[0].activityDate).toBe("2024-06-15T14:30:00.000Z");
    });

    it("should handle cash activities without assetId (backend generates ID)", () => {
      const transactions: LocalTransaction[] = [
        createMockTransaction({
          id: "tx-1",
          activityType: ActivityType.DEPOSIT,
          assetId: "",
          assetSymbol: "",
        }),
      ];
      const dirtyIds = new Set(["tx-1"]);

      const result = buildSavePayload(
        transactions,
        dirtyIds,
        new Set(),
        mockResolveTransactionCurrency,
        dirtyCurrencyLookup,
        assetCurrencyLookup,
        "USD",
      );

      // Backend now generates CASH:{currency} IDs for cash activities
      // Frontend doesn't set asset for cash activities
      expect(result.updates[0].asset).toBeUndefined();
    });

    it("should remove quantity and unitPrice for SPLIT activities", () => {
      const transactions: LocalTransaction[] = [
        createMockTransaction({
          id: "tx-1",
          activityType: ActivityType.SPLIT,
          quantity: 2,
          unitPrice: 0,
        }),
      ];
      const dirtyIds = new Set(["tx-1"]);

      const result = buildSavePayload(
        transactions,
        dirtyIds,
        new Set(),
        mockResolveTransactionCurrency,
        dirtyCurrencyLookup,
        assetCurrencyLookup,
        "USD",
      );

      expect(result.updates[0].quantity).toBeUndefined();
      expect(result.updates[0].unitPrice).toBeUndefined();
    });
  });

  describe("applyTransactionUpdate", () => {
    it("should clear amount when value is null", () => {
      const accountLookup = new Map<string, { id: string; name: string; currency: string }>([
        ["account-1", { id: "account-1", name: "Test Account", currency: "USD" }],
      ]);
      const assetCurrencyLookup = new Map<string, string>();
      const tx = createMockTransaction({ amount: 1000 });

      const updated = applyTransactionUpdate({
        transaction: tx,
        field: "amount",
        value: null,
        accountLookup,
        assetCurrencyLookup,
        fallbackCurrency: "USD",
        resolveTransactionCurrency: () => "USD",
      });

      expect(updated.amount).toBeNull();
    });
  });

  describe("TRACKED_FIELDS", () => {
    it("should contain expected fields", () => {
      expect(TRACKED_FIELDS).toContain("activityType");
      expect(TRACKED_FIELDS).toContain("date");
      expect(TRACKED_FIELDS).toContain("assetSymbol");
      expect(TRACKED_FIELDS).toContain("quantity");
      expect(TRACKED_FIELDS).toContain("unitPrice");
      expect(TRACKED_FIELDS).toContain("amount");
      expect(TRACKED_FIELDS).toContain("fee");
      expect(TRACKED_FIELDS).toContain("accountId");
      expect(TRACKED_FIELDS).toContain("currency");
      expect(TRACKED_FIELDS).toContain("comment");
    });

    it("should not contain metadata fields", () => {
      expect(TRACKED_FIELDS).not.toContain("id");
      expect(TRACKED_FIELDS).not.toContain("createdAt");
      expect(TRACKED_FIELDS).not.toContain("updatedAt");
      expect(TRACKED_FIELDS).not.toContain("isNew");
    });
  });
});
