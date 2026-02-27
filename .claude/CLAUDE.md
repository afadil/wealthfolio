# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Wealthfolio - local-first desktop investment tracker. React + Vite frontend, Tauri/Rust backend, SQLite storage. Also runs as a web app (Axum HTTP server).

Key directories:

- `apps/frontend/` — React app (pages, components, features, commands, hooks, adapters, addons)
- `apps/tauri/` — Tauri desktop/mobile app (IPC commands)
- `apps/server/` — Axum HTTP server (web mode)
- `crates/` — Rust crates (core logic, storage, market-data, connect, device-sync, ai)
- `packages/` — Shared TS packages (addon-sdk, ui, addon-dev-tools)
- `addons/` — Distributable addon plugins

## Commands

| Task | Command |
|------|---------|
| Desktop dev | `pnpm tauri dev` |
| Web dev | `pnpm run dev:web` |
| Frontend only | `pnpm dev` |
| Addon dev mode | `VITE_ENABLE_ADDON_DEV_MODE=true pnpm tauri dev` |
| TS tests | `pnpm test` |
| TS tests (watch) | `pnpm test:watch` |
| Rust tests | `cargo test` |
| Type check | `pnpm type-check` |
| Lint | `pnpm lint` |
| All checks | `pnpm check` |
| Rust compile check | `cargo check` |
| Production build | `pnpm tauri build` |

Run a single Vitest test file: `pnpm --filter frontend test -- path/to/file.test.ts`

## Architecture Data Flow

```
Frontend → @/adapters (build-time resolved) → Tauri IPC | Axum HTTP
                                                    ↓
                                           crates/core (business logic)
                                                    ↓
                                           crates/storage-sqlite (Diesel ORM)
```

### Adapter System (critical pattern)

`@/adapters` resolves at build time via Vite alias to either `adapters/tauri/` or `adapters/web/` based on `BUILD_TARGET` env var. Both expose the same typed interface. TypeScript uses `adapters/index.ts` (re-exports Tauri) for type-checking.

**Adding a new command:**
1. `adapters/tauri/index.ts` — add `tauriInvoke<T>("command_name", args)`
2. `adapters/web/index.ts` — add to `COMMANDS` map + matching typed function
3. `apps/tauri/src/commands/*.rs` — add Tauri command, wire in `mod.rs` + `lib.rs`
4. `apps/server/src/api/` — add Axum handler calling `crates/core` service
5. `crates/core/` — add business logic
6. Service wrapper in `apps/frontend/src/commands/<domain>.ts` wrapping adapter with error handling

### Full Feature Playbook

1. Frontend route/UI → `apps/frontend/src/pages/`, `apps/frontend/src/routes.tsx`
2. Command wrapper → `apps/frontend/src/commands/<domain>.ts`
3. Tauri command → `apps/tauri/src/commands/*.rs`
4. Web endpoint → `apps/server/src/api/`
5. Core logic → `crates/core/`

## Key Patterns

### UI

- Components from `@wealthfolio/ui` and `packages/ui/src/components/`
- Forms: `react-hook-form` + `zod` schemas in `apps/frontend/src/lib/schemas.ts`
- Theme tokens: `apps/frontend/src/globals.css`
- State/data: React Query

### TypeScript Conventions

- Strict mode, no unused locals/params
- Prefer interfaces over types, avoid enums
- Functional components, named exports
- Directory names: lowercase-with-dashes

### Rust Conventions

- `Result`/`Option`, propagate with `?`, `thiserror` for domain errors
- Keep Tauri/Axum commands thin — delegate to `crates/core`
- DB migrations: `crates/storage-sqlite/migrations`

### Activity Types

14 canonical types: `BUY`, `SELL`, `SPLIT`, `DEPOSIT`, `WITHDRAWAL`, `TRANSFER_IN`, `TRANSFER_OUT`, `DIVIDEND`, `INTEREST`, `CREDIT`, `FEE`, `TAX`, `ADJUSTMENT`, `UNKNOWN`. Full reference in `docs/activities/activity-types.md`.

### AI Assistant

`crates/ai` — streaming LLM with tool calling via `rig-core`. Uses `AiEnvironment` trait for DI (Tauri vs Axum), non-blocking write-behind persistence, LRU thread cache. See `docs/architecture/ai-assistant-architecture.md`.

## Web Mode Config

Key env vars (`.env.web`): `WF_DB_PATH`, `WF_SECRET_KEY` (required, 32-byte), `WF_LISTEN_ADDR`, `WF_CORS_ALLOW_ORIGINS`, `WF_AUTH_PASSWORD_HASH` (Argon2id for password auth).

## Plan Mode

- Make the plan extremely concise. Sacrifice grammar for brevity.
- End with unresolved questions, if any.

---

## Behavioral Guidelines

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.

### 2. Simplicity First

- No features beyond what was asked.
- No abstractions for single-use code.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

### 3. Surgical Changes

- Don't improve adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated issues, mention them — don't fix them.
- Remove only what YOUR changes made unused.

### 4. Goal-Driven Execution

- Transform tasks into verifiable goals.
- For multi-step tasks, state a brief plan with verification steps.
- Unverified work is incomplete work.

## Validation Checklist

Before completing any task:

- [ ] Builds: `pnpm build` or `cargo check`
- [ ] Tests pass: `pnpm test` and/or `cargo test`
- [ ] Both desktop and web compile if touching shared code
- [ ] Changes are minimal and surgical

---

When in doubt, follow the nearest existing pattern.
