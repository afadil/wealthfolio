import type { AddonContext as Base, SidebarItemHandle } from '@wealthfolio/addon-sdk';
import type { EventCallback, UnlistenFn } from '@/adapters';
import type {
  Holding,
  Activity,
  Account,
  ActivityDetails,
  ActivityCreate,
  ActivityUpdate,
  ActivityImport,
  ActivitySearchResponse,
  ExchangeRate,
  ContributionLimit,
  NewContributionLimit,
  DepositsCalculation,
  Goal,
  GoalAllocation,
  AssetData,
  QuoteSummary,
  Asset,
  Quote,
  UpdateAssetProfile,
  MarketDataProviderInfo,
  IncomeSummary,
  AccountValuation,
  PerformanceMetrics,
  SimplePerformanceMetrics,
  Settings,
  ImportMappingData,
} from '@/lib/types';
import React from 'react';


// Import all command functions
import { getHoldings } from '@/commands/portfolio';
import { getActivities } from '@/commands/activity';
import { getAccounts } from '@/commands/account';
import {
  getExchangeRates,
  updateExchangeRate,
  addExchangeRate,
  deleteExchangeRate,
} from '@/commands/exchange-rates';
import {
  getContributionLimit,
  createContributionLimit,
  updateContributionLimit,
  deleteContributionLimit,
  calculateDepositsForLimit,
} from '@/commands/contribution-limits';
import {
  getGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  updateGoalsAllocations,
  getGoalsAllocation,
} from '@/commands/goal';
import {
  searchTicker,
  syncHistoryQuotes,
  getAssetData,
  updateAssetProfile,
  updateAssetDataSource,
  updateQuote,
  syncMarketData,
  deleteQuote,
  getQuoteHistory,
  getMarketDataProviders,
} from '@/commands/market-data';
import {
  updatePortfolio,
  recalculatePortfolio,
  getIncomeSummary,
  getHistoricalValuations,
  calculatePerformanceHistory,
  calculatePerformanceSummary,
  calculateAccountsSimplePerformance,
  getHolding,
} from '@/commands/portfolio';
import {
  getSettings,
  updateSettings,
  backupDatabase,
} from '@/commands/settings';
import {
  createAccount,
  updateAccount,
  deleteAccount,
} from '@/commands/account';
import {
  searchActivities,
  createActivity,
  updateActivity,
  saveActivities,
  deleteActivity,
} from '@/commands/activity';
import {
  openCsvFileDialog,
  openFileSaveDialog,
} from '@/commands/file';
import {
  listenImportFileDropHover,
  listenImportFileDrop,
  listenImportFileDropCancelled,
} from '@/commands/import-listener';
import {
  listenPortfolioUpdateStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenMarketSyncStart,
  listenMarketSyncComplete,
} from '@/commands/portfolio-listener';
import {
  importActivities,
  checkActivitiesImport,
  getAccountImportMapping,
  saveAccountImportMapping,
} from '@/commands/activity-import';

// Store for dynamically added navigation items
const dynamicNavItems = new Map<string, any>();
const disableCallbacks = new Set<() => void>();

// Store for dynamically added routes
const dynamicRoutes = new Map<string, React.LazyExoticComponent<React.ComponentType<any>>>();

// Navigation update listeners
const navigationUpdateListeners = new Set<() => void>();

// Function to notify navigation update listeners
function notifyNavigationUpdate() {
  navigationUpdateListeners.forEach(listener => listener());
}

// Public API for getting dynamic navigation items
export function getDynamicNavItems() {
  return Array.from(dynamicNavItems.values()).sort((a, b) => a.order - b.order);
}

// Public API for getting dynamic routes
export function getDynamicRoutes() {
  return Array.from(dynamicRoutes.entries()).map(([path, component]) => ({
    path,
    component
  }));
}

// Public API for subscribing to navigation updates
export function subscribeToNavigationUpdates(callback: () => void) {
  navigationUpdateListeners.add(callback);
  return () => navigationUpdateListeners.delete(callback);
}

// Public API for triggering all disable callbacks
export function triggerAllDisableCallbacks() {
  disableCallbacks.forEach(cb => {
    try {
      cb();
    } catch (error) {
      console.error('Error in addon disable callback:', error);
    }
  });
  disableCallbacks.clear();
  dynamicNavItems.clear();
  dynamicRoutes.clear();
  notifyNavigationUpdate();
}

export interface HostAPI {
  // Core data access
  holdings(accountId: string): Promise<Holding[]>;
  activities(accountId?: string): Promise<ActivityDetails[]>;
  accounts(): Promise<Account[]>;

  // Exchange rates
  getExchangeRates(): Promise<ExchangeRate[]>;
  updateExchangeRate(updatedRate: ExchangeRate): Promise<ExchangeRate>;
  addExchangeRate(newRate: Omit<ExchangeRate, 'id'>): Promise<ExchangeRate>;
  deleteExchangeRate(rateId: string): Promise<void>;

  // Contribution limits
  getContributionLimit(): Promise<ContributionLimit[]>;
  createContributionLimit(newLimit: NewContributionLimit): Promise<ContributionLimit>;
  updateContributionLimit(id: string, updatedLimit: NewContributionLimit): Promise<ContributionLimit>;
  deleteContributionLimit(id: string): Promise<void>;
  calculateDepositsForLimit(limitId: string): Promise<DepositsCalculation>;

  // Goals
  getGoals(): Promise<Goal[]>;
  createGoal(goal: any): Promise<Goal>;
  updateGoal(goal: Goal): Promise<Goal>;
  deleteGoal(goalId: string): Promise<void>;
  updateGoalsAllocations(allocations: GoalAllocation[]): Promise<void>;
  getGoalsAllocation(): Promise<GoalAllocation[]>;

  // Market data
  searchTicker(query: string): Promise<QuoteSummary[]>;
  syncHistoryQuotes(): Promise<void>;
  getAssetData(assetId: string): Promise<AssetData>;
  updateAssetProfile(payload: UpdateAssetProfile): Promise<Asset>;
  updateAssetDataSource(symbol: string, dataSource: string): Promise<Asset>;
  updateQuote(symbol: string, quote: Quote): Promise<void>;
  syncMarketData(symbols: string[], refetchAll: boolean): Promise<void>;
  deleteQuote(id: string): Promise<void>;
  getQuoteHistory(symbol: string): Promise<Quote[]>;
  getMarketDataProviders(): Promise<MarketDataProviderInfo[]>;

  // Portfolio
  updatePortfolio(): Promise<void>;
  recalculatePortfolio(): Promise<void>;
  getIncomeSummary(): Promise<IncomeSummary[]>;
  getHistoricalValuations(accountId?: string, startDate?: string, endDate?: string): Promise<AccountValuation[]>;
  calculatePerformanceHistory(itemType: 'account' | 'symbol', itemId: string, startDate: string, endDate: string): Promise<PerformanceMetrics>;
  calculatePerformanceSummary(args: { itemType: 'account' | 'symbol'; itemId: string; startDate?: string | null; endDate?: string | null; }): Promise<PerformanceMetrics>;
  calculateAccountsSimplePerformance(accountIds: string[]): Promise<SimplePerformanceMetrics[]>;
  getHolding(accountId: string, assetId: string): Promise<Holding | null>;

  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(settingsUpdate: Settings): Promise<Settings>;
  backupDatabase(): Promise<{ filename: string; data: Uint8Array }>;

  // Account management
  createAccount(account: any): Promise<Account>;
  updateAccount(account: any): Promise<Account>;
  deleteAccount(accountId: string): Promise<void>;

  // Activity management
  searchActivities(page: number, pageSize: number, filters: any, searchKeyword: string, sort: any): Promise<ActivitySearchResponse>;
  createActivity(activity: ActivityCreate): Promise<Activity>;
  updateActivity(activity: ActivityUpdate): Promise<Activity>;
  saveActivities(activities: ActivityUpdate[]): Promise<Activity[]>;
  deleteActivity(activityId: string): Promise<Activity>;

  // File operations
  openCsvFileDialog(): Promise<null | string | string[]>;
  openFileSaveDialog(fileContent: Uint8Array | Blob | string, fileName: string): Promise<any>;

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
  checkActivitiesImport(params: { account_id: string; activities: ActivityImport[] }): Promise<ActivityImport[]>;
  getAccountImportMapping(accountId: string): Promise<ImportMappingData>;
  saveAccountImportMapping(mapping: ImportMappingData): Promise<ImportMappingData>;
}

export const realCtx: Base & { api: HostAPI } = {
  sidebar: {
    addItem: (cfg: {
      id: string;
      label: string;
      icon?: React.ReactNode;
      route?: string;
      order?: number;
      onClick?: () => void;
    }): SidebarItemHandle => {
      // Create navigation item
      const navItem = {
        icon: cfg.icon || '<Icons.Circle className="h-5 w-5" />',
        title: cfg.label,
        href: cfg.route || '#',
        onClick: cfg.onClick,
        order: cfg.order || 999,
        id: cfg.id,
      };

      // Store the navigation item
      dynamicNavItems.set(cfg.id, navItem);

      // Notify listeners that navigation has changed
      notifyNavigationUpdate();

      return {
        remove: () => {
          dynamicNavItems.delete(cfg.id);
          notifyNavigationUpdate();
        }
      };
    }
  },
  router: {
    add: (r: {
      path: string;
      component: React.LazyExoticComponent<React.ComponentType<any>>;
    }): void => {

      // Store the route component
      dynamicRoutes.set(r.path, r.component);

      // Notify listeners that routes have changed
      notifyNavigationUpdate();
    }
  },
  onDisable: (cb: () => void): void => {
    disableCallbacks.add(cb);
  },
  api: {
    // Core data access
    holdings: getHoldings,
    activities: getActivities,
    accounts: getAccounts,

    // Exchange rates
    getExchangeRates,
    updateExchangeRate,
    addExchangeRate,
    deleteExchangeRate,

    // Contribution limits
    getContributionLimit,
    createContributionLimit,
    updateContributionLimit,
    deleteContributionLimit,
    calculateDepositsForLimit,

    // Goals
    getGoals,
    createGoal,
    updateGoal,
    deleteGoal,
    updateGoalsAllocations,
    getGoalsAllocation,

    // Market data
    searchTicker,
    syncHistoryQuotes,
    getAssetData,
    updateAssetProfile,
    updateAssetDataSource,
    updateQuote,
    syncMarketData,
    deleteQuote,
    getQuoteHistory,
    getMarketDataProviders,

    // Portfolio
    updatePortfolio,
    recalculatePortfolio,
    getIncomeSummary,
    getHistoricalValuations,
    calculatePerformanceHistory,
    calculatePerformanceSummary,
    calculateAccountsSimplePerformance,
    getHolding,

    // Settings
    getSettings,
    updateSettings,
    backupDatabase,

    // Account management
    createAccount,
    updateAccount,
    deleteAccount,

    // Activity management
    searchActivities,
    createActivity,
    updateActivity,
    saveActivities,
    deleteActivity,

    // File operations
    openCsvFileDialog,
    openFileSaveDialog,

    // Event listeners - Import
    listenImportFileDropHover,
    listenImportFileDrop,
    listenImportFileDropCancelled,

    // Event listeners - Portfolio
    listenPortfolioUpdateStart,
    listenPortfolioUpdateComplete,
    listenPortfolioUpdateError,
    listenMarketSyncStart,
    listenMarketSyncComplete,

    // Activity import
    importActivities,
    checkActivitiesImport,
    getAccountImportMapping,
    saveAccountImportMapping,
  },
};

globalThis.__WF_CTX__ = realCtx; 