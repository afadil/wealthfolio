# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wealthfolio is a local-first desktop investment tracker built with Tauri 2, React 19, and Rust. All data is stored locally in SQLite with no cloud dependencies. The application supports portfolio tracking, activity management, goal planning, and features a powerful addon system for extensibility.

## Development Commands

### Primary Development
- `pnpm tauri dev` - Run desktop application in development mode (most common)
- `pnpm run dev:web` - Run web UI with local Axum server (browser + REST API)
- `pnpm dev` - Run frontend only with Vite (requires backend separately)

### Building
- `pnpm build` - Full production build (types, TypeScript, Vite, packages)
- `pnpm tauri build` - Build desktop application for production
- `pnpm run build:types` - Build TypeScript declaration files for packages

### Testing
- `pnpm test` - Run all tests with Vitest
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:ui` - Run tests with UI
- `pnpm test:coverage` - Run tests with coverage report

### Code Quality
- `pnpm lint` - Lint all code (root + packages)
- `pnpm lint:fix` - Auto-fix linting issues
- `pnpm type-check` - Type check all TypeScript code
- `pnpm format` - Format code with Prettier
- `pnpm check` - Run format check, lint, and type check together

### Addon Development
- `pnpm addon:create` - Create new addon from template
- `pnpm addon:dev` - Start addon development server with hot reload
- `npx @wealthfolio/addon-dev-tools create <name>` - Create standalone addon

## Architecture

### Monorepo Structure

This is a pnpm workspace monorepo with the following key directories:

**Frontend (TypeScript/React)**
- `src/` - Main React application
  - `addons/` - Addon system core (loader, runtime, dev mode, type bridge)
  - `components/` - Reusable React components
  - `pages/` - Page-level components mapped to routes
  - `hooks/` - Custom React hooks
  - `context/` - React context providers
  - `commands/` - Tauri command wrappers (TypeScript)
  - `lib/` - Utilities, types, schemas, constants

**Backend (Rust)**
- `src-core/` - Core business logic library (platform-agnostic)
  - Domain modules: `accounts`, `activities`, `assets`, `portfolio`, `market_data`, `goals`, `limits`
  - Infrastructure: `db` (Diesel ORM), `fx` (exchange rates), `secrets` (keyring)
  - `migrations/` - Diesel database migrations
  - `schema.rs` - Generated database schema

- `src-tauri/` - Tauri desktop integration
  - `src/commands/` - Tauri command handlers (call into src-core)
  - `src/context/` - Service context and dependency injection
  - `src/events.rs` - Event emission to frontend
  - `src/listeners.rs` - Event listeners
  - `src/lib.rs` - Main Tauri application setup

- `src-server/` - Web server mode (Axum REST API, uses src-core)

**Shared Packages**
- `packages/addon-sdk/` - TypeScript SDK for addon development
- `packages/addon-dev-tools/` - CLI tools for creating and running addons
- `packages/ui/` - Shared UI component library (Shadcn-based)

**Addons & Documentation**
- `addons/` - Example addons (e.g., goal-progress-tracker)
- `docs/addons/` - Comprehensive addon development documentation

### Frontend Architecture

- **Routing**: React Router with declarative routes in `src/routes.tsx`
- **State Management**: TanStack Query for server state, React Context for app state
- **Query Client**: Globally exposed as `window.__wealthfolio_query_client__` for addon access
- **Styling**: Tailwind CSS 4 with custom config, Shadcn UI components
- **Backend Communication**: Tauri commands (desktop) or REST API (web mode)
- **Addon System**:
  - Addons loaded at startup via `src/addons/addons-loader.ts`
  - Runtime context injected via `src/addons/addons-runtime-context.ts`
  - Development mode with hot reload in `src/addons/addons-dev-mode.ts`
  - Type bridge in `src/addons/type-bridge.ts` for secure addon-app communication

### Backend Architecture

- **Layered Design**:
  1. `src-tauri/src/commands/` - Tauri command handlers (thin layer)
  2. `src-core/` - Business logic and data access (core library)
  3. Database layer via Diesel ORM

- **Database**: SQLite with Diesel ORM
  - Migrations in `src-core/migrations/`
  - Schema defined in `src-core/schema.rs`
  - Connection pooling with r2d2

- **Service Context**: Dependency injection pattern in `src-tauri/src/context/`
  - Holds database pool, services, and shared state
  - Passed to all command handlers

- **Secrets Management**: OS keyring via `keyring` crate
  - Core app: `set_secret` and `get_secret` commands
  - Addons: Scoped secrets API via `ctx.api.secrets`

- **Error Handling**: Custom error types using `thiserror` crate

### Communication Patterns

**Desktop Mode (Tauri)**
- Frontend calls Rust via `invoke('command_name', { args })` from `@tauri-apps/api/core`
- Rust emits events to frontend via `emit()` in `src-tauri/src/events.rs`
- Commands wrapped in TypeScript in `src/commands/*.ts`

**Web Mode (REST API)**
- Frontend makes HTTP requests to Axum server (src-server)
- Server uses same core logic from `src-core/`
- Proxied through Vite dev server in development (see vite.config.ts)

## Code Style Guidelines

### TypeScript/React (from .cursor/rules/frontend-rules.mdc)
- Write concise, technical TypeScript following functional patterns
- Avoid classes and code duplication
- Use descriptive variable names with auxiliary verbs (`isLoading`, `hasError`)
- Prefer interfaces over types, avoid enums (use maps)
- Use the `function` keyword for pure functions
- File structure: exported component → subcomponents → helpers → types
- Directory naming: lowercase with dashes (`auth-wizard`)
- Favor named exports for components
- Use Tailwind for all styling

### Rust (from .cursor/rules/rust-rules.mdc)
- Write clear, idiomatic Rust with async programming
- Use `thiserror` for custom error types
- Embrace Result and Option types, use `?` operator
- Structure into modules: separate networking, database, business logic
- Use environment variables for configuration (dotenv)
- Write unit tests with `tokio::test` for async code
- Document code with inline comments and Rustdoc
- When refactoring, remove unused code
- Follow Rust naming conventions: snake_case for functions/variables, PascalCase for types

## Key Concepts

### Addon System

Wealthfolio features a comprehensive addon system allowing developers to extend functionality:

**Development Workflow**:
1. Create addon: `npx @wealthfolio/addon-dev-tools create my-addon`
2. Install dependencies: `cd my-addon && npm install`
3. Start dev server: `npm run dev:server`
4. Start Wealthfolio: `pnpm tauri dev` (in main repo)
5. Addon loads automatically with hot reload

**Addon Capabilities**:
- Add custom UI pages and navigation items
- Access portfolio, accounts, holdings, activities, market data
- Listen to real-time events (portfolio updates, market sync)
- Secure storage for API keys via Secrets API
- Full TypeScript SDK with type safety

**Permission System**:
- Automatic code analysis during installation
- User consent required for data access
- Risk-based security warnings
- Transparent permission declarations

**Key Files**:
- `packages/addon-sdk/` - SDK implementation
- `src/addons/addons-core.ts` - Core addon functionality
- `docs/addons/` - Complete documentation

### Database Schema

- Managed via Diesel migrations in `src-core/migrations/`
- Schema auto-generated in `src-core/schema.rs`
- Database path configured via `DATABASE_URL` env variable (default: `../db/wealthfolio.db`)
- Key tables: accounts, activities, assets, portfolio_history, exchange_rates, goals, contribution_limits

### Multi-Currency Support

- Exchange rates stored in database
- FX module in `src-core/src/fx/`
- Market data sync includes exchange rates

### Activity Types

All trading activities (buy, sell, dividend, etc.) are documented in `docs/activities/activity-types.md` with required fields.

### Internationalization (i18n)

The application uses react-i18next for multilanguage support:

**Setup**:
- Configuration: `src/lib/i18n.ts`
- Type definitions: `src/lib/i18n-types.ts` (for TypeScript autocomplete)
- Translations: `src/locales/{lang}/*.json` (organized by namespace)
- Supported languages: English (en), French (fr)

**Usage in Components**:
```typescript
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t } = useTranslation("namespace"); // e.g., "common", "settings", "dashboard"
  return <div>{t("translation_key")}</div>;
}
```

**Translation Namespaces**:
- `common` - Common UI elements (buttons, labels, navigation)
- `settings` - Settings page translations
- `dashboard` - Dashboard-specific translations
- `activity` - Activity page and import workflow
- `holdings` - Holdings and insights page
- `performance` - Performance analysis page
- `account` - Account management
- `goals` - Goals and contribution limits
- `income` - Income tracking (dividends, interest)

**Adding New Translations**:
1. Add keys to English JSON files in `src/locales/en/`
2. Add corresponding translations to other languages
3. Import new namespace in `src/lib/i18n.ts` if creating new file
4. Use `useTranslation("namespace")` hook in components

**Language Detection & Switching**:
- **First-time users**: Automatically detects OS/browser language (e.g., `fr-FR` → `fr`)
- **Returning users**: Uses previously selected language from localStorage
- **Manual switching**: User can change language in Settings > General > Language
- Selection persisted in localStorage (`i18nextLng` key)
- Entire app updates immediately on language change
- Falls back to English if OS language not supported

## Common Development Patterns

### Adding a New Feature

1. **Backend (if needed)**:
   - Add service logic to appropriate module in `src-core/src/`
   - Add database migration if schema changes needed
   - Add Tauri command in `src-tauri/src/commands/`
   - Expose command in `src-tauri/src/lib.rs`

2. **Frontend**:
   - Add TypeScript command wrapper in `src/commands/`
   - Add query key to `src/lib/query-keys.ts`
   - Create UI components in `src/components/`
   - Add page in `src/pages/` if needed
   - Update routes in `src/routes.tsx`

### Testing Approach

- Frontend: Vitest with React Testing Library
- Test files colocated with source: `*.test.ts`, `*.test.tsx`
- Setup file: `src/test/setup.ts`
- Run in watch mode during development

### Building Addons

See comprehensive documentation in `docs/addons/addon-developer-guide.md`. Example addons in `addons/` directory.

## Environment Configuration

- Copy `.env.example` to `.env` for desktop development
- Copy `.env.web.example` to `.env.web` for web mode overrides
- Key variables:
  - `DATABASE_URL` - SQLite database path (desktop)
  - `WF_DB_PATH` - Database path (web server)
  - `WF_LISTEN_ADDR` - Server bind address (web)
  - `WF_CORS_ALLOW_ORIGINS` - CORS origins (web)

## Important Notes

- **Local-First**: All data stored locally in SQLite, no cloud sync
- **Security**: API keys stored in OS keyring, never in files or database
- **Monorepo**: Use `pnpm` for package management, workspace dependencies use `workspace:*`
- **Tauri Version**: Using Tauri 2.x (check plugin versions in package.json)
- **React Version**: Using React 19 (stable)
- **TypeScript**: Strict mode enabled, no implicit any
- **Diesel**: Uses SQLite 3.35+ features (returning clauses)
