import { z } from 'zod';

export const HoldingType = {
  CASH: 'CASH',
  STOCK: 'STOCK',
  MUTUAL_FUND: 'MUTUAL_FUND',
  ETF: 'ETF',
  BOND: 'BOND',
  OTHER: 'OTHER',
  CRYPTOCURRENCY: 'CRYPTOCURRENCY',
} as const;

export type HoldingType = (typeof HoldingType)[keyof typeof HoldingType];

export const holdingTypeSchema = z.enum([
  HoldingType.CASH,
  HoldingType.STOCK,
  HoldingType.MUTUAL_FUND,
  HoldingType.ETF,
  HoldingType.BOND,
  HoldingType.OTHER,
]);

export const AccountType = {
  SECURITIES: 'SECURITIES',
  CASH: 'CASH',
  CRYPTOCURRENCY: 'CRYPTOCURRENCY',
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const accountTypeSchema = z.enum([
  AccountType.SECURITIES,
  AccountType.CASH,
  AccountType.CRYPTOCURRENCY,
]);

export const DataSource = {
  YAHOO: 'YAHOO',
  MANUAL: 'MANUAL',
} as const;

export type DataSource = (typeof DataSource)[keyof typeof DataSource];

// Zod schema for data source validation
export const dataSourceSchema = z.enum([
  DataSource.YAHOO,
  DataSource.MANUAL,
]);

export const ImportFormat = {
  DATE: 'date',
  ACTIVITY_TYPE: 'activityType',
  SYMBOL: 'symbol',
  QUANTITY: 'quantity',
  UNIT_PRICE: 'unitPrice',
  AMOUNT: 'amount',
  CURRENCY: 'currency',
  FEE: 'fee',
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
]);

export const ExportDataType = {
  ACCOUNTS: 'accounts',
  ACTIVITIES: 'activities',
  GOALS: 'goals',
  PORTFOLIO_HISTORY: 'portfolio-history',
} as const;

export type ExportDataType = (typeof ExportDataType)[keyof typeof ExportDataType];

export const exportDataTypeSchema = z.enum([
  ExportDataType.ACCOUNTS,
  ExportDataType.ACTIVITIES,
  ExportDataType.GOALS,
  ExportDataType.PORTFOLIO_HISTORY,
]);

export const ExportedFileFormat = {
  CSV: 'CSV',
  JSON: 'JSON',
  SQLITE: 'SQLite',
} as const;

export type ExportedFileFormat = (typeof ExportedFileFormat)[keyof typeof ExportedFileFormat];

export const exportedFileFormatSchema = z.enum([
  ExportedFileFormat.CSV,
  ExportedFileFormat.JSON,
  ExportedFileFormat.SQLITE,
]);

export const ActivityType = {
  BUY: 'BUY',
  SELL: 'SELL',
  DIVIDEND: 'DIVIDEND',
  INTEREST: 'INTEREST',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  ADD_HOLDING: 'ADD_HOLDING',
  REMOVE_HOLDING: 'REMOVE_HOLDING',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  CONVERSION_IN: 'CONVERSION_IN',
  CONVERSION_OUT: 'CONVERSION_OUT',
  FEE: 'FEE',
  TAX: 'TAX',
  SPLIT: 'SPLIT',
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
  ActivityType.FEE,
  ActivityType.INTEREST,
  ActivityType.TRANSFER_IN,
  ActivityType.TRANSFER_OUT,
  ActivityType.CONVERSION_IN,
  ActivityType.CONVERSION_OUT,
] as const;

export const INCOME_ACTIVITY_TYPES = [
  ActivityType.DIVIDEND,
  ActivityType.INTEREST,
] as const;

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
  ActivityType.CONVERSION_IN,
  ActivityType.CONVERSION_OUT,
  ActivityType.FEE,
  ActivityType.TAX,
  ActivityType.SPLIT,
]); 