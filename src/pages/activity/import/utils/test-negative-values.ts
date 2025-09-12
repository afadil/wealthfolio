import { validateActivityImport, calculateCashActivityAmount } from "./validation-utils";
import { ImportFormat, ActivityType } from "@/lib/types";

// Test data with negative values (simulating broker exports that use negatives for direction)
const testData = [
  {
    lineNumber: "1",
    date: "2024-01-01",
    symbol: "AAPL",
    activityType: "BUY",
    quantity: "-10", // Negative quantity
    unitPrice: "-150.50", // Negative price
    amount: "-1505.00", // Negative amount
    fee: "-5.00", // Negative fee
    currency: "USD",
  },
  {
    lineNumber: "2",
    date: "2024-01-02",
    symbol: "MSFT",
    activityType: "SELL",
    quantity: "-5",
    unitPrice: "-300.00",
    amount: "-1500.00",
    fee: "-2.50",
    currency: "USD",
  },
];

const mapping = {
  accountId: "test-account",
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
  },
  symbolMappings: {},
  accountMappings: {},
};

// Test the validation function
console.log("Testing CSV import with negative values...");

const result = validateActivityImport(testData, mapping, "test-account", "USD");

console.log("Validation Results:");
result.activities.forEach((activity, index) => {
  console.log(`Activity ${index + 1}:`);
  console.log(`  Quantity: ${activity.quantity} (should be positive)`);
  console.log(`  Unit Price: ${activity.unitPrice} (should be positive)`);
  console.log(`  Amount: ${activity.amount} (should be positive)`);
  console.log(`  Fee: ${activity.fee} (should be positive)`);
  console.log(`  Is Valid: ${activity.isValid}`);
  console.log("");
});

// Test the calculateCashActivityAmount function
console.log("Testing calculateCashActivityAmount with negative values:");
const testAmount1 = calculateCashActivityAmount(-100, -2.5);
console.log(`calculateCashActivityAmount(-100, -2.50) = ${testAmount1} (should be 250)`);

const testAmount2 = calculateCashActivityAmount(undefined, -500);
console.log(`calculateCashActivityAmount(undefined, -500) = ${testAmount2} (should be 500)`);
