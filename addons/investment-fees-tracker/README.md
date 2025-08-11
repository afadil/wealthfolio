# Investment Fees Tracker

A Wealthfolio addon that helps you track and analyze investment fees across your portfolio, providing detailed insights into your investment costs.

## Features

- **Comprehensive Fee Tracking**: Monitor all types of investment fees including management fees, transaction costs, and expense ratios
- **Fee Analytics Dashboard**: Visualize fee trends over time with interactive charts and graphs
- **Portfolio Fee Breakdown**: See fee analysis by account, asset type, or individual holdings
- **Cost Impact Analysis**: Understand how fees affect your overall portfolio performance
- **Fee Comparison Tools**: Compare fee structures across different investments
- **Historical Fee Tracking**: Track fee changes and trends over time

## How It Works

1. **Automatic Fee Detection**: The addon automatically identifies fees from your transaction data
2. **Fee Categorization**: Organizes fees by type (management, transaction, advisory, etc.)
3. **Analytics Generation**: Creates detailed reports and visualizations of your fee data
4. **Performance Impact**: Shows how fees impact your overall investment returns

## Fee Types Tracked

- **Management Fees**: Annual fees charged by fund managers
- **Transaction Fees**: Costs associated with buying/selling securities
- **Expense Ratios**: Operating expenses of mutual funds and ETFs
- **Advisory Fees**: Fees paid to financial advisors
- **Platform Fees**: Brokerage and platform maintenance fees
- **Other Costs**: Miscellaneous investment-related expenses

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
- Use the `ctx.api.portfolio.getHoldings` function to access portfolio data for fee analysis
- Use the `ctx.api.activities.getAll` function to extract fee information from transactions
- Create custom React hooks for fee calculations and analytics
- Build interactive charts and data visualization components
- Handle complex financial calculations and data processing
- Integrate with the Wealthfolio sidebar and routing system

## Permissions Required

- **Portfolio Access**: To read current holdings and analyze associated fees
- **Activities Access**: To access transaction data and extract fee information
- **UI Access**: To add navigation items and display analytics dashboard

## Analytics Features

- **Fee Trends**: Track how your fees change over time
- **Cost Breakdown**: Detailed breakdown of fees by category and investment
- **Performance Impact**: See how fees affect your net returns
- **Comparative Analysis**: Compare fee structures across your investments
- **Optimization Suggestions**: Get insights on potential fee savings

## Dashboard Views

The addon provides multiple views for analyzing your investment fees:

- **Overview Dashboard**: High-level summary of all fees
- **Detailed Breakdown**: Granular view of fees by investment and category
- **Trends Analysis**: Historical fee trends and patterns
- **Performance Impact**: How fees affect your portfolio performance
- **Optimization**: Suggestions for reducing investment costs

## License

MIT License - see the main Wealthfolio project for details.