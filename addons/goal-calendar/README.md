# Goal Calendar Addon

A Wealthfolio addon that helps you visualize your investment progress towards target amounts using a calendar-style representation.

## Features

- **Visual Progress Tracking**: See your investment progress with a calendar grid where each dot represents a milestone
- **Configurable Targets**: Set your investment target amount and step size per dot
- **Real-time Portfolio Integration**: Automatically loads your current portfolio value using the Wealthfolio API
- **Interactive Milestones**: Click on dots to see the target amount for each milestone
- **Progress Metrics**: View current amount, target, progress percentage, and remaining amount

## How It Works

1. **Set Your Target**: Configure your investment target amount (default: $100,000)
2. **Choose Step Size**: Set how much each dot represents (default: $10,000)
3. **View Progress**: The calendar shows:
   - ✅ Green dots for completed milestones
   - 🟡 Partially filled dot for current progress
   - ⚪ Empty dots for future milestones

## Installation

1. Build the addon:
   ```bash
   pnpm build
   ```

2. Package the addon:
   ```bash
   pnpm package
   ```

3. Install in Wealthfolio through the addon settings page

## Development

To work on this addon:

```bash
# Install dependencies
pnpm install

# Start development mode (watches for changes)
pnpm dev

# Build for production
pnpm build

# Create distribution package
pnpm bundle
```

## API Usage

This addon demonstrates how to:
- Use the `ctx.api.portfolio.getHoldings` and `ctx.api.goals.getAll` functions to access portfolio and goals data
- Create custom React hooks within addons
- Build interactive UI components
- Handle loading and error states
- Integrate with the Wealthfolio sidebar and routing system

## Permissions Required

- **Portfolio Access**: To read current holdings and calculate total investment value
- **Storage Access**: To save user preferences for target amount and step size

## Settings

- **Target Amount**: Your investment goal (range: $1,000 - $10,000,000)
- **Step Size**: Amount each calendar dot represents (range: $1,000 - $100,000)

## Screenshot

The addon displays a calendar grid similar to GitHub's contribution calendar, but for investment milestones:

```
⚫⚫⚫⚫⚫⚫⚫
⚫⚫🟢⚪⚪⚪⚪
⚪⚪⚪⚪⚪⚪⚪
```

Where:
- ⚫ = Completed milestone
- 🟢 = Partially completed current milestone  
- ⚪ = Future milestone

## License

MIT License - see the main Wealthfolio project for details.
