import { importActivitySchema, importMappingSchema } from "@/lib/schemas";
import * as z from "zod";
import {
  AccountType,
  ActivityStatus,
  ActivityType,
  ACTIVITY_TYPE_DISPLAY_NAMES,
  AssetKind,
  DataSource,
  HoldingType,
  SUBTYPE_DISPLAY_NAMES,
} from "./constants";

export {
  AccountType,
  ActivityStatus,
  ActivityType,
  ACTIVITY_SUBTYPES,
  ACTIVITY_TYPE_DISPLAY_NAMES,
  ACTIVITY_TYPES,
  ASSET_KINDS,
  DataSource,
  ExportDataType,
  ExportedFileFormat,
  HoldingType,
  ImportFormat,
  SUBTYPE_DISPLAY_NAMES,
} from "./constants";

export type { ActivitySubtype, AssetKind, ImportRequiredField } from "./constants";

export interface Account {
  id: string;
  name: string;
  accountType: AccountType;
  group?: string; // Optional
  balance: number;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  platformId?: string; // Optional - links to platform/broker
  accountNumber?: string; // Optional - account number from broker
  meta?: string; // Optional - additional metadata as JSON string
  provider?: string; // Optional - sync provider (e.g., 'SNAPTRADE', 'PLAID', 'MANUAL')
  providerAccountId?: string; // Optional - account ID in the provider's system
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
  return activity.activityTypeOverride !== undefined && activity.activityTypeOverride !== null;
}

/**
 * Get display name for an activity
 */
export function getActivityDisplayName(activity: Activity): string {
  // Check subtype first (most specific)
  if (activity.subtype && SUBTYPE_DISPLAY_NAMES[activity.subtype]) {
    return SUBTYPE_DISPLAY_NAMES[activity.subtype];
  }
  // Use effective type (respects user override)
  const effectiveType = getEffectiveType(activity);
  return (
    (ACTIVITY_TYPE_DISPLAY_NAMES as Record<string, string>)[effectiveType] || effectiveType
  );
}

export interface ActivityDetails {
  id: string;
  activityType: ActivityType;
  subtype?: string | null;
  status?: ActivityStatus;
  date: Date;
  quantity: number;
  unitPrice: number;
  amount: number;
  fee: number;
  currency: string;
  needsReview: boolean;
  comment?: string;
  fxRate?: number | null;
  createdAt: Date;
  assetId: string;
  updatedAt: Date;
  accountId: string;
  accountName: string;
  accountCurrency: string;
  assetSymbol: string;
  assetName?: string;
  assetDataSource?: DataSource;
  // Sync/source metadata
  sourceSystem?: string;
  sourceRecordId?: string;
  idempotencyKey?: string;
  importRunId?: string;
  isUserModified?: boolean;
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
  comment?: string | null;
  fxRate?: number | null;
}

export type ActivityUpdate = ActivityCreate & { id: string };
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
export type ActivityImport = z.infer<typeof importActivitySchema>;
export type ImportMappingData = z.infer<typeof importMappingSchema>;

// Define a generic type for the parsed row data
export type CsvRowData = Record<string, string> & { lineNumber: string };
export interface CsvRowError {
  /** Type of error that occurred */
  type: string;
  /** Standardized error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Row index where the error occurred (optional) */
  row?: number;
  /** Column/field index where the error occurred (optional) */
  index?: number;
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

export interface QuoteSummary {
  exchange: string;
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
}

export interface MarketDataProviderInfo {
  id: string;
  name: string;
  logoFilename: string;
  lastSyncedDate: string | null; // ISO date string
}

export interface MarketData {
  createdAt: Date;
  dataSource: string;
  date: Date;
  id: string;
  marketPrice: number;
  state: "CLOSE"; // assuming state can only be 'CLOSE', expand this as needed
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

export type ValidationResult = { status: "success" } | { status: "error"; errors: string[] };

// Holding types based on Rust HoldingView model

// Types matching Rust structs from src-core/src/assets/assets_model.rs
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
  acquisitionDate: string; // ISO date string
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
  inceptionDate: string; // ISO date string
  lots: Lot[];
}

export interface CashHolding {
  id: string;
  accountId: string;
  currency: string;
  amount: number;
  lastUpdated: string; // ISO date string
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
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
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
  instanceId: string;
  onboardingCompleted: boolean;
  autoUpdateCheckEnabled: boolean;
  menuBarVisible: boolean;
  syncEnabled: boolean;
}

export interface SettingsContextType {
  settings: Settings | null;
  isLoading: boolean;
  isError: boolean;
  updateBaseCurrency: (currency: Settings["baseCurrency"]) => Promise<void>;
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
  yoyGrowth: number | null; // Changed from optional to nullable
}

// Define custom DateRange type matching react-day-picker's
export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export type TimePeriod = "1D" | "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "5Y" | "ALL";

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

export type NewContributionLimit = Omit<ContributionLimit, "id" | "createdAt" | "updatedAt">;

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

// Renamed from CumulativeReturn to match Rust struct ReturnData
export interface ReturnData {
  date: string; // Changed from CumulativeReturn
  value: number;
}

// Renamed from PerformanceData to match Rust struct
export interface PerformanceMetrics {
  id: string;
  returns: ReturnData[]; // Changed from CumulativeReturn[]
  periodStartDate?: string | null; // Changed from periodStartDate?
  periodEndDate?: string | null; // Changed from periodEndDate?
  currency: string;
  cumulativeTwr: number; // Added field, corresponds to TWR
  gainLossAmount?: number | null; // Made explicitly nullable
  annualizedTwr: number; // Added field, corresponds to TWR
  simpleReturn: number; // Added field
  annualizedSimpleReturn: number; // Added field
  cumulativeMwr: number; // Added field, corresponds to MWR
  annualizedMwr: number; // Added field, corresponds to MWR
  volatility: number;
  maxDrawdown: number;
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

// Rename ComparisonItem to TrackedItem
export interface TrackedItem {
  id: string;
  type: "account" | "symbol";
  name: string;
}

// Addon Store Types
export interface AddonStoreListing {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  downloadUrl: string;
  downloads: number;
  rating: number;
  reviewCount: number;
  status?: "active" | "inactive" | "deprecated" | "coming-soon";
  lastUpdated: string;
  releaseNotes: string;
  changelogUrl: string;
  images: string[];
  /** Classification tags for filtering */
  tags?: string[];
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  notes?: string;
  pubDate?: string;
  isAppStoreBuild: boolean;
  storeUrl?: string;
  changelogUrl?: string;
  screenshots?: string[];
}

// Platform/Broker type
export interface Platform {
  id: string;
  name: string | null;
  url: string;
  externalId: string | null;
}

// ============================================================================
// Import Run Types
// ============================================================================

export type ImportRunType = "SYNC" | "IMPORT";
export type ImportRunMode = "INITIAL" | "INCREMENTAL" | "BACKFILL" | "REPAIR";
export type ImportRunStatus = "RUNNING" | "APPLIED" | "NEEDS_REVIEW" | "FAILED" | "CANCELLED";
export type ReviewMode = "NEVER" | "ALWAYS" | "IF_WARNINGS";

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

export type SyncStatus = "IDLE" | "RUNNING" | "NEEDS_REVIEW" | "FAILED";

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
