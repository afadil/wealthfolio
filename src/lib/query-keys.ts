export const QueryKeys = {
  // Account related keys
  ACCOUNTS: 'accounts',
  ACCOUNTS_SUMMARY: 'accounts_summary',
  ACCOUNTS_HISTORY: 'accounts_history',

  // Activity related keys
  ACTIVITY_DATA: 'activity-data',

  // Portfolio related keys
  PORTFOLIO_HISTORY: 'portfolio_history',
  HOLDINGS: 'holdings',
  INCOME_SUMMARY: 'incomeSummary',

  // Goals related keys
  GOALS: 'goals',
  GOALS_ALLOCATIONS: 'goals_allocations',

  // Helper function to create account-specific keys
  accountHistory: (id: string) => ['account_history', id],
} as const;
