# Wealthfolio Addon Developer Guide

Welcome to the comprehensive guide for developing Wealthfolio addons! This guide will take you from your first addon to advanced development patterns.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Development Environment](#development-environment)
3. [Addon Architecture](#addon-architecture)
4. [API Reference](#api-reference)
5. [Examples & Tutorials](#examples--tutorials)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)
8. [Publishing & Distribution](#publishing--distribution)

---

## Quick Start

### Prerequisites

- Node.js 20+ and pnpm
- Wealthfolio app running in development mode
- Basic knowledge of TypeScript/React

### Create Your First Addon

```bash
# Navigate to your development directory
cd /path/to/your/addons

# Create a new addon
npx @wealthfolio/addon-dev-tools create my-first-addon

# Navigate to the addon directory
cd my-first-addon

# Install dependencies
npm install

# Start development server with hot reload
npm run dev:server
```

### Your First Addon Code

```typescript
// src/addon.tsx
import React from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';

function MyAddonPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My First Addon</h1>
      <p>Welcome to Wealthfolio addon development!</p>
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  // Add sidebar item
  const sidebarItem = ctx.sidebar.addItem({
    id: 'my-first-addon',
    label: 'My Addon',
    route: '/my-first-addon',
    order: 100
  });

  // Add route
  ctx.router.add({
    path: '/my-first-addon',
    component: React.lazy(() => Promise.resolve({ default: MyAddonPage }))
  });

  // Return cleanup function
  return {
    disable() {
      sidebarItem.remove();
    }
  };
}
```

The main Wealthfolio app will automatically detect and load your addon when both are running in development mode.

---

## Development Environment

### Hot Reload Development

The development environment provides seamless hot reload:

1. **File Watching**: Automatically watches your `src/` directory
2. **Auto Build**: Rebuilds when files change using Vite
3. **Hot Swap**: Reloads only your addon without full page refresh
4. **Auto Discovery**: Main app automatically detects development servers

### Development Commands

**Using npm scripts (recommended):**
```bash
# Start development server with hot reload
npm run dev:server

# Build addon for testing
npm run build

# Package addon for distribution
npm run bundle

# Watch build (alternative to dev server)
npm run dev

# Type checking
npm run lint

# Clean build artifacts
npm run clean
```

**Using CLI directly:**
```bash
# Start development server
wealthfolio dev

# Build addon
wealthfolio build

# Package addon
wealthfolio package

# Test setup
wealthfolio test
```

### Project Structure

```
my-addon/
├── src/
│   └── addon.tsx          # Main addon entry point
├── dist/                  # Built files (generated)
├── manifest.json          # Addon metadata and permissions
├── package.json           # NPM package configuration
├── vite.config.ts         # Build configuration
├── tsconfig.json          # TypeScript configuration
└── README.md              # Documentation
```

### Debugging Tools

Access these debugging tools in the browser console:

```javascript
// Check addon development status
__ADDON_DEV__.getStatus()

// List development servers
__ADDON_DEV__.listServers()

// Manual discovery of development servers
discoverAddons()

// Manual reload of all addons
reloadAddons()
```

---

## Addon Architecture

### Addon Lifecycle

```typescript
export default function enable(ctx: AddonContext) {
  // 1. Initialization - Set up your addon
  console.log('Addon starting...');
  
  // 2. Register UI components, routes, etc.
  const sidebarItem = ctx.sidebar.addItem({ /* ... */ });
  
  // 3. Set up event listeners
  const unlisten = ctx.api.events.portfolio.onUpdateComplete(() => {
    console.log('Portfolio updated!');
  });
  
  // 4. Return cleanup function
  return {
    disable() {
      // Clean up resources
      sidebarItem.remove();
      unlisten();
      console.log('Addon disabled');
    }
  };
}
```

### Addon Context

The `AddonContext` provides access to all Wealthfolio functionality:

```typescript
interface AddonContext {
  // UI Integration
  sidebar: SidebarAPI;
  router: RouterAPI;
  
  // Data & Operations - Organized by subdomain!
  api: {
    accounts: AccountsAPI;
    portfolio: PortfolioAPI;
    activities: ActivitiesAPI;
    market: MarketAPI;
    assets: AssetsAPI;
    quotes: QuotesAPI;
    performance: PerformanceAPI;
    exchangeRates: ExchangeRatesAPI;
    contributionLimits: ContributionLimitsAPI;
    goals: GoalsAPI;
    settings: SettingsAPI;
    files: FilesAPI;
    events: EventsAPI;
    secrets: SecretsAPI; // Scoped to your addon
  };
  
  // Lifecycle
  onDisable: (callback: () => void) => void;
}
```

### Permissions System

Wealthfolio uses an advanced permission system that automatically analyzes your addon's code and compares it with declared permissions for transparent security.

#### Permission Declaration

Define required permissions in your `manifest.json`:

```json
{
  "id": "my-addon",
  "name": "My Addon",
  "version": "1.0.0",
  "permissions": {
    "accounts": ["read"],
    "portfolio": ["read"],
    "activities": ["read", "write"],
    "market": ["read"],
    "files": ["read"]
  },
  "dataAccess": [
    {
      "category": "portfolio",
      "functions": ["getHoldings"],
      "purpose": "Display portfolio analytics dashboard"
    },
    {
      "category": "market-data",
      "functions": ["searchTicker", "sync"],
      "purpose": "Show price charts and ticker search"
    }
  ]
}
```

#### How Permission Analysis Works

1. **Installation Time**: System analyzes your addon's source code
2. **Function Detection**: Identifies all API function calls automatically
3. **Risk Assessment**: Categorizes permissions by risk level (Low/Medium/High)
4. **User Review**: Users see exactly what permissions your addon needs before installation
5. **Performance**: Analysis cached for ultra-fast runtime performance

#### Permission Categories & Risk Levels

- **🏦 Account Management (High Risk)**: Account creation, modification, deletion
- **📊 Portfolio Data (Medium Risk)**: Holdings, valuations, performance metrics  
- **📝 Transaction History (High Risk)**: Trading activities, imports, modifications
- **📈 Market Data (Low Risk)**: Quotes, prices, financial data
- **🎯 Financial Planning (Medium Risk)**: Goals, contribution limits
- **💱 Currency (Low Risk)**: Exchange rates and conversion
- **⚙️ Application Settings (High Risk)**: App configuration, backups
- **📂 File Operations (Medium Risk)**: File dialogs, system operations
- **🎧 Event Listeners (Low Risk)**: Application events, notifications
- **🎨 User Interface (Low Risk)**: Navigation, UI components

For detailed information, see the [Addon Permissions Guide](addon-permissions.md).

---

## API Reference

### Subdomain Organization

The API is organized into logical subdomains for better discoverability:

#### 🏦 Accounts API
```typescript
// Get all accounts
const accounts = await ctx.api.accounts.getAll();

// Create new account
const newAccount = await ctx.api.accounts.create({
  name: 'My Investment Account',
  accountType: AccountType.CASH,
  currency: 'USD'
});

// Update account
await ctx.api.accounts.update(account);

// Delete account
await ctx.api.accounts.delete(accountId);
```

#### 📊 Portfolio API
```typescript
// Get holdings for an account
const holdings = await ctx.api.portfolio.getHoldings(accountId);

// Get specific holding
const holding = await ctx.api.portfolio.getHolding(accountId, assetId);

// Get income summary
const income = await ctx.api.portfolio.getIncomeSummary();

// Update portfolio calculations
await ctx.api.portfolio.update();
```

#### 📝 Activities API
```typescript
// Get all activities
const activities = await ctx.api.activities.getAll();

// Search activities with pagination
const results = await ctx.api.activities.search(1, 50, {
  accountId: 'account-123',
  activityType: ActivityType.BUY
});

// Create new activity
const activity = await ctx.api.activities.create({
  accountId: 'account-123',
  activityType: ActivityType.BUY,
  assetId: 'AAPL',
  quantity: 100,
  unitPrice: 150.25,
  activityDate: new Date(),
  isDraft: false
});

// Import multiple activities
const imported = await ctx.api.activities.import(activities);
```

#### 📈 Market Data API
```typescript
// Search for ticker symbols
const results = await ctx.api.market.searchTicker('AAPL');

// Sync market data
await ctx.api.market.sync(['AAPL', 'MSFT'], false);

// Get market data providers
const providers = await ctx.api.market.getProviders();
```

#### 🎯 Performance API
```typescript
// Calculate performance history
const history = await ctx.api.performance.calculateHistory(
  'account',
  'account-123',
  '2024-01-01',
  '2024-12-31'
);

// Calculate performance summary
const summary = await ctx.api.performance.calculateSummary({
  itemType: 'account',
  itemId: 'account-123'
});
```

#### 🎧 Events API
```typescript
// Portfolio events
const unlistenPortfolio = await ctx.api.events.portfolio.onUpdateComplete((event) => {
  console.log('Portfolio updated:', event.payload);
});

// Market events
const unlistenMarket = await ctx.api.events.market.onSyncComplete(() => {
  console.log('Market sync completed!');
});

// Import events
const unlistenImport = await ctx.api.events.import.onDrop((event) => {
  console.log('File dropped:', event.payload);
});

// Clean up
ctx.onDisable(() => {
  unlistenPortfolio();
  unlistenMarket();
  unlistenImport();
});
```

#### 🔐 Secrets API (Addon-Scoped)
```typescript
// Store sensitive data (scoped to your addon)
await ctx.api.secrets.set('api-key', 'your-secret-key');

// Retrieve sensitive data
const apiKey = await ctx.api.secrets.get('api-key');

// Delete sensitive data
await ctx.api.secrets.delete('api-key');

// List all keys (returns key names only, not values)
const keys = await ctx.api.secrets.list();
```

### Activity Types Reference

When working with activities, use these standard types:

| Type | Use Case | Cash Impact | Holdings Impact |
|------|----------|-------------|-----------------|
| `BUY` | Purchase securities | Decreases cash | Increases quantity |
| `SELL` | Dispose of securities | Increases cash | Decreases quantity |
| `DIVIDEND` | Cash dividend received | Increases cash | – |
| `INTEREST` | Interest earned | Increases cash | – |
| `DEPOSIT` | Funds added to account | Increases cash | – |
| `WITHDRAWAL` | Funds removed from account | Decreases cash | – |
| `TRANSFER_IN` | Assets moved in from another account | Increases cash/quantity | Preserves cost basis |
| `TRANSFER_OUT` | Assets moved out to another account | Decreases cash/quantity | Preserves cost basis |
| `FEE` | Brokerage fees | Decreases cash | – |
| `TAX` | Taxes paid | Decreases cash | – |

---

## Examples & Tutorials

### Example 1: Portfolio Analytics Dashboard

```typescript
import React, { useState, useEffect } from 'react';
import type { AddonContext, Holding, Account } from '@wealthfolio/addon-sdk';

function AnalyticsDashboard({ ctx }: { ctx: AddonContext }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const accountsData = await ctx.api.accounts.getAll();
        setAccounts(accountsData);

        // Load holdings for all accounts
        const allHoldings = [];
        for (const account of accountsData) {
          const accountHoldings = await ctx.api.portfolio.getHoldings(account.id);
          allHoldings.push(...accountHoldings);
        }
        setHoldings(allHoldings);
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Listen for portfolio updates
    const unlisten = ctx.api.events.portfolio.onUpdateComplete(() => {
      loadData();
    });

    return () => unlisten();
  }, [ctx]);

  if (loading) {
    return <div className="p-6">Loading analytics...</div>;
  }

  const totalValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
  const totalCost = holdings.reduce((sum, holding) => sum + holding.bookValue, 0);
  const totalGainLoss = totalValue - totalCost;
  const gainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Portfolio Analytics</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Value</h3>
          <p className="text-2xl font-bold">${totalValue.toLocaleString()}</p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Cost</h3>
          <p className="text-2xl font-bold">${totalCost.toLocaleString()}</p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Gain/Loss</h3>
          <p className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${totalGainLoss.toLocaleString()}
          </p>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Gain/Loss %</h3>
          <p className={`text-2xl font-bold ${gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {gainLossPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Holdings Summary</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Symbol</th>
                <th className="text-left py-2">Quantity</th>
                <th className="text-left py-2">Market Value</th>
                <th className="text-left py-2">Book Value</th>
                <th className="text-left py-2">Gain/Loss</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => {
                const gainLoss = holding.marketValue - holding.bookValue;
                return (
                  <tr key={holding.id} className="border-b">
                    <td className="py-2 font-medium">{holding.symbol}</td>
                    <td className="py-2">{holding.quantity}</td>
                    <td className="py-2">${holding.marketValue.toLocaleString()}</td>
                    <td className="py-2">${holding.bookValue.toLocaleString()}</td>
                    <td className={`py-2 ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${gainLoss.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: 'portfolio-analytics',
    label: 'Portfolio Analytics',
    route: '/addon/portfolio-analytics',
    order: 100
  });

  ctx.router.add({
    path: '/addon/portfolio-analytics',
    component: React.lazy(() => Promise.resolve({ 
      default: () => <AnalyticsDashboard ctx={ctx} />
    }))
  });

  return {
    disable() {
      sidebarItem.remove();
    }
  };
}
```

### Example 2: Activity Import Tool

```typescript
import React, { useState } from 'react';
import type { AddonContext, ActivityImport, ActivityType } from '@wealthfolio/addon-sdk';

function ActivityImporter({ ctx }: { ctx: AddonContext }) {
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<string>('');

  const handleImportCSV = async () => {
    try {
      setImporting(true);
      setResults('Opening file dialog...');

      // Open CSV file dialog
      const filePath = await ctx.api.files.openCsvDialog();
      if (!filePath) {
        setResults('No file selected');
        return;
      }

      setResults('Processing CSV file...');

      // In a real addon, you would parse the CSV file here
      // This is a simplified example
      const activities: ActivityImport[] = [
        {
          accountId: 'account-123', // You'd get this from user selection
          activityType: ActivityType.BUY,
          symbol: 'AAPL',
          quantity: 100,
          unitPrice: 150.25,
          activityDate: new Date('2024-01-15'),
          isDraft: false,
          isValid: true
        },
        {
          accountId: 'account-123',
          activityType: ActivityType.DIVIDEND,
          symbol: 'AAPL',
          amount: 132.50,
          activityDate: new Date('2024-01-20'),
          isDraft: false,
          isValid: true
        }
      ];

      setResults('Validating activities...');

      // Check import validity
      const checkedActivities = await ctx.api.activities.checkImport(
        'account-123',
        activities
      );

      const validCount = checkedActivities.filter(a => a.isValid).length;
      const invalidCount = checkedActivities.length - validCount;

      if (invalidCount > 0) {
        setResults(`Found ${invalidCount} invalid activities. Please review and fix.`);
        return;
      }

      setResults('Importing activities...');

      // Import activities
      const imported = await ctx.api.activities.import(checkedActivities);

      setResults(`Successfully imported ${imported.length} activities!`);

      // Refresh portfolio after import
      await ctx.api.portfolio.update();

    } catch (error) {
      setResults(`Error: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Activity Importer</h1>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Import Activities from CSV</h2>
        <p className="text-gray-600 mb-4">
          Import your trading activities from a CSV file. The importer will validate
          all activities before importing them.
        </p>
        
        <button
          onClick={handleImportCSV}
          disabled={importing}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {importing ? 'Importing...' : 'Import CSV File'}
        </button>
        
        {results && (
          <div className="mt-4 p-4 bg-gray-50 rounded">
            <p className="text-sm">{results}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: 'activity-importer',
    label: 'Activity Importer',
    route: '/addon/activity-importer',
    order: 200
  });

  ctx.router.add({
    path: '/addon/activity-importer',
    component: React.lazy(() => Promise.resolve({ 
      default: () => <ActivityImporter ctx={ctx} />
    }))
  });

  // Listen for file drop events
  const unlistenDrop = ctx.api.events.import.onDrop((event) => {
    console.log('File dropped for import:', event.payload);
    // Handle dropped files here
  });

  return {
    disable() {
      sidebarItem.remove();
      unlistenDrop();
    }
  };
}
```

### Example 3: Market Data Integration

```typescript
import React, { useState, useEffect } from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';

function MarketDataTool({ ctx }: { ctx: AddonContext }) {
  const [apiKey, setApiKey] = useState('');
  const [symbols, setSymbols] = useState('AAPL,MSFT,GOOGL');
  const [syncing, setSyncing] = useState(false);
  const [results, setResults] = useState('');

  useEffect(() => {
    // Load saved API key
    async function loadApiKey() {
      const savedKey = await ctx.api.secrets.get('market-data-api-key');
      if (savedKey) {
        setApiKey('***SAVED***');
      }
    }
    loadApiKey();
  }, [ctx]);

  const handleSaveApiKey = async () => {
    try {
      await ctx.api.secrets.set('market-data-api-key', apiKey);
      setResults('API key saved successfully!');
    } catch (error) {
      setResults(`Error saving API key: ${error.message}`);
    }
  };

  const handleSyncMarketData = async () => {
    try {
      setSyncing(true);
      setResults('Starting market data sync...');

      const symbolList = symbols.split(',').map(s => s.trim());
      
      // Search for symbols first
      for (const symbol of symbolList) {
        const searchResults = await ctx.api.market.searchTicker(symbol);
        setResults(prev => prev + `\nFound ${searchResults.length} results for ${symbol}`);
      }

      // Sync market data
      await ctx.api.market.sync(symbolList, false);
      
      setResults(prev => prev + '\nMarket data sync completed successfully!');

    } catch (error) {
      setResults(prev => prev + `\nError: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Market Data Tool</h1>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">API Configuration</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="Enter your market data API key"
            />
          </div>
          <button
            onClick={handleSaveApiKey}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Save API Key
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Sync Market Data</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Symbols (comma-separated)</label>
            <input
              type="text"
              value={symbols}
              onChange={(e) => setSymbols(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="AAPL,MSFT,GOOGL"
            />
          </div>
          <button
            onClick={handleSyncMarketData}
            disabled={syncing}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync Market Data'}
          </button>
        </div>
      </div>

      {results && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Results</h2>
          <pre className="text-sm bg-gray-50 p-4 rounded whitespace-pre-wrap">
            {results}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: 'market-data-tool',
    label: 'Market Data',
    route: '/addon/market-data-tool',
    order: 300
  });

  ctx.router.add({
    path: '/addon/market-data-tool',
    component: React.lazy(() => Promise.resolve({ 
      default: () => <MarketDataTool ctx={ctx} />
    }))
  });

  // Listen for market sync events
  const unlistenSyncStart = ctx.api.events.market.onSyncStart(() => {
    console.log('Market sync started...');
  });

  const unlistenSyncComplete = ctx.api.events.market.onSyncComplete(() => {
    console.log('Market sync completed!');
  });

  return {
    disable() {
      sidebarItem.remove();
      unlistenSyncStart();
      unlistenSyncComplete();
    }
  };
}
```

---

## Best Practices

### 1. Error Handling

Always include comprehensive error handling:

```typescript
export default function enable(ctx: AddonContext) {
  try {
    // Your addon initialization logic
    
    return {
      disable() {
        try {
          // Cleanup logic
        } catch (error) {
          console.error('Addon cleanup error:', error);
        }
      }
    };
  } catch (error) {
    console.error('Addon initialization error:', error);
    return { disable: () => {} };
  }
}
```

### 2. Resource Cleanup

Always clean up resources in the disable function:

```typescript
export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({ /* ... */ });
  const unlistenEvent = ctx.api.events.portfolio.onUpdateComplete(() => {});
  
  return {
    disable() {
      sidebarItem.remove();
      unlistenEvent();
    }
  };
}
```

### 3. TypeScript Usage

Take full advantage of TypeScript:

```typescript
import type { 
  AddonContext, 
  Account, 
  Holding, 
  ActivityType,
  ActivityCreate 
} from '@wealthfolio/addon-sdk';

export default function enable(ctx: AddonContext) {
  // Type-safe development with full IntelliSense
  const createBuyActivity = async (
    accountId: string,
    symbol: string,
    quantity: number,
    price: number
  ): Promise<void> => {
    const activity: ActivityCreate = {
      accountId,
      activityType: ActivityType.BUY,
      assetId: symbol,
      quantity,
      unitPrice: price,
      activityDate: new Date(),
      isDraft: false
    };
    
    await ctx.api.activities.create(activity);
  };
}
```

### 4. Environment Detection

Use environment detection for development features:

```typescript
const isDev = import.meta.env.DEV;

export default function enable(ctx: AddonContext) {
  if (isDev) {
    console.log('Development mode - extra logging enabled');
    // Add development-only features
  }
  
  // Your addon logic
}
```

### 5. Security & Permissions

Follow security best practices for user trust:

```typescript
export default function enable(ctx: AddonContext) {
  // ✅ Use Secrets API for sensitive data
  async function setupApiKey() {
    const apiKey = await ctx.api.secrets.get('market-api-key');
    if (!apiKey) {
      // Prompt user for API key and store securely
      const userKey = await promptForApiKey();
      await ctx.api.secrets.set('market-api-key', userKey);
    }
  }

  // ✅ Handle permission errors gracefully
  async function loadAccountData() {
    try {
      return await ctx.api.accounts.getAll();
    } catch (error) {
      if (error.code === 'PERMISSION_DENIED') {
        console.error('Missing accounts permission - check manifest.json');
        return [];
      }
      throw error;
    }
  }

  // ✅ Validate inputs before API calls
  async function createActivity(data: any) {
    if (!data.accountId || !data.activityType) {
      throw new Error('Missing required activity data');
    }
    return await ctx.api.activities.create(data);
  }
}
```

**Permission Checklist:**
- ✅ Declare only permissions you actually use
- ✅ Provide clear purpose descriptions in manifest
- ✅ Test permission dialog before distribution
- ✅ Handle permission errors gracefully

### 6. Async/Await Best Practices

Handle async operations properly:

```typescript
export default function enable(ctx: AddonContext) {
  // Use async/await for API calls
  async function loadPortfolioData() {
    try {
      const accounts = await ctx.api.accounts.getAll();
      const holdings = await Promise.all(
        accounts.map(account => ctx.api.portfolio.getHoldings(account.id))
      );
      return holdings.flat();
    } catch (error) {
      console.error('Failed to load portfolio data:', error);
      return [];
    }
  }
  
  // Handle async initialization
  loadPortfolioData().then(holdings => {
    console.log(`Loaded ${holdings.length} holdings`);
  });
}
```

---

## Troubleshooting

### Common Issues

#### 1. Dev Server Not Starting
- **Check port availability**: Ensure port 3001 is available
- **Validate manifest**: Ensure `manifest.json` exists and is valid JSON
- **Dependencies**: Verify npm dependencies are installed with `npm install`

#### 2. Hot Reload Not Working
- **Check browser console**: Look for JavaScript errors
- **Verify dev mode**: Ensure main app is running in development mode
- **Test connectivity**: `curl http://localhost:3001/health`
- **Manual discovery**: Run `discoverAddons()` in browser console
- **Port range**: Ensure dev server port is in scan range (3001-3005)

#### 3. Addon Not Loading
- **Syntax errors**: Check addon code for TypeScript/JavaScript errors
- **Permissions**: Verify `manifest.json` permissions are correct
- **Network requests**: Check browser Network tab for failed requests
- **Manual registration**: Try manual registration in console

#### 4. API Calls Failing
- **Permissions**: Ensure required permissions are declared in manifest
- **Type errors**: Check TypeScript types match expected API
- **Network issues**: Verify main app is running and accessible

#### 5. TypeScript Errors
- **SDK version**: Ensure you're using the latest `@wealthfolio/addon-sdk`
- **Type imports**: Import types correctly from the SDK
- **Build errors**: Check `npm run build` output for detailed errors

### Debug Commands

```bash
# Check if development server is running
curl http://localhost:3001/health

# Check addon status
curl http://localhost:3001/status

# View available files
curl http://localhost:3001/files

# Test server connectivity
curl http://localhost:3001/test
```

### Manual Registration

If auto-discovery fails:

```javascript
// In the main app's browser console
__ADDON_DEV__.registerDevServer({
  id: 'your-addon-id',
  name: 'Your Addon Name', 
  port: 3001
});

// Then try to load it
__ADDON_DEV__.loadAddonFromDevServer('your-addon-id');
```

### Environment Variables

For advanced debugging, set these environment variables:

**Main App** (optional):
```env
# Enable addon development features
VITE_ADDON_DEV=true

# Enable auto-discovery logging  
VITE_ADDON_AUTO_DISCOVER=true
```

**Addon** (optional):
```env
VITE_DEV_MODE=true
VITE_DEBUG=true
```

---

## Publishing & Distribution

### Building for Production

```bash
# Clean previous builds
npm run clean

# Build addon
npm run build

# Create distribution package
npm run bundle
```

### Testing Production Build

Before distribution:

```bash
# Build and test
npm run bundle

# Install the generated .zip file in Wealthfolio to test
```

### Manifest Requirements

Ensure your `manifest.json` is complete:

```json
{
  "id": "unique-addon-id",
  "name": "Human Readable Name",
  "version": "1.0.0",
  "description": "Brief description of your addon",
  "author": "Your Name",
  "homepage": "https://your-addon-homepage.com",
  "permissions": {
    "accounts": ["read"],
    "portfolio": ["read"],
    "activities": ["read", "write"],
    "market": ["read"],
    "files": ["read"]
  }
}
```

### Distribution Checklist

- [ ] Addon builds without errors
- [ ] All features work in production build
- [ ] Permissions are correctly declared
- [ ] Documentation is complete
- [ ] Version number follows semver
- [ ] Testing completed on target Wealthfolio version

---

## Advanced Topics

### Custom Hooks

Create reusable hooks for common patterns:

```typescript
// hooks/usePortfolioData.ts
import { useState, useEffect } from 'react';
import type { AddonContext, Account, Holding } from '@wealthfolio/addon-sdk';

export function usePortfolioData(ctx: AddonContext) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const accountsData = await ctx.api.accounts.getAll();
        setAccounts(accountsData);

        const allHoldings = [];
        for (const account of accountsData) {
          const accountHoldings = await ctx.api.portfolio.getHoldings(account.id);
          allHoldings.push(...accountHoldings);
        }
        setHoldings(allHoldings);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    const unlisten = ctx.api.events.portfolio.onUpdateComplete(() => {
      loadData();
    });

    return unlisten;
  }, [ctx]);

  return { accounts, holdings, loading };
}
```

### Performance Optimization

```typescript
import React, { memo, useMemo } from 'react';

const HoldingsList = memo(({ holdings }: { holdings: Holding[] }) => {
  const sortedHoldings = useMemo(() => 
    holdings.sort((a, b) => b.marketValue - a.marketValue),
    [holdings]
  );

  return (
    <div>
      {sortedHoldings.map(holding => (
        <div key={holding.id}>{holding.symbol}</div>
      ))}
    </div>
  );
});
```

### State Management

For complex addons, consider using a state management solution:

```typescript
import { create } from 'zustand';

interface AddonState {
  data: any[];
  loading: boolean;
  setData: (data: any[]) => void;
  setLoading: (loading: boolean) => void;
}

const useAddonStore = create<AddonState>((set) => ({
  data: [],
  loading: false,
  setData: (data) => set({ data }),
  setLoading: (loading) => set({ loading }),
}));
```

---

## Support & Community

### Getting Help

- **Documentation**: Check this guide and API reference
- **Issues**: Report bugs and request features on GitHub
- **Community**: Join discussions in the community forum
- **Examples**: Browse example addons in the repository

### Contributing

We welcome contributions to improve the addon ecosystem:

- **Bug Reports**: Help us identify and fix issues
- **Feature Requests**: Suggest new API features or improvements
- **Documentation**: Improve guides and examples
- **Example Addons**: Share useful addon examples

---

This comprehensive guide should get you started with Wealthfolio addon development. The subdomain API structure makes it easy to discover and use the functionality you need, while the TypeScript integration provides excellent developer experience with full type safety and IntelliSense support.

Happy coding! 🚀
