# Wealthfolio UI Package Strategy

## Overview

The `@wealthfolio/ui` package provides a complete design system for Wealthfolio addons, ensuring consistent styling and user experience across all extensions.

## Package Structure

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── ui/           # All shadcn/ui components
│   │   ├── icons.tsx     # Wealthfolio icons
│   │   ├── amount-display.tsx
│   │   └── ...           # Financial components
│   ├── lib/
│   │   └── utils.ts      # Utility functions (cn, etc.)
│   ├── styles.css        # Complete Flexoki theme
│   └── index.ts          # Main exports
├── components.json       # Shadcn CLI config
├── tailwind.config.js    # Tailwind config
└── package.json
```

## For Addon Developers

### Installation
```bash
npm install @wealthfolio/ui
```

### Usage
```tsx
// Import components
import { Button, Card, CardContent, AmountDisplay } from '@wealthfolio/ui';

// Import styles (once in your main file)
import '@wealthfolio/ui/styles';

function MyAddon() {
  return (
    <Card>
      <CardContent>
        <Button>Click me</Button>
        <AmountDisplay amount={1234.56} currency="USD" />
      </CardContent>
    </Card>
  );
}
```

### Benefits
- ✅ **Automatic theming** - Inherits light/dark mode from main app
- ✅ **Consistent styling** - Same look and feel as main app
- ✅ **Financial components** - Ready-to-use components for financial data
- ✅ **Tree-shakeable** - Only bundles what you use
- ✅ **TypeScript support** - Full type safety

## For Main App Development

### Shadcn CLI Operations

#### Adding new components to UI package:
```bash
cd packages/ui
npx shadcn-ui@latest add button
```

#### Adding components to main app (legacy):
```bash
npx shadcn-ui@latest add button
```

### Updating Components

When updating shared components:
1. Edit in `packages/ui/src/components/`
2. Build the package: `cd packages/ui && npm run build`
3. Components automatically available to addons

### Theme Updates

The Flexoki theme is defined in `packages/ui/src/styles.css`. Updates here automatically apply to:
- Main application
- All addons using `@wealthfolio/ui`

## Migration Strategy

### Phase 1: ✅ Package Creation
- [x] Created `@wealthfolio/ui` package
- [x] Copied all UI components
- [x] Set up build system
- [x] Added to workspace

### Phase 2: Addon Integration
- [x] Updated example addons to use UI package
- [x] Added as dependency to addon templates
- [x] Updated documentation

### Phase 3: Main App Migration (Optional)
- [ ] Gradually migrate main app to use `@wealthfolio/ui`
- [ ] Remove duplicate components from main app
- [ ] Centralize all UI in shared package

## Component Categories

### Core UI (shadcn/ui)
All standard shadcn/ui components with Wealthfolio's Flexoki theme applied.

### Financial Components
- `AmountDisplay` - Currency formatting
- `GainAmount` - Gain/loss with color coding
- `GainPercent` - Percentage display
- `Icons` - Financial and general icons

### Utility Functions
- `cn()` - Class name utility with tailwind-merge
- Theme utilities and helpers

## Best Practices

### For Addon Developers
1. Always import from `@wealthfolio/ui` instead of creating custom components
2. Import styles once in your main addon file
3. Use provided utility functions for consistent styling
4. Leverage financial components for data display

### For Core Development
1. Add new components to UI package, not main app
2. Use semantic versioning for UI package updates
3. Test changes against example addons
4. Document new components in README

## Development Workflow

### Adding New Component
1. `cd packages/ui`
2. `npx shadcn-ui@latest add [component]`
3. Customize if needed for Wealthfolio
4. Export in `src/index.ts`
5. Build and test with addons

### Updating Existing Component
1. Edit in `packages/ui/src/components/`
2. `npm run build`
3. Test with addons
4. Update version if breaking changes

This strategy ensures consistent UI/UX across the entire Wealthfolio ecosystem while maintaining developer efficiency and user experience.
