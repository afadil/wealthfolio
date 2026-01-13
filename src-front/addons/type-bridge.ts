/**
 * Type utilities for bridging between main app and addon SDK types
 * These utilities help convert between the main app's internal types and the SDK's public types
 */

import type { EventCallback, UnlistenFn } from "@/adapters";
import type {
  Account,
  AccountValuation,
  Activity,
  ActivityBulkMutationRequest,
  ActivityBulkMutationResult,
  ActivityCreate,
  ActivityDetails,
  ActivityImport,
  ActivitySearchResponse,
  ActivityUpdate,
  Asset,
  ContributionLimit,
  DepositsCalculation,
  ExchangeRate,
  Goal,
  GoalAllocation,
  Holding,
  ImportMappingData,
  IncomeSummary,
  MarketDataProviderInfo,
  NewContributionLimit,
  PerformanceMetrics,
  Quote,
  QuoteSummary,
  Settings,
  SimplePerformanceMetrics,
  UpdateAssetProfile,
} from "@/lib/types";
import type { HostAPI as SDKHostAPI } from "@wealthfolio/addon-sdk";

/**
 * Internal HostAPI interface that matches the actual command function signatures
 * This allows us to maintain type safety internally while providing a clean SDK interface
 */
export interface InternalHostAPI {
  // Core data access
  getHoldings(accountId: string): Promise<Holding[]>;
  getActivities(accountId?: string): Promise<ActivityDetails[]>;
  getAccounts(): Promise<Account[]>;

  // Exchange rates
  getExchangeRates(): Promise<ExchangeRate[]>;
  updateExchangeRate(updatedRate: ExchangeRate): Promise<ExchangeRate>;
  addExchangeRate(newRate: Omit<ExchangeRate, "id">): Promise<ExchangeRate>;

  // Contribution limits
  getContributionLimit(): Promise<ContributionLimit[]>;
  createContributionLimit(newLimit: NewContributionLimit): Promise<ContributionLimit>;
  updateContributionLimit(
    id: string,
    updatedLimit: NewContributionLimit,
  ): Promise<ContributionLimit>;
  calculateDepositsForLimit(limitId: string): Promise<DepositsCalculation>;

  // Goals
  getGoals(): Promise<Goal[]>;
  createGoal(goal: unknown): Promise<Goal>;
  updateGoal(goal: Goal): Promise<Goal>;
  updateGoalsAllocations(allocations: GoalAllocation[]): Promise<void>;
  getGoalsAllocation(): Promise<GoalAllocation[]>;

  // Market data
  searchTicker(query: string): Promise<QuoteSummary[]>;
  syncHistoryQuotes(): Promise<void>;
  getAssetProfile(assetId: string): Promise<Asset>;
  updateAssetProfile(payload: UpdateAssetProfile): Promise<Asset>;
  updatePricingMode(assetId: string, pricingMode: string): Promise<Asset>;
  updateQuote(symbol: string, quote: Quote): Promise<void>;
  syncMarketData(symbols: string[], refetchAll: boolean): Promise<void>;
  getQuoteHistory(symbol: string): Promise<Quote[]>;
  getMarketDataProviders(): Promise<MarketDataProviderInfo[]>;

  // Portfolio
  updatePortfolio(): Promise<void>;
  recalculatePortfolio(): Promise<void>;
  getIncomeSummary(): Promise<IncomeSummary[]>;
  getHistoricalValuations(
    accountId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AccountValuation[]>;
  getLatestValuations(accountIds: string[]): Promise<AccountValuation[]>;
  calculatePerformanceHistory(
    itemType: "account" | "symbol",
    itemId: string,
    startDate: string,
    endDate: string,
  ): Promise<PerformanceMetrics>;
  calculatePerformanceSummary(args: {
    itemType: "account" | "symbol";
    itemId: string;
    startDate?: string | null;
    endDate?: string | null;
  }): Promise<PerformanceMetrics>;
  calculateAccountsSimplePerformance(accountIds: string[]): Promise<SimplePerformanceMetrics[]>;
  getHolding(accountId: string, assetId: string): Promise<Holding | null>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(settingsUpdate: Settings): Promise<Settings>;
  backupDatabase(): Promise<{ filename: string; data: Uint8Array }>;

  // Account management
  createAccount(account: unknown): Promise<Account>;
  updateAccount(account: unknown): Promise<Account>;

  // Activity management
  searchActivities(
    page: number,
    pageSize: number,
    filters: { accountIds?: string | string[]; activityTypes?: string | string[]; symbol?: string },
    searchKeyword: string,
    sort?: { id: string; desc?: boolean },
  ): Promise<ActivitySearchResponse>;
  createActivity(activity: ActivityCreate): Promise<Activity>;
  updateActivity(activity: ActivityUpdate): Promise<Activity>;
  saveActivities(request: ActivityBulkMutationRequest): Promise<ActivityBulkMutationResult>;

  // File operations
  openCsvFileDialog(): Promise<null | string | string[]>;
  openFileSaveDialog(fileContent: Uint8Array | Blob | string, fileName: string): Promise<unknown>;

  // Event listeners - Import
  listenImportFileDropHover<T>(handler: EventCallback<T>): Promise<UnlistenFn>;
  listenImportFileDrop<T>(handler: EventCallback<T>): Promise<UnlistenFn>;
  listenImportFileDropCancelled<T>(handler: EventCallback<T>): Promise<UnlistenFn>;

  // Event listeners - Portfolio
  listenPortfolioUpdateStart<T>(handler: EventCallback<T>): Promise<UnlistenFn>;
  listenPortfolioUpdateComplete<T>(handler: EventCallback<T>): Promise<UnlistenFn>;
  listenPortfolioUpdateError<T>(handler: EventCallback<T>): Promise<UnlistenFn>;
  listenMarketSyncStart<T>(handler: EventCallback<T>): Promise<UnlistenFn>;
  listenMarketSyncComplete<T>(handler: EventCallback<T>): Promise<UnlistenFn>;

  // Activity import
  importActivities(params: { activities: ActivityImport[] }): Promise<ActivityImport[]>;
  checkActivitiesImport(params: {
    account_id: string;
    activities: ActivityImport[];
  }): Promise<ActivityImport[]>;
  getAccountImportMapping(accountId: string): Promise<ImportMappingData>;
  saveAccountImportMapping(mapping: ImportMappingData): Promise<ImportMappingData>;

  // Logger functions (internal - these are the raw logger functions)
  logError(message: string): void;
  logInfo(message: string): void;
  logWarn(message: string): void;
  logTrace(message: string): void;
  logDebug(message: string): void;

  // Navigation functions
  navigateToRoute(route: string): Promise<void>;

  // Query functions
  getQueryClient(): unknown;
  invalidateQueries(queryKey: string | string[]): void;
  refetchQueries(queryKey: string | string[]): void;
}

/**
 * Type bridge utility to convert between internal and SDK types
 * This handles the mapping between the actual implementation types and the public SDK types
 */
export function createSDKHostAPIBridge(internalAPI: InternalHostAPI, addonId?: string): SDKHostAPI {
  // Create logger with addon prefix
  const createAddonLogger = (prefix: string) => ({
    error: (message: string) => internalAPI.logError(`[${prefix}] ${message}`),
    info: (message: string) => internalAPI.logInfo(`[${prefix}] ${message}`),
    warn: (message: string) => internalAPI.logWarn(`[${prefix}] ${message}`),
    trace: (message: string) => internalAPI.logTrace(`[${prefix}] ${message}`),
    debug: (message: string) => internalAPI.logDebug(`[${prefix}] ${message}`),
  });

  return {
    accounts: {
      getAll: internalAPI.getAccounts,
      create: internalAPI.createAccount,
      update: internalAPI.updateAccount,
    },
    portfolio: {
      getHoldings: internalAPI.getHoldings,
      getHolding: internalAPI.getHolding,
      update: internalAPI.updatePortfolio,
      recalculate: internalAPI.recalculatePortfolio,
      getIncomeSummary: internalAPI.getIncomeSummary,
      getHistoricalValuations: internalAPI.getHistoricalValuations,
      getLatestValuations: internalAPI.getLatestValuations,
    },
    activities: {
      getAll: internalAPI.getActivities,
      search: internalAPI.searchActivities,
      create: internalAPI.createActivity,
      update: internalAPI.updateActivity,
      saveMany: (input: ActivityUpdate[] | ActivityBulkMutationRequest) =>
        Array.isArray(input)
          ? internalAPI.saveActivities({ updates: input })
          : internalAPI.saveActivities(input),
      import: (activities: ActivityImport[]) => internalAPI.importActivities({ activities }),
      checkImport: (accountId: string, activities: ActivityImport[]) =>
        internalAPI.checkActivitiesImport({ account_id: accountId, activities }),
      getImportMapping: internalAPI.getAccountImportMapping,
      saveImportMapping: internalAPI.saveAccountImportMapping,
    },
    market: {
      searchTicker: internalAPI.searchTicker,
      syncHistory: internalAPI.syncHistoryQuotes,
      sync: internalAPI.syncMarketData,
      getProviders: internalAPI.getMarketDataProviders,
    },
    assets: {
      getProfile: internalAPI.getAssetProfile,
      updateProfile: internalAPI.updateAssetProfile,
      updatePricingMode: internalAPI.updatePricingMode,
    },
    quotes: {
      update: internalAPI.updateQuote,
      getHistory: internalAPI.getQuoteHistory,
    },
    performance: {
      calculateHistory: internalAPI.calculatePerformanceHistory,
      calculateSummary: internalAPI.calculatePerformanceSummary,
      calculateAccountsSimple: internalAPI.calculateAccountsSimplePerformance,
    },
    exchangeRates: {
      getAll: internalAPI.getExchangeRates,
      update: internalAPI.updateExchangeRate,
      add: internalAPI.addExchangeRate,
    },
    contributionLimits: {
      getAll: internalAPI.getContributionLimit,
      create: internalAPI.createContributionLimit,
      update: internalAPI.updateContributionLimit,
      calculateDeposits: internalAPI.calculateDepositsForLimit,
    },
    goals: {
      getAll: internalAPI.getGoals,
      create: internalAPI.createGoal,
      update: internalAPI.updateGoal,
      updateAllocations: internalAPI.updateGoalsAllocations,
      getAllocations: internalAPI.getGoalsAllocation,
    },
    settings: {
      get: internalAPI.getSettings,
      update: internalAPI.updateSettings,
      backupDatabase: internalAPI.backupDatabase,
    },
    files: {
      openCsvDialog: internalAPI.openCsvFileDialog,
      openSaveDialog: internalAPI.openFileSaveDialog,
    },

    logger: createAddonLogger(addonId || "unknown-addon"),

    events: {
      import: {
        onDropHover: internalAPI.listenImportFileDropHover,
        onDrop: internalAPI.listenImportFileDrop,
        onDropCancelled: internalAPI.listenImportFileDropCancelled,
      },
      portfolio: {
        onUpdateStart: internalAPI.listenPortfolioUpdateStart,
        onUpdateComplete: internalAPI.listenPortfolioUpdateComplete,
        onUpdateError: internalAPI.listenPortfolioUpdateError,
      },
      market: {
        onSyncStart: internalAPI.listenMarketSyncStart,
        onSyncComplete: internalAPI.listenMarketSyncComplete,
      },
    },

    navigation: {
      navigate: internalAPI.navigateToRoute,
    },

    query: {
      getClient: internalAPI.getQueryClient,
      invalidateQueries: internalAPI.invalidateQueries,
      refetchQueries: internalAPI.refetchQueries,
    },
  } as unknown as SDKHostAPI;
}

/**
 * Type guard to check if a value has SDK-compatible types
 */
export function isSDKCompatible<T>(_value: T): _value is T {
  return true; // For now, we use type assertions. Could add runtime checks if needed.
}

/**
 * Utility to convert internal types to SDK types
 * This can be expanded to handle specific type conversions if needed
 */
export function toSDKType<T>(value: T): T {
  return value;
}

/**
 * Utility to convert SDK types to internal types
 * This can be expanded to handle specific type conversions if needed
 */
export function fromSDKType<T>(value: T): T {
  return value;
}
