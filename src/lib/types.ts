import * as z from 'zod';
import { importActivitySchema, importMappingSchema } from '@/lib/schemas';
import {
  ActivityType,
  DataSource,
  AccountType,
  HoldingType,
} from './constants';

export {
  ActivityType,
  DataSource,
  AccountType,
  ImportFormat,
  ExportDataType,
  ExportedFileFormat,
  HoldingType,
} from './constants';

export type { ImportRequiredField } from './constants';

export type Account = {
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
  platformId?: string; // Optional
};

export type Activity = {
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
};

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

export type ActivitySearchResponse = {
  data: ActivityDetails[];
  meta: {
    totalRowCount: number;
  };
};

export type ActivityCreate = {
  accountId: string;
  activityType: string;
  activityDate: string | Date;
  assetId?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  currency?: string;
  fee?: number;
  isDraft: boolean;
  comment?: string | null;
}

export type ActivityUpdate = ActivityCreate & { id: string };
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
  dataSource?: boolean;
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
  state: 'CLOSE'; // assuming state can only be 'CLOSE', expand this as needed
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

export type ValidationResult = { status: 'success' } | { status: 'error'; errors: string[] };

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
  isin?: string | null;
  name?: string | null;
  assetType?: string | null;
  symbol: string;
  symbolMapping?: string | null;
  assetClass?: string | null;
  assetSubClass?: string | null;
  notes?: string | null;
  countries?: string | null;
  categories?: string | null;
  classes?: string | null;
  attributes?: string | null;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
  currency: string;
  dataSource: string;
  sectors?: string | null;
  url?: string | null;
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
  yoyGrowth: number | null; // Changed from optional to nullable
}

// Define custom DateRange type matching react-day-picker's
export type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};

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

export type NewContributionLimit = Omit<ContributionLimit, 'id' | 'createdAt' | 'updatedAt'>;

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
  name?: string;
  sectors: string;
  countries: string;
  notes: string;
  assetClass: string;
  assetSubClass: string;
}

// Rename ComparisonItem to TrackedItem
export type TrackedItem = {
  id: string;
  type: 'account' | 'symbol';
  name: string;
};

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
  status?: 'active' | 'inactive' | 'deprecated' | 'coming-soon';
  lastUpdated: string;
  releaseNotes: string;
  changelogUrl: string;
  images: string[];
  /** Classification tags for filtering */
  tags?: string[];
}

