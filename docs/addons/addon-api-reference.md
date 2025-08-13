# Wealthfolio Addon API Reference

Complete reference for all APIs available to Wealthfolio addons through the subdomain-organized HostAPI.

## Table of Contents

1. [Context Overview](#context-overview)
2. [UI Integration APIs](#ui-integration-apis)
3. [Data & Operations APIs](#data--operations-apis)
4. [Event System](#event-system)
5. [Type Definitions](#type-definitions)
6. [Error Handling](#error-handling)

---

## Context Overview

The `AddonContext` is the main interface provided to your addon's `enable` function:

```typescript
export interface AddonContext {
  // UI Integration
  sidebar: SidebarAPI;
  router: RouterAPI;
  
  // Data & Operations - Organized by subdomain
  api: HostAPI;
  
  // Lifecycle Management
  onDisable: (callback: () => void) => void;
}
```

### Permission Requirements

All API functions require appropriate permissions declared in your addon's `manifest.json`. The system automatically analyzes your code during installation to verify permission usage.

**Example manifest permissions:**
```json
{
  "permissions": {
    "accounts": ["read"],
    "portfolio": ["read"],
    "activities": ["read", "write"],
    "market": ["read"],
    "secrets": ["read", "write"]
  }
}
```

See the [Addon Permissions Guide](addon-permissions.md) for detailed permission information.

---

## UI Integration APIs

### Sidebar API

Add navigation items to the main application sidebar.

#### Methods

**`addItem(item: SidebarItem): SidebarItemHandle`**

Adds a new item to the sidebar navigation.

```typescript
interface SidebarItem {
  id: string;           // Unique identifier
  label: string;        // Display text
  route: string;        // Navigation route
  order?: number;       // Sort order (default: 100)
  icon?: React.ComponentType; // Optional icon component
}

interface SidebarItemHandle {
  remove(): void;       // Remove the sidebar item
}
```

**Example:**
```typescript
const sidebarItem = ctx.sidebar.addItem({
  id: 'my-addon',
  label: 'My Addon',
  route: '/my-addon',
  order: 100
});

// Clean up
ctx.onDisable(() => {
  sidebarItem.remove();
});
```

### Router API

Register routes for your addon's pages.

#### Methods

**`add(route: RouteConfig): void`**

Adds a new route to the application router.

```typescript
interface RouteConfig {
  path: string;                    // URL path
  component: React.LazyExoticComponent<React.ComponentType<any>>;
}
```

**Example:**
```typescript
ctx.router.add({
  path: '/my-addon',
  component: React.lazy(() => Promise.resolve({ default: MyAddonComponent }))
});
```

---

## Data & Operations APIs

All data operations are organized into logical subdomains for better discoverability and maintainability.

### 🏦 Accounts API

Manage user accounts and account information.

#### Methods

**`getAll(): Promise<Account[]>`**

Retrieves all user accounts.

```typescript
const accounts = await ctx.api.accounts.getAll();
```

**`create(account: AccountCreate): Promise<Account>`**

Creates a new account.

```typescript
const newAccount = await ctx.api.accounts.create({
  name: 'My Investment Account',
  accountType: AccountType.INVESTMENT,
  currency: 'USD',
  isActive: true
});
```

**`update(account: Account): Promise<Account>`**

Updates an existing account.

```typescript
const updatedAccount = await ctx.api.accounts.update({
  ...existingAccount,
  name: 'Updated Account Name'
});
```

**`delete(accountId: string): Promise<void>`**

Deletes an account.

```typescript
await ctx.api.accounts.delete('account-123');
```

### 📊 Portfolio API

Access portfolio data, holdings, and performance information.

#### Methods

**`getHoldings(accountId: string): Promise<Holding[]>`**

Gets all holdings for a specific account.

```typescript
const holdings = await ctx.api.portfolio.getHoldings('account-123');
```

**`getHolding(accountId: string, assetId: string): Promise<Holding | null>`**

Gets a specific holding.

```typescript
const holding = await ctx.api.portfolio.getHolding('account-123', 'AAPL');
```

**`update(): Promise<void>`**

Triggers a portfolio update/recalculation.

```typescript
await ctx.api.portfolio.update();
```

**`recalculate(): Promise<void>`**

Forces a complete portfolio recalculation.

```typescript
await ctx.api.portfolio.recalculate();
```

**`getIncomeSummary(): Promise<IncomeSummary>`**

Gets portfolio income summary.

```typescript
const income = await ctx.api.portfolio.getIncomeSummary();
```

**`getHistoricalValuations(args: HistoricalValuationArgs): Promise<HistoricalValuation[]>`**

Gets historical portfolio valuations.

```typescript
const history = await ctx.api.portfolio.getHistoricalValuations({
  accountId: 'account-123',
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});
```

### 📝 Activities API

Manage trading activities, transactions, and imports.

#### Methods

**`getAll(accountId?: string): Promise<Activity[]>`**

Gets all activities, optionally filtered by account.

```typescript
// All activities
const allActivities = await ctx.api.activities.getAll();

// Activities for specific account
const accountActivities = await ctx.api.activities.getAll('account-123');
```

**`search(page: number, pageSize: number, filters?: ActivityFilters, sortBy?: string, sortOrder?: 'asc' | 'desc'): Promise<ActivitySearchResult>`**

Search activities with pagination and filtering.

```typescript
const results = await ctx.api.activities.search(1, 50, {
  accountId: 'account-123',
  activityType: ActivityType.BUY,
  symbol: 'AAPL'
}, 'date', 'desc');
```

**`create(activity: ActivityCreate): Promise<Activity>`**

Creates a new activity.

```typescript
const activity = await ctx.api.activities.create({
  accountId: 'account-123',
  activityType: ActivityType.BUY,
  assetId: 'AAPL',
  quantity: 100,
  unitPrice: 150.25,
  activityDate: new Date(),
  isDraft: false
});
```

**`update(activity: Activity): Promise<Activity>`**

Updates an existing activity.

```typescript
const updated = await ctx.api.activities.update({
  ...existingActivity,
  quantity: 150
});
```

**`saveMany(activities: ActivityCreate[]): Promise<Activity[]>`**

Creates multiple activities in a single operation.

```typescript
const activities = await ctx.api.activities.saveMany([
  { /* activity 1 */ },
  { /* activity 2 */ }
]);
```

**`delete(activityId: string): Promise<void>`**

Deletes an activity.

```typescript
await ctx.api.activities.delete('activity-456');
```

**`import(activities: ActivityImport[]): Promise<Activity[]>`**

Imports validated activities.

```typescript
const imported = await ctx.api.activities.import(checkedActivities);
```

**`checkImport(accountId: string, activities: ActivityImport[]): Promise<ActivityImport[]>`**

Validates activities before import.

```typescript
const validated = await ctx.api.activities.checkImport('account-123', activities);
```

**`getImportMapping(accountId: string): Promise<ImportMapping>`**

Gets import configuration for an account.

```typescript
const mapping = await ctx.api.activities.getImportMapping('account-123');
```

**`saveImportMapping(mapping: ImportMapping): Promise<void>`**

Saves import configuration.

```typescript
await ctx.api.activities.saveImportMapping(importMapping);
```

### 📈 Market Data API

Access market data, search symbols, and sync market information.

#### Methods

**`searchTicker(query: string): Promise<TickerSearchResult[]>`**

Search for ticker symbols.

```typescript
const results = await ctx.api.market.searchTicker('AAPL');
```

**`syncHistory(): Promise<void>`**

Syncs historical market data.

```typescript
await ctx.api.market.syncHistory();
```

**`sync(symbols: string[], refetchAll: boolean): Promise<void>`**

Syncs market data for specific symbols.

```typescript
await ctx.api.market.sync(['AAPL', 'MSFT', 'GOOGL'], false);
```

**`getProviders(): Promise<MarketDataProvider[]>`**

Gets available market data providers.

```typescript
const providers = await ctx.api.market.getProviders();
```

### 🏷️ Assets API

Manage asset profiles and data sources.

#### Methods

**`getProfile(assetId: string): Promise<AssetProfile>`**

Gets asset profile information.

```typescript
const profile = await ctx.api.assets.getProfile('AAPL');
```

**`updateProfile(payload: AssetProfileUpdate): Promise<AssetProfile>`**

Updates asset profile.

```typescript
const updated = await ctx.api.assets.updateProfile({
  assetId: 'AAPL',
  name: 'Apple Inc.',
  sectors: ['Technology']
});
```

**`updateDataSource(symbol: string, dataSource: string): Promise<void>`**

Changes the data source for an asset.

```typescript
await ctx.api.assets.updateDataSource('AAPL', 'YAHOO');
```

### 💹 Quotes API

Manage price quotes and historical data.

#### Methods

**`update(symbol: string, quote: QuoteUpdate): Promise<void>`**

Updates a price quote.

```typescript
await ctx.api.quotes.update('AAPL', {
  price: 150.25,
  date: new Date()
});
```

**`delete(id: string): Promise<void>`**

Deletes a quote.

```typescript
await ctx.api.quotes.delete('quote-123');
```

**`getHistory(symbol: string): Promise<Quote[]>`**

Gets historical quotes for a symbol.

```typescript
const history = await ctx.api.quotes.getHistory('AAPL');
```

### 📊 Performance API

Calculate portfolio and account performance metrics.

#### Methods

**`calculateHistory(itemType: string, itemId: string, startDate: string, endDate: string): Promise<PerformanceHistory[]>`**

Calculates performance history.

```typescript
const history = await ctx.api.performance.calculateHistory(
  'account',
  'account-123',
  '2024-01-01',
  '2024-12-31'
);
```

**`calculateSummary(args: PerformanceSummaryArgs): Promise<PerformanceSummary>`**

Calculates performance summary.

```typescript
const summary = await ctx.api.performance.calculateSummary({
  itemType: 'account',
  itemId: 'account-123',
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});
```

**`calculateAccountsSimple(accountIds: string[]): Promise<SimpleAccountPerformance[]>`**

Calculates simple performance metrics for accounts.

```typescript
const performance = await ctx.api.performance.calculateAccountsSimple(['account-123']);
```

### 💱 Exchange Rates API

Manage currency exchange rates.

#### Methods

**`getAll(): Promise<ExchangeRate[]>`**

Gets all exchange rates.

```typescript
const rates = await ctx.api.exchangeRates.getAll();
```

**`update(rate: ExchangeRate): Promise<ExchangeRate>`**

Updates an exchange rate.

```typescript
const updated = await ctx.api.exchangeRates.update({
  ...existingRate,
  rate: 1.25
});
```

**`add(newRate: ExchangeRateCreate): Promise<ExchangeRate>`**

Adds a new exchange rate.

```typescript
const rate = await ctx.api.exchangeRates.add({
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  rate: 0.85,
  date: new Date()
});
```

**`delete(rateId: string): Promise<void>`**

Deletes an exchange rate.

```typescript
await ctx.api.exchangeRates.delete('rate-123');
```

### 🏗️ Contribution Limits API

Manage account contribution limits.

#### Methods

**`getAll(): Promise<ContributionLimit[]>`**

Gets all contribution limits.

```typescript
const limits = await ctx.api.contributionLimits.getAll();
```

**`create(newLimit: ContributionLimitCreate): Promise<ContributionLimit>`**

Creates a new contribution limit.

```typescript
const limit = await ctx.api.contributionLimits.create({
  accountId: 'account-123',
  limitType: 'ANNUAL',
  amount: 6000,
  year: 2024
});
```

**`update(id: string, updatedLimit: ContributionLimitUpdate): Promise<ContributionLimit>`**

Updates a contribution limit.

```typescript
const updated = await ctx.api.contributionLimits.update('limit-123', {
  amount: 7000
});
```

**`delete(id: string): Promise<void>`**

Deletes a contribution limit.

```typescript
await ctx.api.contributionLimits.delete('limit-123');
```

**`calculateDeposits(limitId: string): Promise<ContributionCalculation>`**

Calculates deposits against a limit.

```typescript
const calculation = await ctx.api.contributionLimits.calculateDeposits('limit-123');
```

### 🎯 Goals API

Manage financial goals and allocations.

#### Methods

**`getAll(): Promise<Goal[]>`**

Gets all goals.

```typescript
const goals = await ctx.api.goals.getAll();
```

**`create(goal: GoalCreate): Promise<Goal>`**

Creates a new goal.

```typescript
const goal = await ctx.api.goals.create({
  title: 'Emergency Fund',
  targetAmount: 50000,
  description: 'Build emergency fund',
  targetDate: new Date('2025-12-31')
});
```

**`update(goal: Goal): Promise<Goal>`**

Updates a goal.

```typescript
const updated = await ctx.api.goals.update({
  ...existingGoal,
  targetAmount: 75000
});
```

**`delete(goalId: string): Promise<void>`**

Deletes a goal.

```typescript
await ctx.api.goals.delete('goal-123');
```

**`updateAllocations(allocations: GoalAllocation[]): Promise<void>`**

Updates goal allocations.

```typescript
await ctx.api.goals.updateAllocations([
  { goalId: 'goal-123', accountId: 'account-123', percentage: 50 }
]);
```

**`getAllocations(): Promise<GoalAllocation[]>`**

Gets all goal allocations.

```typescript
const allocations = await ctx.api.goals.getAllocations();
```

### ⚙️ Settings API

Manage application settings.

#### Methods

**`get(): Promise<Settings>`**

Gets current application settings.

```typescript
const settings = await ctx.api.settings.get();
```

**`update(settings: SettingsUpdate): Promise<Settings>`**

Updates application settings.

```typescript
const updated = await ctx.api.settings.update({
  baseCurrency: 'EUR',
  theme: 'dark'
});
```

**`backupDatabase(): Promise<void>`**

Creates a database backup.

```typescript
await ctx.api.settings.backupDatabase();
```

### 📂 Files API

File operation utilities.

#### Methods

**`openCsvDialog(): Promise<string | null>`**

Opens a file dialog for CSV selection.

```typescript
const filePath = await ctx.api.files.openCsvDialog();
if (filePath) {
  // Process the selected file
}
```

**`openSaveDialog(content: string, fileName: string): Promise<string | null>`**

Opens a save dialog.

```typescript
const savedPath = await ctx.api.files.openSaveDialog(
  'CSV content here',
  'export.csv'
);
```

### 🔐 Secrets API

Secure storage for sensitive data (scoped to your addon).

#### Methods

**`get(key: string): Promise<string | null>`**

Retrieves a secret value.

```typescript
const apiKey = await ctx.api.secrets.get('api-key');
```

**`set(key: string, value: string): Promise<void>`**

Stores a secret value.

```typescript
await ctx.api.secrets.set('api-key', 'your-secret-key');
```

**`delete(key: string): Promise<void>`**

Deletes a secret.

```typescript
await ctx.api.secrets.delete('api-key');
```

**`list(): Promise<string[]>`**

Lists all secret keys (not values).

```typescript
const keys = await ctx.api.secrets.list();
```

### 📝 Logger API

Logging functionality with automatic addon prefix for easy identification.

All log messages will be automatically prefixed with your addon ID, making it easy to identify which addon is logging messages during development and debugging.

#### Methods

**`error(message: string): void`**

Log an error message.

```typescript
ctx.api.logger.error('Failed to process data');
// Output: [your-addon-id] Failed to process data
```

**`info(message: string): void`**

Log an informational message.

```typescript
ctx.api.logger.info('Processing completed successfully');
// Output: [your-addon-id] Processing completed successfully
```

**`warn(message: string): void`**

Log a warning message.

```typescript
ctx.api.logger.warn('API rate limit approaching');
// Output: [your-addon-id] API rate limit approaching
```

**`debug(message: string): void`**

Log a debug message (typically for development).

```typescript
ctx.api.logger.debug('Variable value: ' + JSON.stringify(data));
// Output: [your-addon-id] Variable value: {...}
```

**`trace(message: string): void`**

Log a trace message (for detailed debugging).

```typescript
ctx.api.logger.trace('Entering function processData()');
// Output: [your-addon-id] Entering function processData()
```

#### Usage Example

```typescript
export function enable(ctx: AddonContext) {
  ctx.api.logger.info('Addon enabled');
  
  try {
    // Your addon logic here
    const data = await processData();
    ctx.api.logger.debug('Processed data: ' + JSON.stringify(data));
  } catch (error) {
    ctx.api.logger.error('Error processing data: ' + error.message);
  }
}
```

---

## Event System

The event system allows you to listen for various application events organized by category.

### 🎧 Events API Structure

```typescript
interface EventsAPI {
  import: ImportEvents;
  portfolio: PortfolioEvents;
  market: MarketEvents;
}
```

### Import Events

Listen for file import-related events.

**`onDropHover(handler: (event: DropEvent) => void): Promise<UnlistenFn>`**

Listens for file drop hover events.

```typescript
const unlisten = await ctx.api.events.import.onDropHover((event) => {
  console.log('File hovering over drop zone:', event.payload);
});
```

**`onDrop(handler: (event: DropEvent) => void): Promise<UnlistenFn>`**

Listens for file drop events.

```typescript
const unlisten = await ctx.api.events.import.onDrop((event) => {
  console.log('File dropped:', event.payload);
  // Handle file import
});
```

**`onDropCancelled(handler: (event: DropEvent) => void): Promise<UnlistenFn>`**

Listens for cancelled file drops.

```typescript
const unlisten = await ctx.api.events.import.onDropCancelled((event) => {
  console.log('File drop cancelled');
});
```

### Portfolio Events

Listen for portfolio-related events.

**`onUpdateStart(handler: (event: PortfolioEvent) => void): Promise<UnlistenFn>`**

Listens for portfolio update start.

```typescript
const unlisten = await ctx.api.events.portfolio.onUpdateStart((event) => {
  console.log('Portfolio update started');
});
```

**`onUpdateComplete(handler: (event: PortfolioEvent) => void): Promise<UnlistenFn>`**

Listens for portfolio update completion.

```typescript
const unlisten = await ctx.api.events.portfolio.onUpdateComplete((event) => {
  console.log('Portfolio update completed:', event.payload);
  // Refresh your addon's data
});
```

**`onUpdateError(handler: (event: PortfolioEvent) => void): Promise<UnlistenFn>`**

Listens for portfolio update errors.

```typescript
const unlisten = await ctx.api.events.portfolio.onUpdateError((event) => {
  console.error('Portfolio update failed:', event.payload);
});
```

### Market Events

Listen for market data events.

**`onSyncStart(handler: (event: MarketEvent) => void): Promise<UnlistenFn>`**

Listens for market sync start.

```typescript
const unlisten = await ctx.api.events.market.onSyncStart((event) => {
  console.log('Market sync started');
});
```

**`onSyncComplete(handler: (event: MarketEvent) => void): Promise<UnlistenFn>`**

Listens for market sync completion.

```typescript
const unlisten = await ctx.api.events.market.onSyncComplete((event) => {
  console.log('Market sync completed:', event.payload);
});
```

### Event Cleanup

Always clean up event listeners in your disable function:

```typescript
export default function enable(ctx: AddonContext) {
  const unlistenPortfolio = ctx.api.events.portfolio.onUpdateComplete(() => {
    // Handle event
  });
  
  const unlistenMarket = ctx.api.events.market.onSyncComplete(() => {
    // Handle event
  });

  return {
    disable() {
      unlistenPortfolio();
      unlistenMarket();
    }
  };
}
```

---

## Type Definitions

### Core Types

#### Account Types

```typescript
interface Account {
  id: string;
  name: string;
  accountType: AccountType;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

enum AccountType {
  INVESTMENT = 'INVESTMENT',
  CASH = 'CASH',
  RETIREMENT = 'RETIREMENT',
  CRYPTO = 'CRYPTO'
}

interface AccountCreate {
  name: string;
  accountType: AccountType;
  currency: string;
  isActive?: boolean;
}
```

#### Activity Types

```typescript
interface Activity {
  id: string;
  accountId: string;
  activityType: ActivityType;
  assetId?: string;
  symbol?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  fee?: number;
  tax?: number;
  activityDate: Date;
  isDraft: boolean;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

enum ActivityType {
  BUY = 'BUY',
  SELL = 'SELL',
  DIVIDEND = 'DIVIDEND',
  INTEREST = 'INTEREST',
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  ADD_HOLDING = 'ADD_HOLDING',
  REMOVE_HOLDING = 'REMOVE_HOLDING',
  FEE = 'FEE',
  TAX = 'TAX',
  SPLIT = 'SPLIT'
}

interface ActivityCreate {
  accountId: string;
  activityType: ActivityType;
  assetId?: string;
  symbol?: string;
  quantity?: number;
  unitPrice?: number;
  amount?: number;
  fee?: number;
  tax?: number;
  activityDate: Date;
  isDraft: boolean;
  comment?: string;
}

interface ActivityImport extends ActivityCreate {
  isValid: boolean;
  validationErrors?: string[];
}
```

#### Holding Types

```typescript
interface Holding {
  id: string;
  accountId: string;
  symbol: string;
  assetId: string;
  quantity: number;
  averageCost: number;
  bookValue: number;
  marketPrice: number;
  marketValue: number;
  currency: string;
  performance: HoldingPerformance;
  updatedAt: Date;
}

interface HoldingPerformance {
  totalGainLoss: number;
  totalGainLossPercent: number;
  dayGainLoss: number;
  dayGainLossPercent: number;
}
```

#### Performance Types

```typescript
interface PerformanceHistory {
  date: Date;
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dayGainLoss: number;
  dayGainLossPercent: number;
}

interface PerformanceSummary {
  totalValue: number;
  totalCost: number;
  totalGainLoss: number;
  totalGainLossPercent: number;
  dayGainLoss: number;
  dayGainLossPercent: number;
  currency: string;
}

interface PerformanceSummaryArgs {
  itemType: 'account' | 'portfolio';
  itemId?: string;
  startDate?: string;
  endDate?: string;
}
```

#### Market Data Types

```typescript
interface TickerSearchResult {
  symbol: string;
  name: string;
  type: string;
  region: string;
  marketOpen: string;
  marketClose: string;
  timezone: string;
  currency: string;
  matchScore: number;
}

interface Quote {
  id: string;
  symbol: string;
  price: number;
  date: Date;
  currency: string;
  createdAt: Date;
}

interface QuoteUpdate {
  price: number;
  date: Date;
}

interface MarketDataProvider {
  id: string;
  name: string;
  isEnabled: boolean;
  config: Record<string, any>;
}
```

#### Goal Types

```typescript
interface Goal {
  id: string;
  title: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: Date;
  isAchieved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface GoalCreate {
  title: string;
  description?: string;
  targetAmount: number;
  targetDate?: Date;
}

interface GoalAllocation {
  id: string;
  goalId: string;
  accountId: string;
  percentage: number;
}
```

### Event Types

```typescript
interface DropEvent {
  payload: {
    files: string[];
    position: { x: number; y: number };
  };
}

interface PortfolioEvent {
  payload?: {
    accountId?: string;
    updatedAt: Date;
  };
}

interface MarketEvent {
  payload?: {
    symbols?: string[];
    updatedAt: Date;
  };
}

type UnlistenFn = () => void;
```

### Utility Types

```typescript
interface ActivitySearchResult {
  activities: Activity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ActivityFilters {
  accountId?: string;
  activityType?: ActivityType;
  symbol?: string;
  startDate?: string;
  endDate?: string;
}

interface ImportMapping {
  id: string;
  accountId: string;
  mapping: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Error Handling

### Error Types

All API functions can throw these error types:

```typescript
interface APIError extends Error {
  code: string;
  details?: any;
}

interface ValidationError extends APIError {
  code: 'VALIDATION_ERROR';
  details: {
    field: string;
    message: string;
  }[];
}

interface NotFoundError extends APIError {
  code: 'NOT_FOUND';
  details: {
    resource: string;
    id: string;
  };
}

interface PermissionError extends APIError {
  code: 'PERMISSION_DENIED';
  details: {
    permission: string;
    resource: string;
    requiredLevel: 'read' | 'write' | 'admin';
  };
}
```

### Error Handling Best Practices

```typescript
export default function enable(ctx: AddonContext) {
  async function safeAPICall() {
    try {
      const accounts = await ctx.api.accounts.getAll();
      return accounts;
    } catch (error) {
      if (error.code === 'PERMISSION_DENIED') {
        console.error('Missing permission:', error.details);
        // Show user-friendly message about missing permissions
        showPermissionError(error.details.permission, error.details.requiredLevel);
      } else if (error.code === 'VALIDATION_ERROR') {
        console.error('Validation failed:', error.details);
        // Handle validation error
      } else {
        console.error('Unexpected error:', error);
        // Handle unexpected error
      }
      return [];
    }
  }
  
  function showPermissionError(permission: string, level: string) {
    // Guide user to check manifest.json
    console.warn(`Add "${permission}": ["${level}"] to your manifest.json permissions`);
  }
}
```

### Common Error Scenarios

1. **Missing Permissions**: Ensure required permissions are declared in `manifest.json`
2. **Invalid Data**: Validate data before sending to API
3. **Network Issues**: Handle connectivity problems gracefully
4. **Resource Not Found**: Check if resources exist before operations
5. **Rate Limiting**: Respect API rate limits in your addon

---

This API reference provides comprehensive coverage of all available functionality in the Wealthfolio addon system. The subdomain organization makes it easy to discover and use the right APIs for your addon's needs.
