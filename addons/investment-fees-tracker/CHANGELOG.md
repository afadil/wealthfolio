# Changelog

All notable changes to the Investment Fees Tracker addon will be documented in
this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-02-24

### Changed

- Updated SDK version to 3.0.0
- Updated activity model and parsing logic for new addon SDK
- Updated dependencies and package versions
- Restructured project directories for new frontend/backend layout
- Added @vitejs/plugin-react dependency
- Adjusted grid layout for improved responsiveness on Fees Tracker page

### Fixed

- Fixed goal progress bugs and deduplicated addon code

## [2.0.0] - 2025-10-28

### Changed

- Migrated to Tailwind CSS v4 and updated shadcn components
- Improved layout and mobile responsiveness
- Updated addons layout and fixed issues in mobile
- Updated ESLint and Prettier configuration
- Upgraded addon for Wealthfolio 2.0.0 compatibility

## [1.0.1] - 2025-08-23

### Fixed

- Fixed calculation of fees from fee transaction types
- Improved accuracy of fee tracking and reporting

## [1.0.0] - 2025-08-20

### Added

- Initial release of Investment Fees Tracker addon
- Comprehensive fee tracking and analysis across entire portfolio
- Detailed analytics and insights for investment expenses
- Integration with portfolio holdings for fee calculation
- Transaction activity analysis for historical fee data
- Multi-currency support with automatic conversion
- Advanced reporting and visualization of fee structures
- Sidebar navigation integration for easy access
- Compatible with Wealthfolio addon SDK v1.0.0

### Features

- Track management fees, expense ratios, and transaction costs
- Analyze fee impact on portfolio performance
- Historical fee tracking with trend analysis
- Currency conversion for accurate fee calculations
- Detailed breakdown by asset type and account
- Export capabilities for fee reports
- Real-time fee monitoring and alerts
- Responsive design for all screen sizes

### Analytics

- Fee-to-asset ratio calculations
- Performance impact analysis
- Cost basis adjustments
- Comparative fee analysis across holdings
- Annual fee projections

### Permissions

- Portfolio holdings access for fee analysis
- Activities access for transaction fee data
- Currency data access for conversion rates
- Settings access for base currency configuration
- UI components access for sidebar and routing
