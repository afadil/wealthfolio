export const QueryKeys = {
  // Account related keys
  ACCOUNTS: "accounts",
  ACCOUNTS_SUMMARY: "accounts_summary",

  // Activity related keys
  ACTIVITY_DATA: "activity-data",
  ACTIVITIES: "activities",

  // Portfolio related keys
  HOLDINGS: "holdings",
  HOLDING: "holding",
  INCOME_SUMMARY: "incomeSummary",
  SPENDING_SUMMARY: "spendingSummary",
  PORTFOLIO_SUMMARY: "portfolioSummary",
  QUOTE_HISTORY: "quoteHistory",

  // Goals related keys
  GOALS: "goals",
  GOALS_WITH_CONTRIBUTIONS: "goals_with_contributions",
  ACCOUNT_FREE_CASH: "account_free_cash",

  // Settings related keys
  SETTINGS: "settings",
  EXCHANGE_RATES: "exchangeRates",

  // New keys for exchange rates
  EXCHANGE_RATE_SYMBOLS: "exchange_rate_symbols",
  QUOTE: "quote",

  CONTRIBUTION_LIMITS: "contributionLimits",
  CONTRIBUTION_LIMIT_PROGRESS: "contributionLimitProgress",

  ASSET_DATA: "asset_data",
  ASSETS: "assets",
  LATEST_QUOTES: "latest_quotes",
  IMPORT_MAPPING: "import_mapping",

  PERFORMANCE_SUMMARY: "performanceSummary",
  PERFORMANCE_HISTORY: "performanceHistory",

  HISTORY_VALUATION: "historyValuation",
  // Helper function to create account-specific keys
  valuationHistory: (id: string) => [QueryKeys.HISTORY_VALUATION, id],

  // Account simple performance
  ACCOUNTS_SIMPLE_PERFORMANCE: "accountsSimplePerformance",
  accountsSimplePerformance: (accountIds: string[]) => [
    QueryKeys.ACCOUNTS_SIMPLE_PERFORMANCE,
    [...accountIds].sort().join(",") || "none",
  ],

  // Market Data Providers
  MARKET_DATA_PROVIDERS: "marketDataProviders",
  MARKET_DATA_PROVIDER_SETTINGS: "marketDataProviderSettings",

  transactions: "transactions",
  latestValuations: "latest-valuations",

  // Market Data
  symbolSearch: "symbol-search",

  ASSET_HISTORY: "asset-history",

  // Addons
  INSTALLED_ADDONS: "installedAddons",
  ADDON_STORE_LISTINGS: "addonStoreListings",
  ADDON_AUTO_UPDATE_CHECK: "addonAutoUpdateCheck",

  secrets: {
    apiKey: (providerId: string) => ["secrets", "apiKey", providerId],
  },

  // Categories
  CATEGORIES: "categories",
  CATEGORIES_HIERARCHICAL: "categories_hierarchical",
  EXPENSE_CATEGORIES: "expense_categories",
  INCOME_CATEGORIES: "income_categories",
  CATEGORY_ACTIVITY_COUNTS: "category_activity_counts",

  // Activity Rules
  ACTIVITY_RULES: "activity_rules",
  ACTIVITY_RULES_WITH_NAMES: "activity_rules_with_names",
  // Legacy aliases
  CATEGORY_RULES: "activity_rules",
  CATEGORY_RULES_WITH_NAMES: "activity_rules_with_names",

  // Event Types
  EVENT_TYPES: "event_types",

  // Events
  EVENTS: "events",
  EVENTS_WITH_NAMES: "events_with_names",
  EVENT_ACTIVITY_COUNTS: "event_activity_counts",
  EVENT_SPENDING_SUMMARIES: "event_spending_summaries",

  // Cash Activities
  CASH_ACTIVITIES: "cash_activities",

  // Month Metrics
  MONTH_METRICS: "month_metrics",

  // Budget
  BUDGET_CONFIG: "budget_config",
  BUDGET_SUMMARY: "budget_summary",
  BUDGET_ALLOCATIONS: "budget_allocations",
  BUDGET_VS_ACTUAL: "budget_vs_actual",
} as const;

import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidates all queries that depend on activity data.
 * Call this after any activity create/update/delete mutation.
 */
export const invalidateActivityQueries = (queryClient: QueryClient) => {
  // Core activity queries
  queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITIES] });
  queryClient.invalidateQueries({ queryKey: [QueryKeys.ACTIVITY_DATA] });
  queryClient.invalidateQueries({ queryKey: [QueryKeys.CASH_ACTIVITIES] });

  // Account-related (balances change with activities)
  queryClient.invalidateQueries({ queryKey: [QueryKeys.ACCOUNTS] });

  // Spending & Income summaries
  queryClient.invalidateQueries({ queryKey: [QueryKeys.SPENDING_SUMMARY] });
  queryClient.invalidateQueries({ queryKey: [QueryKeys.INCOME_SUMMARY] });

  // Reports & Metrics
  queryClient.invalidateQueries({ queryKey: [QueryKeys.MONTH_METRICS] });
  queryClient.invalidateQueries({ queryKey: [QueryKeys.EVENT_SPENDING_SUMMARIES] });

  // Portfolio (holdings can change with trading activities)
  queryClient.invalidateQueries({ queryKey: [QueryKeys.HOLDINGS] });
};
