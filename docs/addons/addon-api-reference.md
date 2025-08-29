# API Reference

Complete reference for Wealthfolio addon APIs. All functions require appropriate permissions in `manifest.json`.

## Context Overview

The `AddonContext` is provided to your addon's `enable` function:

```typescript
export interface AddonContext {
  api: HostAPI;
  sidebar: SidebarAPI;
  router: RouterAPI;
  onDisable: (callback: () => void) => void;
}
```

Basic usage:

```typescript
export default function enable(ctx: AddonContext) {
  // Access APIs
  const accounts = await ctx.api.accounts.getAll();
  #### `onDropHover(callback: EventCallback): Promise<UnlistenFn>`
  Fires when files are hovered over for import.

  ```typescript
  const unlistenHover = await ctx.api.events.import.onDropHover((event) => {
    console.log('File hover detected');
    showDropZone();
  });
  ```

  #### `onDrop(callback: EventCallback): Promise<UnlistenFn>`
  Fires when files are dropped for import.

  ```typescript
  const unlistenImport = await ctx.api.events.import.onDrop((event) => {
    console.log('File dropped:', event.payload);
    // Trigger import workflow
    handleFileImport(event.payload.files);
  });
  ```

  #### `onDropCancelled(callback: EventCallback): Promise<UnlistenFn>`
  Fires when file drop is cancelled.

  ```typescript
  const unlistenCancel = await ctx.api.events.import.onDropCancelled(() => {
    console.log('File drop cancelled');
    hideDropZone();
  });
  ```

  ---

  ## Navigation API

  Navigate programmatically within the Wealthfolio application.

  ### Methods

  #### `navigate(route: string): Promise<void>`
  Navigate to a specific route in the application.

  ```typescript
  // Navigate to a specific account
  await ctx.api.navigation.navigate('/accounts/account-123');

  // Navigate to portfolio overview
  await ctx.api.navigation.navigate('/portfolio');

  // Navigate to activities page
  await ctx.api.navigation.navigate('/activities');

  // Navigate to settings
  await ctx.api.navigation.navigate('/settings');
  ```

  > **Info**
  > **Navigation Routes**: The navigation API uses the same route structure as the main application. Common routes include `/accounts`, `/portfolio`, `/activities`, `/goals`, and `/settings`.

  ---

  ## Query API

  Access and manipulate the shared React Query client for efficient data management.

  ### Methods

  #### `getClient(): QueryClient`
  Gets the shared QueryClient instance from the main application.

  ```typescript
  const queryClient = ctx.api.query.getClient();

  // Use standard React Query methods
  const accounts = await queryClient.fetchQuery({
    queryKey: ['accounts'],
    queryFn: () => ctx.api.accounts.getAll()
  });
  ```

  #### `invalidateQueries(queryKey: string | string[]): void`
  Invalidates queries to trigger refetch.

  ```typescript
  // Invalidate specific query
  ctx.api.query.invalidateQueries(['accounts']);

  // Invalidate multiple related queries
  ctx.api.query.invalidateQueries(['portfolio', 'holdings']);

  // Invalidate all account-related queries
  ctx.api.query.invalidateQueries(['accounts']);
  ```

  #### `refetchQueries(queryKey: string | string[]): void`
  Triggers immediate refetch of queries.

  ```typescript
  // Refetch portfolio data
  ctx.api.query.refetchQueries(['portfolio']);

  // Refetch multiple queries
  ctx.api.query.refetchQueries(['accounts', 'holdings']);
  ```

  ### Integration with Events

  Combine Query API with event listeners for reactive data updates:

  ```typescript
  export default function enable(ctx: AddonContext) {
    // Invalidate relevant queries when portfolio updates
    const unlistenPortfolio = await ctx.api.events.portfolio.onUpdateComplete(() => {
      ctx.api.query.invalidateQueries(['portfolio', 'holdings', 'performance']);
    });

    // Invalidate market data queries when sync completes
    const unlistenMarket = await ctx.api.events.market.onSyncComplete(() => {
      ctx.api.query.invalidateQueries(['quotes', 'assets']);
    });

    ctx.onDisable(() => {
      unlistenPortfolio();
      unlistenMarket();
    });
  }
  ```

  ---

  ## UI Integration APIs

  ### Sidebar API

  Add navigation items to the main application sidebar.

  #### `addItem(item: SidebarItem): SidebarItemHandle`

  ```typescript
  const sidebarItem = ctx.sidebar.addItem({
    id: 'my-addon',
    label: 'My Addon',
    route: '/addon/my-addon',
    icon: MyAddonIcon, // Optional React component
    order: 100 // Lower numbers appear first
  });

  // Remove when addon is disabled
  ctx.onDisable(() => {
    sidebarItem.remove();
  });
  ```

  ### Router API

  Register routes for your addon's pages.

  #### `add(route: RouteConfig): void`

  ```typescript
  ctx.router.add({
    path: '/addon/my-addon',
    component: React.lazy(() => Promise.resolve({ default: MyAddonComponent }))
  });

  // Multiple routes
  ctx.router.add({
    path: '/addon/my-addon/settings',
    component: React.lazy(() => Promise.resolve({ default: MyAddonSettings }))
  });
  ```

  ---

  ## Error Handling

  ### API Error Types

  ```typescript
  interface APIError {
    code: string;
    message: string;
    details?: any;
  }
  ```

  Common error codes:
  - `PERMISSION_DENIED` - Insufficient permissions
  - `NOT_FOUND` - Resource not found
  - `VALIDATION_ERROR` - Invalid data provided
  - `NETWORK_ERROR` - Connection issues
  - `RATE_LIMITED` - Too many requests

  ### Best Practices

  ```typescript
  try {
    const accounts = await ctx.api.accounts.getAll();
```

#### `update(activity: ActivityUpdate): Promise<Activity>`
Updates an existing activity with conflict detection.

```typescript
const updated = await ctx.api.activities.update({
  ...existingActivity,
  quantity: 150,
  unitPrice: 145.75
});
```

#### `saveMany(activities: ActivityUpdate[]): Promise<Activity[]>`
Efficiently creates multiple activities in a single transaction.

```typescript
const activities = await ctx.api.activities.saveMany([
  { accountId: 'account-123', activityType: 'BUY', /* ... */ },
  { accountId: 'account-123', activityType: 'DIVIDEND', /* ... */ }
]);
```

#### `delete(activityId: string): Promise<void>`
Deletes an activity and updates portfolio calculations.

```typescript
await ctx.api.activities.delete('activity-456');
```

#### `import(activities: ActivityImport[]): Promise<ActivityImport[]>`
Imports validated activities with duplicate detection.

```typescript
const imported = await ctx.api.activities.import(checkedActivities);
```

#### `checkImport(accountId: string, activities: ActivityImport[]): Promise<ActivityImport[]>`
Validates activities before import with error reporting.

```typescript
const validated = await ctx.api.activities.checkImport('account-123', activities);
```

#### `getImportMapping(accountId: string): Promise<ImportMappingData>`
Get import mapping configuration for an account.

```typescript
const mapping = await ctx.api.activities.getImportMapping('account-123');
```

#### `saveImportMapping(mapping: ImportMappingData): Promise<ImportMappingData>`
Save import mapping configuration.

```typescript
const savedMapping = await ctx.api.activities.saveImportMapping(mapping);
```

```typescript
try {
  const accounts = await ctx.api.accounts.getAll();
} catch (error) {
  if (error.code === 'PERMISSION_DENIED') {
    ctx.api.logger.error('Missing account permissions');
    // Show user-friendly message
  } else if (error.code === 'NETWORK_ERROR') {
    ctx.api.logger.warn('Network issue, retrying...');
    // Implement retry logic
  } else {
    ctx.api.logger.error('Unexpected error:', error);
    // General error handling
  }
}
```

---

## Advanced Usage

### Batch Operations

```typescript
// Efficient batch processing
const activities = await Promise.all([
  ctx.api.activities.getAll('account-1'),
  ctx.api.activities.getAll('account-2'),
  ctx.api.activities.getAll('account-3')
]);

// Batch create
const newActivities = await ctx.api.activities.saveMany([
  { /* activity 1 */ },
  { /* activity 2 */ },
  { /* activity 3 */ }
]);
```

### Real-time Updates

```typescript
export default function enable(ctx: AddonContext) {
  // Listen for multiple events
  const unsubscribers = [
    await ctx.api.events.portfolio.onUpdateComplete(() => refreshData()),
    await ctx.api.events.market.onSyncComplete(() => updatePrices()),
    await ctx.api.events.import.onDrop((event) => handleImport(event))
  ];
  
  // Clean up all listeners
  ctx.onDisable(() => {
    unsubscribers.forEach(unsub => unsub());
  });
}
```

### Caching Strategies

```typescript
// Simple in-memory cache
const cache = new Map();

async function getCachedAccounts() {
  if (cache.has('accounts')) {
    return cache.get('accounts');
  }
  
  const accounts = await ctx.api.accounts.getAll();
  cache.set('accounts', accounts);
  
  // Invalidate cache on updates
  const unlisten = await ctx.api.events.portfolio.onUpdateComplete(() => {
    cache.delete('accounts');
  });
  
  return accounts;
}
```

---

## TypeScript Support

Full TypeScript definitions are provided for all APIs:

```typescript
import type { 
  AddonContext,
  Account,
  Activity,
  Holding,
  PerformanceHistory,
  PerformanceSummary,
  // ... and many more
} from '@wealthfolio/addon-sdk';

// Type-safe API usage
const accounts: Account[] = await ctx.api.accounts.getAll();
const holdings: Holding[] = await ctx.api.portfolio.getHoldings(accounts[0].id);
```

## Performance Tips

1. **Use batch operations** when possible
2. **Implement caching** for expensive operations
3. **Listen to relevant events only**
4. **Clean up resources** in disable function
5. **Use React.memo** for expensive components
6. **Debounce user inputs** for search/filter

---

**Ready to build?** Check out our [examples](/docs/addons/examples) to see these APIs in action!
const history = await ctx.api.quotes.getHistory('AAPL');
```

---

## Performance API

Calculate portfolio and account performance metrics with historical analysis.

### Methods

#### `calculateHistory(itemType: 'account' | 'symbol', itemId: string, startDate: string, endDate: string): Promise<PerformanceMetrics>`
Calculates detailed performance history for charts and analysis.

```typescript
const history = await ctx.api.performance.calculateHistory(
  'account',
  'account-123',
  '2024-01-01',
  '2024-12-31'
);
```

#### `calculateSummary(args: { itemType: 'account' | 'symbol'; itemId: string; startDate?: string | null; endDate?: string | null; }): Promise<PerformanceMetrics>`
Calculates comprehensive performance summary with key metrics.

```typescript
const summary = await ctx.api.performance.calculateSummary({
  itemType: 'account',
  itemId: 'account-123',
  startDate: '2024-01-01',
  endDate: '2024-12-31'
});
```

#### `calculateAccountsSimple(accountIds: string[]): Promise<SimplePerformanceMetrics[]>`
Calculates simple performance metrics for multiple accounts efficiently.

```typescript
const performance = await ctx.api.performance.calculateAccountsSimple([
  'account-123', 
  'account-456'
]);
```

---

## Exchange Rates API

Manage currency exchange rates for multi-currency portfolios.

### Methods

#### `getAll(): Promise<ExchangeRate[]>`
Gets all exchange rates.

```typescript
const rates = await ctx.api.exchangeRates.getAll();
```

#### `update(updatedRate: ExchangeRate): Promise<ExchangeRate>`
Updates an existing exchange rate.

```typescript
const updatedRate = await ctx.api.exchangeRates.update({
  id: 'rate-123',
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  rate: 0.85,
  // ... other rate data
});
```

#### `add(newRate: Omit<ExchangeRate, 'id'>): Promise<ExchangeRate>`
Adds a new exchange rate.

```typescript
const newRate = await ctx.api.exchangeRates.add({
  fromCurrency: 'USD',
  toCurrency: 'GBP',
  rate: 0.75,
  // ... other rate data
});
```

---

## Contribution Limits API

Manage investment contribution limits and calculations.

### Methods

#### `getAll(): Promise<ContributionLimit[]>`
Gets all contribution limits.

```typescript
const limits = await ctx.api.contributionLimits.getAll();
```

#### `create(newLimit: NewContributionLimit): Promise<ContributionLimit>`
Creates a new contribution limit.

```typescript
const limit = await ctx.api.contributionLimits.create({
  name: 'RRSP 2024',
  limitType: 'RRSP',
  maxAmount: 30000,
  year: 2024,
  // ... other limit data
});
```

#### `update(id: string, updatedLimit: NewContributionLimit): Promise<ContributionLimit>`
Updates an existing contribution limit.

```typescript
const updatedLimit = await ctx.api.contributionLimits.update('limit-123', {
  name: 'Updated RRSP 2024',
  maxAmount: 31000,
  // ... other updated data
});
```

#### `calculateDeposits(limitId: string): Promise<DepositsCalculation>`
Calculates deposits for a specific contribution limit.

```typescript
const deposits = await ctx.api.contributionLimits.calculateDeposits('limit-123');
```

---

## Goals API

Manage financial goals and allocations.

### Methods

#### `getAll(): Promise<Goal[]>`
Gets all goals.

```typescript
const goals = await ctx.api.goals.getAll();
```

#### `create(goal: any): Promise<Goal>`
Creates a new goal.

```typescript
const goal = await ctx.api.goals.create({
  name: 'Retirement Fund',
  targetAmount: 500000,
  targetDate: '2040-01-01',
  // ... other goal data
});
```

#### `update(goal: Goal): Promise<Goal>`
Updates an existing goal.

```typescript
const updatedGoal = await ctx.api.goals.update({
  ...existingGoal,
  targetAmount: 600000,
});
```

#### `updateAllocations(allocations: GoalAllocation[]): Promise<void>`
Updates goal allocations.

```typescript
await ctx.api.goals.updateAllocations([
  { goalId: 'goal-123', accountId: 'account-456', percentage: 50 },
  // ... other allocations
]);
```

#### `getAllocations(): Promise<GoalAllocation[]>`
Gets goal allocations.

```typescript
const allocations = await ctx.api.goals.getAllocations();
```

---

## Settings API

Manage application settings and configuration.

### Methods

#### `get(): Promise<Settings>`
Gets application settings.

```typescript
const settings = await ctx.api.settings.get();
```

#### `update(settingsUpdate: Settings): Promise<Settings>`
Updates application settings.

```typescript
const updatedSettings = await ctx.api.settings.update({
  ...currentSettings,
  baseCurrency: 'EUR',
  // ... other settings
});
```

#### `backupDatabase(): Promise<{ filename: string; data: Uint8Array }>`
Creates a database backup.

```typescript
const backup = await ctx.api.settings.backupDatabase();
```

---

## Files API

Handle file operations and dialogs.

### Methods

#### `openCsvDialog(): Promise<null | string | string[]>`
Opens a CSV file selection dialog.

```typescript
const files = await ctx.api.files.openCsvDialog();
if (files) {
  // Process selected files
}
```

#### `openSaveDialog(fileContent: Uint8Array | Blob | string, fileName: string): Promise<any>`
Opens a file save dialog.

```typescript
const result = await ctx.api.files.openSaveDialog(
  fileContent,
  'export.csv'
);
```

---

## Secrets API

Securely store and retrieve sensitive data like API keys and tokens. All data is scoped to your addon for security.

### Methods

#### `set(key: string, value: string): Promise<void>`
Stores a secret value encrypted and scoped to your addon.

```typescript
// Store API key securely
await ctx.api.secrets.set('api-key', 'your-secret-api-key');

// Store user credentials
await ctx.api.secrets.set('auth-token', userAuthToken);
```

#### `get(key: string): Promise<string | null>`
Retrieves a secret value (returns null if not found).

```typescript
const apiKey = await ctx.api.secrets.get('api-key');
if (apiKey) {
  // Use the API key
  const data = await fetch(`https://api.example.com/data?key=${apiKey}`);
}
```

#### `delete(key: string): Promise<void>`
Permanently deletes a secret.

```typescript
await ctx.api.secrets.delete('old-api-key');
```

> **Info**
> **Security Note**: Secrets are encrypted at rest and scoped to your addon. Other addons cannot access your secrets, and you cannot access theirs.

---

## Logger API

Provides logging functionality with automatic addon prefix.

### Methods

#### `error(message: string): void`
Logs an error message.

```typescript
ctx.api.logger.error('Failed to fetch data from API');
```

#### `info(message: string): void`
Logs an informational message.

```typescript
ctx.api.logger.info('Data sync completed successfully');
```

#### `warn(message: string): void`
Logs a warning message.

```typescript
ctx.api.logger.warn('API rate limit approaching');
```

#### `debug(message: string): void`
Logs a debug message.

```typescript
ctx.api.logger.debug('Processing 100 activities');
```

#### `trace(message: string): void`
Logs a trace message for detailed debugging.

```typescript
ctx.api.logger.trace('Entering function processActivity');
```

---

## Event System

Listen to real-time events for responsive addon behavior.

### Portfolio Events

#### `onUpdateStart(callback: EventCallback): Promise<UnlistenFn>`
Fires when portfolio update starts.

```typescript
const unlistenStart = await ctx.api.events.portfolio.onUpdateStart((event) => {
  console.log('Portfolio update started');
  showLoadingIndicator();
});
```

#### `onUpdateComplete(callback: EventCallback): Promise<UnlistenFn>`
Fires when portfolio calculations are updated.

```typescript
const unlistenPortfolio = await ctx.api.events.portfolio.onUpdateComplete((event) => {
  console.log('Portfolio updated:', event.payload);
  // Refresh your addon's data
  refreshPortfolioData();
});

// Clean up on disable
ctx.onDisable(() => {
  unlistenPortfolio();
});
```

#### `onUpdateError(callback: EventCallback): Promise<UnlistenFn>`
Fires when portfolio update encounters an error.

```typescript
const unlistenError = await ctx.api.events.portfolio.onUpdateError((event) => {
  console.error('Portfolio update failed:', event.payload);
  showErrorMessage();
});
```

### Market Events

#### `onSyncStart(callback: EventCallback): Promise<UnlistenFn>`
Fires when market data sync starts.

```typescript
const unlistenSyncStart = await ctx.api.events.market.onSyncStart(() => {
  console.log('Market sync started');
  showSyncIndicator();
});
```

#### `onSyncComplete(callback: EventCallback): Promise<UnlistenFn>`
Fires when market data sync is completed.

```typescript
const unlistenMarket = await ctx.api.events.market.onSyncComplete(() => {
  console.log('Market data updated!');
  // Update price displays
  updatePriceDisplays();
});
```
