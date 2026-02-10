/**
 * Comprehensive data types for Wealthfolio addons
 * These types mirror the main application types to ensure compatibility
 */

// Canonical activity types (closed set of 14)
export const ActivityType = {
  BUY: 'BUY',
  SELL: 'SELL',
  SPLIT: 'SPLIT',
  DIVIDEND: 'DIVIDEND',
  INTEREST: 'INTEREST',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  TRANSFER_IN: 'TRANSFER_IN',
  TRANSFER_OUT: 'TRANSFER_OUT',
  FEE: 'FEE',
  TAX: 'TAX',
  CREDIT: 'CREDIT',
  ADJUSTMENT: 'ADJUSTMENT',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

// Array of all activity types for iteration
export const ACTIVITY_TYPES = [
  'BUY',
  'SELL',
  'SPLIT',
  'DIVIDEND',
  'INTEREST',
  'DEPOSIT',
  'WITHDRAWAL',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'FEE',
  'TAX',
  'CREDIT',
  'ADJUSTMENT',
  'UNKNOWN',
] as const;

// Activity status for lifecycle management
export const ActivityStatus = {
  POSTED: 'POSTED',
  PENDING: 'PENDING',
  DRAFT: 'DRAFT',
  VOID: 'VOID',
} as const;

export type ActivityStatus = (typeof ActivityStatus)[keyof typeof ActivityStatus];

// Known subtypes for UI
export const ACTIVITY_SUBTYPES = {
  // Dividend subtypes
  DRIP: 'DRIP',
  QUALIFIED: 'QUALIFIED',
  ORDINARY: 'ORDINARY',
  RETURN_OF_CAPITAL: 'RETURN_OF_CAPITAL',
  DIVIDEND_IN_KIND: 'DIVIDEND_IN_KIND',

  // Interest subtypes
  STAKING_REWARD: 'STAKING_REWARD',
  LENDING_INTEREST: 'LENDING_INTEREST',
  COUPON: 'COUPON',

  // Split subtypes
  REVERSE_SPLIT: 'REVERSE_SPLIT',

  // Option subtypes
  OPTION_OPEN: 'OPTION_OPEN',
  OPTION_CLOSE: 'OPTION_CLOSE',
  OPTION_EXPIRE: 'OPTION_EXPIRE',
  OPTION_ASSIGNMENT: 'OPTION_ASSIGNMENT',
  OPTION_EXERCISE: 'OPTION_EXERCISE',

  // Fee subtypes
  MANAGEMENT_FEE: 'MANAGEMENT_FEE',
  ADR_FEE: 'ADR_FEE',
  INTEREST_CHARGE: 'INTEREST_CHARGE',

  // Tax subtypes
  WITHHOLDING: 'WITHHOLDING',
  NRA_WITHHOLDING: 'NRA_WITHHOLDING',

  // Credit subtypes
  FEE_REFUND: 'FEE_REFUND',
  TAX_REFUND: 'TAX_REFUND',
  BONUS: 'BONUS',
  ADJUSTMENT: 'ADJUSTMENT',
  REBATE: 'REBATE',
  REVERSAL: 'REVERSAL',

  // Liability subtypes
  LIABILITY_INTEREST_ACCRUAL: 'LIABILITY_INTEREST_ACCRUAL',
  LIABILITY_PRINCIPAL_PAYMENT: 'LIABILITY_PRINCIPAL_PAYMENT',
} as const;

export type ActivitySubtype = (typeof ACTIVITY_SUBTYPES)[keyof typeof ACTIVITY_SUBTYPES];

// Asset kinds for behavior classification
export const ASSET_KINDS = [
  'SECURITY',
  'CRYPTO',
  'CASH',
  'FX_RATE',
  'OPTION',
  'COMMODITY',
  'PRIVATE_EQUITY',
  'PROPERTY',
  'VEHICLE',
  'LIABILITY',
  'OTHER',
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export const DataSource = {
  YAHOO: 'YAHOO',
  MANUAL: 'MANUAL',
} as const;

export type DataSource = (typeof DataSource)[keyof typeof DataSource];

export const AccountType = {
  SECURITIES: 'SECURITIES',
  CASH: 'CASH',
  CRYPTOCURRENCY: 'CRYPTOCURRENCY',
} as const;

export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const HoldingType = {
  CASH: 'cash',
  SECURITY: 'security',
} as const;

export type HoldingType = (typeof HoldingType)[keyof typeof HoldingType];

export type ImportRequiredField = 'symbol' | 'quantity' | 'price' | 'date' | 'type';

// Core data types
export interface Account {
  id: string;
  name: string;
  accountType: AccountType;
  group?: string;
  balance: number;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  platformId?: string;
}

/**
 * Activity interface matching the new backend model
 * @deprecated Use the new Activity interface with activityType field
 */
export interface ActivityLegacy {
  id: string;
  type: ActivityType;
  date: Date | string;
  quantity: number;
  unitPrice: number;
  currency: string;
  fee: number;
  isDraft: boolean;
  comment?: string | null;
  accountId?: string | null;
  createdAt: Date | string;
  symbolProfileId: string;
  updatedAt: Date | string;
  assetDataSource?: DataSource;
}

/**
 * Activity interface matching the new backend model
 */
export interface Activity {
  // Identity
  id: string;
  accountId: string;
  assetId?: string; // NOW OPTIONAL for pure cash events

  // Classification
  activityType: string; // Canonical type (closed set of 15)
  activityTypeOverride?: string; // User override (never touched by sync)
  sourceType?: string; // Raw provider label (REI, DIV, etc.)
  subtype?: string; // Semantic variation (DRIP, STAKING_REWARD, etc.)
  status: ActivityStatus;

  // Timing
  activityDate: string; // ISO timestamp (UTC)
  settlementDate?: string;

  // Quantities (strings to preserve decimal precision)
  quantity?: string;
  unitPrice?: string;
  amount?: string;
  fee?: string;
  currency: string;
  fxRate?: string;

  // Metadata
  notes?: string;
  metadata?: Record<string, unknown>;

  // Source identity
  sourceSystem?: string; // SNAPTRADE, PLAID, MANUAL, CSV
  sourceRecordId?: string;
  sourceGroupId?: string;
  idempotencyKey?: string;
  importRunId?: string;

  // Sync flags
  isUserModified: boolean; // User edited; sync protects economics
  needsReview: boolean; // Needs user review (low confidence, etc.)

  // Audit
  createdAt: string;
  updatedAt: string;
}

/**
 * Helper to get effective type (respects user override)
 */
export function getEffectiveType(activity: Activity): string {
  return activity.activityTypeOverride ?? activity.activityType;
}

/**
 * Check if activity has user override
 */
export function hasUserOverride(activity: Activity): boolean {
  return (
    activity.activityTypeOverride !== undefined && activity.activityTypeOverride !== null
  );
}

export interface ActivityDetails {
  id: string;
  activityType: ActivityType;
  date: Date;
  quantity: number;
  unitPrice: number;
  amount: number;
  fee: number;
  currency: string;
  isDraft: boolean;
  comment?: string;
  createdAt: Date;
  assetId: string;
  updatedAt: Date;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  assetSymbol: string;
  assetName?: string;
  assetDataSource?: DataSource;
  subRows?: ActivityDetails[];
}

export interface ActivitySearchResponse {
  data: ActivityDetails[];
  meta: {
    totalRowCount: number;
  };
}

export interface ActivityCreate {
  id?: string;
  accountId: string;
  activityType: string;
  activityDate: string | Date;
  assetId?: string;
  assetDataSource?: DataSource;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  currency?: string;
  fee?: number;
  isDraft: boolean;
  comment?: string | null;
}

export interface ActivityUpdate extends ActivityCreate {
  id: string;
}

export interface ActivityBulkMutationRequest {
  creates?: ActivityCreate[];
  updates?: ActivityUpdate[];
  deleteIds?: string[];
}

export interface ActivityBulkMutationError {
  id?: string;
  action: string;
  message: string;
}

export interface ActivityBulkIdentifierMapping {
  tempId?: string | null;
  activityId: string;
}

export interface ActivityBulkMutationResult {
  created: Activity[];
  updated: Activity[];
  deleted: Activity[];
  createdMappings: ActivityBulkIdentifierMapping[];
  errors: ActivityBulkMutationError[];
}

export interface ActivityImport {
  id?: string;
  accountId: string;
  currency?: string;
  activityType: ActivityType;
  date?: Date | string;
  symbol: string;
  amount?: number;
  quantity?: number;
  unitPrice?: number;
  fee?: number;
  accountName?: string;
  symbolName?: string;
  /** Resolved exchange MIC for the symbol (populated during validation) */
  exchangeMic?: string;
  errors?: Record<string, string[]>;
  isValid: boolean;
  lineNumber?: number;
  isDraft: boolean;
  comment?: string;
}

export interface ImportMappingData {
  accountId: string;
  fieldMappings: Record<string, string>;
  activityMappings: Record<string, string[]>;
  symbolMappings: Record<string, string>;
  accountMappings: Record<string, string>;
}

export interface AssetProfile {
  id: string;
  isin: string | null;
  name: string | null;
  assetType: string | null;
  symbol: string;
  symbolMapping: string | null;
  assetClass: string | null;
  assetSubClass: string | null;
  notes: string | null;
  countries: string | null;
  categories: string | null;
  classes: string | null;
  attributes: string | null;
  createdAt: Date;
  currency: string;
  dataSource: string;
  updatedAt: Date;
  sectors: string | null;
  url: string | null;
}

export interface SymbolSearchResult {
  exchange: string;
  /** Canonical exchange MIC code (e.g., "XNAS", "XTSE") */
  exchangeMic?: string;
  /** Friendly exchange name (e.g., "NASDAQ" instead of "NMS" or "XNAS") */
  exchangeName?: string;
  /** Currency derived from exchange (e.g., "USD", "CAD") */
  currency?: string;
  shortName: string;
  quoteType: string;
  symbol: string;
  index: string;
  score: number;
  typeDisplay: string;
  longName: string;
  sector?: string;
  industry?: string;
  dataSource?: string;
  /** True if this asset already exists in user's database */
  isExisting?: boolean;
  /** The existing asset ID if found (e.g., "SEC:AAPL:XNAS") */
  existingAssetId?: string;
}

export interface MarketDataProviderInfo {
  id: string;
  name: string;
  logoFilename: string;
  lastSyncedDate: string | null;
}

export interface MarketData {
  createdAt: Date;
  dataSource: string;
  date: Date;
  id: string;
  marketPrice: number;
  state: 'CLOSE';
  symbol: string;
  symbolProfileId: string;
}

export interface Tag {
  id: string;
  name: string;
  activityId: string | null;
}

export interface ImportValidationResult {
  activities: ActivityImport[];
  validationSummary: {
    totalRows: number;
    validCount: number;
    invalidCount: number;
  };
}

export type ValidationResult =
  | { status: 'success' }
  | { status: 'error'; errors: string[] };

// Holding types
export interface Sector {
  name: string;
  weight: number;
}

export interface Country {
  name: string;
  weight: number;
}

export interface Instrument {
  id: string;
  symbol: string;
  name?: string | null;
  currency: string;
  notes?: string | null;
  dataSource?: string | null;
  assetClass?: string | null;
  assetSubclass?: string | null;
  countries?: Country[] | null;
  sectors?: Sector[] | null;
}

export interface MonetaryValue {
  local: number;
  base: number;
}

export interface Lot {
  id: string;
  positionId: string;
  acquisitionDate: string;
  quantity: number;
  costBasis: number;
  acquisitionPrice: number;
  acquisitionFees: number;
}

export interface Position {
  id: string;
  accountId: string;
  assetId: string;
  quantity: number;
  averageCost: number;
  totalCostBasis: number;
  currency: string;
  inceptionDate: string;
  lots: Lot[];
}

export interface CashHolding {
  id: string;
  accountId: string;
  currency: string;
  amount: number;
  lastUpdated: string;
}

export interface Holding {
  id: string;
  holdingType: HoldingType;
  accountId: string;
  instrument?: Instrument | null;
  quantity: number;
  openDate?: string | Date | null;
  lots?: Lot[] | null;
  localCurrency: string;
  baseCurrency: string;
  fxRate?: number | null;
  marketValue: MonetaryValue;
  costBasis?: MonetaryValue | null;
  price?: number | null;
  unrealizedGain?: MonetaryValue | null;
  unrealizedGainPct?: number | null;
  realizedGain?: MonetaryValue | null;
  realizedGainPct?: number | null;
  totalGain?: MonetaryValue | null;
  totalGainPct?: number | null;
  dayChange?: MonetaryValue | null;
  dayChangePct?: number | null;
  prevCloseValue?: MonetaryValue | null;
  weight: number;
  asOfDate: string;
}

export interface Asset {
  id: string;
  symbol: string;
  name?: string | null;

  // Behavior classification
  kind?: AssetKind;

  // Provider/market taxonomy
  assetType?: string | null;
  assetClass?: string | null;
  assetSubClass?: string | null;

  // Identifiers
  isin?: string | null;
  currency: string;

  // Pricing
  dataSource: string;
  quoteSymbol?: string | null;

  // Legacy fields for backward compatibility
  symbolMapping?: string | null;
  notes?: string | null;
  countries?: string | null;
  categories?: string | null;
  classes?: string | null;
  attributes?: string | null;
  sectors?: string | null;
  url?: string | null;

  // Status
  isActive?: boolean;

  // Extensions
  metadata?: Record<string, unknown>;

  // Audit
  createdAt: string;
  updatedAt: string;
}

export interface Quote {
  id: string;
  createdAt: string;
  dataSource: string;
  timestamp: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  volume: number;
  close: number;
  adjclose: number;
  currency: string;
}

export interface QuoteUpdate {
  timestamp: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  volume: number;
  close: number;
  dataSource: string;
}

export interface Settings {
  theme: string;
  font: string;
  baseCurrency: string;
  onboardingCompleted: boolean;
  autoUpdateCheckEnabled: boolean;
}

export interface SettingsContextType {
  settings: Settings | null;
  isLoading: boolean;
  isError: boolean;
  updateBaseCurrency: (currency: Settings['baseCurrency']) => Promise<void>;
  accountsGrouped: boolean;
  setAccountsGrouped: (value: boolean) => void;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  targetAmount: number;
  isAchieved?: boolean;
  allocations?: GoalAllocation[];
}

export interface GoalAllocation {
  id: string;
  goalId: string;
  accountId: string;
  percentAllocation: number;
}

export interface GoalProgress {
  name: string;
  targetValue: number;
  currentValue: number;
  progress: number;
  currency: string;
}

export interface IncomeSummary {
  period: string;
  byMonth: Record<string, number>;
  byType: Record<string, number>;
  bySymbol: Record<string, number>;
  byCurrency: Record<string, number>;
  totalIncome: number;
  currency: string;
  monthlyAverage: number;
  yoyGrowth: number | null;
}

export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export type TimePeriod = '1D' | '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'ALL';

export interface AccountValuation {
  id: string;
  accountId: string;
  valuationDate: string;
  accountCurrency: string;
  baseCurrency: string;
  fxRateToBase: number;
  cashBalance: number;
  investmentMarketValue: number;
  totalValue: number;
  costBasis: number;
  netContribution: number;
  calculatedAt: string;
}

export interface AccountSummaryView {
  accountId: string;
  accountName: string;
  accountType: string;
  accountGroup: string | null;
  accountCurrency: string;
  totalValueAccountCurrency: number;
  totalValueBaseCurrency: number;
  baseCurrency: string;
  performance: SimplePerformanceMetrics;
}

export interface SimplePerformanceMetrics {
  accountId: string;
  totalValue?: number | null;
  accountCurrency?: string | null;
  baseCurrency?: string | null;
  fxRateToBase?: number | null;
  totalGainLossAmount?: number | null;
  cumulativeReturnPercent?: number | null;
  dayGainLossAmount?: number | null;
  dayReturnPercentModDietz?: number | null;
  portfolioWeight?: number | null;
}

export interface AccountGroup {
  groupName: string;
  accounts: AccountSummaryView[];
  totalValueBaseCurrency: number;
  baseCurrency: string;
  performance: SimplePerformanceMetrics;
  accountCount: number;
}

export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  fromCurrencyName?: string;
  toCurrencyName?: string;
  rate: number;
  source: string;
  isLoading?: boolean;
  timestamp: string;
}

export interface ContributionLimit {
  id: string;
  groupName: string;
  contributionYear: number;
  limitAmount: number;
  accountIds?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type NewContributionLimit = Omit<
  ContributionLimit,
  'id' | 'createdAt' | 'updatedAt'
>;

export interface AccountDeposit {
  amount: number;
  currency: string;
  convertedAmount: number;
}

export interface DepositsCalculation {
  total: number;
  baseCurrency: string;
  byAccount: Record<string, AccountDeposit>;
}

export const ACTIVITY_TYPE_PREFIX_LENGTH = 12;

export interface ReturnData {
  date: string;
  value: number;
}

export interface PerformanceMetrics {
  id: string;
  returns: ReturnData[];
  periodStartDate?: string | null;
  periodEndDate?: string | null;
  currency: string;
  /** Period gain in dollars (SOTA: change in unrealized P&L for HOLDINGS mode) */
  periodGain: number;
  /** Period return percentage (SOTA formula for HOLDINGS mode) */
  periodReturn: number;
  /** Time-weighted return (null for HOLDINGS mode - requires cash flow tracking) */
  cumulativeTwr?: number | null;
  /** Legacy field for backward compatibility */
  gainLossAmount?: number | null;
  /** Annualized TWR (null for HOLDINGS mode) */
  annualizedTwr?: number | null;
  simpleReturn: number;
  annualizedSimpleReturn: number;
  /** Money-weighted return (null for HOLDINGS mode - requires cash flow tracking) */
  cumulativeMwr?: number | null;
  /** Annualized MWR (null for HOLDINGS mode) */
  annualizedMwr?: number | null;
  volatility: number;
  maxDrawdown: number;
  /** Indicates if this is a HOLDINGS mode account (no cash flow tracking) */
  isHoldingsMode?: boolean;
}

export interface UpdateAssetProfile {
  symbol: string;
  symbolMapping?: string | null;
  name?: string;
  sectors: string;
  countries: string;
  notes: string;
  assetClass: string;
  assetSubClass: string;
}

export interface TrackedItem {
  id: string;
  type: 'account' | 'symbol';
  name: string;
}

// ============================================================================
// Import Run Types
// ============================================================================

export type ImportRunType = 'SYNC' | 'IMPORT';
export type ImportRunMode = 'INITIAL' | 'INCREMENTAL' | 'BACKFILL' | 'REPAIR';
export type ImportRunStatus =
  | 'RUNNING'
  | 'APPLIED'
  | 'NEEDS_REVIEW'
  | 'FAILED'
  | 'CANCELLED';
export type ReviewMode = 'NEVER' | 'ALWAYS' | 'IF_WARNINGS';

export interface ImportRunSummary {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
  warnings: number;
  errors: number;
  removed: number;
}

export interface ImportRun {
  id: string;
  accountId: string;
  sourceSystem: string;
  runType: ImportRunType;
  mode: ImportRunMode;
  status: ImportRunStatus;
  startedAt: string;
  finishedAt?: string;
  reviewMode: ReviewMode;
  appliedAt?: string;
  checkpointIn?: Record<string, unknown>;
  checkpointOut?: Record<string, unknown>;
  summary?: ImportRunSummary;
  warnings?: string[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Sync State Types
// ============================================================================

export type SyncStatus = 'IDLE' | 'RUNNING' | 'NEEDS_REVIEW' | 'FAILED';

export interface BrokerSyncState {
  accountId: string;
  provider: string;
  checkpointJson?: Record<string, unknown>;
  lastAttemptedAt?: string;
  lastSuccessfulAt?: string;
  lastError?: string;
  lastRunId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
