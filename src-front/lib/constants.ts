import { z } from "zod";

// Wealthfolio Connect Portal URL - centralized configuration
export const WEALTHFOLIO_CONNECT_PORTAL_URL = "https://connect.wealthfolio.app";

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

// Canonical activity types (closed set of 15)
export const ActivityType = {
  BUY: "BUY",
  SELL: "SELL",
  SPLIT: "SPLIT",
  ADD_HOLDING: "ADD_HOLDING",
  REMOVE_HOLDING: "REMOVE_HOLDING",
  DIVIDEND: "DIVIDEND",
  INTEREST: "INTEREST",
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  TRANSFER_IN: "TRANSFER_IN",
  TRANSFER_OUT: "TRANSFER_OUT",
  FEE: "FEE",
  TAX: "TAX",
  CREDIT: "CREDIT",
  UNKNOWN: "UNKNOWN",
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

// Array of all activity types for iteration
export const ACTIVITY_TYPES = [
  "BUY",
  "SELL",
  "SPLIT",
  "ADD_HOLDING",
  "REMOVE_HOLDING",
  "DIVIDEND",
  "INTEREST",
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "FEE",
  "TAX",
  "CREDIT",
  "UNKNOWN",
] as const;

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
  ActivityType.SPLIT,
  ActivityType.ADD_HOLDING,
  ActivityType.REMOVE_HOLDING,
  ActivityType.DIVIDEND,
  ActivityType.INTEREST,
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.TRANSFER_IN,
  ActivityType.TRANSFER_OUT,
  ActivityType.FEE,
  ActivityType.TAX,
  ActivityType.CREDIT,
  ActivityType.UNKNOWN,
]);

// Display names for activity types
export const ActivityTypeNames: Record<ActivityType, string> = {
  [ActivityType.BUY]: "Buy",
  [ActivityType.SELL]: "Sell",
  [ActivityType.SPLIT]: "Split",
  [ActivityType.ADD_HOLDING]: "Add Holding",
  [ActivityType.REMOVE_HOLDING]: "Remove Holding",
  [ActivityType.DIVIDEND]: "Dividend",
  [ActivityType.INTEREST]: "Interest",
  [ActivityType.DEPOSIT]: "Deposit",
  [ActivityType.WITHDRAWAL]: "Withdrawal",
  [ActivityType.TRANSFER_IN]: "Transfer In",
  [ActivityType.TRANSFER_OUT]: "Transfer Out",
  [ActivityType.FEE]: "Fee",
  [ActivityType.TAX]: "Tax",
  [ActivityType.CREDIT]: "Credit",
  [ActivityType.UNKNOWN]: "Unknown",
};

// Alias for backward compatibility
export const ACTIVITY_TYPE_DISPLAY_NAMES = ActivityTypeNames;

// Activity status for lifecycle management
export const ActivityStatus = {
  POSTED: "POSTED",
  PENDING: "PENDING",
  DRAFT: "DRAFT",
  VOID: "VOID",
} as const;

export type ActivityStatus = (typeof ActivityStatus)[keyof typeof ActivityStatus];

// Known subtypes for UI
export const ACTIVITY_SUBTYPES = {
  // Dividend subtypes
  DRIP: "DRIP",
  QUALIFIED: "QUALIFIED",
  ORDINARY: "ORDINARY",
  RETURN_OF_CAPITAL: "RETURN_OF_CAPITAL",
  DIVIDEND_IN_KIND: "DIVIDEND_IN_KIND",

  // Interest subtypes
  STAKING_REWARD: "STAKING_REWARD",
  LENDING_INTEREST: "LENDING_INTEREST",
  COUPON: "COUPON",

  // Split subtypes
  STOCK_DIVIDEND: "STOCK_DIVIDEND",
  REVERSE_SPLIT: "REVERSE_SPLIT",

  // Option subtypes
  OPTION_OPEN: "OPTION_OPEN",
  OPTION_CLOSE: "OPTION_CLOSE",
  OPTION_EXPIRE: "OPTION_EXPIRE",
  OPTION_ASSIGNMENT: "OPTION_ASSIGNMENT",
  OPTION_EXERCISE: "OPTION_EXERCISE",

  // Fee subtypes
  MANAGEMENT_FEE: "MANAGEMENT_FEE",
  ADR_FEE: "ADR_FEE",
  INTEREST_CHARGE: "INTEREST_CHARGE",

  // Tax subtypes
  WITHHOLDING: "WITHHOLDING",
  NRA_WITHHOLDING: "NRA_WITHHOLDING",

  // Credit subtypes
  FEE_REFUND: "FEE_REFUND",
  TAX_REFUND: "TAX_REFUND",
  BONUS: "BONUS",
  ADJUSTMENT: "ADJUSTMENT",
  REBATE: "REBATE",
  REVERSAL: "REVERSAL",

  // Liability subtypes
  LIABILITY_INTEREST_ACCRUAL: "LIABILITY_INTEREST_ACCRUAL",
  LIABILITY_PRINCIPAL_PAYMENT: "LIABILITY_PRINCIPAL_PAYMENT",
} as const;

export type ActivitySubtype = (typeof ACTIVITY_SUBTYPES)[keyof typeof ACTIVITY_SUBTYPES];

// Display names for subtypes
export const SUBTYPE_DISPLAY_NAMES: Record<string, string> = {
  DRIP: "Dividend Reinvested",
  STAKING_REWARD: "Staking Reward",
  DIVIDEND_IN_KIND: "Dividend (In Kind)",
  STOCK_DIVIDEND: "Stock Dividend",
  OPTION_OPEN: "Option Open",
  OPTION_CLOSE: "Option Close",
  OPTION_EXPIRE: "Option Expired",
  OPTION_ASSIGNMENT: "Option Assignment",
  OPTION_EXERCISE: "Option Exercise",
  QUALIFIED: "Qualified Dividend",
  ORDINARY: "Ordinary Dividend",
  RETURN_OF_CAPITAL: "Return of Capital",
  COUPON: "Bond Coupon",
  WITHHOLDING: "Withholding Tax",
  NRA_WITHHOLDING: "NRA Withholding Tax",
  FEE_REFUND: "Fee Refund",
  TAX_REFUND: "Tax Refund",
  BONUS: "Bonus",
  ADJUSTMENT: "Adjustment",
  REBATE: "Rebate",
  REVERSAL: "Reversal",
  MANAGEMENT_FEE: "Management Fee",
  ADR_FEE: "ADR Fee",
  INTEREST_CHARGE: "Interest Charge",
  LENDING_INTEREST: "Lending Interest",
  REVERSE_SPLIT: "Reverse Split",
  LIABILITY_INTEREST_ACCRUAL: "Liability Interest Accrual",
  LIABILITY_PRINCIPAL_PAYMENT: "Liability Principal Payment",
};

// Asset kinds for behavior classification
export const ASSET_KINDS = [
  "SECURITY",
  "CRYPTO",
  "CASH",
  "FX_RATE",
  "OPTION",
  "COMMODITY",
  "PRIVATE_EQUITY",
  "PROPERTY",
  "VEHICLE",
  "LIABILITY",
  "OTHER",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

// Asset subclass types (from Rust AssetSubClass enum)
export const ASSET_SUBCLASS_TYPES = [
  { label: "Stock", value: "Stock" },
  { label: "ETF", value: "ETF" },
  { label: "Mutual Fund", value: "Mutual Fund" },
  { label: "Cryptocurrency", value: "Cryptocurrency" },
  { label: "Commodity", value: "Commodity" },
  { label: "Precious Metal", value: "Precious Metal" },
  { label: "Alternative", value: "Alternative" },
  { label: "Cash", value: "Cash" },
] as const;
