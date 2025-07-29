# Addon Development Guide with Hot Reload

This guide explains how to develop Wealthfolio addons with hot reload functionality for a seamless development experience.

## Quick Start

### 1. Create a New Addon

```bash
# Navigate to your development directory
cd /path/to/your/addons

# Create a new addon
npx @wealthfolio/addon-sdk create my-awesome-addon

# Navigate to the addon directory
cd my-awesome-addon

# Install dependencies
pnpm install
```

### 2. Start Development Mode

```bash
# Start the development server with hot reload
pnpm dev:server
```

This will:
- Start a development server on `http://localhost:3001`
- Watch for file changes in `src/` directory
- Automatically rebuild when files change
- Provide hot reload endpoints for the main app

### 3. Register with Main App

The main Wealthfolio app will automatically detect and load your addon when both are running in development mode. **No additional configuration is required.**

**If your addon is not detected automatically:**

1. Open the browser console in the main app
2. Run: `discoverAddons()` to manually scan for development servers
3. Check the status: `__ADDON_DEV__.getStatus()`
4. Verify your dev server is running: `curl http://localhost:3001/health`

## Development Workflow

### File Structure

```
my-awesome-addon/
├── src/
│   └── addon.tsx          # Main addon entry point
├── manifest.json          # Addon metadata
├── package.json           # NPM package configuration
├── vite.config.ts         # Build configuration
└── README.md              # Documentation
```

### Hot Reload Process

1. **File Watching**: The development server watches your `src/` directory
2. **Auto Build**: When files change, Vite automatically rebuilds
3. **Reload Signal**: The dev server signals the main app about changes
4. **Hot Swap**: The main app reloads only your addon without full page refresh

### Development Commands

```bash
# Start development server with hot reload
pnpm dev:server

# Build addon for testing
pnpm build

# Package addon for distribution
pnpm bundle

# Watch build (alternative to dev server)
pnpm dev
```

## Advanced Development

### Custom Development Server Port

```bash
# Start on a different port
pnpm dev:server -- --port 3002
```

### Development Environment Variables

**For your addon project** (optional), create a `.env.development` file in your addon directory:

```env
VITE_DEV_MODE=true
VITE_DEBUG=true
```

**For the main Wealthfolio app** (optional advanced configuration):

```env
# Optional: Force enable addon development features
VITE_ADDON_DEV=true

# Optional: Enable additional auto-discovery logging  
VITE_ADDON_AUTO_DISCOVER=true
```

**Note**: The addon development system works automatically when running `npm run dev` in the main app. These environment variables are only needed for advanced configuration or troubleshooting.

### Debugging

The main app provides debugging tools accessible in the browser console:

```javascript
// Check addon development status
__ADDON_DEV__.getStatus()

// List development servers
__ADDON_DEV__.listServers()

// Manual discovery of development servers
discoverAddons()

// Manual reload of all addons
reloadAddons()

// Legacy debug function
debugAddons()
```

### Hot Reload API

Your addon can respond to hot reload events:

```typescript
export default function enable(ctx) {
  // Your addon logic here
  
  return {
    disable() {
      // Cleanup logic
      console.log('Addon disabled for hot reload');
    }
  };
}
```

## Development Best Practices

### 1. Use TypeScript

Take advantage of TypeScript for better development experience:

```typescript
import { AddonContext } from '@wealthfolio/addon-sdk';
import { Holding, Account } from '@wealthfolio/addon-sdk/types';

export default function enable(ctx: AddonContext) {
  // Type-safe development
}
```

### 2. Error Handling

Always include proper error handling:

```typescript
export default function enable(ctx) {
  try {
    // Your addon logic
    
    return {
      disable() {
        try {
          // Cleanup logic
        } catch (error) {
          console.error('Cleanup error:', error);
        }
      }
    };
  } catch (error) {
    console.error('Addon initialization error:', error);
    return { disable: () => {} };
  }
}
```

### 3. Development vs Production

Use environment detection for development-specific features:

```typescript
const isDev = import.meta.env.DEV;

export default function enable(ctx) {
  if (isDev) {
    console.log('Development mode - extra logging enabled');
  }
  
  // Your addon logic
}
```

## Troubleshooting

### Common Issues

#### 1. Dev Server Not Starting
- Check if port 3001 is available
- Ensure manifest.json exists and is valid
- Verify npm dependencies are installed

#### 2. Hot Reload Not Working
- Check browser console for errors
- Verify the main app is running in development mode
- Ensure dev server is accessible at localhost:3001
- Try manual discovery: `discoverAddons()` in browser console
- Check if the addon dev server port is in the scan range (3001-3005)

#### 3. Addon Not Loading
- Check addon syntax for errors
- Verify manifest.json permissions
- Look at browser network tab for failed requests
- Ensure your dev server port is in the auto-discovery range (3001-3005)
- Try manual registration in console: `__ADDON_DEV__.registerDevServer({id: 'your-addon-id', name: 'Your Addon', port: 3001})`

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

If auto-discovery fails, you can manually register your development server:

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

## Production Deployment

### Building for Production

```bash
# Clean previous builds
pnpm clean

# Build addon
pnpm build

# Create distribution package
pnpm package
```

### Testing Production Build

Before distribution, test your addon in production mode:

```bash
# Build and install in main app
pnpm bundle

# Then install the generated .zip file in Wealthfolio
```

## Examples

### Simple Sidebar Addon

```typescript
import React from 'react';

function MyComponent() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">My Addon</h1>
      <p>Hello from my addon!</p>
    </div>
  );
}

export default function enable(ctx) {
  const sidebarItem = ctx.sidebar.addItem({
    id: 'my-addon',
    label: 'My Addon',
    route: '/my-addon',
    order: 100
  });

  ctx.router.add({
    path: '/my-addon',
    component: React.lazy(() => Promise.resolve({ default: MyComponent }))
  });

  return {
    disable() {
      sidebarItem.remove();
    }
  };
}
```

### Data-Driven Addon

```typescript
import React, { useState, useEffect } from 'react';

function PortfolioSummary() {
  const [holdings, setHoldings] = useState([]);

  useEffect(() => {
    async function loadData() {
      const ctx = getAddonContext();
      const data = await ctx.api.holdings('');
      setHoldings(data);
    }
    loadData();
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Portfolio Summary</h2>
      <p>Total Holdings: {holdings.length}</p>
    </div>
  );
}

export default function enable(ctx) {
  // Add your addon logic here
}
```

This hot reload system provides a seamless development experience, allowing you to see changes instantly without manual reloads or complex setup procedures.
