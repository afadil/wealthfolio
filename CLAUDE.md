# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**WealthVN** is a beautiful, local-first desktop investment tracking application built with:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Rust (Tauri for desktop, Axum for web server)
- **Database**: SQLite with Diesel ORM
- **Architecture**: Local-first with optional web mode, powerful addon system

## Common Commands

### Development
```bash
# Start desktop app in development mode (Tauri)
pnpm tauri dev

# Start web mode (React UI + Axum backend)
pnpm run dev:web

# Run only the backend server
cargo run --manifest-path src-server/Cargo.toml

# Start Vite frontend only
pnpm dev

# Build for production (all targets)
pnpm tauri build

# Build frontend only
pnpm build
```

### Testing
```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

### Code Quality
```bash
# Lint all code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Type check all packages
pnpm type-check

# Format all code
pnpm format

# Check formatting
pnpm format:check

# Run all checks (format, lint, type-check)
pnpm check
```

### Addon Development
```bash
# Create a new addon
npx @wealthvn/addon-dev-tools create my-addon
cd my-addon
npm install

# Start addon development server
pnpm addon:dev

# Run addon development server directly
node packages/addon-dev-tools/dev-server.js
```

## Project Structure

```
wealthvn/
├── src/                          # React frontend source
│   ├── components/              # Reusable React components
│   ├── pages/                   # Application pages and routes
│   ├── hooks/                   # Custom React hooks
│   ├── lib/                     # Utilities and helpers
│   ├── commands/                # Tauri command handlers
│   ├── adapters/                # Data source adapters
│   ├── addons/                  # Addon system core
│   ├── routes.tsx               # Application routing
│   └── types/                   # TypeScript type definitions
│
├── src-tauri/                   # Tauri desktop app
│   ├── src/main.rs             # Tauri entry point
│   ├── capabilities/           # Permission definitions
│   └── tauri.conf.json         # Tauri configuration
│
├── src-server/                  # Rust backend (Axum)
│   ├── src/
│   │   ├── main.rs             # HTTP server entry point
│   │   ├── api.rs              # REST API routes
│   │   ├── main_lib.rs         # Core application logic
│   │   ├── models.rs           # Data models
│   │   ├── config.rs           # Configuration
│   │   ├── error.rs            # Error types
│   │   └── addons/             # Addon system backend
│   └── tests/                   # Rust tests
│
├── src-core/                    # Shared Rust core logic
│
├── packages/                    # Shared packages (monorepo)
│   ├── addon-sdk/              # Addon SDK for developers
│   ├── addon-dev-tools/        # CLI tools for addon development
│   └── ui/                     # Shared UI component library
│
├── addons/                      # Example addons
│   ├── goal-progress-tracker/
│   ├── investment-fees-tracker/
│   └── swingfolio-addon/
│
├── docs/                        # Documentation
│   ├── addons/                 # Addon development guides
│   └── activities/             # Activity types reference
│
├── db/                          # SQLite databases
└── scripts/                     # Build and utility scripts
```

## Architecture Overview

### Frontend (React + TypeScript)
- **Framework**: React 19 with functional components and hooks
- **Routing**: TanStack Router (declarative routing)
- **State Management**: TanStack Query for server state, React hooks for local state
- **Styling**: Tailwind CSS with shadcn/ui components
- **Build Tool**: Vite for fast development and building
- **Architecture**: Component-based with separation of concerns

### Backend (Rust)
- **Desktop**: Tauri for desktop app functionality
- **Web Server**: Axum for HTTP API server
- **Database**: SQLite with Diesel ORM
- **Key Features**:
  - Local data storage and privacy
  - Secure API key storage via OS keyring
  - RESTful API for frontend communication
  - Addon system support

### Database Schema
- **Accounts**: User accounts (brokerages, banks, etc.)
- **Holdings**: Current portfolio positions
- **Activities**: Transaction history (buys, sells, dividends, etc.)
- **Market Data**: Price history and quotes
- **Goals**: Financial goals and progress tracking

### Addon System
The addon system is a key architectural feature that allows extensibility:
- **SDK**: TypeScript-based SDK with full type safety
- **Hot Reload**: Development mode with live reloading
- **Permissions**: Comprehensive security and permission system
- **UI Integration**: Add custom pages, navigation, and components
- **Real-time Events**: Listen to portfolio updates and user actions
- **Secure Storage**: API keys and sensitive data storage

## Development Guidelines

### Frontend Code Style
From `.cursor/rules/frontend-rules.mdc`:
- Use **functional components** with TypeScript interfaces
- Use **named exports** for components
- Prefer **interfaces over types**
- **Avoid enums**; use maps instead
- Structure files as: exported component → subcomponents → helpers → types
- Use **Tailwind CSS** for styling
- Follow **immutable data** patterns
- Use **descriptive variable names** with auxiliary verbs (isLoading, hasError)

### Rust Code Style
From `.cursor/rules/rust-rules.mdc`:
- Use **snake_case** for variables and functions
- Use **PascalCase** for types and structs
- Embrace **Result and Option** types for error handling
- Use **async/await** patterns effectively
- Use **tokio::test** for async tests
- Structure modules: networking, database, business logic separated
- Write **Rustdoc** comments for public APIs

### Database Patterns
- **Diesel ORM** for type-safe SQL queries
- **SQLite** for local storage
- **Migrations** managed via Diesel migrations
- All data stored locally for privacy

### Configuration
Environment files:
- `.env` - Desktop app configuration (DATABASE_URL)
- `.env.web` - Web mode overrides (WF_LISTEN_ADDR, WF_DB_PATH, WF_CORS_ALLOW_ORIGINS)

## Key Technologies

### Frontend Stack
- React 19.1.1
- TanStack Query (react-query)
- TanStack Router
- React Hook Form with Zod validation
- Recharts for data visualization
- Tailwind CSS 4.x
- Radix UI components

### Backend Stack
- Rust (current stable)
- Tauri 2.x for desktop
- Axum for web server
- Diesel ORM
- SQLite
- Tokio for async runtime

### Development Tools
- Vite 7.x
- TypeScript 5.9.x
- ESLint 9.x
- Prettier 3.x
- Vitest 3.x for testing
- pnpm for package management
- Turborepo for monorepo builds

## Important Configuration Files

- `package.json` - Root package with all scripts
- `src-tauri/tauri.conf.json` - Desktop app configuration
- `vite.config.ts` - Vite build configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `tsconfig.json` - TypeScript configuration
- `eslint.config.js` - ESLint configuration

## Web Mode Development

For web development, the app runs with:
- **Frontend**: Vite dev server at http://localhost:1420
- **Backend**: Axum HTTP server (default: http://127.0.0.1:8080)
- Vite proxies API calls to the backend

Environment variables for web mode:
```bash
WF_LISTEN_ADDR=127.0.0.1:8080
WF_DB_PATH=./db/web-dev.db
WF_CORS_ALLOW_ORIGINS=http://localhost:1420
WF_REQUEST_TIMEOUT_MS=30000
WF_STATIC_DIR=dist
VITE_API_TARGET=http://127.0.0.1:8080
```

## Security & Data Storage

- **Local-first**: All data stored in SQLite database
- **API Keys**: Stored using OS keyring (never on disk)
- **Addons**: Permission-based access system with user consent
- **No Cloud Dependencies**: Complete offline functionality

## Testing Strategy

- **Frontend**: Vitest with React Testing Library
- **Backend**: Rust unit tests with tokio::test
- **Integration**: API tests and end-to-end scenarios
- **Coverage**: Available via `pnpm test:coverage`

## Building and Distribution

### Desktop App
```bash
# Build all targets
pnpm tauri build

# Build for specific platform
pnpm tauri build --target x86_64-pc-windows-msvc  # Windows
pnpm tauri build --target x86_64-apple-darwin    # macOS Intel
pnpm tauri build --target aarch64-apple-darwin   # macOS Apple Silicon
pnpm tauri build --target x86_64-unknown-linux-gnu # Linux
```

### Web Server (Docker)
```bash
docker build -t wealthvn-web .
docker run --rm -it \
  -e WF_LISTEN_ADDR=0.0.0.0:8080 \
  -e WF_DB_PATH=/data/wealthvn.db \
  -p 8080:8080 \
  -v "$(pwd)/wealthvn-data:/data" \
  wealthvn-web
```

## Database Location

- **Default**: `../db/wealthvn.db` (relative to app binary)
- **Custom**: Set `DATABASE_URL` environment variable
- **Web mode**: Use `WF_DB_PATH` in `.env.web`

## Dependencies

Required for development:
- Node.js (LTS)
- pnpm
- Rust (stable)
- Tauri CLI

Install dependencies:
```bash
pnpm install
```

## Activity Types

The app supports various transaction types (buys, sells, dividends, etc.). See `docs/activities/activity-types.md` for complete reference on required fields for each activity type.

## Addon Development Quick Reference

Creating an addon:
1. `npx @wealthvn/addon-dev-tools create my-addon`
2. `cd my-addon && npm install`
3. Start dev server: `pnpm addon:dev` (in project root)
4. Start WealthVN: `pnpm tauri dev` (in another terminal)

Addon features:
- Custom pages and navigation
- Access to all portfolio data
- Real-time events (portfolio updates, market sync)
- Secure secrets storage
- Hot reload in development
- Permission system with user consent

## Common Development Tasks

### Adding a new page:
1. Create component in `src/pages/`
2. Add route in `src/routes.tsx`
3. Update navigation if needed

### Adding a new command:
1. Implement handler in `src/commands/`
2. Expose via Tauri in `src-tauri/src/main.rs`
3. Call from frontend using `@tauri-apps/api`

### Database changes:
1. Create migration in `src-server/migrations/`
2. Update models in `src-server/src/models.rs`
3. Update TypeScript types in `src/types/`

### Creating shared components:
1. Add to `packages/ui/src/components/`
2. Build: `pnpm -r build`
3. Import in app: `import { ComponentName } from '@wealthvn/ui'`

