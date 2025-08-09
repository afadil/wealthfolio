/**
 * Permission system types and constants for Wealthfolio addons
 */

/**
 * Security risk levels for addon operations
 */
export type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Function permission details with declaration and detection tracking
 */
export interface FunctionPermission {
  /** Function name */
  name: string;
  /** Whether this function was declared by the developer in manifest */
  isDeclared: boolean;
  /** Whether this function was detected by static analysis during installation */
  isDetected: boolean;
  /** ISO timestamp when this function was detected (if isDetected is true) */
  detectedAt?: string;
}

/**
 * Permission requirement for specific addon functionality
 */
export interface Permission {
  /** Permission category identifier */
  category: string;
  /** List of API functions this permission grants access to with their declaration/detection status */
  functions: FunctionPermission[];
  /** Human-readable explanation of why this permission is needed */
  purpose: string;
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
      'getHoldings', 'getHolding', 'updatePortfolio', 'recalculatePortfolio',
      'getIncomeSummary', 'getHistoricalValuations', 'getLatestValuations',
      'calculatePerformanceHistory', 'calculatePerformanceSummary',
      'calculateAccountsSimplePerformance'
    ],
    riskLevel: 'medium'
  },
  {
    id: 'activities',
    name: 'Transaction History',
    description: 'Access to transaction records and activity management',
    functions: [
      'getActivities', 'searchActivities', 'createActivity', 'updateActivity',
      'saveActivities', 'importActivities', 'checkActivitiesImport',
      'getAccountImportMapping', 'saveAccountImportMapping'
    ],
    riskLevel: 'high'
  },
  {
    id: 'accounts',
    name: 'Account Management',
    description: 'Access to account information and settings',
    functions: [
      'getAccounts', 'createAccount', 'updateAccount'
    ],
    riskLevel: 'high'
  },
  {
    id: 'market-data',
    name: 'Market Data',
    description: 'Access to market prices, quotes, and financial data',
    functions: [
      'searchTicker', 'syncHistoryQuotes', 'getAssetProfile', 'updateAssetProfile',
      'updateAssetDataSource', 'updateQuote', 'syncMarketData',
      'getQuoteHistory', 'getMarketDataProviders'
    ],
    riskLevel: 'low'
  },
  {
    id: 'financial-planning',
    name: 'Financial Planning',
    description: 'Access to goals, contribution limits, and planning tools',
    functions: [
      'getGoals', 'createGoal', 'updateGoal', 'updateGoalsAllocations',
      'getGoalsAllocation', 'getContributionLimit', 'createContributionLimit',
      'updateContributionLimit', 'calculateDepositsForLimit'
    ],
    riskLevel: 'medium'
  },
  {
    id: 'currency',
    name: 'Exchange Rates',
    description: 'Access to currency exchange rates and conversion data',
    functions: [
      'getExchangeRates', 'updateExchangeRate', 'addExchangeRate'
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
      'onDropHover', 'onDrop', 'onDropCancelled',
      'onUpdateStart', 'onUpdateComplete', 'onUpdateError',
      'onSyncStart', 'onSyncComplete'
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
 * Create a FunctionPermission object
 */
export function createFunctionPermission(
  name: string,
  isDeclared: boolean = false,
  isDetected: boolean = false,
  detectedAt?: string
): FunctionPermission {
  return {
    name,
    isDeclared,
    isDetected,
    detectedAt: isDetected ? (detectedAt || new Date().toISOString()) : undefined
  };
}

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

/**
 * Get all declared functions from a permission
 */
export function getDeclaredFunctions(permission: Permission): string[] {
  return permission.functions
    .filter(func => func.isDeclared)
    .map(func => func.name);
}

/**
 * Get all detected functions from a permission
 */
export function getDetectedFunctions(permission: Permission): string[] {
  return permission.functions
    .filter(func => func.isDetected)
    .map(func => func.name);
}

/**
 * Get functions that were detected but not declared (potential security concern)
 */
export function getUndeclaredDetectedFunctions(permission: Permission): string[] {
  return permission.functions
    .filter(func => func.isDetected && !func.isDeclared)
    .map(func => func.name);
}

/**
 * Check if a permission has any undeclared detected functions
 */
export function hasUndeclaredDetectedFunctions(permission: Permission): boolean {
  return permission.functions.some(func => func.isDetected && !func.isDeclared);
}

/**
 * Add a detected function to a permission
 */
export function addDetectedFunction(
  permission: Permission, 
  functionName: string, 
  detectedAt?: string
): Permission {
  const existingFunc = permission.functions.find(f => f.name === functionName);
  
  if (existingFunc) {
    // Update existing function to mark as detected
    existingFunc.isDetected = true;
    existingFunc.detectedAt = detectedAt || new Date().toISOString();
  } else {
    // Add new detected function
    permission.functions.push(createFunctionPermission(
      functionName, 
      false, 
      true, 
      detectedAt
    ));
  }
  
  return permission;
}

/**
 * Mark a function as declared in a permission
 */
export function markFunctionAsDeclared(
  permission: Permission, 
  functionName: string
): Permission {
  const existingFunc = permission.functions.find(f => f.name === functionName);
  
  if (existingFunc) {
    existingFunc.isDeclared = true;
  } else {
    // Add new declared function
    permission.functions.push(createFunctionPermission(functionName, true, false));
  }
  
  return permission;
}
