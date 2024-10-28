export const QueryKeys = {
  // Account related keys
  ACCOUNTS: 'accounts',
  ACCOUNTS_SUMMARY: 'accounts_summary',

  // Activity related keys
  ACTIVITY_DATA: 'activity-data',
  ACTIVITIES: 'activities',

  // Portfolio related keys
  HISTORY: 'history',
  HOLDINGS: 'holdings',
  INCOME_SUMMARY: 'incomeSummary',

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

  // Helper function to create account-specific keys
  accountHistory: (id: string) => ['history', id],
} as const;
