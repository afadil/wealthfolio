# Subdomain API Structure - Examples & Usage

## Overview

The new subdomain structure organizes the HostAPI into logical functional areas, making it much easier to discover and use the right functions.

## Before vs After Comparison

### ❌ Before (Flat Structure)
```typescript
// Hard to discover, potential naming conflicts
await ctx.api.getAccounts();
await ctx.api.getActivities();
await ctx.api.getHoldings(accountId);
await ctx.api.createActivity(activity);
await ctx.api.updateActivity(activity);
await ctx.api.getExchangeRates();
await ctx.api.getGoals();
await ctx.api.searchTicker(query);
// ... 80+ functions at the root level
```

### ✅ After (Subdomain Structure)
```typescript
// Well organized, excellent IntelliSense
await ctx.api.accounts.getAll();
await ctx.api.activities.getAll();
await ctx.api.portfolio.getHoldings(accountId);
await ctx.api.activities.create(activity);
await ctx.api.activities.update(activity);
await ctx.api.exchangeRates.getAll();
await ctx.api.goals.getAll();
await ctx.api.market.searchTicker(query);
```

## Complete API Structure

```typescript
ctx.api = {
  accounts: {
    getAll()           // Get all accounts
    create(account)    // Create new account
    update(account)    // Update account
    delete(accountId)  // Delete account
  },
  
  portfolio: {
    getHoldings(accountId)                    // Get holdings for account
    getHolding(accountId, assetId)           // Get specific holding
    update()                                 // Update portfolio calculations
    recalculate()                           // Recalculate entire portfolio
    getIncomeSummary()                      // Get income data
    getHistoricalValuations(...)            // Get historical data
  },
  
  activities: {
    getAll(accountId?)                      // Get activities
    search(page, pageSize, filters, ...)    // Search with pagination
    create(activity)                        // Create activity
    update(activity)                        // Update activity
    saveMany(activities)                    // Save multiple activities
    delete(activityId)                      // Delete activity
    import(activities)                      // Import activities
    checkImport(accountId, activities)      // Validate before import
    getImportMapping(accountId)             // Get import config
    saveImportMapping(mapping)              // Save import config
  },
  
  market: {
    searchTicker(query)                     // Search for symbols
    syncHistory()                           // Sync historical data
    sync(symbols, refetchAll)               // Sync market data
    getProviders()                          // Get data providers
  },
  
  assets: {
    getProfile(assetId)                     // Get asset profile
    updateProfile(payload)                  // Update asset profile
    updateDataSource(symbol, dataSource)   // Change data source
  },
  
  quotes: {
    update(symbol, quote)                   // Update quote
    delete(id)                              // Delete quote
    getHistory(symbol)                      // Get quote history
  },
  
  performance: {
    calculateHistory(itemType, itemId, startDate, endDate)  // Calculate performance history
    calculateSummary(args)                                  // Calculate performance summary
    calculateAccountsSimple(accountIds)                     // Simple performance for accounts
  },
  
  exchangeRates: {
    getAll()                               // Get all rates
    update(rate)                           // Update rate
    add(newRate)                           // Add new rate
    delete(rateId)                         // Delete rate
  },
  
  contributionLimits: {
    getAll()                               // Get all limits
    create(newLimit)                       // Create limit
    update(id, updatedLimit)               // Update limit
    delete(id)                             // Delete limit
    calculateDeposits(limitId)             // Calculate deposits
  },
  
  goals: {
    getAll()                               // Get all goals
    create(goal)                           // Create goal
    update(goal)                           // Update goal
    delete(goalId)                         // Delete goal
    updateAllocations(allocations)         // Update allocations
    getAllocations()                       // Get allocations
  },
  
  settings: {
    get()                                  // Get settings
    update(settings)                       // Update settings
    backupDatabase()                       // Create backup
  },
  
  files: {
    openCsvDialog()                        // Open CSV file dialog
    openSaveDialog(content, fileName)      // Open save dialog
  },
  
  events: {
    import: {
      onDropHover(handler)                 // File drop hover events
      onDrop(handler)                      // File drop events
      onDropCancelled(handler)             // File drop cancelled
    },
    portfolio: {
      onUpdateStart(handler)               // Portfolio update start
      onUpdateComplete(handler)            // Portfolio update complete
      onUpdateError(handler)               // Portfolio update error
    },
    market: {
      onSyncStart(handler)                 // Market sync start
      onSyncComplete(handler)              // Market sync complete
    }
  }
}
```

## Practical Examples

### 📊 Portfolio Management Addon
```typescript
import type { AddonContext, Holding } from '@wealthfolio/addon-sdk';

export function enable(ctx: AddonContext) {
  ctx.sidebar.addItem({
    id: 'portfolio-analyzer',
    label: 'Portfolio Analyzer',
    route: '/portfolio-analyzer'
  });

  // Get all accounts and their holdings
  async function analyzePortfolio() {
    const accounts = await ctx.api.accounts.getAll();
    
    for (const account of accounts) {
      const holdings = await ctx.api.portfolio.getHoldings(account.id);
      const performance = await ctx.api.performance.calculateSummary({
        itemType: 'account',
        itemId: account.id,
        startDate: '2024-01-01',
        endDate: '2024-12-31'
      });
      
      console.log(`Account ${account.name}:`, {
        holdingsCount: holdings.length,
        performance
      });
    }
  }

  // Listen for portfolio updates
  ctx.api.events.portfolio.onUpdateComplete(() => {
    console.log('Portfolio updated, refreshing analysis...');
    analyzePortfolio();
  });
}
```

### 📈 Market Data Tracker Addon
```typescript
import type { AddonContext, Quote } from '@wealthfolio/addon-sdk';

export function enable(ctx: AddonContext) {
  // Track specific symbols
  async function trackSymbols(symbols: string[]) {
    // Search for symbols first
    for (const symbol of symbols) {
      const results = await ctx.api.market.searchTicker(symbol);
      console.log(`Found ${results.length} results for ${symbol}`);
    }

    // Sync market data
    await ctx.api.market.sync(symbols, false);
    
    // Get quote history
    for (const symbol of symbols) {
      const history = await ctx.api.quotes.getHistory(symbol);
      console.log(`${symbol} has ${history.length} historical quotes`);
    }
  }

  // Listen for market sync events
  ctx.api.events.market.onSyncStart(() => {
    console.log('Market sync started...');
  });

  ctx.api.events.market.onSyncComplete(() => {
    console.log('Market sync completed!');
  });
}
```

### 💰 Activity Import Addon
```typescript
import type { AddonContext, ActivityImport, ActivityType } from '@wealthfolio/addon-sdk';

export function enable(ctx: AddonContext) {
  async function importActivities() {
    // Open CSV file dialog
    const filePath = await ctx.api.files.openCsvDialog();
    if (!filePath) return;

    // Parse activities (your custom logic here)
    const activities: ActivityImport[] = [
      {
        accountId: 'account-123',
        activityType: ActivityType.BUY,
        symbol: 'AAPL',
        quantity: 100,
        unitPrice: 150.25,
        isDraft: false,
        isValid: true
      }
    ];

    // Check import validity
    const checkedActivities = await ctx.api.activities.checkImport(
      'account-123', 
      activities
    );

    // Import if valid
    if (checkedActivities.every(a => a.isValid)) {
      const imported = await ctx.api.activities.import(checkedActivities);
      console.log(`Imported ${imported.length} activities`);
    }
  }

  // Listen for file drop events
  ctx.api.events.import.onDrop(async (event) => {
    console.log('File dropped:', event.payload);
    // Handle dropped file
  });
}
```

### ⚙️ Settings & Goals Manager
```typescript
import type { AddonContext, Goal, Settings } from '@wealthfolio/addon-sdk';

export function enable(ctx: AddonContext) {
  async function manageSettings() {
    // Get current settings
    const settings = await ctx.api.settings.get();
    console.log('Current base currency:', settings.baseCurrency);

    // Update settings
    await ctx.api.settings.update({
      ...settings,
      theme: 'dark'
    });
  }

  async function manageGoals() {
    // Get all goals
    const goals = await ctx.api.goals.getAll();
    
    // Create a new goal
    const newGoal = await ctx.api.goals.create({
      title: 'Emergency Fund',
      targetAmount: 50000,
      description: 'Build emergency fund'
    });

    // Get goal allocations
    const allocations = await ctx.api.goals.getAllocations();
    console.log('Goal allocations:', allocations);
  }
}
```

## Benefits of Subdomain Structure

### 🎯 **Better Organization**
- Related functions grouped together
- Logical hierarchy that matches mental models
- Easy to find what you need

### 🔍 **Improved Discoverability**
- IntelliSense shows relevant functions
- Type completion guides you to the right API
- Self-documenting structure

### 🚀 **Enhanced Developer Experience**
```typescript
// Type ctx.api. and see all domains
ctx.api.accounts.     // <- IntelliSense shows account functions
ctx.api.portfolio.    // <- IntelliSense shows portfolio functions
ctx.api.activities.   // <- IntelliSense shows activity functions
```

### 📚 **Better Documentation**
- Each subdomain can have focused documentation
- Examples are more relevant and targeted
- Easier to write comprehensive guides

### 🔧 **Maintainability**
- Clear separation of concerns
- Easy to add new functions to appropriate domains
- Prevents API sprawl at the root level

### 🎨 **Familiar Patterns**
- Matches common API design patterns
- Similar to popular libraries (AWS SDK, Google APIs)
- Intuitive for developers

## Migration Guide

### For Existing Addons
If you have existing addons using the flat structure, here's how to migrate:

```typescript
// Old way
await ctx.api.getAccounts();
await ctx.api.createActivity(activity);
await ctx.api.getHoldings(accountId);

// New way
await ctx.api.accounts.getAll();
await ctx.api.activities.create(activity);
await ctx.api.portfolio.getHoldings(accountId);
```

### Automated Migration
You could create a simple find-and-replace script:
```bash
# Replace common patterns
sed -i 's/ctx\.api\.getAccounts/ctx.api.accounts.getAll/g' *.ts
sed -i 's/ctx\.api\.createActivity/ctx.api.activities.create/g' *.ts
sed -i 's/ctx\.api\.getHoldings/ctx.api.portfolio.getHoldings/g' *.ts
# ... etc
```

## Conclusion

The subdomain structure provides a much better developer experience while maintaining all the functionality. It's:

✅ **More discoverable** - Easy to find the right function
✅ **Better organized** - Logical grouping of related functionality  
✅ **Type-safe** - Full IntelliSense support
✅ **Scalable** - Easy to add new functions without clutter
✅ **Professional** - Matches industry-standard API design patterns

This structure sets up the addon ecosystem for long-term success and makes it much easier for developers to build powerful addons for Wealthfolio.
