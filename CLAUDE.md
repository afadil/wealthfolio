# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

### Development Commands

```bash
# Desktop app (Tauri)
pnpm tauri dev                    # Run desktop app in dev mode
pnpm tauri build                  # Build for production

# Web mode (Vite + Axum server)
pnpm run dev:web                  # Start both frontend and backend

# Frontend only
pnpm dev                          # Vite dev server at localhost:1420

# Backend server only
cargo run --manifest-path src-server/Cargo.toml
```

### Testing & Quality

```bash
pnpm test                         # Run vitest tests
pnpm test:watch                   # Watch mode
pnpm test:coverage                # With coverage
pnpm test:e2e                     # Playwright E2E tests

pnpm type-check                   # TypeScript check (all packages)
pnpm lint                         # ESLint (all packages)
pnpm format                       # Prettier format

# Rust
cargo check --manifest-path src-core/Cargo.toml
cargo test --manifest-path src-core/Cargo.toml
```

### Single Test

```bash
pnpm test -- path/to/file.test.ts           # Run specific test file
pnpm test -- -t "test name pattern"         # Run tests matching pattern
```

## Architecture Overview

This is a Tauri desktop app (React + Rust) with an optional web mode via Axum HTTP server.

```
src/                    # React frontend (Vite, TanStack Query, Tailwind v4)
  ├── commands/         # Frontend wrappers that call Tauri or Web APIs
  ├── pages/            # Route pages
  ├── components/       # React components
  ├── hooks/            # Custom hooks
  ├── lib/              # Utilities, types, schemas
  └── adapters/         # Runtime detection (desktop vs web)

src-core/               # Rust business logic (shared by desktop & server)
  ├── src/              # Services, repositories, models
  └── migrations/       # Diesel SQLite migrations

src-tauri/              # Tauri desktop app
  └── src/commands/     # IPC command handlers

src-server/             # Axum HTTP server (web mode)
  └── src/api.rs        # REST endpoints

packages/               # Monorepo packages
  ├── ui/               # @wealthfolio/ui - shared components
  ├── addon-sdk/        # TypeScript SDK for addons
  └── addon-dev-tools/  # CLI and dev server for addons
```

### Key Patterns

**Frontend command wrappers** (`src/commands/*.ts`): Support both desktop and web modes by switching on `RUN_ENV`. See `src/commands/portfolio.ts` for the pattern.

**Runtime adapter** (`src/adapters/index.ts`): Detects environment and provides `invokeTauri` or `invokeWeb` bridges.

**Tauri commands**: Add in `src-tauri/src/commands/*.rs`, register in `mod.rs`, expose in `main.rs`.

**Axum handlers**: Add in `src-server/src/api.rs`, call `src-core` services.

## Code Conventions

### TypeScript/React
- Functional components, no classes
- Prefer interfaces over types
- Use maps/unions instead of enums
- Named exports for components
- Directory names: lowercase-with-dashes

### Rust
- Use `Result`/`Option` with `?` propagation
- Define errors via `thiserror`
- Diesel ORM with SQLite
- Keep Tauri/Axum handlers thin, delegate to `src-core`

### Styling
- Tailwind v4 (CSS-first)
- Use `@wealthfolio/ui` components
- Theme tokens in `src/styles.css`

## Additional Context

See `AGENTS.md` for detailed architecture documentation, playbooks for common changes, and troubleshooting guidance.
