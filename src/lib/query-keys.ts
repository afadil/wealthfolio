export const QueryKeys = {
  // Account related keys
  ACCOUNTS: 'accounts',
  ACCOUNTS_SUMMARY: 'accounts_summary',
  ACCOUNTS_HISTORY: 'accounts_history',

  // Activity related keys
  ACTIVITY_DATA: 'activity-data',
  ACTIVITIES: 'activities',

  // Portfolio related keys
  PORTFOLIO_HISTORY: 'portfolio_history',
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

  // Helper function to create account-specific keys
  accountHistory: (id: string) => ['account_history', id],
} as const;
