# Swingfolio - Advanced Swing Trading Tracker

A comprehensive Wealthfolio addon for tracking and analyzing swing trading
performance with detailed analytics, calendar views, and performance metrics.

## Features

### 📊 Performance Analytics

- **Comprehensive Metrics**: Win rate, profit factor, expectancy, max drawdown
- **Realized vs Unrealized P/L**: Track both closed and open positions
- **Equity Curve**: Visual representation of cumulative performance
- **Distribution Analysis**: Performance by symbol, weekday, holding period, and
  account

### 📅 Calendar View

- **Monthly Calendar**: Color-coded days based on P/L performance
- **Daily Details**: Click any day to see trades and summary
- **Visual Indicators**: Green for profits, red for losses, intensity based on
  return %
- **Trade Count**: See number of trades per day

### 🎯 Activity Selection

- **Smart Filtering**: Auto-include activities tagged with "Swing"
- **Manual Selection**: Choose specific activities with advanced filters
- **Bulk Operations**: Select/deselect multiple activities at once
- **Persistent Storage**: Your selections are saved securely

### ⚙️ Advanced Settings

- **Lot Matching**: Choose between FIFO and LIFO methods
- **Date Ranges**: Flexible time period analysis (1M, 3M, 6M, YTD, 1Y, All)
- **Calculation Options**: Include/exclude fees and dividends
- **Calendar Customization**: Set color thresholds for performance visualization

### 📈 Open Positions Tracking

- **Real-time Unrealized P/L**: Track current position performance
- **Days Open**: Monitor holding periods for open trades
- **Market Value**: Current position values and returns

## Installation

1. Download the addon package from the Wealthfolio addon marketplace
2. Install through the Wealthfolio addon manager
3. Enable the addon in your settings
4. Navigate to "Swingfolio" in the sidebar to get started

## Getting Started

### 1. Select Your Activities

- Go to **Swingfolio > Select Activities**
- Enable "Auto-include Swing tagged activities" for automatic selection
- Or manually select specific BUY/SELL activities
- Use filters to find activities by account, symbol, or date
- Save your selection

### 2. Configure Settings

- Go to **Swingfolio > Settings**
- Choose your preferred lot matching method (FIFO/LIFO)
- Set default date range for dashboard
- Configure whether to include fees and dividends
- Customize calendar color thresholds

### 3. Analyze Performance

- View your dashboard with key metrics
- Explore the equity curve chart
- Use the calendar view to see daily performance
- Review open positions and their unrealized P/L
- Analyze distribution charts for insights

## Key Metrics Explained

### Performance Metrics

- **Win Rate**: Percentage of profitable trades
- **Profit Factor**: Ratio of gross profit to gross loss
- **Expectancy**: Expected value per trade
- **Max Drawdown**: Largest peak-to-trough decline

### Trade Matching

- **FIFO (First In, First Out)**: Matches oldest buy with sell
- **LIFO (Last In, First Out)**: Matches newest buy with sell
- **Partial Fills**: Handles multiple lots and partial position closes

### Calendar Colors

- **Green Intensity**: Based on positive return percentage thresholds
- **Red Intensity**: Based on negative return percentage thresholds
- **Gray**: Days with no trades or zero P/L

## Data Privacy & Security

- All preferences and selections are stored securely using Wealthfolio's
  encrypted storage
- No data is transmitted outside of your Wealthfolio instance
- Full privacy protection for sensitive financial information

## Permissions Required

- **Activities**: Read access to BUY/SELL transactions
- **Portfolio**: Read access to holdings for unrealized P/L calculations
- **Accounts**: Read access for filtering and analysis
- **Assets**: Read access for symbol and price information
- **Settings**: Read access for currency and timezone preferences
- **Secrets**: Secure storage for user preferences

## Technical Details

### Architecture

- Built with React and TypeScript
- Uses React Query for efficient data management
- Recharts for performance visualizations
- Date-fns for date calculations and formatting

### Trade Matching Engine

- Supports both FIFO and LIFO lot matching methods
- Handles partial fills and multiple lot scenarios
- Proportional fee allocation across matched quantities
- Accurate P/L calculations with cost basis tracking

### Performance Calculations

- Time-weighted returns for equity curve
- Risk-adjusted metrics including Sharpe ratio concepts
- Drawdown analysis from peak equity values
- Statistical analysis of trade distributions

## Support & Feedback

For support, feature requests, or bug reports:

- Visit the Wealthfolio community forums
- Submit issues through the addon feedback system
- Check the Wealthfolio documentation for addon troubleshooting

## Version History

### v1.0.0 (Current)

- Initial release with core swing trading analytics
- Calendar view with color-coded performance
- Activity selection and filtering
- Comprehensive performance metrics
- Open positions tracking
- Distribution analysis charts
- Configurable settings and preferences

---

**Swingfolio** - Elevate your swing trading analysis with professional-grade
performance tracking and insights.
