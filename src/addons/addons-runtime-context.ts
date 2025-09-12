import type { AddonContext, SidebarItemHandle } from "@wealthfolio/addon-sdk";
import { createSDKHostAPIBridge } from "./type-bridge";
import React from "react";

// Import all command functions
import { getHoldings } from "@/commands/portfolio";
import { getActivities } from "@/commands/activity";
import { getAccounts } from "@/commands/account";
import { getExchangeRates, updateExchangeRate, addExchangeRate } from "@/commands/exchange-rates";
import {
  getContributionLimit,
  createContributionLimit,
  updateContributionLimit,
  calculateDepositsForLimit,
} from "@/commands/contribution-limits";
import {
  getGoals,
  createGoal,
  updateGoal,
  updateGoalsAllocations,
  getGoalsAllocation,
} from "@/commands/goal";
import {
  searchTicker,
  syncHistoryQuotes,
  getAssetProfile,
  updateAssetProfile,
  updateAssetDataSource,
  updateQuote,
  syncMarketData,
  getQuoteHistory,
  getMarketDataProviders,
} from "@/commands/market-data";
import {
  updatePortfolio,
  recalculatePortfolio,
  getIncomeSummary,
  getHistoricalValuations,
  getLatestValuations,
  calculatePerformanceHistory,
  calculatePerformanceSummary,
  calculateAccountsSimplePerformance,
  getHolding,
} from "@/commands/portfolio";
import { getSettings, updateSettings, backupDatabase } from "@/commands/settings";
import { createAccount, updateAccount } from "@/commands/account";
import {
  searchActivities,
  createActivity,
  updateActivity,
  saveActivities,
} from "@/commands/activity";
import { openCsvFileDialog, openFileSaveDialog } from "@/commands/file";
import {
  listenImportFileDropHover,
  listenImportFileDrop,
  listenImportFileDropCancelled,
} from "@/commands/import-listener";
import {
  listenPortfolioUpdateStart,
  listenPortfolioUpdateComplete,
  listenPortfolioUpdateError,
  listenMarketSyncStart,
  listenMarketSyncComplete,
} from "@/commands/portfolio-listener";
import {
  importActivities,
  checkActivitiesImport,
  getAccountImportMapping,
  saveAccountImportMapping,
} from "@/commands/activity-import";
import { setSecret, getSecret, deleteSecret } from "@/commands/secrets";
import { logger } from "@/adapters";

// Store for dynamically added navigation items
const dynamicNavItems = new Map<string, any>();
const disableCallbacks = new Set<() => void>();

// Store for dynamically added routes
const dynamicRoutes = new Map<string, React.LazyExoticComponent<React.ComponentType<any>>>();

// Navigation update listeners
const navigationUpdateListeners = new Set<() => void>();

// Function to notify navigation update listeners
function notifyNavigationUpdate() {
  navigationUpdateListeners.forEach((listener) => listener());
}

// Public API for getting dynamic navigation items
export function getDynamicNavItems() {
  return Array.from(dynamicNavItems.values()).sort((a, b) => a.order - b.order);
}

// Public API for getting dynamic routes
export function getDynamicRoutes() {
  return Array.from(dynamicRoutes.entries()).map(([path, component]) => ({
    path,
    component,
  }));
}

// Public API for subscribing to navigation updates
export function subscribeToNavigationUpdates(callback: () => void) {
  navigationUpdateListeners.add(callback);
  return () => navigationUpdateListeners.delete(callback);
}

// Public API for triggering navigation updates
export function triggerNavigationUpdate() {
  notifyNavigationUpdate();
}

// Public API for triggering all disable callbacks
export function triggerAllDisableCallbacks() {
  disableCallbacks.forEach((cb) => {
    try {
      cb();
    } catch (error) {
      console.error("Error in addon disable callback:", error);
    }
  });
  disableCallbacks.clear();
  dynamicNavItems.clear();
  dynamicRoutes.clear();
  notifyNavigationUpdate();
}

// Create addon-scoped secret functions
function createAddonScopedSecrets(addonId: string) {
  const addonPrefix = `addon_${addonId}_`;

  return {
    set: async (key: string, value: string): Promise<void> => {
      const scopedKey = `${addonPrefix}${key}`;
      return setSecret(scopedKey, value);
    },
    get: async (key: string): Promise<string | null> => {
      const scopedKey = `${addonPrefix}${key}`;
      return getSecret(scopedKey);
    },
    delete: async (key: string): Promise<void> => {
      const scopedKey = `${addonPrefix}${key}`;
      return deleteSecret(scopedKey);
    },
  };
}

// Create context factory function for addon-specific contexts
export function createAddonContext(addonId: string): AddonContext {
  return {
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
          href: cfg.route || "#",
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
          },
        };
      },
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
      },
    },
    onDisable: (cb: () => void): void => {
      disableCallbacks.add(cb);
    },
    api: (() => {
      const baseAPI = createSDKHostAPIBridge(
        {
          // Core data access
          getHoldings: getHoldings,
          getActivities: getActivities,
          getAccounts: getAccounts,

          // Exchange rates
          getExchangeRates,
          updateExchangeRate,
          addExchangeRate,

          // Contribution limits
          getContributionLimit,
          createContributionLimit,
          updateContributionLimit,
          calculateDepositsForLimit,

          // Goals
          getGoals,
          createGoal,
          updateGoal,
          updateGoalsAllocations,
          getGoalsAllocation,

          // Market data
          searchTicker,
          syncHistoryQuotes,
          getAssetProfile,
          updateAssetProfile,
          updateAssetDataSource,
          updateQuote,
          syncMarketData,
          getQuoteHistory,
          getMarketDataProviders,

          // Portfolio
          updatePortfolio,
          recalculatePortfolio,
          getIncomeSummary,
          getHistoricalValuations,
          getLatestValuations,
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

          // Activity management
          searchActivities,
          createActivity,
          updateActivity,
          saveActivities,

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

          // Logger functions
          logError: logger.error,
          logInfo: logger.info,
          logWarn: logger.warn,
          logTrace: logger.trace,
          logDebug: logger.debug,

          // Navigation functions
          navigateToRoute: async (route: string) => {
            // Use the browser's navigation API through React Router
            const navigate = (window as any).__wealthfolio_navigate__;
            if (navigate) {
              navigate(route);
            } else {
              // Fallback: change the URL directly
              window.location.hash = route;
            }
          },

          // Query functions
          getQueryClient: () => {
            return (window as any).__wealthfolio_query_client__;
          },
          invalidateQueries: (queryKey: string | string[]) => {
            const queryClient = (window as any).__wealthfolio_query_client__;
            if (queryClient) {
              queryClient.invalidateQueries({
                queryKey: Array.isArray(queryKey) ? queryKey : [queryKey],
              });
            }
          },
          refetchQueries: (queryKey: string | string[]) => {
            const queryClient = (window as any).__wealthfolio_query_client__;
            if (queryClient) {
              queryClient.refetchQueries({
                queryKey: Array.isArray(queryKey) ? queryKey : [queryKey],
              });
            }
          },
        },
        addonId,
      );

      // Add the secrets API manually
      (baseAPI as any).secrets = createAddonScopedSecrets(addonId);

      return baseAPI;
    })(),
  };
}

// Note: We intentionally do not set a global context to ensure proper secret isolation.
// Each addon receives its own scoped context via the enable(ctx: AddonContext) function parameter.
