import { z } from "zod";

export const PORTFOLIO_ACCOUNT_ID = "TOTAL";

export const HoldingType = {
  CASH: "cash",
  SECURITY: "security",
} as const;

export type HoldingType = (typeof HoldingType)[keyof typeof HoldingType];

export const AccountType = {
  SECURITIES: "SECURITIES",
  CASH: "CASH",
  CRYPTOCURRENCY: "CRYPTOCURRENCY",
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const accountTypeSchema = z.enum([
  AccountType.SECURITIES,
  AccountType.CASH,
  AccountType.CRYPTOCURRENCY,
]);

export const DataSource = {
  YAHOO: "YAHOO",
  MANUAL: "MANUAL",
} as const;

export type DataSource = (typeof DataSource)[keyof typeof DataSource];

// Zod schema for data source validation
export const dataSourceSchema = z.enum([DataSource.YAHOO, DataSource.MANUAL]);

export const ImportFormat = {
  DATE: "date",
  ACTIVITY_TYPE: "activityType",
  SYMBOL: "symbol",
  QUANTITY: "quantity",
  UNIT_PRICE: "unitPrice",
  AMOUNT: "amount",
  CURRENCY: "currency",
  FEE: "fee",
  ACCOUNT: "account",
  COMMENT: "comment",
} as const;

export type ImportFormat = (typeof ImportFormat)[keyof typeof ImportFormat];

export const importFormatSchema = z.enum([
  ImportFormat.DATE,
  ImportFormat.ACTIVITY_TYPE,
  ImportFormat.SYMBOL,
  ImportFormat.QUANTITY,
  ImportFormat.UNIT_PRICE,
  ImportFormat.AMOUNT,
  ImportFormat.CURRENCY,
  ImportFormat.FEE,
  ImportFormat.ACCOUNT,
  ImportFormat.COMMENT,
]);

export const IMPORT_REQUIRED_FIELDS = [
  ImportFormat.DATE,
  ImportFormat.ACTIVITY_TYPE,
  ImportFormat.SYMBOL,
  ImportFormat.QUANTITY,
  ImportFormat.UNIT_PRICE,
  ImportFormat.AMOUNT,
] as const;

export type ImportRequiredField = (typeof IMPORT_REQUIRED_FIELDS)[number];

export const ExportDataType = {
  ACCOUNTS: "accounts",
  ACTIVITIES: "activities",
  GOALS: "goals",
  PORTFOLIO_HISTORY: "portfolio-history",
} as const;

export type ExportDataType = (typeof ExportDataType)[keyof typeof ExportDataType];

export const exportDataTypeSchema = z.enum([
  ExportDataType.ACCOUNTS,
  ExportDataType.ACTIVITIES,
  ExportDataType.GOALS,
  ExportDataType.PORTFOLIO_HISTORY,
]);

export const ExportedFileFormat = {
  CSV: "CSV",
  JSON: "JSON",
  SQLITE: "SQLite",
} as const;

export type ExportedFileFormat = (typeof ExportedFileFormat)[keyof typeof ExportedFileFormat];

export const exportedFileFormatSchema = z.enum([
  ExportedFileFormat.CSV,
  ExportedFileFormat.JSON,
  ExportedFileFormat.SQLITE,
]);

export const ActivityType = {
  BUY: "BUY",
  SELL: "SELL",
  DIVIDEND: "DIVIDEND",
  INTEREST: "INTEREST",
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  ADD_HOLDING: "ADD_HOLDING",
  REMOVE_HOLDING: "REMOVE_HOLDING",
  TRANSFER_IN: "TRANSFER_IN",
  TRANSFER_OUT: "TRANSFER_OUT",
  FEE: "FEE",
  TAX: "TAX",
  SPLIT: "SPLIT",
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const TRADING_ACTIVITY_TYPES = [
  ActivityType.BUY,
  ActivityType.SELL,
  ActivityType.SPLIT,
  ActivityType.ADD_HOLDING,
  ActivityType.REMOVE_HOLDING,
] as const;

export const CASH_ACTIVITY_TYPES = [
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.INTEREST,
  ActivityType.TRANSFER_IN,
  ActivityType.TRANSFER_OUT,
  ActivityType.TAX,
  ActivityType.FEE,
] as const;

export const INCOME_ACTIVITY_TYPES = [ActivityType.DIVIDEND, ActivityType.INTEREST] as const;

// Zod schema for activity type validation
export const activityTypeSchema = z.enum([
  ActivityType.BUY,
  ActivityType.SELL,
  ActivityType.DIVIDEND,
  ActivityType.INTEREST,
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.TRANSFER_IN,
  ActivityType.TRANSFER_OUT,
  ActivityType.ADD_HOLDING,
  ActivityType.REMOVE_HOLDING,
  ActivityType.FEE,
  ActivityType.TAX,
  ActivityType.SPLIT,
]);

export const ActivityTypeNames: Record<ActivityType, string> = {
  [ActivityType.BUY]: "Buy",
  [ActivityType.SELL]: "Sell",
  [ActivityType.DIVIDEND]: "Dividend",
  [ActivityType.INTEREST]: "Interest",
  [ActivityType.DEPOSIT]: "Deposit",
  [ActivityType.WITHDRAWAL]: "Withdrawal",
  [ActivityType.ADD_HOLDING]: "Add Holding",
  [ActivityType.REMOVE_HOLDING]: "Remove Holding",
  [ActivityType.TRANSFER_IN]: "Transfer In",
  [ActivityType.TRANSFER_OUT]: "Transfer Out",
  [ActivityType.FEE]: "Fee",
  [ActivityType.TAX]: "Tax",
  [ActivityType.SPLIT]: "Split",
};
