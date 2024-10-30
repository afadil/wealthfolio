import * as z from 'zod';
import { importActivitySchema, importMappingSchema, newActivitySchema } from '@/lib/schemas';

export enum AccountType {
  SECURITIES = 'SECURITIES',
  SAVINGS = 'SAVINGS',
  CHECKING = 'CHECKING',
  // Add more types as needed
}

export enum ActivityType {
  BUY = 'BUY',
  SELL = 'SELL',
  DIVIDEND = 'DIVIDEND',
  INTEREST = 'INTEREST',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  CONVERSION_IN = 'CONVERSION_IN',
  CONVERSION_OUT = 'CONVERSION_OUT',
  FEE = 'FEE',
  TAX = 'TAX',
  SPLIT = 'SPLIT',
}

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
  type: string;
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
  activityType: string;
  date: Date;
  quantity: number;
  unitPrice: number;
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
  assetDataSource?: string;
}

export type ActivitySearchResponse = {
  data: ActivityDetails[];
  meta: {
    totalRowCount: number;
  };
};

export type NewActivity = z.infer<typeof newActivitySchema>;
export type ActivityImport = z.infer<typeof importActivitySchema>;
export type ImportMappingData = z.infer<typeof importMappingSchema>;

export interface AssetProfile {
  id: string;
  isin: string | null;
  name: string | null;
  assetType: string | null;
  symbol: string;
  symbolMapping: string | null;
  assetClass: string | null;
  assetSubClass: string | null;
  comment: string | null;
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

export type ValidationResult = { status: 'success' } | { status: 'error'; errors: string[] };

export interface Holding {
  id: string;
  symbol: string;
  symbolName: string;
  holdingType: string;
  quantity: number;
  currency: string;
  baseCurrency: string;
  marketPrice?: number;
  averageCost?: number;
  marketValue: number;
  bookValue: number;
  marketValueConverted: number;
  bookValueConverted: number;
  portfolioPercent: number;
  performance: {
    totalGainPercent: number;
    totalGainAmount: number;
    totalGainAmountConverted: number;
    dayGainPercent?: number;
    dayGainAmount?: number;
    dayGainAmountConverted?: number;
  };
  account?: {
    id: string;
    name: string;
    type: string;
    group: string;
    currency: string;
  };
  assetClass?: string;
  assetSubClass?: string;
  sectors?: [
    {
      name: string;
      weight: number;
    },
  ];
  countries?: [
    {
      code: string;
      weight: number;
    },
  ];
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
  comment?: string | null;
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
  createdAt: string; // ISO date string
  dataSource: string;
  date: string; // ISO date string
  symbol: string;
  open: number;
  high: number;
  low: number;
  volume: number;
  close: number;
  adjclose: number;
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
}

export type ExportDataType = 'accounts' | 'activities' | 'goals' | 'portfolio-history';

export type ExportedFileFormat = 'CSV' | 'JSON' | 'SQLite';

export interface ContributionLimit {
  id: string;
  groupName: string;
  contributionYear: number;
  limitAmount: number;
  accountIds?: string | null;
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

export enum ImportFormat {
  Date = 'date',
  ActivityType = 'activityType',
  Symbol = 'symbol',
  Quantity = 'quantity',
  UnitPrice = 'unitPrice',
  Amount = 'amount',
  Currency = 'currency',
  Fee = 'fee',
}

// export interface ImportMappingData {
//   accountId: string;
//   fieldMappings: Record<string, string>;
//   activityMappings: Record<string, string[]>;
//   symbolMappings: Record<string, string>;
// }

export const ACTIVITY_TYPE_PREFIX_LENGTH = 12;
