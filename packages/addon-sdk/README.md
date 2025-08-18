# @wealthfolio/addon-sdk

[![Version](https://img.shields.io/npm/v/@wealthfolio/addon-sdk?style=flat-square)](https://www.npmjs.com/package/@wealthfolio/addon-sdk)
[![License](https://img.shields.io/npm/l/@wealthfolio/addon-sdk?style=flat-square)](https://github.com/afadil/wealthfolio/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue?style=flat-square)](https://www.typescriptlang.org/)

A comprehensive TypeScript SDK for building secure, feature-rich addons for Wealthfolio. Extend your portfolio management experience with custom analytics, integrations, and visualizations.

## 🚀 Features

- **Type-Safe Development**: Full TypeScript support with comprehensive type definitions
- **Security-First**: Built-in permission system with risk assessment
- **Modular Architecture**: Clean separation of concerns with well-defined APIs
- **React Integration**: Seamless integration with React components and hooks
- **Hot Reloading**: Development-friendly with automatic reload capabilities
- **ZIP Packaging**: Simple distribution model with manifest-based configuration

## 📦 Installation

```bash
# Using npm
npm install @wealthfolio/addon-sdk

# Using yarn
yarn add @wealthfolio/addon-sdk

# Using pnpm
pnpm add @wealthfolio/addon-sdk
```

## 🏗️ Project Structure

Create your addon with the following recommended structure:

```
my-portfolio-addon/
├── manifest.json          # Addon metadata and permissions
├── src/
│   ├── index.ts           # Main entry point
│   ├── components/        # React components
│   │   └── Dashboard.tsx
│   ├── hooks/            # Custom hooks
│   ├── types/            # TypeScript types
│   └── utils/            # Utility functions
├── dist/                 # Built output
│   └── addon.js
├── assets/               # Static assets
├── package.json
├── tsconfig.json
└── vite.config.ts        # Build configuration
```

## 📋 Manifest Configuration

Create a `manifest.json` file in your addon root:

```json
{
  "id": "advanced-portfolio-tracker",
  "name": "Advanced Portfolio Tracker",
  "version": "1.2.0",
  "description": "Advanced analytics and visualizations for your investment portfolio",
  "author": "Your Name",
  "homepage": "https://github.com/yourname/portfolio-addon",
  "license": "MIT",
  "main": "dist/addon.js",
  "sdkVersion": "1.1.0",
  "minWealthfolioVersion": "1.0.0",
  "keywords": ["portfolio", "analytics", "visualization"],
  "icon": "data:image/svg+xml;base64,...",
  "permissions": [
    {
      "category": "portfolio",
      "functions": ["getHoldings"],
      "purpose": "Display portfolio analytics and performance metrics"
    }
  ],
  "dataAccess": [
    {
      "category": "market-data", 
      "functions": ["searchTicker", "getQuoteHistory"],
      "purpose": "Fetch real-time market data for price charts and analysis"
    }
  ]
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier (lowercase, hyphens allowed) |
| `name` | `string` | Human-readable addon name |
| `version` | `string` | Semantic version (e.g., "1.0.0") |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Brief description of functionality |
| `author` | `string` | Author name or organization |
| `homepage` | `string` | Project homepage URL |
| `license` | `string` | License identifier |
| `main` | `string` | Entry point file (default: "addon.js") |
| `sdkVersion` | `string` | Compatible SDK version |
| `permissions` | `Permission[]` | Security permissions required |
| `dataAccess` | `DataAccess[]` | Detailed data access declarations |

## 🔨 Development Guide

### Basic Addon Example

```typescript
import { getAddonContext, type AddonContext } from '@wealthfolio/addon-sdk';
import { lazy } from 'react';

// Get the addon context
const ctx = getAddonContext();

export default function enable(context: AddonContext) {
  // Add a sidebar navigation item
  const sidebarItem = context.sidebar.addItem({
    id: 'portfolio-analytics',
    label: 'Portfolio Analytics',
    icon: 'chart-bar',
    route: '/addons/portfolio-analytics',
    order: 100
  });

  // Register a new route
  context.router.add({
    path: '/addons/portfolio-analytics',
    component: lazy(() => import('./components/AnalyticsDashboard'))
  });

  // Register cleanup callback
  context.onDisable(() => {
    sidebarItem.remove();
    context.api.logger.info('Portfolio Analytics addon disabled');
  });

  return {
    disable: () => {
      // Optional: Additional cleanup logic
      context.api.logger.info('Addon cleanup completed');
    }
  };
}
```

### Advanced Component Example

```typescript
// components/AnalyticsDashboard.tsx
import React, { useEffect, useState } from 'react';
import { getAddonContext } from '@wealthfolio/addon-sdk';
import type { Holding, Account } from '@wealthfolio/addon-sdk/types';

export function AnalyticsDashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const ctx = getAddonContext();
        
        // Access Wealthfolio APIs through the context
        const [holdingsData, accountsData] = await Promise.all([
          ctx.api.holdings(), // Access portfolio holdings
          ctx.api.accounts()  // Access account information
        ]);

        setHoldings(holdingsData);
        setAccounts(accountsData);
      } catch (error) {
        ctx.api.logger.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return <div>Loading analytics...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Portfolio Analytics</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Holdings Overview</h2>
          <p>Total holdings: {holdings.length}</p>
          {/* Add your custom analytics here */}
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Account Summary</h2>
          <p>Total accounts: {accounts.length}</p>
          {/* Add account analytics here */}
        </div>
      </div>
    </div>
  );
}

export default AnalyticsDashboard;
```

### Using Hooks and State Management

```typescript
// hooks/usePortfolioData.ts
import { useState, useEffect } from 'react';
import { getAddonContext } from '@wealthfolio/addon-sdk';
import type { Holding, PerformanceMetrics } from '@wealthfolio/addon-sdk/types';

export function usePortfolioData(accountId?: string) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const ctx = getAddonContext();
        
        const holdingsData = await ctx.api.holdings(accountId || '');
        setHoldings(holdingsData);

        if (accountId) {
          const performanceData = await ctx.api.calculatePerformanceSummary({
            itemType: 'account',
            itemId: accountId
          });
          setPerformance(performanceData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [accountId]);

  return { holdings, performance, loading, error };
}
```

## 🔐 Security & Permissions

### Permission Categories

| Category | Risk Level | Description |
|----------|------------|-------------|
| `ui` | Low | Add navigation items and routes |
| `market-data` | Low | Access market prices and quotes |
| `events` | Low | Listen to application events |
| `currency` | Low | Access exchange rates |
| `portfolio` | Medium | Access holdings and valuations |
| `files` | Medium | File dialog operations |
| `financial-planning` | Medium | Goals and contribution limits |
| `activities` | High | Transaction history access |
| `accounts` | High | Account management |
| `settings` | High | Application configuration |

### Declaring Permissions

```json
{
  "permissions": [
    {
      "category": "portfolio",
      "functions": ["holdings", "getHolding", "calculatePerformanceSummary"],
      "purpose": "Display detailed portfolio analytics and performance metrics"
    },
    {
      "category": "market-data",
      "functions": ["searchTicker", "getQuoteHistory"],
      "purpose": "Show price charts and enable ticker search functionality"
    }
  ]
}
```

## 🛠️ Build Configuration

### Vite Configuration

Create a `vite.config.ts` for optimal bundling:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MyPortfolioAddon',
      fileName: 'addon',
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    },
    outDir: 'dist',
    minify: 'terser',
    sourcemap: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
```

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

## 📦 Building and Packaging

### Build Your Addon

```bash
# Install dependencies
npm install

# Build for production
npm run build

# The built addon will be in dist/addon.js
```

### Create Distribution Package

```bash
# Create a ZIP package with all necessary files
zip -r my-portfolio-addon.zip \
  manifest.json \
  dist/ \
  assets/ \
  README.md
```

### Package Structure

Your final package should contain:
- `manifest.json` - Addon metadata
- `dist/addon.js` - Compiled addon code
- `assets/` - Static assets (optional)
- `README.md` - Documentation (optional)

## 🚀 Installation & Testing

### Install in Wealthfolio

1. Open Wealthfolio
2. Navigate to Settings → Addons
3. Click "Install Addon"
4. Select your ZIP package
5. Review permissions and approve
6. Restart Wealthfolio to activate

### Development Testing

For development, you can test addons locally:

```bash
# Build in watch mode
npm run dev

# Your changes will be reflected after reloading addons in Wealthfolio
```

## 📚 API Reference

### Context Methods

#### `sidebar.addItem(config)`

Add an item to the application sidebar.

**Parameters:**
- `config.id` (string): Unique identifier
- `config.label` (string): Display text
- `config.icon` (string | ReactNode): Icon name or component
- `config.route` (string): Navigation route
- `config.order` (number): Display order (optional)
- `config.onClick` (function): Click handler (optional)

**Returns:** `SidebarItemHandle` with `remove()` method

#### `router.add(route)`

Register a new route in the application.

**Parameters:**
- `route.path` (string): Route path pattern
- `route.component` (LazyExoticComponent): Lazy-loaded component

#### `onDisable(callback)`

Register cleanup callback for addon disable.

**Parameters:**
- `callback` (function): Cleanup function

### Data Access APIs

All data access is performed through the context's `api` property:

```typescript
const ctx = getAddonContext();

// Portfolio data
const holdings = await ctx.api.holdings(accountId);
const accounts = await ctx.api.accounts();

// Market data  
const quotes = await ctx.api.getQuoteHistory(symbol);
const profile = await ctx.api.getAssetProfile(assetId);

// Financial planning
const goals = await ctx.api.getGoals();
const limits = await ctx.api.getContributionLimit();

// Settings
const settings = await ctx.api.getSettings();
```

## 🔄 Migration Guide

### From v1.0.0 to v1.1.0

#### Context Access
```typescript
// Before
import ctx from '@wealthfolio/addon-sdk';

// After (recommended)
import { getAddonContext } from '@wealthfolio/addon-sdk';
const ctx = getAddonContext();
```

#### Type Imports
```typescript
// Before
import type { AddonContext, AddonManifest } from '@wealthfolio/addon-sdk';

// After (more specific)
import type { AddonContext } from '@wealthfolio/addon-sdk';
import type { AddonManifest } from '@wealthfolio/addon-sdk/manifest';
```

## 🤝 Contributing

We welcome contributions to improve the addon SDK!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests and documentation
5. Submit a pull request

## 📄 License

MIT - see [LICENSE](LICENSE) for details.

## 🔗 Links

- [Wealthfolio Homepage](https://wealthfolio.app)
- [Addon Gallery](https://wealthfolio.app/addons)
- [Documentation](https://docs.wealthfolio.app/addons)
- [GitHub Repository](https://github.com/afadil/wealthfolio)
- [Issue Tracker](https://github.com/afadil/wealthfolio/issues)

## 💬 Support

- [Discord Community](https://discord.gg/wealthfolio)
- [GitHub Discussions](https://github.com/afadil/wealthfolio/discussions)
- [Email Support](mailto:support@wealthfolio.app) 