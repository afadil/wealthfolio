# @wealthfolio/ui

Wealthfolio's shared UI component library built on top of shadcn/ui and Tailwind CSS.

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

## Usage

### Basic Components
```tsx
import { Button, Card, CardContent } from '@wealthfolio/ui';

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
import { AmountDisplay, GainAmount, GainPercent } from '@wealthfolio/ui';

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

### Styling

Import the CSS file in your addon:
```tsx
import '@wealthfolio/ui/styles';
```

Or in your CSS:
```css
@import '@wealthfolio/ui/styles';
```

## Components

### UI Primitives
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

## Theming

The components use CSS variables for theming. The main app provides the theme context, so addons automatically inherit the current theme (light/dark mode).

## Development

```bash
# Build the package
npm run build

# Watch for changes
npm run dev

# Type check
npm run lint
```
