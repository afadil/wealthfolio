# Changelog

All notable changes to the Swingfolio addon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.1] - 2026-03-05

### Fixed

- Simplified calendar data generation for historical analysis
- Enhanced activity filtering to include SPLIT activities
- Updated yearly calendar data structure

## [3.0.0] - 2026-02-24

### Changed

- Updated SDK version to 3.0.0
- Updated activity model and parsing logic for new addon SDK
- Updated dependencies and package versions
- Restructured project directories for new frontend/backend layout
- Added @vitejs/plugin-react dependency

## [2.0.0] - 2025-10-28

### Changed

- Migrated to Tailwind CSS v4 and updated shadcn components
- Improved layout and mobile responsiveness
- Updated ESLint and Prettier configuration
- Upgraded addon for Wealthfolio 2.0.0 compatibility

## [1.0.4] - 2025-08-31

### Fixed

- Improved currency handling in trade calculations
- Refined performance metrics accuracy
- Enhanced dashboard layout
- Removed reporting currency preference for consistency

## [1.0.3] - 2025-08-31

### Changed

- Resolved merge conflicts in trade-matcher
- Removed calendar-view component in favor of new implementation

## [1.0.2] - 2025-08-30

### Changed

- Refactored trade-matcher and addon structure

### Improved

- Enhanced EquityCurveChart component with weekly period type support
- Improved layout for empty data state
- Refactored useHoldings hook to aggregate holdings from all accounts
- Removed unused hooks and utility files
- Dashboard now automatically determines chart period type based on selected
  period
- Improved user feedback for no selected activities

## [1.0.0] - 2025-08-26

### Added

- Initial release of Swingfolio addon
- Swing stock trading tracker with performance analytics
- Trade matching engine for buy/sell pairing
- Calendar views for trade history visualization
- Equity curve charting with multiple period types
- Dashboard with performance metrics and trade summaries
- Multi-currency support with exchange rate conversion
- Integration with portfolio holdings for unrealized P/L
- Sidebar navigation integration for easy access
- Compatible with Wealthfolio addon SDK v1.0.0

### Permissions

- Activities access for swing trading analysis
- Portfolio holdings access for unrealized P/L calculations
- Exchange rates access for currency conversion
- Settings access for base currency configuration
- UI components access for sidebar and routing
