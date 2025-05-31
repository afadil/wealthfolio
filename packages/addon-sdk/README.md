# @wealthfolio/addon-sdk

TypeScript SDK for building Wealthfolio addons with ZIP package support.

## Installation

```bash
npm install @wealthfolio/addon-sdk
```

## Addon Format

Wealthfolio addons are distributed as ZIP packages containing:
- `manifest.json` - Addon metadata and configuration
- `dist/addon.js` - Main addon entry point (or custom path specified in manifest)
- Additional assets, components, and resources

## Manifest Structure

Create a `manifest.json` file in your addon root:

```json
{
  "id": "portfolio-tracker-addon",
  "name": "Portfolio Tracker Addon",
  "version": "2.1.0",
  "description": "Advanced portfolio tracking and analytics addon for Wealthfolio",
  "author": "Community Developer",
  "main": "dist/addon.js",
  "sdkVersion": "1.0.0"
}
```

### Required Fields
- `id` - Unique addon identifier
- `name` - Display name of the addon
- `version` - Semantic version
- `main` - Entry point file path

### Optional Fields
- `description` - Addon description
- `author` - Author name
- `sdkVersion` - Target SDK version

## Usage

### Basic Addon Example

```typescript
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { lazy } from 'react';

export default function enable(ctx: AddonContext) {
  // Add sidebar item
  const item = ctx.sidebar.addItem({
    id: 'hello-addon',
    label: 'Hello Addon',
    route: '/addons/hello-addon',
    icon: 'star',
    order: 100
  });

  // Register route
  ctx.router.add({
    path: '/addons/hello-addon',
    component: lazy(() => import('./HelloAddonPage'))
  });

  // Cleanup on disable
  ctx.onDisable(() => {
    item.remove();
  });
}
```

### Building Your Addon

1. **Create a `vite.lib.config.ts`:**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'MyAddon',
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
    }
  }
});
```

2. **Build the addon:**
```bash
vite build --config vite.lib.config.ts
```

3. **Package as ZIP:**
```bash
# Create addon package with manifest.json and built files
zip -r my-addon.zip manifest.json dist/ assets/
```

### Project Structure

```
my-addon/
├── manifest.json
├── src/
│   ├── index.ts
│   └── components/
├── dist/
│   └── addon.js
├── assets/
└── package.json
```

## API Reference

### AddonContext

The main context object passed to your addon's enable function.

#### `sidebar.addItem(config)`

Adds an item to the application sidebar.

**Parameters:**
- `id: string` - Unique identifier for the sidebar item
- `label: string` - Display text for the sidebar item
- `icon?: string` - Optional icon name
- `route?: string` - Optional route to navigate to
- `order?: number` - Optional ordering priority
- `onClick?: () => void` - Optional click handler

**Returns:** `SidebarItemHandle` with a `remove()` method

#### `router.add(route)`

Registers a new route in the application.

**Parameters:**
- `path: string` - Route path
- `component: React.LazyExoticComponent<React.ComponentType<any>>` - Lazy-loaded component

#### `onDisable(callback)`

Registers a cleanup callback for when the addon is disabled.

**Parameters:**
- `callback: () => void` - Function to call on addon disable

## Installation

1. Build your addon as a ZIP package
2. Open Wealthfolio Settings → Addons
3. Click "Install Addon" and select your ZIP file
4. The addon will be installed and available on next app restart

## License

MIT 