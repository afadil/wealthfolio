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
  // New account types for alternative assets
  PROPERTY: "PROPERTY",
  VEHICLE: "VEHICLE",
  COLLECTIBLE: "COLLECTIBLE",
  PRECIOUS: "PRECIOUS",
  LIABILITY: "LIABILITY",
  OTHER: "OTHER",
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const accountTypeSchema = z.enum([
  AccountType.SECURITIES,
  AccountType.CASH,
  AccountType.CRYPTOCURRENCY,
  AccountType.PROPERTY,
  AccountType.VEHICLE,
  AccountType.COLLECTIBLE,
  AccountType.PRECIOUS,
  AccountType.LIABILITY,
  AccountType.OTHER,
]);

/**
 * Returns the default group name for a given account type.
 * Maps account types to their default group names for UI organization.
 */
export function defaultGroupForAccountType(accountType: AccountType): string {
  switch (accountType) {
    case AccountType.SECURITIES:
      return "Investments";
    case AccountType.CASH:
      return "Cash";
    case AccountType.CRYPTOCURRENCY:
      return "Crypto";
    case AccountType.PROPERTY:
      return "Properties";
    case AccountType.VEHICLE:
      return "Vehicles";
    case AccountType.COLLECTIBLE:
      return "Collectibles";
    case AccountType.PRECIOUS:
      return "Precious Metals";
    case AccountType.LIABILITY:
      return "Liabilities";
    case AccountType.OTHER:
      return "Other Assets";
    default:
      return "Other";
  }
}

/**
 * Returns true if the account type is for alternative assets (non-investment).
 */
export function isAlternativeAssetType(accountType: AccountType): boolean {
  return (
    accountType === AccountType.PROPERTY ||
    accountType === AccountType.VEHICLE ||
    accountType === AccountType.COLLECTIBLE ||
    accountType === AccountType.PRECIOUS ||
    accountType === AccountType.OTHER
  );
}

/**
 * Returns true if the account type is a liability.
 */
export function isLiabilityType(accountType: AccountType): boolean {
  return accountType === AccountType.LIABILITY;
}

/**
 * Asset ID delimiter used in all asset IDs (colon).
 * Format: {primary}:{qualifier}
 * Examples: AAPL:XNAS, BTC:USD, CASH:USD, PROP:abc12345
 */
export const ASSET_ID_DELIMITER = ":";

/**
 * Alternative asset ID prefixes (per spec: PROP:, VEH:, COLL:, PREC:, LIAB:, ALT:)
 */
export const ALTERNATIVE_ASSET_ID_PREFIXES = [
  "PROP:",
  "VEH:",
  "COLL:",
  "PREC:",
  "LIAB:",
  "ALT:",
] as const;

/**
 * Cash asset ID prefix
 */
export const CASH_ASSET_ID_PREFIX = "CASH:";

/**
 * Parsed asset ID structure
 */
export interface ParsedAssetId {
  primary: string;
  qualifier: string;
  kind?: "security" | "crypto" | "fx" | "cash" | "alternative";
}

/**
 * Parses an asset ID into its components.
 * Returns null if the ID doesn't contain the delimiter.
 *
 * @example
 * parseAssetId("AAPL:XNAS") // { primary: "AAPL", qualifier: "XNAS", kind: "security" }
 * parseAssetId("BTC:USD") // { primary: "BTC", qualifier: "USD", kind: "crypto" }
 * parseAssetId("CASH:USD") // { primary: "CASH", qualifier: "USD", kind: "cash" }
 * parseAssetId("PROP:abc12345") // { primary: "PROP", qualifier: "abc12345", kind: "alternative" }
 */
export function parseAssetId(assetId: string): ParsedAssetId | null {
  const parts = assetId.split(ASSET_ID_DELIMITER);
  if (parts.length !== 2) {
    return null;
  }

  const [primary, qualifier] = parts;

  // Determine kind based on the ID format
  let kind: ParsedAssetId["kind"];

  if (primary === "CASH") {
    kind = "cash";
  } else if (["PROP", "VEH", "COLL", "PREC", "LIAB", "ALT"].includes(primary)) {
    kind = "alternative";
  } else if (qualifier.length === 4 && /^[A-Z]{4}$/.test(qualifier)) {
    // 4-letter qualifier is MIC code (security)
    kind = "security";
  } else if (qualifier.length === 3 && /^[A-Z]{3}$/.test(qualifier)) {
    // 3-letter qualifier could be FX or crypto
    kind = primary.length === 3 ? "fx" : "crypto";
  }

  return { primary, qualifier, kind };
}

/**
 * Formats an asset ID for display.
 * For securities: shows symbol only (AAPL:XNAS -> AAPL)
 * For cash: shows currency (CASH:USD -> USD)
 * For alternatives: shows full ID (PROP:abc12345)
 */
export function formatAssetIdForDisplay(assetId: string): string {
  const parsed = parseAssetId(assetId);
  if (!parsed) return assetId;

  switch (parsed.kind) {
    case "security":
    case "crypto":
    case "fx":
      return parsed.primary;
    case "cash":
      return parsed.qualifier; // Show currency code
    case "alternative":
      return assetId; // Show full ID for alternatives
    default:
      return parsed.primary;
  }
}

/**
 * Returns true if the asset ID (symbol) belongs to an alternative asset.
 * Alternative assets have prefixed IDs like PROP:xxxxx, VEH:xxxxx, etc.
 */
export function isAlternativeAssetId(assetId: string): boolean {
  return ALTERNATIVE_ASSET_ID_PREFIXES.some((prefix) => assetId.startsWith(prefix));
}

/**
 * Returns true if the asset ID belongs to a liability (LIAB: prefix).
 */
export function isLiabilityAssetId(assetId: string): boolean {
  return assetId.startsWith("LIAB:");
}

/**
 * Returns true if the asset ID belongs to a cash position (CASH: prefix).
 */
export function isCashAssetId(assetId: string): boolean {
  return assetId.startsWith(CASH_ASSET_ID_PREFIX);
}

// DataSource: Where quote data comes from (used on Quote objects)
export const DataSource = {
  YAHOO: "YAHOO",
  MANUAL: "MANUAL",
} as const;

export type DataSource = (typeof DataSource)[keyof typeof DataSource];

// Zod schema for data source validation
export const dataSourceSchema = z.enum([DataSource.YAHOO, DataSource.MANUAL]);

// PricingMode: How an asset's price is determined (used on Asset/Activity objects)
export const PricingMode = {
  MARKET: "MARKET", // Auto-fetch prices from market data providers
  MANUAL: "MANUAL", // User manages prices manually
  DERIVED: "DERIVED", // Calculated from other assets
  NONE: "NONE", // No pricing needed (e.g., cash)
} as const;

export type PricingMode = (typeof PricingMode)[keyof typeof PricingMode];

// Zod schema for pricing mode validation
export const pricingModeSchema = z.enum([
  PricingMode.MARKET,
  PricingMode.MANUAL,
  PricingMode.DERIVED,
  PricingMode.NONE,
]);

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

// Canonical activity types (closed set of 14)
export const ActivityType = {
  BUY: "BUY",
  SELL: "SELL",
  SPLIT: "SPLIT",
  DIVIDEND: "DIVIDEND",
  INTEREST: "INTEREST",
  DEPOSIT: "DEPOSIT",
  WITHDRAWAL: "WITHDRAWAL",
  TRANSFER_IN: "TRANSFER_IN",
  TRANSFER_OUT: "TRANSFER_OUT",
  FEE: "FEE",
  TAX: "TAX",
  CREDIT: "CREDIT",
  ADJUSTMENT: "ADJUSTMENT",
  UNKNOWN: "UNKNOWN",
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

// Array of all activity types for iteration
export const ACTIVITY_TYPES = [
  "BUY",
  "SELL",
  "SPLIT",
  "DIVIDEND",
  "INTEREST",
  "DEPOSIT",
  "WITHDRAWAL",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "FEE",
  "TAX",
  "CREDIT",
  "ADJUSTMENT",
  "UNKNOWN",
] as const;

export const TRADING_ACTIVITY_TYPES = [
  ActivityType.BUY,
  ActivityType.SELL,
  ActivityType.SPLIT,
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
  ActivityType.DIVIDEND,
  ActivityType.INTEREST,
  ActivityType.DEPOSIT,
  ActivityType.WITHDRAWAL,
  ActivityType.TRANSFER_IN,
  ActivityType.TRANSFER_OUT,
  ActivityType.FEE,
  ActivityType.TAX,
  ActivityType.CREDIT,
  ActivityType.ADJUSTMENT,
  ActivityType.UNKNOWN,
]);

// Display names for activity types
export const ActivityTypeNames: Record<ActivityType, string> = {
  [ActivityType.BUY]: "Buy",
  [ActivityType.SELL]: "Sell",
  [ActivityType.SPLIT]: "Split",
  [ActivityType.DIVIDEND]: "Dividend",
  [ActivityType.INTEREST]: "Interest",
  [ActivityType.DEPOSIT]: "Deposit",
  [ActivityType.WITHDRAWAL]: "Withdrawal",
  [ActivityType.TRANSFER_IN]: "Transfer In",
  [ActivityType.TRANSFER_OUT]: "Transfer Out",
  [ActivityType.FEE]: "Fee",
  [ActivityType.TAX]: "Tax",
  [ActivityType.CREDIT]: "Credit",
  [ActivityType.ADJUSTMENT]: "Adjustment",
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

  // Alternative asset subtypes
  OPENING_POSITION: "OPENING_POSITION",
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
  OPENING_POSITION: "Opening Position",
};

// Suggested subtypes per activity type
export const SUBTYPES_BY_ACTIVITY_TYPE: Record<string, string[]> = {
  [ActivityType.DIVIDEND]: [
    ACTIVITY_SUBTYPES.DRIP,
    ACTIVITY_SUBTYPES.QUALIFIED,
    ACTIVITY_SUBTYPES.ORDINARY,
    ACTIVITY_SUBTYPES.RETURN_OF_CAPITAL,
    ACTIVITY_SUBTYPES.DIVIDEND_IN_KIND,
  ],
  [ActivityType.INTEREST]: [
    ACTIVITY_SUBTYPES.STAKING_REWARD,
    ACTIVITY_SUBTYPES.LENDING_INTEREST,
    ACTIVITY_SUBTYPES.COUPON,
  ],
  [ActivityType.SPLIT]: [ACTIVITY_SUBTYPES.STOCK_DIVIDEND, ACTIVITY_SUBTYPES.REVERSE_SPLIT],
  [ActivityType.SELL]: [ACTIVITY_SUBTYPES.OPTION_ASSIGNMENT, ACTIVITY_SUBTYPES.OPTION_EXERCISE],
  [ActivityType.BUY]: [ACTIVITY_SUBTYPES.OPTION_ASSIGNMENT, ACTIVITY_SUBTYPES.OPTION_EXERCISE],
  [ActivityType.FEE]: [
    ACTIVITY_SUBTYPES.MANAGEMENT_FEE,
    ACTIVITY_SUBTYPES.ADR_FEE,
    ACTIVITY_SUBTYPES.INTEREST_CHARGE,
  ],
  [ActivityType.TAX]: [ACTIVITY_SUBTYPES.WITHHOLDING, ACTIVITY_SUBTYPES.NRA_WITHHOLDING],
  [ActivityType.CREDIT]: [
    ACTIVITY_SUBTYPES.FEE_REFUND,
    ACTIVITY_SUBTYPES.TAX_REFUND,
    ACTIVITY_SUBTYPES.BONUS,
    ACTIVITY_SUBTYPES.ADJUSTMENT,
    ACTIVITY_SUBTYPES.REBATE,
    ACTIVITY_SUBTYPES.REVERSAL,
  ],
  [ActivityType.TRANSFER_IN]: [ACTIVITY_SUBTYPES.OPENING_POSITION],
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
  "COLLECTIBLE",
  "PHYSICAL_PRECIOUS",
  "LIABILITY",
  "OTHER",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

// Display names for all asset kinds
export const ASSET_KIND_DISPLAY_NAMES: Record<AssetKind, string> = {
  SECURITY: "Security",
  CRYPTO: "Cryptocurrency",
  CASH: "Cash",
  FX_RATE: "FX Rate",
  OPTION: "Option",
  COMMODITY: "Commodity",
  PRIVATE_EQUITY: "Private Equity",
  PROPERTY: "Property",
  VEHICLE: "Vehicle",
  COLLECTIBLE: "Collectible",
  PHYSICAL_PRECIOUS: "Precious Metal",
  LIABILITY: "Liability",
  OTHER: "Other",
};

// User-editable asset kinds (excludes system-managed types like CASH and FX_RATE)
export const EDITABLE_ASSET_KINDS: AssetKind[] = [
  "SECURITY",
  "CRYPTO",
  "OPTION",
  "COMMODITY",
  "PRIVATE_EQUITY",
  "PROPERTY",
  "VEHICLE",
  "COLLECTIBLE",
  "PHYSICAL_PRECIOUS",
  "LIABILITY",
  "OTHER",
];

// Convenience object for alternative asset kinds
export const AlternativeAssetKind = {
  PROPERTY: "PROPERTY",
  VEHICLE: "VEHICLE",
  COLLECTIBLE: "COLLECTIBLE",
  PHYSICAL_PRECIOUS: "PHYSICAL_PRECIOUS",
  LIABILITY: "LIABILITY",
  OTHER: "OTHER",
} as const;

export type AlternativeAssetKind = (typeof AlternativeAssetKind)[keyof typeof AlternativeAssetKind];

// Display names for alternative asset kinds
export const ALTERNATIVE_ASSET_KIND_DISPLAY_NAMES: Record<AlternativeAssetKind, string> = {
  [AlternativeAssetKind.PROPERTY]: "Property",
  [AlternativeAssetKind.VEHICLE]: "Vehicle",
  [AlternativeAssetKind.COLLECTIBLE]: "Collectible",
  [AlternativeAssetKind.PHYSICAL_PRECIOUS]: "Precious Metal",
  [AlternativeAssetKind.LIABILITY]: "Liability",
  [AlternativeAssetKind.OTHER]: "Other",
};

// Default account groups for alternative assets
export const ALTERNATIVE_ASSET_DEFAULT_GROUPS: Record<AlternativeAssetKind, string> = {
  [AlternativeAssetKind.PROPERTY]: "Properties",
  [AlternativeAssetKind.VEHICLE]: "Vehicles",
  [AlternativeAssetKind.COLLECTIBLE]: "Collectibles",
  [AlternativeAssetKind.PHYSICAL_PRECIOUS]: "Precious Metals",
  [AlternativeAssetKind.LIABILITY]: "Liabilities",
  [AlternativeAssetKind.OTHER]: "Other Assets",
};

// Map API kind values (lowercase) to enum values
const API_KIND_TO_ENUM: Record<string, AlternativeAssetKind> = {
  property: AlternativeAssetKind.PROPERTY,
  vehicle: AlternativeAssetKind.VEHICLE,
  collectible: AlternativeAssetKind.COLLECTIBLE,
  precious: AlternativeAssetKind.PHYSICAL_PRECIOUS,
  liability: AlternativeAssetKind.LIABILITY,
  other: AlternativeAssetKind.OTHER,
};

/**
 * Convert an API kind string (lowercase like "precious") to the AlternativeAssetKind enum value.
 * Returns OTHER if the kind is not recognized.
 */
export function apiKindToAlternativeAssetKind(apiKind: string): AlternativeAssetKind {
  return API_KIND_TO_ENUM[apiKind.toLowerCase()] ?? AlternativeAssetKind.OTHER;
}

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

/**
 * Holding category filters for the Holdings page.
 * Three main categories: Investments (stocks, ETFs, crypto, options, etc.), Assets (alternative assets), Liabilities.
 * Uses assetKinds to filter holdings directly by their assetKind field.
 * IDs are stable strings for URL persistence and local storage.
 */
export const HOLDING_CATEGORY_FILTERS = [
  { id: "investments", label: "Investments", assetKinds: ["SECURITY", "CRYPTO", "OPTION", "COMMODITY", "PRIVATE_EQUITY"] },
  { id: "assets", label: "Assets", assetKinds: ["PROPERTY", "VEHICLE", "COLLECTIBLE", "PHYSICAL_PRECIOUS", "OTHER"] },
  { id: "liabilities", label: "Liabilities", assetKinds: ["LIABILITY"] },
] as const;

export type HoldingCategoryFilterId = (typeof HOLDING_CATEGORY_FILTERS)[number]["id"];

/**
 * Maps account types to their display group names for the Holdings page.
 * Used for collapsible group headers.
 */
export const HOLDING_GROUP_DISPLAY_NAMES: Record<string, string> = {
  [AccountType.SECURITIES]: "Investments",
  [AccountType.CRYPTOCURRENCY]: "Investments",
  [AccountType.CASH]: "Cash",
  [AccountType.PROPERTY]: "Properties",
  [AccountType.VEHICLE]: "Vehicles",
  [AccountType.COLLECTIBLE]: "Collectibles",
  [AccountType.PRECIOUS]: "Precious Metals",
  [AccountType.LIABILITY]: "Liabilities",
  [AccountType.OTHER]: "Other Assets",
};

/**
 * Order for displaying holding groups in the Holdings page.
 * Lower numbers appear first.
 */
export const HOLDING_GROUP_ORDER: Record<string, number> = {
  Investments: 1,
  Properties: 2,
  Vehicles: 3,
  Collectibles: 4,
  "Precious Metals": 5,
  "Other Assets": 6,
  Liabilities: 7,
  Cash: 8,
};

// =============================================================================
// Exchange Mapping (Fallback)
// =============================================================================

/**
 * Display names for exchange codes (MIC codes and special values).
 * Used to show user-friendly exchange names in the UI.
 */
export const EXCHANGE_DISPLAY_NAMES: Record<string, string> = {
  // Major US exchanges
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  XASE: "NYSE American",
  ARCX: "NYSE Arca",
  BATS: "CBOE BZX",

  // Canadian exchanges
  XTSE: "TSX",
  XTSX: "TSX-V",
  XCNQ: "CSE",
  XNEO: "Aequitas NEO",

  // European exchanges
  XLON: "LSE",
  XPAR: "Euronext Paris",
  XAMS: "Euronext Amsterdam",
  XBRU: "Euronext Brussels",
  XLIS: "Euronext Lisbon",
  XETR: "XETRA",
  XFRA: "Frankfurt",
  XSWX: "SIX Swiss",
  XMIL: "Borsa Italiana",
  XMAD: "BME",

  // Asia-Pacific exchanges
  XASX: "ASX",
  XTKS: "Tokyo",
  XHKG: "HKEX",
  XSHG: "Shanghai",
  XSHE: "Shenzhen",
  XSES: "SGX",
  XKRX: "Korea",
  XBOM: "BSE India",
  XNSE: "NSE India",

  // Other major exchanges
  XJSE: "JSE",
  XSAU: "Tadawul",
  XBSP: "B3",
  XMEX: "BMV",

  // Special values
  MANUAL: "Manual",
  CCC: "Crypto",
  CCY: "FX",

  // OTC markets
  PNK: "OTC Pink",
  OTC: "OTC",
  OTCQX: "OTCQX",
  OTCQB: "OTCQB",
};

/**
 * Get a friendly display name for an exchange code.
 * Falls back to the original code if no mapping exists.
 *
 * @param exchangeCode - Exchange MIC code (e.g., XNAS, XTSE, XASX)
 * @returns Friendly display name (e.g., NASDAQ, TSX, ASX) or original code if not mapped
 */
export function getExchangeDisplayName(exchangeCode: string | undefined | null): string {
  if (!exchangeCode) return "";
  const upperCode = exchangeCode.toUpperCase();
  return EXCHANGE_DISPLAY_NAMES[upperCode] ?? exchangeCode;
}
