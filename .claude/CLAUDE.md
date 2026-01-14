## Project Overview

Wealthfolio - Desktop investment tracker with local-first data. React + Vite
frontend, Tauri/Rust backend, SQLite storage.

Key directories:

- `src-front/` — React app (pages, components, commands, hooks)
- `crates/` — Rust crates (core logic, storage, market-data, connect, device-sync)
- `src-tauri/` — Tauri desktop app (IPC commands)
- `src-server/` — Axum HTTP server (web mode)
- `packages/` — Shared TS packages (addon-sdk, ui, addon-dev-tools)

## Quick Commands

- Dev desktop: `pnpm tauri dev`
- Dev web: `pnpm run dev:web`
- Tests: `pnpm test` | `cargo test`
- Type check: `pnpm type-check`
- Lint: `pnpm lint`

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for the sake of concision.
- At the end of each plan, give me a list of unresolved questions to answer, if
  any.
