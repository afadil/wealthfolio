# AGENTS.md

This guide equips AI coding agents (and humans) to work effectively in this
repository. It summarizes architecture, key entry points, run targets, code
conventions, and an actionable playbook for common changes. Prefer surgical
edits, clear reasoning, and validation via the existing scripts and tests.

## Overview

- React + Vite frontend with Tailwind v4 and shadcn-based UI components.
- Desktop app via Tauri (Rust) with local SQLite storage; optional web mode
  served by an Axum HTTP server.
- Strong addon system powered by a TypeScript SDK enabling dynamic sidebar
  routes, UI, permissions, and secure secrets.
- Monorepo-style packages: shared UI (`@wealthfolio/ui`), addon SDK, and addon
  dev tools.

References:

- `README.md`:1 — Project intro, features, dev, and Docker.
- `src/App.tsx`:1 — App providers and QueryClient wiring.
- `src/routes.tsx`:1 — Route map and dynamic addon routes.
- `src/styles.css`:1 — Tailwind v4 CSS-first setup and theme tokens.
- `src/adapters/index.ts`:1 — Runtime env (desktop/web) and invoke bridges.
- `src/commands/portfolio.ts`:1 — Example web/Tauri command wrappers.
- `src-server/src/main.rs`:1 — Axum server entrypoint.
- `src-tauri/src/main.rs`:1 — Tauri desktop entrypoint.
- `packages/ui/src/index.ts`:1 — Shared UI exports.

## Run Targets

- Desktop dev: `pnpm tauri dev`
- Desktop build: `pnpm tauri build`
- Web dev (Vite + Axum): `pnpm run dev:web`
  - Optional override env: copy `.env.web.example` to `.env.web` (see
    `README.md`:1)
- Server only (HTTP API + static):
  `cargo run --manifest-path src-server/Cargo.toml`
- Tests (frontend/unit): `pnpm test` | `pnpm test:watch` | `pnpm test:coverage`

## Code Layout

- Frontend app: `src/`
  - Pages: `src/pages/...`
  - Components: `src/components/...`
  - Hooks: `src/hooks/...`
  - Core types/helpers: `src/lib/...`
  - Commands (frontend bridges): `src/commands/...` (call into Tauri or Web
    server based on runtime)
  - Addons runtime: `src/addons/...`
- Desktop (Tauri): `src-tauri/` (Rust commands, events, capabilities)
- Core business logic (Rust): `src-core/` (models, services, repositories,
  migrations)
- HTTP Server (web mode): `src-server/`
- Packages: `packages/`
  - `addon-sdk` — TypeScript SDK for addons
  - `addon-dev-tools` — CLI and dev server for addons
  - `ui` — Shared UI lib (`@wealthfolio/ui`)

## Architecture Notes

- Runtime detection is centralized and selects between Tauri and Web adapters.
  - `src/adapters/index.ts`:1 — `getRunEnv`, `invokeTauri`, `invokeWeb`.
- Frontend command wrappers must support both desktop and web:
  - See `src/commands/portfolio.ts`:1 for a complete pattern (switch on
    `RUN_ENV`, unified signatures, logging, error handling).
- Web mode server routes (Axum) live in `src-server/src/api.rs` and wire to core
  services in `src-core`.
- Tauri commands live under `src-tauri/src/commands/*` and call into `src-core`
  services.
- Addons:
  - Runtime host bridge: `src/addons/addons-runtime-context.ts`:1
  - SDK: `packages/addon-sdk/src/*`
  - Dev tools: `packages/addon-dev-tools/*` (hot reload server, scaffolding)

## Styling & UI

- Use Tailwind v4 (CSS-first) and shared components from `@wealthfolio/ui`.
- Prefer composition via `packages/ui/src/components/ui/*` and
  `packages/ui/src/components/common/*`.
- Theme tokens are declared in `src/styles.css`:1 (light/dark, semantic colors,
  charts, sidebar).
- Avoid ad-hoc global CSS; local, component-level styling should rely on
  Tailwind utilities.

## Data & Security

- All user data is local (SQLite). No cloud dependencies.
- API keys and secrets use OS keyring via core services; never write secrets to
  disk.
  - Frontend: use secrets commands through adapters.
  - Addons: `ctx.api.secrets` provides scoped storage per addon.
- Permission model for addons is enforced; request only minimal capabilities.

## Development Conventions

- TypeScript: strict mode, no unused locals/params (`tsconfig.json`:1).
- Keep changes minimal, focused, and consistent with surrounding style.
- Don’t introduce unrelated refactors; avoid renames unless required by the
  task.
- Prefer existing helpers and patterns; follow command wrapper conventions.
- Error handling: log concisely, surface actionable messages to UI when needed.

## Validation Checklist

- Build the target you’re modifying:
  - Frontend only: `pnpm build`
  - Desktop: `pnpm tauri dev`
  - Web mode: `pnpm run dev:web`
- Run tests locally where applicable: `pnpm test`
- Lint/format if touched areas use them (keep changes consistent; don’t add new
  toolchains).
- For server changes, run `cargo run --manifest-path src-server/Cargo.toml` and
  verify endpoints.
- For Tauri commands, verify desktop flows compile and run.

## Agent Playbook

When adding a new user-visible feature that needs backend data:

1. Frontend route and UI

- Add page under `src/pages/...` and route in `src/routes.tsx`:1.
- Build UI with components from `@wealthfolio/ui` and Tailwind.

2. Frontend command wrapper

- Add a function in `src/commands/<domain>.ts` following the `RUN_ENV` switch
  pattern (see `src/commands/portfolio.ts`:1).

3. Desktop backend (if needed)

- Add Tauri command under `src-tauri/src/commands/*.rs` and wire it in
  `src-tauri/src/commands/mod.rs`.
- Expose the command in `src-tauri/src/main.rs`:1.

4. Web server endpoint (if needed)

- Add a handler in `src-server/src/api.rs` and route in its router.
- Call into the appropriate `src-core` service.

5. Core logic (shared)

- Implement or update services/repos in `src-core/` as needed; add migrations if
  schema changes.
- Keep business rules and calculations in core, not UI layers.

6. Tests

- Add/extend vitest tests near changed TS modules (e.g., `src/lib/*.test.ts`).
- For Rust, add tests under the relevant crate when practical.

Common UI tasks:

- Tables/charts: reuse components under `packages/ui/src/components/ui/*` and
  `packages/ui/src/components/common/*`.
- Forms: use `react-hook-form` and validators via `zod` types from
  `src/lib/schemas.ts`:1 when possible.

## Useful Commands (Agent Discovery)

- List files quickly: `rg --files`
- Search text: `rg "keyword"`
- Inspect scripts: `cat package.json`
- Frontend dev server: `pnpm dev`
- Web mode combo: `pnpm run dev:web`
- Desktop dev: `pnpm tauri dev`
- Tests: `pnpm test` or `pnpm test:watch`

## Addon Development (Quickstart)

- Scaffold: `npx @wealthfolio/addon-dev-tools create <my-addon>`
- Start addon dev server: `npm run dev:server` (from addon dir)
- Run Wealthfolio (desktop) with addon dev mode:
  `VITE_ENABLE_ADDON_DEV_MODE=true pnpm tauri dev`
- Add routes and sidebar via the addon context
  (`src/addons/addons-runtime-context.ts`:1)
- Use `ctx.api.*` for data, events, and query cache integration (see docs below)

Docs entry points:

- `docs/addons/index.md`:1 — Addon docs hub
- `docs/addons/addon-api-reference.md`:1 — API surface and examples
- `docs/addons/addon-architecture.md`:1 — Design and patterns
- `docs/activities/activity-types.md`:1 — Activity schemas for import/creation

## Frontend Rules (Cursor)

- Scope: applies to `src/**`, `.tsx`, `.ts` files; complements repo conventions.
- Tech stack: Node.js, React, Vite, TanStack Query, Tailwind CSS; routing in
  this repo uses React Router (not TanStack Router).
- General principles: write concise, technical TypeScript; avoid duplication;
  prefer functional/declarative patterns; avoid classes; use descriptive names
  like `isLoading`/`hasError`.
- File structure order: exported component → subcomponents → helpers → static
  content → types.
- Naming: use lowercase-with-dashes for directories (e.g.,
  `components/auth-wizard`); favor named exports.
- TypeScript: use TS everywhere; prefer interfaces over types; avoid enums (use
  maps/union types); use functional components with interface props.
- Syntax: use `function` for pure functions; always use curly braces for
  conditionals; favor simple, declarative JSX.
- UI/styling: use Tailwind utilities; reuse `@wealthfolio/ui` components where
  possible.
- Performance: immutable data; efficient data fetching with React Query;
  minimize network calls; choose efficient data structures; optimize rendering
  (memoize, derive state, virtualize when needed).
- Source: `.cursor/rules/frontend-rules.mdc` (treat as living rules; keep this
  section concise and defer to the source for updates).

## PR & Review Tips

- Include a brief summary of the change, affected areas, and test steps.
- Note any migrations or data shape changes.
- Keep diffs small and cohesive; split unrelated changes.
- Ensure both desktop and web modes compile when you touch shared layers.

## Security & Privacy

- Never log secrets or personal financial data.
- Use secrets APIs; do not persist tokens in files or localStorage.
- Validate all input and handle errors gracefully.

## Troubleshooting

- Vite runs at `http://localhost:1420` in web mode and proxies API to the
  server.
- The server logs the effective database path on startup; ensure write
  permissions.
- For web mode, verify CORS and env (`.env.web`) if API calls fail.
- If an adapter call fails, confirm the matching server/Tauri command and
  parameter names.

---

This document is intended to make AI agents productive, consistent, and safe in
this codebase. When in doubt, follow the nearest existing pattern and validate
via the provided scripts.

## Backend Rules (Rust)

- Scope: Rust code in `src-tauri/**`, `src-core/**`, and `src-server/**` (Axum).
  Source of truth: `.cursor/rules/rust-rules.mdc`.
- Principles: write clear, idiomatic Rust; do only the requested task; prefer
  modularity and small, focused functions; expressive names (`is_ready`,
  `has_data`).
- Async: embrace `async`/`.await` where appropriate; avoid blocking; use safe
  await points.
- Error handling: use `Result`/`Option`; propagate with `?`; define domain
  errors via `thiserror`; handle edge cases early; return errors rather than
  panicking.
- Concurrency & performance: respect ownership/borrowing; avoid unnecessary
  clones; prefer references and slices; be mindful of locking granularity.
- Organization: separate concerns (network/api in `src-server`, desktop IPC in
  `src-tauri`, business logic in `src-core` services/repos). Keep commands
  thin—delegate to `src-core`.
- Database: Diesel + SQLite; keep migrations in `src-core/migrations`; server
  embeds and applies them automatically on startup.
- Tauri: add new commands under `src-tauri/src/commands/*.rs`, register in
  `mod.rs` and expose via `main.rs`. Keep IPC structs serde-friendly.
- Axum server: add handlers in `src-server/src/api.rs`, convert to DTOs as
  needed, and call `src-core` services. Validate/parse query/body (e.g., dates).
- Testing: use `tokio::test` for async; prefer unit tests on services in
  `src-core`; add integration tests in `src-server/tests` when touching HTTP.
  Use fakes/mocks for external deps.
- Docs & cleanup: add Rustdoc where it clarifies intent; remove dead code during
  refactors.
