/**
 * Comprehensive data types for Wealthfolio addons
 * These types mirror the main application types to ensure compatibility
 */

// Re-export all the constants from the main app - matching the actual values
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
  FEE: 'FEE',
  TAX: 'TAX',
  SPLIT: 'SPLIT',
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

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

export interface Activity {
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

export interface ActivityUpdate extends ActivityCreate {
  id: string;
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

export type ValidationResult = { status: 'success' } | { status: 'error'; errors: string[] };

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
  createdAt: string;
  updatedAt: string;
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
  yoyGrowth: number | null;
}

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
  cumulativeTwr: number;
  gainLossAmount?: number | null;
  annualizedTwr: number;
  simpleReturn: number;
  annualizedSimpleReturn: number;
  cumulativeMwr: number;
  annualizedMwr: number;
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

export type TrackedItem = {
  id: string;
  type: 'account' | 'symbol';
  name: string;
};
