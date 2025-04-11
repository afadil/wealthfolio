import * as z from 'zod';
import { importActivitySchema, importMappingSchema } from '@/lib/schemas';
import {
  ActivityType,
  DataSource,
  AccountType,
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

export interface AssetSummary {
  id: string;
  name?: string | null;
  assetType?: string | null;
  symbol: string;
  assetClass?: string | null;
  assetSubClass?: string | null;
  currency: string;
  countries?: Country[] | null;
  sectors?: Sector[] | null;
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


// Renamed from Performance and updated fields
export interface PerformanceMetrics {
  marketPrice: number;
  marketValue: number;
  totalGainLossAmount: number;
  totalGainLossPercent: number;
  dayGainLossAmount: number;
  dayGainLossPercent: number;
  baseCurrency: string;
  fxRateToBase: number;
}

export interface Holding {
  id: string;
  holdingType: 'security' | 'cash';
  accountId: string;
  assetId: string;
  symbol: string;
  asset?: AssetSummary | null;
  quantity: number;
  averageCostPrice: number;
  totalCostBasis: number;
  currency: string;
  inceptionDate: string;
  performance: PerformanceMetrics;
  allocationPercent: number;
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
  date: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  volume: number;
  close: number;
  adjclose: number;
}

export interface QuoteUpdate {
  date: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  volume: number;
  close: number;
  dataSource: string;
}

export interface AssetData {
  asset: Asset;
  quoteHistory: Quote[];
}

export interface Settings {
  theme: string;
  font: string;
  baseCurrency: string;
}

export interface SettingsContextType {
  settings: Settings | null;
  isLoading: boolean;
  isError: boolean;
  updateSettings: (settings: Settings) => void;
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

export type TimePeriod = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export interface HistorySummary {
  id?: string;
  startDate: string;
  endDate: string;
  entriesCount: number;
}

export interface PortfolioHistory {
  id: string;
  accountId: string;
  date: string;
  totalValue: number;
  marketValue: number;
  bookCost: number;
  availableCash: number;
  netDeposit: number;
  currency: string;
  baseCurrency: string;
  totalGainValue: number;
  totalGainPercentage: number;
  dayGainPercentage: number;
  dayGainValue: number;
  allocationPercentage: number | null;
  exchangeRate: number | null;
  calculatedAt: string;
}

export interface AccountPerformanceMetrics {
  totalGainLossAmount: number | null;
  totalGainLossPercent: number | null;
  dayGainLossAmount: number | null;
  dayGainLossPercent: number | null;
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
  performance: AccountPerformanceMetrics;
}

export interface AccountGroup {
  groupName: string;
  accounts: AccountSummaryView[];
  totalValueBaseCurrency: number;
  baseCurrency: string;
  performance: AccountPerformanceMetrics;
  accountCount: number;
}

export interface AccountSummary {
  account: Account;
  performance: PortfolioHistory;
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

export interface CumulativeReturn {
  date: string;
  value: number;
}

export interface PerformanceData {
  id: string;
  name: string;
  returns: CumulativeReturn[];
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  maxDrawdown: number;
}

// Added based on Rust struct in performance_service.rs
export interface TotalReturn {
  rate: string;
  amount: string;
}

export interface UpdateAssetProfile {
  symbol: string;
  sectors: string;
  countries: string;
  notes: string;
  assetClass: string;
  assetSubClass: string;
}

