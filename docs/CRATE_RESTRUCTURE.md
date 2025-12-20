# Crate Restructure Plan

## Target Structure

```
wealthfolio/
│
├── Cargo.toml                      # Workspace root (NEW)
│
├── src-front/                      # React frontend (renamed from src/)
├── src-tauri/                      # Tauri app (desktop + mobile)
├── src-server/                     # Axum API server
│
├── crates/
│   ├── core/                       # Domain logic (moved from src-core/)
│   │   ├── src/
│   │   │   ├── accounts/
│   │   │   ├── activities/
│   │   │   ├── assets/
│   │   │   ├── portfolio/
│   │   │   ├── goals/
│   │   │   ├── limits/
│   │   │   ├── fx/
│   │   │   ├── market_data/
│   │   │   ├── settings/
│   │   │   ├── db/
│   │   │   └── lib.rs
│   │   └── Cargo.toml
│   │
│   └── connect/                    # Wealthfolio Connect (extracted from src-core/src/sync/)
│       ├── src/
│       │   ├── broker/             # Cloud broker sync
│       │   │   ├── client.rs       # API client (move from src-tauri/commands/brokers_sync.rs)
│       │   │   ├── models.rs       # (from sync/broker_models.rs)
│       │   │   ├── service.rs      # (from sync/sync_service.rs)
│       │   │   └── traits.rs       # (from sync/sync_traits.rs)
│       │   ├── state/              # Sync state tracking
│       │   │   └── repository.rs   # (from sync/brokers_sync_state_repository.rs)
│       │   ├── platform/
│       │   │   └── repository.rs   # (from sync/platform_repository.rs)
│       │   └── lib.rs
│       └── Cargo.toml
│
├── packages/                       # npm packages (unchanged)
├── addons/                         # Built-in addons (unchanged)
│
├── dist/                           # Vite build output (gitignored)
├── package.json
└── pnpm-workspace.yaml
```

---

## Implementation Steps

### Phase 1: Create Workspace

```bash
# 1. Create crates directory
mkdir -p crates

# 2. Move src-core to crates/core
mv src-core crates/core
```

### Phase 2: Create Root Cargo.toml

Create `Cargo.toml` at project root:

```toml
[workspace]
resolver = "2"
members = [
    "src-tauri",
    "src-server",
    "crates/*",
]

[workspace.package]
version = "2.1.0"
edition = "2021"
license = "AGPL-3.0"

[workspace.dependencies]
# Shared versions
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
diesel = { version = "2.2", features = ["sqlite", "chrono", "r2d2", "numeric", "returning_clauses_for_sqlite_3_35"] }
diesel_migrations = { version = "2.2", features = ["sqlite"] }
chrono = { version = "0.4", features = ["serde"] }
reqwest = { version = "0.12", features = ["json"] }
thiserror = "1"
anyhow = "1"
uuid = { version = "1", features = ["v4", "serde"] }
rust_decimal = { version = "1.39", features = ["maths", "serde-float"] }
async-trait = "0.1"
log = "0.4"

# Internal crates
wealthfolio-core = { path = "crates/core" }
wealthfolio-connect = { path = "crates/connect" }
```

### Phase 3: Extract Connect Crate

```bash
# 1. Create connect crate structure
mkdir -p crates/connect/src/broker
mkdir -p crates/connect/src/state
mkdir -p crates/connect/src/platform

# 2. Move sync files to connect
mv crates/core/src/sync/broker_models.rs crates/connect/src/broker/models.rs
mv crates/core/src/sync/sync_service.rs crates/connect/src/broker/service.rs
mv crates/core/src/sync/sync_traits.rs crates/connect/src/broker/traits.rs
mv crates/core/src/sync/brokers_sync_state_repository.rs crates/connect/src/state/repository.rs
mv crates/core/src/sync/platform_repository.rs crates/connect/src/platform/repository.rs

# 3. Remove old sync directory
rm -rf crates/core/src/sync
```

Create `crates/connect/Cargo.toml`:

```toml
[package]
name = "wealthfolio-connect"
version.workspace = true
edition.workspace = true

[dependencies]
wealthfolio-core = { workspace = true }
reqwest = { workspace = true, features = ["json", "cookies"] }
tokio = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
chrono = { workspace = true }
thiserror = { workspace = true }
async-trait = { workspace = true }
uuid = { workspace = true }
rust_decimal = { workspace = true }
log = { workspace = true }

[features]
default = ["broker"]
broker = []           # Cloud broker sync
device = []           # P2P sync (future)
```

Create `crates/connect/src/lib.rs`:

```rust
pub mod broker;
pub mod state;
pub mod platform;

pub use broker::*;
pub use state::*;
pub use platform::*;
```

Create `crates/connect/src/broker/mod.rs`:

```rust
mod models;
mod service;
mod traits;

pub use models::*;
pub use service::*;
pub use traits::*;
```

### Phase 4: Update crates/core

Update `crates/core/Cargo.toml`:

```toml
[package]
name = "wealthfolio-core"
version.workspace = true
edition.workspace = true

[dependencies]
tokio = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
diesel = { workspace = true }
diesel_migrations = { workspace = true }
chrono = { workspace = true }
thiserror = { workspace = true }
anyhow = { workspace = true }
uuid = { workspace = true }
rust_decimal = { workspace = true }
async-trait = { workspace = true }
log = { workspace = true }
# ... other deps from current Cargo.toml
```

Update `crates/core/src/lib.rs` - remove sync module export.

### Phase 5: Update src-tauri/Cargo.toml

```toml
[dependencies]
wealthfolio-core = { workspace = true }
wealthfolio-connect = { workspace = true }
# Change path:
# OLD: wealthfolio_core = { path = "../src-core" }
# NEW: use workspace = true
```

### Phase 6: Update src-server/Cargo.toml

```toml
[dependencies]
wealthfolio-core = { workspace = true }
wealthfolio-connect = { workspace = true }
# Change path:
# OLD: wealthfolio_core = { path = "../src-core", package = "wealthfolio_core" }
# NEW: use workspace = true
```

### Phase 7: Rename Frontend Directory

```bash
mv src src-front
```

Update `vite.config.ts`:

```ts
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src-front"),  // was: ./src
  },
},
```

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["src-front/*"]
    }
  },
  "include": ["src-front"]
}
```

Update `index.html`:

```html
<script type="module" src="/src-front/main.tsx"></script>
<!-- was: /src/main.tsx -->
```

### Phase 8: Update Import Paths

In `src-tauri/src/commands/brokers_sync.rs` and other files:

```rust
// OLD
use wealthfolio_core::sync::*;

// NEW
use wealthfolio_connect::*;
```

In `src-server/src/sync.rs`:

```rust
// OLD
use wealthfolio_core::sync::*;

// NEW
use wealthfolio_connect::*;
```

### Phase 9: Verify

```bash
# Build workspace
cargo build --workspace

# Run tests
cargo test --workspace

# Build frontend
pnpm build

# Run Tauri dev
pnpm tauri dev
```

---

## File Mapping Reference

| Old Location | New Location |
|--------------|--------------|
| `src-core/` | `crates/core/` |
| `src-core/src/sync/` | `crates/connect/src/` |
| `src-core/src/sync/broker_models.rs` | `crates/connect/src/broker/models.rs` |
| `src-core/src/sync/sync_service.rs` | `crates/connect/src/broker/service.rs` |
| `src-core/src/sync/sync_traits.rs` | `crates/connect/src/broker/traits.rs` |
| `src-core/src/sync/brokers_sync_state_repository.rs` | `crates/connect/src/state/repository.rs` |
| `src-core/src/sync/platform_repository.rs` | `crates/connect/src/platform/repository.rs` |
| `src/` | `src-front/` |

---

## Dependency Graph

```
                        ┌─────────────────┐
                        │   src-tauri     │
                        │(desktop+mobile) │
                        └────────┬────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
      ┌─────────────┐                       ┌─────────────┐
      │   connect   │                       │ src-server  │
      └──────┬──────┘                       └──────┬──────┘
             │                                     │
             └──────────────────┬──────────────────┘
                                │
                                ▼
                        ┌─────────────┐
                        │    core     │
                        └─────────────┘
```

---

## Notes

- **Tauri structure unchanged**: `src-tauri/` stays as-is, only dependency paths change
- **Crate naming**: Uses `wealthfolio-connect` (hyphen) in Cargo, import as `wealthfolio_connect` (underscore)
- **Workspace benefits**: Single `cargo build`, shared dep versions, unified clippy/fmt
- **Future crates**: Can add `crates/addons/`, `crates/ai/`, etc. following same pattern
