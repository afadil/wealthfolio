# Changelog

All notable changes to the Goal Progress Tracker addon will be documented in
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
- Adjusted CalendarDot component styles for improved layout and responsiveness

### Fixed

- Fixed goal progress bugs and deduplicated addon code

## [2.0.0] - 2025-10-28

### Changed

- Migrated to Tailwind CSS v4 and updated shadcn components
- Updated addons layout and fixed issues in mobile
- Updated ESLint and Prettier configuration
- Upgraded addon for Wealthfolio 2.0.0 compatibility

## [1.0.0] - 2025-08-20

### Added

- Initial release of Goal Progress Tracker addon
- Visual progress tracking for investment goals
- Integration with portfolio holdings to calculate current investment value
- Real-time progress updates based on portfolio valuations
- Support for multiple investment goals with individual progress tracking
- Clean and intuitive user interface for goal management
- Sidebar navigation integration for easy access
- Compatible with Wealthfolio addon SDK v1.0.0

### Features

- View current portfolio value vs goal targets
- Progress visualization with percentage completion
- Account integration for comprehensive tracking
- Responsive design for all screen sizes

### Permissions

- Portfolio access for latest valuations
- Financial planning data access for goals
- Accounts information access
- UI components access for sidebar and routing
