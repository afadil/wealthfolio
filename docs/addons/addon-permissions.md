# Addon Permission System

A comprehensive guide to understanding and working with Wealthfolio's addon permission system for secure and transparent addon development.

## Table of Contents

1. [Overview](#overview)
2. [Permission Categories](#permission-categories)
3. [Manifest Declaration](#manifest-declaration)
4. [Permission Analysis](#permission-analysis)
5. [Security Best Practices](#security-best-practices)
6. [Installation Flow](#installation-flow)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Wealthfolio's addon permission system provides transparent security by automatically analyzing your addon's code and comparing it with declared permissions in your manifest. This ensures users know exactly what data your addon accesses.

### Key Features

- **Automatic Detection**: System analyzes your code during installation
- **Transparent Security**: Users see exactly what permissions are needed
- **Risk Assessment**: Permissions are categorized by risk level
- **Performance Optimized**: Analysis happens once during installation, not at runtime

### Permission States

Each permission can be in one of these states:

| State | Description | Security Impact |
|-------|-------------|-----------------|
| ✅ **Declared & Detected** | Perfect - declared in manifest and actually used | Secure |
| ⚠️ **Declared Only** | Over-permission - declared but not used | Review needed |
| ❌ **Detected Only** | Under-permission - used but not declared | Security risk |

---

## Permission Categories

### 🏦 Account Management (High Risk)
Access to user accounts and account settings.

**Functions:** `getAll`, `create`, `update`, `delete`
**Use Cases:** Account management tools, portfolio organization
**Security Note:** Can modify or delete user accounts

### 📊 Portfolio Data (Medium Risk)
Access to holdings, valuations, and portfolio metrics.

**Functions:** `getHoldings`, `getHolding`, `update`, `recalculate`, `getIncomeSummary`
**Use Cases:** Analytics dashboards, portfolio visualization
**Security Note:** Access to sensitive financial positions

### 📝 Transaction History (High Risk)
Access to trading activities and transaction records.

**Functions:** `getAll`, `search`, `create`, `update`, `delete`, `import`
**Use Cases:** Activity importers, transaction analysis
**Security Note:** Can view and modify trading history

### 📈 Market Data (Low Risk)
Access to market prices and financial data.

**Functions:** `searchTicker`, `sync`, `getProviders`
**Use Cases:** Price charts, market data integration
**Security Note:** Public market data, minimal privacy impact

### 🎯 Financial Planning (Medium Risk)
Access to goals and contribution limits.

**Functions:** `getAll`, `create`, `update`, `delete`, `calculateDeposits`
**Use Cases:** Goal tracking, retirement planning
**Security Note:** Access to financial planning data

### 💱 Currency (Low Risk)
Access to exchange rates and currency conversion.

**Functions:** `getAll`, `update`, `add`, `delete`
**Use Cases:** Multi-currency support, conversion tools
**Security Note:** Public exchange rate data

### ⚙️ Application Settings (High Risk)
Access to app configuration and backups.

**Functions:** `get`, `update`, `backupDatabase`
**Use Cases:** Backup tools, settings management
**Security Note:** Can modify application behavior

### 📂 File Operations (Medium Risk)
File dialog and system operations.

**Functions:** `openCsvDialog`, `openSaveDialog`
**Use Cases:** Import/export tools, file management
**Security Note:** File system access

### 🎧 Event Listeners (Low Risk)
Application events and notifications.

**Functions:** `onUpdateComplete`, `onSyncComplete`, `onDrop`
**Use Cases:** Real-time updates, event handling
**Security Note:** Read-only event access

### 🎨 User Interface (Low Risk)
Navigation and UI component modifications.

**Functions:** `addItem`, `add` (routes)
**Use Cases:** Navigation, UI extensions
**Security Note:** UI modifications only

---

## Manifest Declaration

### Basic Manifest Structure

```json
{
  "id": "my-addon",
  "name": "My Addon",
  "version": "1.0.0",
  "description": "Brief description of your addon",
  "author": "Your Name",
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

### Permission Levels

- **`read`**: View-only access to data
- **`write`**: Can create, update, or delete data
- **`admin`**: Full administrative access (rarely needed)

### Data Access Declaration

The `dataAccess` array provides detailed information about what your addon does:

```json
{
  "category": "portfolio",
  "functions": ["getHoldings", "getIncomeSummary"],
  "purpose": "Calculate and display portfolio performance metrics"
}
```

**Best Practice:** Always include a clear, user-friendly purpose description.

---

## Permission Analysis

### How It Works

1. **Installation Time**: System analyzes your addon's source code
2. **Function Detection**: Identifies all API function calls
3. **Categorization**: Maps functions to permission categories
4. **Risk Assessment**: Calculates overall risk level
5. **Storage**: Results stored in manifest for fast access

### Detected Patterns

The system detects these function call patterns:

```typescript
// Direct function calls
ctx.api.accounts.getAll()

// Method calls on objects  
const accounts = await ctx.api.accounts.getAll()

// String references (less common)
const functionName = 'getAll'
```

### Performance Benefits

- **Ultra-fast**: Permission info read from metadata (0.1-1ms vs 50-3000ms)
- **No Runtime Overhead**: Analysis done once during installation
- **Scalable**: Works efficiently with large addons

---

## Security Best Practices

### 1. Principle of Least Privilege

Only request permissions you actually need:

```json
// ❌ Over-permissioned
{
  "permissions": {
    "accounts": ["read", "write", "admin"],
    "portfolio": ["read", "write"],
    "activities": ["read", "write"]
  }
}

// ✅ Minimal permissions
{
  "permissions": {
    "portfolio": ["read"],
    "market": ["read"]
  }
}
```

### 2. Clear Purpose Descriptions

Help users understand why you need permissions:

```json
// ❌ Vague purpose
{
  "category": "activities",
  "functions": ["getAll", "create"],
  "purpose": "Access activities"
}

// ✅ Clear purpose
{
  "category": "activities", 
  "functions": ["getAll", "create"],
  "purpose": "Import trading activities from CSV files and create new transactions"
}
```

### 3. Sensitive Data Handling

Use the Secrets API for sensitive information:

```typescript
// ✅ Store API keys securely
await ctx.api.secrets.set('api-key', userApiKey);

// ✅ Retrieve securely
const apiKey = await ctx.api.secrets.get('api-key');

// ❌ Don't store in regular variables or localStorage
```

### 4. Error Handling

Handle permission errors gracefully:

```typescript
try {
  const accounts = await ctx.api.accounts.getAll();
} catch (error) {
  if (error.code === 'PERMISSION_DENIED') {
    console.error('Missing accounts permission');
    // Show user-friendly message
  }
}
```

### 5. Validate Before Use

Check permissions match your actual usage:

```typescript
// Ensure you've declared the permissions you use
const requiredPermissions = [
  'portfolio.read',
  'market.read'
];

// Your addon should only use functions you've declared
```

---

## Installation Flow

### User Experience

1. **File Selection**: User selects addon ZIP file
2. **Code Analysis**: System analyzes addon code for API usage
3. **Permission Dialog**: User reviews security information:
   - Risk level assessment (Low/Medium/High)
   - Permission categories required
   - Declared data access with purposes
   - Security warnings for high-risk addons
4. **User Decision**: User approves or denies installation
5. **Installation**: If approved, addon is installed with permissions cached

### Developer Considerations

- **Build Quality**: Ensure your addon builds without errors
- **Clear Documentation**: Include helpful README and comments
- **Test Permissions**: Verify your manifest matches actual usage
- **Handle Rejections**: Users may deny high-risk addons

---

## Troubleshooting

### Common Issues

#### 1. Permission Mismatch Warnings

**Problem**: System detects functions not declared in manifest

**Solution**: Update your manifest to include all used functions:

```json
{
  "dataAccess": [
    {
      "category": "portfolio",
      "functions": ["getHoldings", "update"],
      "purpose": "Display and refresh portfolio data"
    }
  ]
}
```

#### 2. Over-Permission Warnings

**Problem**: Declared permissions not actually used

**Solution**: Remove unused permissions from manifest:

```json
// Remove unused permissions
{
  "permissions": {
    "portfolio": ["read"]  // Remove "write" if not used
  }
}
```

#### 3. High Risk Rating

**Problem**: Addon flagged as high-risk

**Solutions**:
- Reduce scope to only necessary permissions
- Provide clear explanations in `dataAccess.purpose`
- Consider splitting functionality across multiple addons

#### 4. Installation Rejection

**Problem**: Users rejecting addon installation

**Solutions**:
- Lower permission requirements
- Improve purpose descriptions
- Add security documentation
- Provide addon screenshots/demos

### Debug Commands

```bash
# Check if permissions are properly detected
curl http://localhost:3001/permissions

# Validate manifest structure
npm run lint

# Test addon with minimal permissions
npm run test-permissions
```

### Validation Tools

```typescript
// Check if your addon uses undeclared permissions
const permissions = getDetectedPermissionsFromMetadata(metadata);
if (permissions?.hasUndeclaredPermissions) {
  console.warn('Addon uses undeclared permissions');
}
```

---

## Examples

### Read-Only Analytics Addon

```json
{
  "id": "portfolio-analytics",
  "name": "Portfolio Analytics Dashboard",
  "version": "1.0.0",
  "permissions": {
    "accounts": ["read"],
    "portfolio": ["read"],
    "market": ["read"]
  },
  "dataAccess": [
    {
      "category": "portfolio",
      "functions": ["getHoldings", "getIncomeSummary"],
      "purpose": "Calculate and display portfolio performance metrics"
    },
    {
      "category": "accounts", 
      "functions": ["getAll"],
      "purpose": "Show account-level portfolio breakdown"
    },
    {
      "category": "market-data",
      "functions": ["searchTicker"],
      "purpose": "Display current market prices in charts"
    }
  ]
}
```

### Activity Import Tool

```json
{
  "id": "csv-importer",
  "name": "CSV Activity Importer", 
  "version": "1.0.0",
  "permissions": {
    "accounts": ["read"],
    "activities": ["read", "write"],
    "files": ["read"],
    "portfolio": ["write"]
  },
  "dataAccess": [
    {
      "category": "activities",
      "functions": ["checkImport", "import", "create"],
      "purpose": "Import trading activities from CSV files"
    },
    {
      "category": "files",
      "functions": ["openCsvDialog"],
      "purpose": "Allow users to select CSV files for import"
    },
    {
      "category": "portfolio", 
      "functions": ["update"],
      "purpose": "Refresh portfolio calculations after importing activities"
    }
  ]
}
```

### Market Data Provider

```json
{
  "id": "custom-market-provider",
  "name": "Custom Market Data Provider",
  "version": "1.0.0", 
  "permissions": {
    "market": ["read", "write"],
    "assets": ["read", "write"],
    "secrets": ["read", "write"]
  },
  "dataAccess": [
    {
      "category": "market-data",
      "functions": ["sync", "getProviders"],
      "purpose": "Sync market data from custom API provider"
    },
    {
      "category": "assets",
      "functions": ["updateProfile", "updateDataSource"], 
      "purpose": "Update asset profiles with data from custom provider"
    },
    {
      "category": "secrets",
      "functions": ["get", "set"],
      "purpose": "Securely store API keys for market data provider"
    }
  ]
}
```

---

This permission system ensures transparency and security while maintaining excellent performance. By following these guidelines, you can create secure addons that users trust and install confidently.
