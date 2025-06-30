export const QueryKeys = {
  // Account related keys
  ACCOUNTS: 'accounts',
  ACCOUNTS_SUMMARY: 'accounts_summary',

  // Activity related keys
  ACTIVITY_DATA: 'activity-data',
  ACTIVITIES: 'activities',

  // Portfolio related keys
  HOLDINGS: 'holdings',
  HOLDING: 'holding',
  INCOME_SUMMARY: 'incomeSummary',
  PORTFOLIO_SUMMARY: 'portfolioSummary',
  QUOTE_HISTORY: 'quoteHistory',

  // Goals related keys
  GOALS: 'goals',
  GOALS_ALLOCATIONS: 'goals_allocations',

  // Settings related keys
  SETTINGS: 'settings',
  EXCHANGE_RATES: 'exchangeRates',

  // New keys for exchange rates
  EXCHANGE_RATE_SYMBOLS: 'exchange_rate_symbols',
  QUOTE: 'quote',

  CONTRIBUTION_LIMITS: 'contributionLimits',
  CONTRIBUTION_LIMIT_PROGRESS: 'contributionLimitProgress',

  ASSET_DATA: 'asset_data',
  IMPORT_MAPPING: 'import_mapping',

  PERFORMANCE_SUMMARY: 'performanceSummary',
  PERFORMANCE_HISTORY: 'performanceHistory',

  HISTORY_VALUATION: 'historyValuation',
  // Helper function to create account-specific keys
  valuationHistory: (id: string) => [QueryKeys.HISTORY_VALUATION, id],

  // Account simple performance
  ACCOUNTS_SIMPLE_PERFORMANCE: 'accountsSimplePerformance',
  accountsSimplePerformance: (accountIds: string[]) => [
    QueryKeys.ACCOUNTS_SIMPLE_PERFORMANCE,
    [...accountIds].sort().join(',') || 'none',
  ],

  // Market Data Providers
  MARKET_DATA_PROVIDERS: 'marketDataProviders',
  MARKET_DATA_PROVIDER_SETTINGS: 'marketDataProviderSettings',

  transactions: 'transactions',
  latestValuations: 'latest-valuations',

  // Market Data
  symbolSearch: 'symbol-search',

  ASSET_HISTORY: 'asset-history',

  secrets: {
    apiKey: (providerId: string) => ['secrets', 'apiKey', providerId],
  },
} as const;
