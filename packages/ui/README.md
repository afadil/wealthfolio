# @wealthfolio/ui

Wealthfolio's shared UI component library built on top of shadcn/ui and Tailwind
CSS.

## Overview

The `@wealthfolio/ui` package provides a complete design system for Wealthfolio
addons, ensuring consistent styling and user experience across all extensions.

## Features

- 🎨 **Complete shadcn/ui components** - All essential UI primitives
- 💰 **Wealthfolio-specific components** - Financial data display components
- 🎭 **Consistent theming** - Dark/light mode support with CSS variables
- 📦 **Tree-shakeable** - Import only what you need
- 🔧 **TypeScript ready** - Full type safety

## Installation

For addons:

```bash
npm install @wealthfolio/ui
```

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
│   └── index.ts          # Main exports
├── components.json       # Shadcn CLI config
├── tailwind.config.js    # Tailwind config
└── package.json
```

## Usage

### Basic Components

```tsx
import { Button, Card, CardContent } from "@wealthfolio/ui";

function MyComponent() {
  return (
    <Card>
      <CardContent>
        <Button>Click me</Button>
      </CardContent>
    </Card>
  );
}
```

### Financial Components

```tsx
import { AmountDisplay, GainAmount, GainPercent } from "@wealthfolio/ui";

function FinancialData() {
  return (
    <div>
      <AmountDisplay amount={1234.56} currency="USD" />
      <GainAmount gain={123.45} />
      <GainPercent percentage={5.67} />
    </div>
  );
}
```

### Complete Addon Example

```tsx
// Import components
import { Button, Card, CardContent, AmountDisplay } from "@wealthfolio/ui";

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

### Benefits for Addon Developers

- ✅ **Automatic theming** - Inherits light/dark mode from main app
- ✅ **Consistent styling** - Same look and feel as main app
- ✅ **Financial components** - Ready-to-use components for financial data
- ✅ **Tree-shakeable** - Only bundles what you use
- ✅ **TypeScript support** - Full type safety

### Styling

Wealthfolio loads its stylesheet into the addon sandbox. Addons using
`@wealthfolio/ui` do not need to import `@wealthfolio/ui/styles`; doing so can
bundle Tailwind CSS a second time. The package CSS export is not used by the
addon runtime, so do not add a CSS copy step to the package build solely for
addon styling.

## Components

### Core UI (shadcn/ui)

All standard shadcn/ui components with Wealthfolio's Flexoki theme applied:

- `Button` - Various button styles and sizes
- `Card` - Container component with header/content/footer
- `Input` - Form input with validation styles
- `Label` - Accessible form labels
- `Badge` - Status indicators
- `Dialog` - Modal dialogs
- `Dropdown` - Dropdown menus
- `Table` - Data tables
- `Tabs` - Tab navigation
- And many more...

### Financial Components

- `AmountDisplay` - Formatted currency display
- `GainAmount` - Gain/loss amount with color coding
- `GainPercent` - Percentage change display
- `Icons` - Financial and general purpose icons

### Utility Functions

- `cn()` - Class name utility with tailwind-merge
- Theme utilities and helpers

## Theming

The components use CSS variables for theming. The main app provides the theme
context, so addons inherit the selected curated palette and resolved light/dark
mode.

Curated palettes are data definitions in the frontend. The shared semantic
mapping lives in `packages/ui/src/theme-mapping.css`; the host supplies complete
CSS color values from `apps/frontend/src/globals.css`, which is loaded into the
addon sandbox by `apps/frontend/src/addons/iframe/addon-sandbox-entry.tsx`.
Updates here automatically apply to:

- Main application
- All addons using `@wealthfolio/ui`

## Development

### Basic Commands

```bash
# Build the package
pnpm build

# Watch for changes
pnpm dev

# Type check
pnpm lint
```

### For Main App Development

#### Adding new components to UI package:

```bash
cd packages/ui
npx shadcn-ui@latest add button
```

#### Adding components to main app (legacy):

```bash
npx shadcn-ui@latest add button
```

#### Updating Components

Wealthfolio owns and adapts its component source. Generate pinned upstream
references in a separate scratch project, inspect the differences, and manually
port justified changes with behavior and public-API verification. Do not bulk
regenerate or apply presets over this package. Production remains on Radix; the
experimental Base UI pilot has unresolved WebKit focus/dismissal failures and
does not establish native mobile parity. Keep financial/date behavior, addon
APIs and theme-owned geometry intact when evaluating replacements. See
[theme contributions](../../docs/theme-contributing.md) for the token contract.

### Stylesheet contract

Import `@wealthfolio/ui/styles` into a Tailwind v4 build. The published
stylesheet is Tailwind source, not precompiled utility CSS; the host must
include Tailwind v4 in its toolchain. The UI package build copies both the
stylesheet and its shared token mapping into `dist`. It supplies no palette
defaults, so it never overrides a host palette. Standalone hosts must supply
semantic color variables and shared geometry such as `--radius` and
`--input-height`; Wealthfolio addons receive these through the existing host
theme snapshot. Color variables contain full CSS colors, not raw HSL channels.
Curated theme contribution instructions are in the repository’s
`docs/theme-contributing.md`.

Financial display tokens `gain`, `loss` and `flat` fall back to the existing
`success`, `destructive` and `foreground` variables when absent. Destructive
controls accept separate background, hover and foreground tokens, with legacy
color/opacity fallbacks for older hosts. This separates financial loss colors
from destructive control contrast without requiring existing hosts to adopt new
tokens immediately.
