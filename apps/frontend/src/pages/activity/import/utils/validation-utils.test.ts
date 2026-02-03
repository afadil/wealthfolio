import { describe, it, expect } from "vitest";
import {
  calculateCashActivityAmount,
  validateActivityImport,
  normalizeNumericValue,
  parseAndAbsoluteValue,
} from "./validation-utils";
import { ImportFormat, ActivityType } from "@/lib/types";

describe("validation-utils", () => {
  describe("normalizeNumericValue", () => {
    it("should handle currency symbols", () => {
      expect(normalizeNumericValue("$48.945")).toBe(48.945);
      expect(normalizeNumericValue("$1223.63")).toBe(1223.63);
      expect(normalizeNumericValue("-$692.48")).toBe(-692.48);
      expect(normalizeNumericValue("£100.50")).toBe(100.5);
      expect(normalizeNumericValue("€75.25")).toBe(75.25);
      expect(normalizeNumericValue("¥1000")).toBe(1000);
    });

    it("should handle commas and spaces", () => {
      expect(normalizeNumericValue("1,234.56")).toBe(1234.56);
      expect(normalizeNumericValue("1 234.56")).toBe(1234.56);
      expect(normalizeNumericValue("$1,000,000.00")).toBe(1000000.0);
      expect(normalizeNumericValue(" 123.45 ")).toBe(123.45);
    });

    it("should handle parentheses for negative values", () => {
      expect(normalizeNumericValue("(100.50)")).toBe(100.5);
      expect(normalizeNumericValue("$(1,234.56)")).toBe(1234.56);
    });

    it("should handle empty and invalid values", () => {
      expect(normalizeNumericValue("")).toBeUndefined();
      expect(normalizeNumericValue("   ")).toBeUndefined();
      expect(normalizeNumericValue("-")).toBeUndefined();
      expect(normalizeNumericValue("N/A")).toBeUndefined();
      expect(normalizeNumericValue("null")).toBeUndefined();
      expect(normalizeNumericValue("abc")).toBeUndefined();
      expect(normalizeNumericValue(undefined)).toBeUndefined();
    });

    it("should handle plain numeric values", () => {
      expect(normalizeNumericValue("123.45")).toBe(123.45);
      expect(normalizeNumericValue("-67.89")).toBe(-67.89);
      expect(normalizeNumericValue("0")).toBe(0);
      expect(normalizeNumericValue("0.00")).toBe(0);
    });
  });

  describe("parseAndAbsoluteValue", () => {
    it("should return absolute values of normalized numbers", () => {
      expect(parseAndAbsoluteValue("$48.945")).toBe(48.945);
      expect(parseAndAbsoluteValue("-$692.48")).toBe(692.48);
      expect(parseAndAbsoluteValue("(100.50)")).toBe(100.5);
      expect(parseAndAbsoluteValue("-123.45")).toBe(123.45);
    });

    it("should return undefined for invalid values", () => {
      expect(parseAndAbsoluteValue("")).toBeUndefined();
      expect(parseAndAbsoluteValue("abc")).toBeUndefined();
      expect(parseAndAbsoluteValue(undefined)).toBeUndefined();
    });
  });

  describe("calculateCashActivityAmount", () => {
    it("should handle positive values correctly", () => {
      expect(calculateCashActivityAmount(100, 2.5)).toBe(250);
      expect(calculateCashActivityAmount(undefined, 500)).toBe(500);
      expect(calculateCashActivityAmount(200, undefined)).toBe(200);
    });

    it("should convert negative values to positive using absolute values", () => {
      expect(calculateCashActivityAmount(-100, -2.5)).toBe(250);
      expect(calculateCashActivityAmount(undefined, -500)).toBe(500);
      expect(calculateCashActivityAmount(-200, undefined)).toBe(200);
    });

    it("should handle mixed positive and negative values", () => {
      expect(calculateCashActivityAmount(-100, 2.5)).toBe(250);
      expect(calculateCashActivityAmount(100, -2.5)).toBe(250);
    });
  });

  describe("validateActivityImport with negative values", () => {
    const testMapping = {
      accountId: "test-account",
      name: "Test Mapping",
      fieldMappings: {
        [ImportFormat.DATE]: "date",
        [ImportFormat.SYMBOL]: "symbol",
        [ImportFormat.ACTIVITY_TYPE]: "activityType",
        [ImportFormat.QUANTITY]: "quantity",
        [ImportFormat.UNIT_PRICE]: "unitPrice",
        [ImportFormat.AMOUNT]: "amount",
        [ImportFormat.FEE]: "fee",
        [ImportFormat.CURRENCY]: "currency",
      },
      activityMappings: {
        [ActivityType.BUY]: ["BUY"],
        [ActivityType.SELL]: ["SELL"],
        [ActivityType.DEPOSIT]: ["DEPOSIT"],
        [ActivityType.TAX]: ["TAX"],
        [ActivityType.FEE]: ["FEE"],
        [ActivityType.TRANSFER_IN]: ["TRANSFER_IN"],
        [ActivityType.TRANSFER_OUT]: ["TRANSFER_OUT"],
        [ActivityType.SPLIT]: ["SPLIT"],
      },
      symbolMappings: {},
      accountMappings: {},
    };

    it("should convert negative values to positive for BUY activities", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "2024-01-01T00:00:00.000Z",
          symbol: "AAPL",
          activityType: "BUY",
          quantity: "-10",
          unitPrice: "-150.50",
          amount: "-1505.00",
          fee: "-5.00",
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(1);
      const activity = result.activities[0];

      expect(activity.quantity).toBe(10);
      expect(activity.unitPrice).toBe(150.5);
      expect(activity.amount).toBe(1505); // quantity * unitPrice (10 * 150.50 = 1505)
      expect(activity.fee).toBe(5.0);
    });

    it("should convert negative values to positive for SELL activities", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "2024-01-01T00:00:00.000Z",
          symbol: "MSFT",
          activityType: "SELL",
          quantity: "-5",
          unitPrice: "-300.00",
          amount: "-1500.00",
          fee: "-2.50",
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(1);
      const activity = result.activities[0];

      expect(activity.quantity).toBe(5);
      expect(activity.unitPrice).toBe(300.0);
      expect(activity.amount).toBe(1500); // quantity * unitPrice
      expect(activity.fee).toBe(2.5);
    });

    it("should convert negative values to positive for DEPOSIT activities", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "2024-01-01T00:00:00.000Z",
          symbol: "$CASH-USD",
          activityType: "DEPOSIT",
          quantity: "1",
          unitPrice: "1",
          amount: "-1000.00",
          fee: "-0.00",
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(1);
      const activity = result.activities[0];

      expect(activity.amount).toBe(1000.0);
      expect(activity.fee).toBe(0.0);
    });

    it("should handle mixed positive and negative values correctly", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "2024-01-01T00:00:00.000Z",
          symbol: "GOOGL",
          activityType: "BUY",
          quantity: "3", // positive
          unitPrice: "-2500.00", // negative
          amount: "7500.00", // positive
          fee: "-10.00", // negative
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(1);
      const activity = result.activities[0];

      expect(activity.quantity).toBe(3);
      expect(activity.unitPrice).toBe(2500.0); // converted to positive
      expect(activity.amount).toBe(7500); // quantity * unitPrice (3 * 2500)
      expect(activity.fee).toBe(10.0); // converted to positive
    });

    it("should handle SPLIT activities with no cash impact", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "2024-01-01T00:00:00.000Z",
          symbol: "AAPL",
          activityType: "SPLIT",
          quantity: "20", // 2:1 split
          unitPrice: "75.00", // half the previous price
          amount: "0",
          fee: "0",
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(1);
      const activity = result.activities[0];

      expect(activity.quantity).toBe(20);
      expect(activity.unitPrice).toBe(75.0);
      expect(activity.amount).toBe(0); // SPLIT has no cash impact
      expect(activity.fee).toBe(0);
    });

    it("should handle TRANSFER_IN activities as cash activities", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "2024-01-01T00:00:00.000Z",
          symbol: "$CASH-USD",
          activityType: "TRANSFER_IN",
          quantity: "1",
          unitPrice: "1",
          amount: "-500.00", // negative amount
          fee: "0",
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(1);
      const activity = result.activities[0];

      expect(activity.amount).toBe(500.0); // converted to positive
      expect(activity.fee).toBe(0);
    });

    it("should handle CSV values with currency symbols like real broker exports", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "06/27/2025",
          symbol: "AAPL",
          activityType: "SELL",
          quantity: "25",
          unitPrice: "$48.945",
          amount: "$1223.63",
          fee: "0",
          currency: "USD",
        },
        {
          lineNumber: "2",
          date: "06/20/2025",
          symbol: "AAPL",
          activityType: "BUY",
          quantity: "8",
          unitPrice: "$86.5599",
          amount: "-$692.48",
          fee: "",
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(2);

      // First activity (SELL)
      const sellActivity = result.activities[0];
      expect(sellActivity.quantity).toBe(25);
      expect(sellActivity.unitPrice).toBe(48.945);
      expect(sellActivity.amount).toBe(1223.625); // quantity * unitPrice (25 * 48.945)
      expect(sellActivity.fee).toBe(0);

      // Second activity (BUY)
      const buyActivity = result.activities[1];
      expect(buyActivity.quantity).toBe(8);
      expect(buyActivity.unitPrice).toBe(86.5599);
      expect(buyActivity.amount).toBe(692.4792); // quantity * unitPrice (8 * 86.5599)
      expect(buyActivity.fee).toBe(0);
    });

    it("should handle FEE activities with fee value only (no amount)", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "2024-01-01T00:00:00.000Z",
          symbol: "$CASH-USD",
          activityType: "FEE",
          quantity: "",
          unitPrice: "",
          amount: "", // No amount provided
          fee: "$25.00", // Fee provided with currency symbol
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(1);
      const activity = result.activities[0];

      expect(activity.isValid).toBe(true);
      expect(activity.amount).toBe(0); // Amount should be 0 for fee-only activities
      expect(activity.fee).toBe(25.0); // The actual fee value
      expect(activity.errors).toBeUndefined();
    });

    it("should handle FEE activities with both fee and amount", () => {
      const testData = [
        {
          lineNumber: "1",
          date: "2024-01-01T00:00:00.000Z",
          symbol: "$CASH-USD",
          activityType: "FEE",
          quantity: "",
          unitPrice: "",
          amount: "$50.00", // Amount provided
          fee: "$5.00", // Fee also provided
          currency: "USD",
        },
      ];

      const result = validateActivityImport(testData, testMapping, "test-account", "USD");

      expect(result.activities).toHaveLength(1);
      const activity = result.activities[0];

      expect(activity.isValid).toBe(true);
      expect(activity.amount).toBe(50.0); // Should use provided amount
      expect(activity.fee).toBe(5.0); // Should use provided fee
      expect(activity.errors).toBeUndefined();
    });
  });
});
