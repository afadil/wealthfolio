/**
 * Permission system types and constants for Wealthfolio addons
 */

/**
 * Security risk levels for addon operations
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Permission requirement for specific addon functionality
 */
export interface Permission {
  /** Permission category identifier */
  category: string;
  /** List of API functions this permission grants access to */
  functions: string[];
  /** Human-readable explanation of why this permission is needed */
  purpose: string;
  /** Whether this permission was declared by the developer in manifest */
  is_declared?: boolean;
  /** Whether this permission was detected by static analysis during installation */
  is_detected?: boolean;
  /** ISO timestamp when this permission was detected (if is_detected is true) */
  detected_at?: string;
}

/**
 * Permission category definition
 */
export interface PermissionCategory {
  /** Unique category identifier */
  id: string;
  /** Display name for the category */
  name: string;
  /** Detailed description of what this category covers */
  description: string;
  /** List of API functions in this category */
  functions: string[];
  /** Security risk level for this category */
  riskLevel: RiskLevel;
}


/**
 * Predefined permission categories with their associated functions and risk levels
 */
export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: 'portfolio',
    name: 'Portfolio Data',
    description: 'Access to holdings, portfolio performance, and account valuations',
    functions: [
      'holdings', 'getHolding', 'updatePortfolio', 'recalculatePortfolio',
      'getHistoricalValuations', 'calculatePerformanceHistory', 
      'calculatePerformanceSummary', 'calculateAccountsSimplePerformance'
    ],
    riskLevel: 'medium'
  },
  {
    id: 'activities',
    name: 'Transaction History',
    description: 'Access to transaction records and activity management',
    functions: [
      'activities', 'searchActivities', 'createActivity', 'updateActivity',
      'saveActivities', 'deleteActivity', 'importActivities', 'checkActivitiesImport'
    ],
    riskLevel: 'high'
  },
  {
    id: 'accounts',
    name: 'Account Management',
    description: 'Access to account information and settings',
    functions: [
      'accounts', 'createAccount', 'updateAccount', 'deleteAccount',
      'getAccountImportMapping', 'saveAccountImportMapping'
    ],
    riskLevel: 'high'
  },
  {
    id: 'market-data',
    name: 'Market Data',
    description: 'Access to market prices, quotes, and financial data',
    functions: [
      'searchTicker', 'syncHistoryQuotes', 'getAssetProfile', 'updateAssetProfile',
      'updateAssetDataSource', 'updateQuote', 'syncMarketData', 'deleteQuote',
      'getQuoteHistory', 'getMarketDataProviders'
    ],
    riskLevel: 'low'
  },
  {
    id: 'financial-planning',
    name: 'Financial Planning',
    description: 'Access to goals, contribution limits, and planning tools',
    functions: [
      'getGoals', 'createGoal', 'updateGoal', 'deleteGoal', 'updateGoalsAllocations',
      'getGoalsAllocation', 'getContributionLimit', 'createContributionLimit',
      'updateContributionLimit', 'deleteContributionLimit', 'calculateDepositsForLimit'
    ],
    riskLevel: 'medium'
  },
  {
    id: 'currency',
    name: 'Exchange Rates',
    description: 'Access to currency exchange rates and conversion data',
    functions: [
      'getExchangeRates', 'updateExchangeRate', 'addExchangeRate', 'deleteExchangeRate'
    ],
    riskLevel: 'low'
  },
  {
    id: 'settings',
    name: 'Application Settings',
    description: 'Access to application settings and configuration',
    functions: [
      'getSettings', 'updateSettings', 'backupDatabase'
    ],
    riskLevel: 'high'
  },
  {
    id: 'files',
    name: 'File Operations',
    description: 'Access to file dialogs and file system operations',
    functions: [
      'openCsvFileDialog', 'openFileSaveDialog'
    ],
    riskLevel: 'medium'
  },
  {
    id: 'events',
    name: 'Event Listeners',
    description: 'Access to application events and notifications',
    functions: [
      'listenImportFileDropHover', 'listenImportFileDrop', 'listenImportFileDropCancelled',
      'listenPortfolioUpdateStart', 'listenPortfolioUpdateComplete', 'listenPortfolioUpdateError',
      'listenMarketSyncStart', 'listenMarketSyncComplete'
    ],
    riskLevel: 'low'
  },
  {
    id: 'ui',
    name: 'User Interface',
    description: 'Access to modify navigation and add UI components',
    functions: [
      'sidebar.addItem', 'router.add'
    ],
    riskLevel: 'low'
  }
];

/**
 * Helper functions for permission management
 */

/**
 * Get permission category by ID
 */
export function getPermissionCategory(id: string): PermissionCategory | undefined {
  return PERMISSION_CATEGORIES.find(category => category.id === id);
}

/**
 * Get permission categories by risk level
 */
export function getPermissionCategoriesByRisk(riskLevel: RiskLevel): PermissionCategory[] {
  return PERMISSION_CATEGORIES.filter(category => category.riskLevel === riskLevel);
}

/**
 * Get the risk level for a specific function
 */
export function getFunctionRiskLevel(functionName: string): RiskLevel | undefined {
  const category = PERMISSION_CATEGORIES.find(cat => 
    cat.functions.includes(functionName)
  );
  return category?.riskLevel;
}

/**
 * Check if a function requires a specific permission category
 */
export function isPermissionRequired(functionName: string, categoryId: string): boolean {
  const category = getPermissionCategory(categoryId);
  return category ? category.functions.includes(functionName) : false;
}
