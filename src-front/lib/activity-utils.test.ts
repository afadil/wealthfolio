import { ActivityType } from "./constants";
import {
  isCashActivity,
  isCashTransfer,
  isIncomeActivity,
  calculateActivityValue,
} from "./activity-utils";
import { ActivityDetails } from "./types";

describe("Activity Utilities", () => {
  describe("isCashActivity", () => {
    it("should identify cash activities correctly", () => {
      expect(isCashActivity(ActivityType.DEPOSIT)).toBe(true);
      expect(isCashActivity(ActivityType.WITHDRAWAL)).toBe(true);
      expect(isCashActivity(ActivityType.FEE)).toBe(true);
      expect(isCashActivity(ActivityType.INTEREST)).toBe(true);

      expect(isCashActivity(ActivityType.BUY)).toBe(false);
      expect(isCashActivity(ActivityType.SELL)).toBe(false);
      expect(isCashActivity(ActivityType.SPLIT)).toBe(false);
    });
  });

  describe("isIncomeActivity", () => {
    it("should identify income activities correctly", () => {
      expect(isIncomeActivity(ActivityType.DIVIDEND)).toBe(true);
      expect(isIncomeActivity(ActivityType.INTEREST)).toBe(true);

      expect(isIncomeActivity(ActivityType.BUY)).toBe(false);
      expect(isIncomeActivity(ActivityType.SELL)).toBe(false);
      expect(isIncomeActivity(ActivityType.DEPOSIT)).toBe(false);
      expect(isIncomeActivity(ActivityType.WITHDRAWAL)).toBe(false);
    });
  });

  describe("isCashTransfer", () => {
    it("should identify cash transfers correctly", () => {
      expect(isCashTransfer(ActivityType.TRANSFER_IN, "$CASH-USD")).toBe(true);
      expect(isCashTransfer(ActivityType.TRANSFER_OUT, "$CASH-EUR")).toBe(true);

      expect(isCashTransfer(ActivityType.TRANSFER_IN, "AAPL")).toBe(false);
      expect(isCashTransfer(ActivityType.DEPOSIT, "$CASH-USD")).toBe(false);
    });
  });

  describe("calculateActivityValue", () => {
    const createActivity = (overrides: Partial<ActivityDetails> = {}): ActivityDetails => ({
      id: "1",
      activityType: ActivityType.BUY,
      date: new Date(),
      quantity: 10,
      unitPrice: 100,
      amount: 0,
      fee: 10,
      currency: "USD",
      needsReview: false,
      createdAt: new Date(),
      assetId: "AAPL",
      updatedAt: new Date(),
      accountId: "account1",
      accountName: "Test Account",
      accountCurrency: "USD",
      assetSymbol: "AAPL",
      ...overrides,
    });

    it("should calculate BUY activity value correctly", () => {
      const activity = createActivity({
        activityType: ActivityType.BUY,
        quantity: 10,
        unitPrice: 100,
        fee: 10,
      });

      // (10 * 100) + 10 = 1010
      expect(calculateActivityValue(activity)).toBe(1010);
    });

    it("should calculate SELL activity value correctly", () => {
      const activity = createActivity({
        activityType: ActivityType.SELL,
        quantity: 10,
        unitPrice: 100,
        fee: 10,
      });

      // (10 * 100) - 10 = 990
      expect(calculateActivityValue(activity)).toBe(990);
    });

    it("should calculate DEPOSIT activity value correctly", () => {
      const activity = createActivity({
        activityType: ActivityType.DEPOSIT,
        amount: 1000,
        fee: 10,
      });

      // 1000 - 10 = 990
      expect(calculateActivityValue(activity)).toBe(990);
    });

    it("should calculate INTEREST activity value correctly", () => {
      const activity = createActivity({
        activityType: ActivityType.INTEREST,
        amount: 500,
        fee: 5,
      });

      // 500 - 5 = 495
      expect(calculateActivityValue(activity)).toBe(495);
    });

    it("should calculate DIVIDEND activity value correctly", () => {
      const activity = createActivity({
        activityType: ActivityType.DIVIDEND,
        amount: 300,
        fee: 3,
      });

      // 300 - 3 = 297
      expect(calculateActivityValue(activity)).toBe(297);
    });

    it("should calculate WITHDRAWAL activity value correctly", () => {
      const activity = createActivity({
        activityType: ActivityType.WITHDRAWAL,
        amount: 1000,
        fee: 10,
      });

      // 1000 + 10 = 1010
      expect(calculateActivityValue(activity)).toBe(1010);
    });

    it("should calculate FEE activity value correctly", () => {
      const activity = createActivity({
        activityType: ActivityType.FEE,
        fee: 10,
      });

      expect(calculateActivityValue(activity)).toBe(10);
    });

    it("should calculate SPLIT activity value correctly", () => {
      const activity = createActivity({
        activityType: ActivityType.SPLIT,
        amount: 2, // 2:1 split
      });

      expect(calculateActivityValue(activity)).toBe(0);
    });

    it("should calculate cash transfer activity value correctly", () => {
      const transferIn = createActivity({
        activityType: ActivityType.TRANSFER_IN,
        assetSymbol: "$CASH-USD",
        amount: 1000,
        fee: 10,
      });

      expect(calculateActivityValue(transferIn)).toBe(990);

      const transferOut = createActivity({
        activityType: ActivityType.TRANSFER_OUT,
        assetSymbol: "$CASH-USD",
        amount: 1000,
        fee: 10,
      });

      expect(calculateActivityValue(transferOut)).toBe(1010);
    });
  });
});
