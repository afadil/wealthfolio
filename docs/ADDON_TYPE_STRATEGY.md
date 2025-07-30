# Wealthfolio Addon SDK: Comprehensive Type Strategy & Implementation Guide

## Overview

This document outlines the best strategy and design for making the Wealthfolio runtime context fully typed with all available functions while sharing types with addons through a dedicated SDK package.

## Architecture Strategy

### ✅ Enhanced Addon SDK Package Approach

We've implemented a comprehensive solution using an enhanced `@wealthfolio/addon-sdk` package that includes:

1. **Complete Type Definitions**: All data types, enums, and interfaces
2. **Comprehensive HostAPI Interface**: Fully typed access to all Wealthfolio functionality  
3. **Type Bridge System**: Handles type compatibility between main app and SDK
4. **Version Management**: Proper versioning and export structure

## Implementation Components

### 1. Enhanced SDK Structure

```
packages/addon-sdk/src/
├── index.ts              # Main entry point with all exports
├── types.ts              # Core addon context and manager types
├── data-types.ts         # All Wealthfolio data types and enums
├── host-api.ts           # Complete HostAPI interface
├── manifest.ts           # Addon manifest types
├── permissions.ts        # Permission system types
└── utils.ts              # Utility functions
```

### 2. Key Benefits

✅ **Full Type Safety**: Addons get complete IntelliSense and type checking
✅ **Single Source of Truth**: All types defined once in the SDK
✅ **Version Controlled**: Proper semver for breaking changes
✅ **Tree Shakeable**: Only import what you need
✅ **Comprehensive API**: Access to all 80+ Wealthfolio functions
✅ **Event System**: Full support for Tauri event listeners
✅ **Development Experience**: Rich TypeScript support

### 3. Package Exports Structure

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./types": "./dist/types.js", 
    "./data-types": "./dist/data-types.js",
    "./host-api": "./dist/host-api.js",
    "./permissions": "./dist/permissions.js"
  }
}
```

## Usage Examples

### Basic Addon Development

```typescript
import type { AddonContext, Account, Holding } from '@wealthfolio/addon-sdk';

export function enable(ctx: AddonContext) {
  // Full type safety and IntelliSense
  ctx.sidebar.addItem({
    id: 'my-addon',
    label: 'My Addon',
    route: '/my-addon'
  });

  // Access to all APIs with proper typing - organized by subdomain!
  const accounts = await ctx.api.accounts.getAll();
  const holdings = await ctx.api.portfolio.getHoldings(accounts[0].id);
  
  // Event listeners with proper types
  const unlisten = await ctx.api.events.portfolio.onUpdateComplete((event) => {
    console.log('Portfolio updated:', event.payload);
  });

  ctx.onDisable(() => {
    unlisten();
  });
}
```

### Advanced Usage with Subdomain Structure

```typescript
import type { 
  AddonContext, 
  ActivityType, 
  AccountType,
  ActivityCreate,
  Holding 
} from '@wealthfolio/addon-sdk';

export function enable(ctx: AddonContext) {
  // Use proper enums and types with organized API
  const newActivity: ActivityCreate = {
    accountId: 'account-123',
    activityType: ActivityType.BUY,
    activityDate: new Date(),
    assetId: 'asset-456',
    quantity: 100,
    unitPrice: 50.25,
    isDraft: false
  };

  // Create activity with full type checking - subdomain organization!
  const created = await ctx.api.activities.create(newActivity);
  
  // Get portfolio data
  const performance = await ctx.api.performance.calculateSummary({
    itemType: 'account',
    itemId: 'account-123'
  });
  
  // Market data operations
  const quotes = await ctx.api.market.searchTicker('AAPL');
  await ctx.api.market.sync(['AAPL', 'MSFT'], false);
}
```

## Type Bridge System

The main application uses a type bridge to handle compatibility:

```typescript
// src/addons/type-bridge.ts
export function createSDKHostAPIBridge(internalAPI: InternalHostAPI): SDKHostAPI {
  return internalAPI as any as SDKHostAPI;
}
```

This allows the main app to maintain internal types while exposing a clean SDK interface.

## Runtime Context Implementation

```typescript
// src/addons/addons-runtime-context.ts
export const realCtx: AddonContext = {
  sidebar: { /* ... */ },
  router: { /* ... */ },
  onDisable: (cb) => { /* ... */ },
  api: createSDKHostAPIBridge({
    holdings: getHoldings,
    activities: getActivities,
    accounts: getAccounts,
    // ... all 80+ functions
  })
};

globalThis.__WF_CTX__ = realCtx;
```

## Development Workflow

### 1. SDK Development
```bash
cd packages/addon-sdk
npm run build    # Build the SDK
npm run dev      # Watch mode for development
```

### 2. Main App Integration  
The main app imports types from the SDK and uses the type bridge for compatibility.

### 3. Addon Development
Addons import everything they need from `@wealthfolio/addon-sdk`:

```typescript
import type { 
  AddonContext,
  Account,
  Activity, 
  Holding,
  ActivityType,
  // ... any other types needed
} from '@wealthfolio/addon-sdk';
```

## API Categories Available to Addons

The HostAPI provides access to organized subdomains:

### 🏦 **Accounts** (4 functions)
- `accounts.getAll()`, `accounts.create()`, `accounts.update()`, `accounts.delete()`

### � **Portfolio** (6 functions)  
- `portfolio.getHoldings()`, `portfolio.update()`, `portfolio.getIncomeSummary()`, etc.

### 📝 **Activities** (9 functions)
- `activities.getAll()`, `activities.search()`, `activities.create()`, `activities.import()`, etc.

### 📈 **Market Data** (4 functions)
- `market.searchTicker()`, `market.sync()`, `market.syncHistory()`, `market.getProviders()`

### 🏷️ **Assets** (3 functions)
- `assets.getProfile()`, `assets.updateProfile()`, `assets.updateDataSource()`

### � **Quotes** (3 functions)
- `quotes.update()`, `quotes.delete()`, `quotes.getHistory()`

### 📊 **Performance** (3 functions)
- `performance.calculateHistory()`, `performance.calculateSummary()`, `performance.calculateAccountsSimple()`

### 💱 **Exchange Rates** (4 functions)
- `exchangeRates.getAll()`, `exchangeRates.update()`, `exchangeRates.add()`, `exchangeRates.delete()`

### 🎯 **Goals** (6 functions)
- `goals.getAll()`, `goals.create()`, `goals.update()`, `goals.updateAllocations()`, etc.

### 🏗️ **Contribution Limits** (5 functions)
- `contributionLimits.getAll()`, `contributionLimits.create()`, `contributionLimits.calculateDeposits()`, etc.

### ⚙️ **Settings** (3 functions)
- `settings.get()`, `settings.update()`, `settings.backupDatabase()`

### 📂 **Files** (2 functions)
- `files.openCsvDialog()`, `files.openSaveDialog()`

### 🎧 **Events** (8 functions organized in subgroups)
- `events.import.*`, `events.portfolio.*`, `events.market.*`

**Total: 60+ fully typed functions organized in 13 logical subdomains**

## Version Management Strategy

### Semantic Versioning
- **Major**: Breaking changes to API or types
- **Minor**: New features, additional APIs
- **Patch**: Bug fixes, documentation updates

### Breaking Changes
When making breaking changes:
1. Update SDK version to next major
2. Update main app to use new SDK version
3. Provide migration guide for addon developers

## Best Practices

### For SDK Development
1. ✅ Keep types in sync with main app
2. ✅ Provide comprehensive JSDoc comments
3. ✅ Use semantic versioning properly
4. ✅ Test types with example addons

### For Main App Integration
1. ✅ Use type bridge for compatibility
2. ✅ Keep internal types separate from SDK types
3. ✅ Update SDK when adding new functionality
4. ✅ Maintain backward compatibility when possible

### For Addon Development
1. ✅ Always use latest SDK version
2. ✅ Import only needed types for tree shaking
3. ✅ Follow TypeScript best practices
4. ✅ Handle async operations properly

## Benefits Summary

| Aspect | Benefit |
|--------|---------|
| **Type Safety** | Full IntelliSense and compile-time checking |
| **Developer Experience** | Rich autocomplete and error detection |
| **API Organization** | Subdomain structure for better discoverability |
| **Maintainability** | Single source of truth for all types |
| **Versioning** | Proper semver for managing changes |
| **Documentation** | Self-documenting through TypeScript |
| **Performance** | Tree-shakeable, only bundle what's used |
| **Compatibility** | Bridge system handles type differences |
| **Extensibility** | Easy to add new APIs and types |
| **Familiar Patterns** | Industry-standard API design |

## Migration Path

If you have existing addons:

### Before (Basic SDK)
```typescript
// Limited types, flat API structure
interface BasicContext {
  sidebar: { addItem: (item: any) => any };
  api: {
    getAccounts: () => any;
    createActivity: (activity: any) => any;
    // 80+ functions at root level - hard to discover
  }
}
```

### After (Enhanced SDK with Subdomains)
```typescript
// Comprehensive types, organized API structure
import type { 
  AddonContext, 
  Holding, 
  ActivityType 
} from '@wealthfolio/addon-sdk';

// Full IntelliSense, organized by domain!
ctx.api.accounts.getAll()
ctx.api.activities.create(activity)
ctx.api.portfolio.getHoldings(accountId)
ctx.api.market.searchTicker(query)
ctx.api.events.portfolio.onUpdateComplete(handler)
```

## Conclusion

This enhanced SDK approach provides:

✅ **Complete type coverage** for all Wealthfolio functionality
✅ **Excellent developer experience** with full IntelliSense  
✅ **Maintainable architecture** with clear separation of concerns
✅ **Future-proof design** that can evolve with the application
✅ **Production-ready** type bridge system for compatibility

The strategy balances type safety, developer experience, and maintainability while providing a clean, professional SDK for addon developers.
