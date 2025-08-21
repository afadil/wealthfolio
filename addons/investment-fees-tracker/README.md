# Investment Fees Tracker

A comprehensive Wealthfolio addon that helps you track and analyze investment fees across your portfolio, providing detailed insights into your investment costs and their impact on returns.

## Features

- **Fee Period Analysis**: View fees across different time periods (Total, Year-to-Date, Last Year)
- **Interactive Fee Dashboard**: Modern dashboard with overview cards displaying total fees, monthly averages, and portfolio impact
- **Fee History Visualization**: Line charts showing fee trends over time with period-over-period comparisons
- **Account Fee Breakdown**: Horizontal bar charts showing fee distribution across different accounts
- **Fee Category Analysis**: Donut charts categorizing fees by type (Trading, Transfer, Management, Other)
- **Advanced Fee Analytics**: Detailed analytics including highest fee transactions, fee efficiency metrics, and cost impact analysis
- **Multi-Currency Support**: Automatic currency conversion to display all fees in your base currency
- **Privacy Controls**: Integrated balance privacy controls to hide sensitive fee amounts

## How It Works

1. **Data Collection**: The addon automatically extracts fee information from your transaction activities and dedicated fee entries
2. **Period-based Analysis**: Organizes fee data by time periods (Total, YTD, Last Year) for flexible analysis
3. **Real-time Analytics**: Calculates comprehensive fee metrics including averages, trends, and efficiency ratios
4. **Visual Dashboard**: Presents data through interactive charts, cards, and breakdowns for easy understanding
5. **Currency Normalization**: Converts all fees to your base currency for consistent comparison and analysis

## Fee Types Tracked

- **Trading Fees**: Transaction costs from buying and selling securities (BUY/SELL activities)
- **Transfer Fees**: Costs associated with account transfers (TRANSFER_IN/TRANSFER_OUT activities)
- **Management Fees**: Dedicated fee entries and portfolio management costs (FEE activities)
- **Other Fees**: Miscellaneous investment-related expenses from various activity types

## Dashboard Components

- **Fee Overview Cards**: High-level metrics showing total fees, monthly averages, and portfolio impact percentage
- **Fee History Chart**: Interactive line chart displaying fee trends over time with previous period comparisons
- **Account Breakdown**: Horizontal bar chart showing fee distribution across different investment accounts
- **Fee Categories**: Visual breakdown of fees by type using donut charts and detailed analytics

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

# Start development server with hot reload
pnpm dev:server

# Build for production
pnpm build

# Create distribution package
pnpm bundle

# Type checking
pnpm type-check
```

## API Usage

This addon demonstrates how to:
- Use `ctx.api.activities.getAll()` to extract fee information from all transaction activities
- Use `ctx.api.portfolio.getHoldings()` to access portfolio data for fee impact analysis
- Use `ctx.api.settings.get()` to retrieve base currency settings for fee normalization
- Use `ctx.api.currency.getAll()` for multi-currency fee conversion
- Create custom React hooks (`useFeeSummary`, `useFeeAnalytics`) for complex fee calculations
- Build responsive dashboard components with charts using Recharts library
- Implement period-based data filtering and comparison analytics
- Integrate with Wealthfolio UI components and theming system

## Permissions Required

- **Portfolio Access**: Read portfolio holdings to calculate fee impact as percentage of portfolio value
- **Activities Access**: Access all transaction activities to extract and analyze fee data
- **Currency Access**: Access exchange rates for multi-currency fee conversion and normalization
- **Settings Access**: Read base currency settings for consistent fee reporting
- **UI Access**: Add navigation items to sidebar and register dashboard routes for fee analytics

## Analytics Features

- **Fee Efficiency Metrics**: Calculate average fees per transaction and fee percentages relative to portfolio value
- **Period Comparisons**: Compare fees across Total, Year-to-Date, and Last Year periods
- **Highest Fee Tracking**: Identify transactions with the highest fees for cost optimization
- **Account Analysis**: Break down fees by investment account with transaction counts and averages
- **Asset-Level Analysis**: Track fees by individual assets and calculate fee-to-volume ratios
- **Trend Analysis**: Visualize fee patterns over time with month-over-month comparisons
- **Currency Normalization**: Convert all fees to base currency for consistent analysis
- **Performance Impact**: Calculate estimated annual fees and potential return loss from fee costs

## Technical Implementation

### Core Components
- **`fees-page.tsx`**: Main dashboard page with period selector and comprehensive fee analytics
- **`fee-overview-cards.tsx`**: Summary cards displaying key fee metrics and statistics
- **`fee-history-chart.tsx`**: Line chart component for visualizing fee trends over time
- **`account-breakdown.tsx`**: Horizontal bar chart showing fee distribution by account
- **`fee-categories-chart.tsx`**: Donut chart for fee category visualization
- **`fee-period-selector.tsx`**: UI component for switching between time periods

### Data Processing
- **`fee-calculation.service.ts`**: Core service for fee calculations, analytics, and currency conversion
- **`useFeeSummary` hook**: Fetches and processes fee summary data across different periods
- **`useFeeAnalytics` hook**: Provides advanced fee analytics and efficiency metrics
- **`useCurrencyConversion` hook**: Handles multi-currency fee normalization

### Features
- Responsive design with mobile-friendly layouts
- Privacy controls integration for sensitive financial data
- Error handling and loading states for better user experience
- Modular component architecture for maintainability

## License

MIT License - see the main Wealthfolio project for details.