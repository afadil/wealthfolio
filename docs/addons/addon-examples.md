# Wealthfolio Addon Examples & Tutorials

This guide provides practical examples and step-by-step tutorials for building Wealthfolio addons, from simple to advanced use cases.

## Table of Contents

1. [Getting Started Examples](#getting-started-examples)
2. [Data Visualization Addons](#data-visualization-addons)
3. [Import & Export Tools](#import--export-tools)
4. [Portfolio Analysis Tools](#portfolio-analysis-tools)
5. [Goal Tracking Addons](#goal-tracking-addons)
---

## Getting Started Examples

### Example 1: Simple Hello World Addon

The most basic addon that adds a sidebar item and displays a simple page.

```typescript
// src/addon.tsx
import React from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';

function HelloWorldPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        Hello Wealthfolio! 👋
      </h1>
      <p className="text-gray-600">
        Welcome to your first Wealthfolio addon! This is where your custom
        functionality will live.
      </p>
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  // Add sidebar navigation item
  const sidebarItem = ctx.sidebar.addItem({
    id: 'hello-world',
    label: 'Hello World',
    route: '/hello-world',
    order: 100
  });

  // Register the route
  ctx.router.add({
    path: '/hello-world',
    component: React.lazy(() => Promise.resolve({ default: HelloWorldPage }))
  });

  // Return cleanup function
  return {
    disable() {
      sidebarItem.remove();
    }
  };
}
```

### Example 2: Account Summary Widget

A simple addon that displays account information.

```typescript
// src/addon.tsx
import React, { useState, useEffect } from 'react';
import type { AddonContext, Account } from '@wealthfolio/addon-sdk';

function AccountSummaryPage({ ctx }: { ctx: AddonContext }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const accountData = await ctx.api.accounts.getAll();
        setAccounts(accountData);
      } catch (error) {
        console.error('Failed to load accounts:', error);
      } finally {
        setLoading(false);
      }
    }

    loadAccounts();
  }, [ctx]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading accounts...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Account Summary</h1>
      
      <div className="grid gap-4">
        {accounts.map((account) => (
          <div key={account.id} className="bg-white p-4 rounded-lg shadow border">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-lg">{account.name}</h3>
                <p className="text-gray-600 capitalize">
                  {account.accountType.toLowerCase().replace('_', ' ')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Currency</p>
                <p className="font-medium">{account.currency}</p>
              </div>
            </div>
            <div className="mt-2">
              <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                account.isActive 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {account.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No accounts found. Create your first account to get started!
        </div>
      )}
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: 'account-summary',
    label: 'Account Summary',
    route: '/addon/account-summary',
    order: 100
  });

  ctx.router.add({
    path: '/addon/account-summary',
    component: React.lazy(() => Promise.resolve({ 
      default: () => <AccountSummaryPage ctx={ctx} />
    }))
  });

  return {
    disable() {
      sidebarItem.remove();
    }
  };
}
```

---

## Data Visualization Addons

### Example 3: Portfolio Pie Chart

An addon that visualizes portfolio allocation using a pie chart.

```typescript
// src/addon.tsx
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { AddonContext, Holding, Account } from '@wealthfolio/addon-sdk';

interface ChartData {
  name: string;
  value: number;
  color: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

function PortfolioChart({ ctx }: { ctx: AddonContext }) {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const accountsData = await ctx.api.accounts.getAll();
        setAccounts(accountsData);

        let allHoldings: Holding[] = [];

        if (selectedAccount === 'all') {
          // Load holdings for all accounts
          for (const account of accountsData) {
            const holdings = await ctx.api.portfolio.getHoldings(account.id);
            allHoldings.push(...holdings);
          }
        } else {
          // Load holdings for selected account
          allHoldings = await ctx.api.portfolio.getHoldings(selectedAccount);
        }

        // Group holdings by symbol and calculate total value
        const groupedHoldings = allHoldings.reduce((acc, holding) => {
          if (acc[holding.symbol]) {
            acc[holding.symbol] += holding.marketValue;
          } else {
            acc[holding.symbol] = holding.marketValue;
          }
          return acc;
        }, {} as Record<string, number>);

        // Convert to chart data
        const data = Object.entries(groupedHoldings).map(([symbol, value], index) => ({
          name: symbol,
          value: Math.round(value * 100) / 100,
          color: COLORS[index % COLORS.length]
        }));

        // Sort by value descending
        data.sort((a, b) => b.value - a.value);

        setChartData(data);
      } catch (error) {
        console.error('Failed to load portfolio data:', error);
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
  }, [ctx, selectedAccount]);

  const totalValue = chartData.reduce((sum, item) => sum + item.value, 0);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading portfolio data...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Portfolio Allocation</h1>
        
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="all">All Accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
      </div>

      {chartData.length > 0 ? (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="mb-4">
            <p className="text-lg font-semibold">
              Total Value: ${totalValue.toLocaleString()}
            </p>
          </div>

          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`$${value.toLocaleString()}`, 'Value']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Holdings Breakdown</h3>
            <div className="grid gap-2">
              {chartData.map((item, index) => {
                const percentage = (item.value / totalValue) * 100;
                return (
                  <div key={index} className="flex justify-between items-center p-2 border rounded">
                    <div className="flex items-center">
                      <div
                        className="w-4 h-4 rounded mr-3"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">${item.value.toLocaleString()}</div>
                      <div className="text-sm text-gray-500">{percentage.toFixed(1)}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          No holdings found for the selected account(s).
        </div>
      )}
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: 'portfolio-chart',
    label: 'Portfolio Chart',
    route: '/addon/portfolio-chart',
    order: 150
  });

  ctx.router.add({
    path: '/addon/portfolio-chart',
    component: React.lazy(() => Promise.resolve({ 
      default: () => <PortfolioChart ctx={ctx} />
    }))
  });

  return {
    disable() {
      sidebarItem.remove();
    }
  };
}
```

---

## Import & Export Tools

### Example 4: CSV Activity Importer

A comprehensive activity import tool with validation and preview.

```typescript
// src/addon.tsx
import React, { useState } from 'react';
import type { 
  AddonContext, 
  ActivityImport, 
  ActivityType, 
  Account 
} from '@wealthfolio/addon-sdk';

interface CSVRow {
  date: string;
  type: string;
  symbol: string;
  quantity: string;
  price: string;
  amount: string;
  fee: string;
}

function ActivityImporter({ ctx }: { ctx: AddonContext }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [csvData, setCsvData] = useState<CSVRow[]>([]);
  const [activities, setActivities] = useState<ActivityImport[]>([]);
  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'import' | 'complete'>('upload');
  const [results, setResults] = useState<string>('');

  React.useEffect(() => {
    async function loadAccounts() {
      try {
        const accountsData = await ctx.api.accounts.getAll();
        setAccounts(accountsData);
        if (accountsData.length > 0) {
          setSelectedAccount(accountsData[0].id);
        }
      } catch (error) {
        console.error('Failed to load accounts:', error);
      }
    }
    loadAccounts();
  }, [ctx]);

  const handleFileUpload = async () => {
    try {
      const filePath = await ctx.api.files.openCsvDialog();
      if (!filePath) return;

      // In a real implementation, you would parse the CSV file here
      // This is a simplified example with mock data
      const mockCsvData: CSVRow[] = [
        {
          date: '2024-01-15',
          type: 'BUY',
          symbol: 'AAPL',
          quantity: '100',
          price: '150.25',
          amount: '15025.00',
          fee: '9.99'
        },
        {
          date: '2024-01-20',
          type: 'DIVIDEND',
          symbol: 'AAPL',
          quantity: '',
          price: '',
          amount: '132.50',
          fee: '0'
        }
      ];

      setCsvData(mockCsvData);
      
      // Convert CSV to activities
      const convertedActivities = mockCsvData.map((row, index): ActivityImport => ({
        accountId: selectedAccount,
        activityType: row.type as ActivityType,
        symbol: row.symbol || undefined,
        assetId: row.symbol || undefined,
        quantity: row.quantity ? parseFloat(row.quantity) : undefined,
        unitPrice: row.price ? parseFloat(row.price) : undefined,
        amount: row.amount ? parseFloat(row.amount) : undefined,
        fee: row.fee ? parseFloat(row.fee) : undefined,
        activityDate: new Date(row.date),
        isDraft: false,
        isValid: true, // Will be validated in next step
        validationErrors: []
      }));

      setActivities(convertedActivities);
      setStep('preview');
    } catch (error) {
      setResults(`Error loading file: ${error.message}`);
    }
  };

  const handleValidateActivities = async () => {
    try {
      setImporting(true);
      const validatedActivities = await ctx.api.activities.checkImport(
        selectedAccount,
        activities
      );
      setActivities(validatedActivities);
      setStep('import');
    } catch (error) {
      setResults(`Validation error: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    try {
      setImporting(true);
      const validActivities = activities.filter(a => a.isValid);
      
      if (validActivities.length === 0) {
        setResults('No valid activities to import');
        return;
      }

      const imported = await ctx.api.activities.import(validActivities);
      
      // Trigger portfolio update
      await ctx.api.portfolio.update();
      
      setResults(`Successfully imported ${imported.length} activities!`);
      setStep('complete');
    } catch (error) {
      setResults(`Import error: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  const resetImporter = () => {
    setCsvData([]);
    setActivities([]);
    setResults('');
    setStep('upload');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Activity Importer</h1>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Step 1: Select Account & Upload CSV</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Target Account</label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full p-2 border rounded"
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.currency})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              Expected CSV format: Date, Type, Symbol, Quantity, Price, Amount, Fee
            </p>
            <button
              onClick={handleFileUpload}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Upload CSV File
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Step 2: Preview Activities</h2>
          
          <div className="mb-4">
            <p className="text-sm text-gray-600">
              Found {activities.length} activities. Review and validate before importing.
            </p>
          </div>

          <div className="overflow-x-auto mb-4">
            <table className="min-w-full border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border p-2 text-left">Date</th>
                  <th className="border p-2 text-left">Type</th>
                  <th className="border p-2 text-left">Symbol</th>
                  <th className="border p-2 text-left">Quantity</th>
                  <th className="border p-2 text-left">Price</th>
                  <th className="border p-2 text-left">Amount</th>
                  <th className="border p-2 text-left">Fee</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity, index) => (
                  <tr key={index}>
                    <td className="border p-2">{activity.activityDate.toDateString()}</td>
                    <td className="border p-2">{activity.activityType}</td>
                    <td className="border p-2">{activity.symbol || '-'}</td>
                    <td className="border p-2">{activity.quantity || '-'}</td>
                    <td className="border p-2">{activity.unitPrice || '-'}</td>
                    <td className="border p-2">{activity.amount || '-'}</td>
                    <td className="border p-2">{activity.fee || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleValidateActivities}
              disabled={importing}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {importing ? 'Validating...' : 'Validate Activities'}
            </button>
            <button
              onClick={resetImporter}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Import */}
      {step === 'import' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Step 3: Import Results</h2>
          
          <div className="mb-4">
            {(() => {
              const validCount = activities.filter(a => a.isValid).length;
              const invalidCount = activities.length - validCount;
              
              return (
                <div>
                  <p className="text-sm text-green-600 mb-2">
                    ✓ {validCount} valid activities ready for import
                  </p>
                  {invalidCount > 0 && (
                    <p className="text-sm text-red-600 mb-2">
                      ✗ {invalidCount} invalid activities (will be skipped)
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {activities.some(a => !a.isValid) && (
            <div className="mb-4">
              <h3 className="font-medium mb-2">Validation Errors:</h3>
              <div className="bg-red-50 p-3 rounded">
                {activities.filter(a => !a.isValid).map((activity, index) => (
                  <div key={index} className="text-sm text-red-700">
                    Row {index + 1}: {activity.validationErrors?.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={importing || !activities.some(a => a.isValid)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? 'Importing...' : 'Import Valid Activities'}
            </button>
            <button
              onClick={resetImporter}
              className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Import Complete! 🎉</h2>
          
          <div className="mb-4">
            <p className="text-green-600">{results}</p>
          </div>

          <button
            onClick={resetImporter}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Import More Activities
          </button>
        </div>
      )}

      {results && step !== 'complete' && (
        <div className="mt-4 p-4 bg-gray-50 rounded">
          <p className="text-sm">{results}</p>
        </div>
      )}
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: 'activity-importer',
    label: 'Import Activities',
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
    // Could automatically trigger import process
  });

  return {
    disable() {
      sidebarItem.remove();
      unlistenDrop();
    }
  };
}
```

---

## Portfolio Analysis Tools

### Example 6: Performance Analytics Dashboard

An advanced addon that provides detailed portfolio performance analysis.

```typescript
// src/addon.tsx
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import type { 
  AddonContext, 
  Account, 
  Holding, 
  PerformanceHistory,
  PerformanceSummary 
} from '@wealthfolio/addon-sdk';

interface AnalyticsData {
  performanceHistory: PerformanceHistory[];
  performanceSummary: PerformanceSummary;
  topPerformers: Holding[];
  worstPerformers: Holding[];
}

function PerformanceAnalytics({ ctx }: { ctx: AddonContext }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'YTD'>('1Y');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const accountsData = await ctx.api.accounts.getAll();
        setAccounts(accountsData);
      } catch (error) {
        console.error('Failed to load accounts:', error);
      }
    }
    loadAccounts();
  }, [ctx]);

  useEffect(() => {
    loadAnalyticsData();
  }, [ctx, selectedAccount, dateRange]);

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();

    switch (dateRange) {
      case '1M':
        start.setMonth(start.getMonth() - 1);
        break;
      case '3M':
        start.setMonth(start.getMonth() - 3);
        break;
      case '6M':
        start.setMonth(start.getMonth() - 6);
        break;
      case '1Y':
        start.setFullYear(start.getFullYear() - 1);
        break;
      case 'YTD':
        start.setMonth(0, 1);
        break;
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0]
    };
  };

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();

      let performanceHistory: PerformanceHistory[] = [];
      let performanceSummary: PerformanceSummary;
      let allHoldings: Holding[] = [];

      if (selectedAccount === 'all') {
        // Get performance for entire portfolio
        performanceHistory = await ctx.api.performance.calculateHistory(
          'portfolio',
          '',
          startDate,
          endDate
        );

        performanceSummary = await ctx.api.performance.calculateSummary({
          itemType: 'portfolio',
          startDate,
          endDate
        });

        // Get all holdings
        for (const account of accounts) {
          const holdings = await ctx.api.portfolio.getHoldings(account.id);
          allHoldings.push(...holdings);
        }
      } else {
        // Get performance for specific account
        performanceHistory = await ctx.api.performance.calculateHistory(
          'account',
          selectedAccount,
          startDate,
          endDate
        );

        performanceSummary = await ctx.api.performance.calculateSummary({
          itemType: 'account',
          itemId: selectedAccount,
          startDate,
          endDate
        });

        allHoldings = await ctx.api.portfolio.getHoldings(selectedAccount);
      }

      // Sort holdings by performance
      const holdingsWithGainLoss = allHoldings.map(holding => ({
        ...holding,
        gainLossPercent: holding.performance.totalGainLossPercent
      }));

      const topPerformers = holdingsWithGainLoss
        .sort((a, b) => b.gainLossPercent - a.gainLossPercent)
        .slice(0, 5);

      const worstPerformers = holdingsWithGainLoss
        .sort((a, b) => a.gainLossPercent - b.gainLossPercent)
        .slice(0, 5);

      setAnalyticsData({
        performanceHistory,
        performanceSummary,
        topPerformers,
        worstPerformers
      });

    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading performance analytics...</div>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="p-6">
        <div className="text-red-600">Failed to load analytics data</div>
      </div>
    );
  }

  const { performanceHistory, performanceSummary, topPerformers, worstPerformers } = analyticsData;

  // Format data for charts
  const chartData = performanceHistory.map(point => ({
    date: new Date(point.date).toLocaleDateString(),
    value: point.totalValue,
    gainLoss: point.totalGainLoss,
    gainLossPercent: point.totalGainLossPercent
  }));

  const performerData = [
    ...topPerformers.map(holding => ({
      symbol: holding.symbol,
      performance: holding.gainLossPercent,
      type: 'top'
    })),
    ...worstPerformers.map(holding => ({
      symbol: holding.symbol,
      performance: holding.gainLossPercent,
      type: 'worst'
    }))
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Performance Analytics</h1>
        
        <div className="flex gap-4">
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="border rounded px-3 py-2"
          >
            <option value="all">All Accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>

          <div className="flex border rounded overflow-hidden">
            {(['1M', '3M', '6M', '1Y', 'YTD'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-2 text-sm ${
                  dateRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Value</h3>
          <p className="text-2xl font-bold">
            ${performanceSummary.totalValue.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500 mt-1">{performanceSummary.currency}</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Cost</h3>
          <p className="text-2xl font-bold">
            ${performanceSummary.totalCost.toLocaleString()}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Total Gain/Loss</h3>
          <p className={`text-2xl font-bold ${
            performanceSummary.totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            ${performanceSummary.totalGainLoss.toLocaleString()}
          </p>
          <p className={`text-sm ${
            performanceSummary.totalGainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {performanceSummary.totalGainLossPercent.toFixed(2)}%
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Day Gain/Loss</h3>
          <p className={`text-2xl font-bold ${
            performanceSummary.dayGainLoss >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            ${performanceSummary.dayGainLoss.toLocaleString()}
          </p>
          <p className={`text-sm ${
            performanceSummary.dayGainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            {performanceSummary.dayGainLossPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Performance Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Portfolio Value Over Time</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip 
                formatter={(value, name) => [
                  `$${Number(value).toLocaleString()}`,
                  name === 'value' ? 'Portfolio Value' : 'Gain/Loss'
                ]}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#2563eb" 
                strokeWidth={2}
                name="Portfolio Value"
              />
              <Line 
                type="monotone" 
                dataKey="gainLoss" 
                stroke="#16a34a" 
                strokeWidth={2}
                name="Gain/Loss"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top and Worst Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Top Performers</h2>
          <div className="space-y-3">
            {topPerformers.map((holding, index) => (
              <div key={holding.id} className="flex justify-between items-center p-3 bg-green-50 rounded">
                <div>
                  <div className="font-medium">{holding.symbol}</div>
                  <div className="text-sm text-gray-600">
                    {holding.quantity} shares @ ${holding.averageCost.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-green-600">
                    +{holding.performance.totalGainLossPercent.toFixed(2)}%
                  </div>
                  <div className="text-sm text-green-600">
                    +${holding.performance.totalGainLoss.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Worst Performers */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Worst Performers</h2>
          <div className="space-y-3">
            {worstPerformers.map((holding, index) => (
              <div key={holding.id} className="flex justify-between items-center p-3 bg-red-50 rounded">
                <div>
                  <div className="font-medium">{holding.symbol}</div>
                  <div className="text-sm text-gray-600">
                    {holding.quantity} shares @ ${holding.averageCost.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-red-600">
                    {holding.performance.totalGainLossPercent.toFixed(2)}%
                  </div>
                  <div className="text-sm text-red-600">
                    ${holding.performance.totalGainLoss.toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Comparison Chart */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Performance Comparison</h2>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={performerData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="symbol" />
              <YAxis />
              <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}%`, 'Performance']} />
              <Bar 
                dataKey="performance" 
                fill={(entry) => entry.performance >= 0 ? '#16a34a' : '#dc2626'}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: 'performance-analytics',
    label: 'Performance Analytics',
    route: '/addon/performance-analytics',
    order: 400
  });

  ctx.router.add({
    path: '/addon/performance-analytics',
    component: React.lazy(() => Promise.resolve({ 
      default: () => <PerformanceAnalytics ctx={ctx} />
    }))
  });

  // Listen for portfolio updates to refresh data
  const unlistenPortfolio = ctx.api.events.portfolio.onUpdateComplete(() => {
    // Could trigger a data refresh here
    console.log('Portfolio updated - analytics data may need refresh');
  });

  return {
    disable() {
      sidebarItem.remove();
      unlistenPortfolio();
    }
  };
}
```

This comprehensive examples guide provides practical, real-world addon implementations that developers can use as starting points for their own addons. Each example demonstrates different aspects of the Wealthfolio addon system and showcases best practices for building robust, user-friendly addons.
