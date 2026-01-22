# Account Tracking Mode: Transactions vs Holdings

## Status

- Owner: Wealthfolio
- Stage: Draft (needs product decisions + API confirmation)
- Target surfaces: Desktop (Tauri) + Web (Axum) via shared `wealthfolio_connect` orchestrator

## Terminology

- `Tracking mode` is set per account: `Transactions (Performance)` or `Holdings (Snapshots)`.
- `Needs setup` means the account exists locally but `accounts.meta.wealthfolio.trackingMode = "NOT_SET"`.
- `Sync disabled` means Connect cloud `sync_enabled=false` for that broker account (local tracking mode may still be set).

## Problem

Wealthfolio Connect currently exposes a single “sync enabled” flag per broker account (cloud-side) and the local app performs a single kind of sync: it imports **transactions/activities** and then derives holdings snapshots + valuation history locally.

Users have two distinct needs:

1. **Performance tracking** (returns, cashflows, gains) → requires **transactions**.
2. **Value tracking** (net worth, allocation, snapshots) → can be satisfied by periodic **holdings snapshots** without full transaction history.

We need a clear, per-account choice that explains tradeoffs in plain language and drives the sync pipeline accordingly.

## Goals

- Let users choose, per account (manual or connected), how Wealthfolio should track it:
  - `Transactions` (performance tracking)
  - `Holdings` (snapshots / net worth tracking)
- Make the UX self-explanatory with high-quality copy and guardrails.
- Ensure the sync orchestrator respects the selected tracking mode and doesn’t fetch/store unnecessary data.
- Keep settings local-first and consistent across Desktop/Web (SQLite-backed).

## Non-goals

- Building a full reconciliation workflow (computed holdings vs broker holdings).
- Backfilling historical daily holdings from brokers beyond what the upstream API supports.
- Changing cloud-side “sync_enabled” (currently only manageable via the Connect portal).

## Current Code Reality (Baseline)

- Sync trigger:
  - Frontend calls `syncBrokerData()` → adapter invokes `sync_broker_data` (`src-front/adapters/shared/connect.ts`, `src-tauri/src/commands/brokers_sync.rs`, `src-server/src/api/connect.rs`).
- Sync engine:
  - `crates/connect/src/broker/orchestrator.rs` runs:
    1) list connections → sync platforms
    2) list accounts → filter `sync_enabled=true` → sync local accounts
    3) for local synced accounts → fetch activities → upsert activities → mark `brokers_sync_state`
- Local “sync state”:
  - `brokers_sync_state` tracks one sync state per `(account_id, provider)` and is currently activity/transactions oriented.
- UI:
  - Connect page lists broker accounts and shows a status dot based on presence of `sync_status` timestamps (`src-front/features/wealthfolio-connect/pages/connect-page.tsx`).

## Proposed UX

### Where the user sets this

**Connect → Accounts** list becomes the primary place:

- Each account row shows a “Tracking mode” chip:
  - `Transactions` / `Holdings` / `Needs setup`
- Clicking the row (or a “Settings” icon) opens an **Account tracking settings** sheet.

Secondary entry point (optional, later):

- `Settings → Accounts → <Account>` shows the same “Tracking mode” setting for any account (manual or connected).

### Account tracking settings sheet (recommended UX)

**Title:** “Tracking mode”

**Subtitle:** “Choose how Wealthfolio should track this account.”

**Controls:** single-choice “tracking mode” (radio / segmented control)

- **Transactions (performance)**
  - Helper: “Imports trades, deposits, dividends, fees, and other activity history.”
  - Unlocks: “Returns over time, gains, cashflow insights, full portfolio analytics.”
- **Holdings (snapshots)**
  - Helper: “Saves point-in-time positions and cash balances when you sync.”
  - Unlocks: “Net worth and allocation snapshots over time (without importing transactions).”

**Dynamic warnings (guardrails)**

- If `Holdings` is selected:
  - Warning title: “Performance will be limited”
  - Body: “Without transactions, Wealthfolio can’t show detailed performance and profit for this account. You’ll still see value and allocation snapshots.”

**Call to action**

- Primary: `Save`
- Secondary: `Cancel`
- Optional tertiary: `Sync now` (runs a sync using the updated settings)

### First-time experience (newly created connected account)

When a broker account is first discovered (remote account exists, but there is no matching local `Account` yet), the user must explicitly choose a tracking mode **before** we import any historical data for that account.

This solves the “accidental huge import” problem and makes the tradeoffs obvious at the moment they matter.

**Rule:**

- New accounts start as `Needs setup` (no tracking mode chosen) until the user selects a mode.
- The app should still create the local `Account` record (so the user can see/manage it), but it must not import transactions or holdings snapshots for that account until a mode is saved.

#### “New accounts found” decision flow (primary)

Trigger: broker sync detects one or more remote accounts that are not yet present locally.

Experience:

- Show a modal/sheet: `New accounts found`
- Subtitle: `Choose how to track each account. You can change this later.`
- List each new account with:
  - A single-choice `Tracking mode` selector: `Transactions` / `Holdings`
  - `Account name` (editable, prefilled from broker)
  - `Group` (optional, editable)
  - If Connect has `sync_enabled=false` for the account: show `Sync disabled` state + `Enable in Connect portal` CTA (no import can run until enabled)
  - Default pre-selection: none (explicit opt-in required)
- Bulk actions (top of list):
  - `Set all to Transactions`
  - `Set all to Holdings`
- Primary CTA: `Save and sync`
- Secondary CTA: `Not now`

Outcomes:

- `Save and sync` persists mode into `accounts.meta.wealthfolio.trackingMode`, then triggers a sync run immediately using the chosen modes.
- `Not now` leaves accounts in `Needs setup` and shows a persistent badge/banner on the Connect page until resolved.

#### Transactions import behavior

When the user selects `Transactions`, the app imports **all transaction history available from the Connect API**, using the current pagination/checkpoint behavior.

No “backfill” UX is required (the provider decides how much history is available).

**UI behavior on first appearance:**

- Show the account row with the chip `Needs setup` until the user selects a mode.
- Show a persistent (not one-time) banner at the top of the Accounts card while any new accounts are unresolved:
  - Title: `Action needed: choose a tracking mode`
  - Body: `We found new accounts. Pick how to track them before importing data.`
  - Action: `Review new accounts`

**If the cloud portal has sync disabled (`sync_enabled=false`):**

- The account row is still shown and the chip reads `Sync disabled`.
- Tracking mode can still be selected, but syncing is blocked until the user enables the account in the Connect portal.
- Disable `Sync now` and provide a CTA: `Enable in Connect portal` (opens the portal Accounts page).

#### How the UI learns about new accounts

When broker sync finishes, the frontend should always be informed if new accounts were discovered (even if the sync was started in the background). Keep this simple and deterministic—no trigger flags.

**Recommendation:** extend the existing `broker:sync-complete` payload to include a list of newly discovered accounts that require user configuration.

Important: this list must be based on *local accounts newly created from broker accounts* in the same sync run (i.e., accounts that now exist locally with `trackingMode="NOT_SET"`), so we don’t need the frontend to diff lists.

```ts
newAccounts?: Array<{
  provider: string;
  providerAccountId: string;
  localAccountId: string; // created locally, but trackingMode is NOT_SET / needs user decision
  remoteSyncEnabled: boolean; // Connect cloud sync_enabled gate
  institutionName?: string;
  defaultName?: string; // from broker account name
}>;
```

Frontend behavior:

- If `newAccounts?.length > 0`, always surface:
  - Toast: `New accounts found` with action `Review`
  - Persistent banner on Connect page until resolved
- The `Review` action opens the `New accounts found` sheet described above, where the user sets:
  - `Tracking mode`
  - `Account name`
  - `Group`

### Copy deck (strings)

Use these exact strings to keep the UI consistent:

- Chip labels:
  - `Transactions`
  - `Holdings`
  - `Needs setup`
  - `Sync disabled`
- Section title: `Tracking mode`
- Transactions label: `Transactions (performance)`
- Transactions helper: `Imports trades, deposits, dividends, fees, and other activity history.`
- Transactions benefits bullets:
  - `Returns over time (how your account grew)`
  - `Gains and cashflow analytics`
  - `Transaction history available from your broker`
- Holdings label: `Holdings (snapshots)`
- Holdings helper: `Saves point-in-time positions and cash balances when you sync.`
- Holdings benefits bullets:
  - `Net worth and allocation snapshots over time`
  - `Holdings history even without importing transactions`
  - `Faster “where am I today” tracking`
- Holdings-only warning title: `Performance will be limited`
- Holdings-only warning body: `Without transactions, Wealthfolio can’t show detailed performance and profit for this account. You’ll still see value and allocation snapshots.`
- Needs-setup chip tooltip: `Choose a tracking mode to start importing data.`
- Sync-disabled chip tooltip: `Sync is disabled in Connect. Enable it in the portal to import data.`

## Account Page UX (Limited History / Missing Snapshots)

The account history chart on `src-front/pages/account/account-page.tsx` is driven by **daily valuations** (`daily_account_valuation`). Daily valuations are computed from **daily holdings snapshots** (`holdings_snapshots`) during portfolio jobs.

Key implication:

- If an account has **no holdings snapshots**, valuation history will be empty and the history chart cannot render meaningful data.

### Expected UX states

1) **No valuations yet (valuation history empty)**

Show an explicit empty state instead of rendering `0` values:

- Title: `No history yet`
- Body (connected account):
  - `Sync this account to start building history.`
  - CTA: `Sync now`
- Body (manual account):
  - `Add your first transaction to start building history.`
  - CTAs: `Record transaction`, `Import CSV`

2) **History starts after the selected range**

When the user selects an interval that starts before the earliest valuation date:

- Show a small inline note: `History starts on {earliestDate}`
- Clamp the chart range to the available data (no “flatline to zero”).

3) **Holdings tracking mode (snapshots)**

For `trackingMode=HOLDINGS` accounts:

- Value/history is supported (from snapshots + quotes).
- Performance metrics that require transactions (e.g., returns adjusted for deposits/withdrawals, realized gains) should be hidden or shown as `—` with helper text:
  - `Some performance metrics require Transactions tracking.`
- If snapshots are sparse, display a disclosure near the chart:
  - `History is based on snapshots. Trades between snapshots aren’t captured.`

## Manual Accounts UX (Not Yet Tracked)

Manual accounts can exist before any data is added (no activities, no holdings snapshots).

Expected UX:

- Account page shows the holdings empty state (no chart) until the user adds a first transaction/import.
- Copy should match the existing empty state tone:
  - `Get started by adding your first transaction or importing from CSV.`
- If the user switches a manual account to `trackingMode=HOLDINGS`, the UI must either:
  - provide a way to create manual snapshots, or
  - prevent selecting HOLDINGS for manual accounts with helper text:
    - `Holdings tracking is currently available for connected accounts.`

## Data Model & Persistence

### Where to store preferences

Store per-account `trackingMode` in `accounts.meta` (already present and writable via `update_account`).

- Pros: no migration required; works in Desktop/Web; can be surfaced anywhere the Account object is available.
- Cons: requires careful JSON merging and a stable namespace to avoid clobbering broker metadata.

**Proposed JSON shape (namespaced):**

```json
{
  "wealthfolio": {
    "trackingMode": "TRANSACTIONS"
  }
}
```

Rules:

- Default when missing:
  - Existing accounts (already in the DB): keep current behavior by treating missing as `trackingMode="TRANSACTIONS"` (unless you choose to re-confirm)
  - New manual accounts: default `trackingMode="TRANSACTIONS"` (matches current manual activity entry)

To represent “Needs setup” for newly discovered connected accounts, explicitly set:

- `trackingMode="NOT_SET"`

Notes:

- This is intentionally **not** under `connect.*` so it can be used for manual accounts too.
- Connected accounts still respect the cloud portal gate `sync_enabled` in addition to `trackingMode`.
- `trackingMode="NOT_SET"` is intended for connected-account onboarding only; manual accounts should default to `TRANSACTIONS`.

### Migration (existing databases)

We need to preserve current behavior for existing installs: accounts should behave as “Transactions tracking” by default, unless a user explicitly changes it.

**Approach:** add a SQLite migration that sets a default `wealthfolio.trackingMode="TRANSACTIONS"` for any existing `accounts` row where it is missing.

- Proposed migration (name suggestion): `crates/storage-sqlite/migrations/<YYYY-MM-DD>-<id>_account_tracking_mode`
- Behavior:
  - If `accounts.meta` is NULL/empty/invalid JSON → replace with a minimal JSON object containing `wealthfolio.trackingMode`.
  - If `accounts.meta` is valid JSON but missing the key → `json_set` it without overwriting other fields.

Newly discovered connected accounts that require user configuration should be created with:

- `accounts.meta.wealthfolio.trackingMode = "NOT_SET"`

### Sync state tracking

We need separate state for each sync kind (transactions vs holdings):

- Transactions sync state (existing `brokers_sync_state`)
- Holdings sync state (new)

**Recommended (clean) approach:**

- Extend `brokers_sync_state` primary key to include a `sync_kind` discriminator:
  - `(account_id, provider, sync_kind)`
  - `sync_kind ∈ {"TRANSACTIONS","HOLDINGS"}`

This enables:

- independent `last_successful_at`
- independent errors (“transactions failed” while holdings succeeded)
- accurate status chips in UI

Alternative (acceptable but less ideal):

- Add a second table `brokers_holdings_sync_state` with the same columns.

## Backend / Sync Engine Spec

### Effective mode resolution

For each local account with a `providerAccountId` (remote broker account id):

- `remoteEnabled`: from cloud `BrokerAccount.sync_enabled`
- `trackingMode`: from `accounts.meta.wealthfolio.trackingMode`

Effective:

- If `!remoteEnabled` → skip all fetches (cloud sync disabled).
- Else:
  - `trackingMode=TRANSACTIONS` → run activities sync
  - `trackingMode=HOLDINGS` → run holdings snapshot sync
  - `trackingMode=NOT_SET` → skip all fetches and surface “Needs setup”

### Transactions history size

For `trackingMode=TRANSACTIONS`, import the full history available from the provider and keep subsequent runs incremental via checkpoints.

**If the user later switches away from Transactions:**

- Do not delete already-imported activities automatically.
- Simply stop fetching new ones (mode acts like a gate).
- Optional (later): an “Advanced” destructive action: `Delete imported broker transactions…` (with irreversible warning).

### Cloud API requirements (new)

Transactions are already supported via `BrokerApiClient::get_account_activities(...)`.

Holdings snapshots require a cloud endpoint + client plumbing, e.g.:

- `GET /accounts/{id}/holdings?asOf=YYYY-MM-DD` (or equivalent)
  - Returns positions, quantities, cash balances, and (optionally) cost basis + market values.

**New trait method (conceptual):**

```rust
async fn get_account_holdings(
  &self,
  account_id: &str,
  as_of: Option<&str>
) -> Result<BrokerHoldingsSnapshot>;
```

### Local storage requirements for holdings snapshots

Two viable options:

1) **Write into `holdings_snapshots`** as a keyframe for `snapshot_date=as_of` (recommended for UI reuse).
2) Store broker holdings snapshots in a separate table and teach `SnapshotService` to merge sources (more complex).

Recommendation:

- For `trackingMode=HOLDINGS` (connected accounts), write broker snapshots into `holdings_snapshots` as keyframes.
- For `trackingMode=TRANSACTIONS`, keep existing activity-derived snapshots as the source of truth.

### Critical: do not delete broker snapshots on “Rebuild Full History”

Current recalculation behavior deletes/replaces snapshots per account:

- `SnapshotRepository::overwrite_all_snapshots_for_account()` deletes **all** rows in `holdings_snapshots` for `account_id` before saving new ones (`crates/storage-sqlite/src/portfolio/snapshot/repository.rs`).
- The “Rebuild Full History” flow calls `SnapshotService::force_recalculate_holdings_snapshots(Some(ids))` for **all active accounts** (`src-tauri/src/listeners.rs`, `src-server/src/api/shared.rs`).

If we store broker-imported holdings snapshots in `holdings_snapshots`, a full recalculation would wipe them and they would not be recreated (because HOLDINGS-mode accounts intentionally have no transaction history).

**Recommended, minimal approach:**

- Treat `wealthfolio.trackingMode` as the “source-of-truth” discriminator.
- In portfolio job runners:
  - Build `account_ids_for_snapshot_calculation` by filtering out accounts where `trackingMode === "HOLDINGS" || trackingMode === "NOT_SET"`.
  - Implementation detail: `trackingMode` is stored inside `accounts.meta` as JSON; the job runner must parse `Account.meta` and read `$.wealthfolio.trackingMode`.
  - Continue running valuation history for **all** active accounts (including HOLDINGS-mode), since valuations read from existing snapshots.

This keeps broker snapshots intact without adding a new DB column.

If we later need true hybrid behavior (both sources in one account), introduce an explicit snapshot `source` column and selective deletion; avoid mixing sources without that.

### Import run tracking

Keep using `import_runs` with `run_type="SYNC"` but differentiate via `source_system`, e.g.:

- `CONNECT_TRANSACTIONS`
- `CONNECT_HOLDINGS`

This keeps “Recent Sync Activity” working with minimal UI change while still allowing filtering later.

### Orchestrator changes (high level)

Update `SyncOrchestrator` to:

1) Sync connections (unchanged)
2) Sync accounts (unchanged, still based on `remoteEnabled`)
3) For each synced local account:
   - If `trackingMode=TRANSACTIONS`: sync activities (existing logic)
   - If `trackingMode=HOLDINGS`: fetch holdings and persist a snapshot (new)
   - If `trackingMode=NOT_SET`: skip (user hasn’t chosen a mode yet)
4) Emit:
   - `broker:sync-start` unchanged
   - `sync-progress` payloads should include which kind is running
   - `broker:sync-complete` should summarize what ran (see next section)

### Sync completion payload (frontend toast + UI)

Current frontend toast logic expects `accountsSynced` and `activitiesSynced`.

Extend to include holdings summary:

```ts
holdingsSynced?: {
  accountsSynced: number;
  snapshotsUpserted: number;
  positionsUpserted: number;
};
```

Copy guidance for the toast:

- Title: `Broker Sync Complete`
- Description examples:
  - `124 activities · 3 holdings snapshots`
  - `Everything is up to date`

## Frontend Implementation Spec (UX + wiring)

## Impact: Settings → Accounts

The current accounts settings UI lives under:

- List page: `src-front/pages/settings/accounts/accounts-page.tsx`
- Edit modal/form: `src-front/pages/settings/accounts/components/account-edit-modal.tsx` and `src-front/pages/settings/accounts/components/account-form.tsx`
- Validation schema: `src-front/lib/schemas.ts` (`newAccountSchema`)

### What changes in the Settings UI

1) **Accounts list rows**

- Add a small “Tracking mode” pill/badge per account row:
  - `Transactions` or `Holdings`
  - If `trackingMode="NOT_SET"`: show `Needs setup`
  - If Connect cloud `sync_enabled=false`: show `Sync disabled` (even if a tracking mode is selected locally)

2) **Account edit modal**

- Add a new “Tracking mode” section to the form:
  - Options: `Transactions`, `Holdings`
  - Help text mirrors the Connect page copy (performance vs snapshots tradeoff).
- For connected accounts with `sync_enabled=false`, keep the control available but show an inline callout:
  - `Sync is disabled in Connect. Enable it in the portal to start importing data.`
- For manual accounts:
  - Recommendation: keep `Transactions` as the only selectable mode (disable `Holdings`) unless manual snapshot entry is implemented.
  - If disabled: helper text `Holdings tracking is currently available for connected accounts.`

3) **Name + group editing**

- Settings remains the “source of truth” for manual edits to:
  - `Account name`
  - `Group`
- The “New accounts found” prompt should reuse the same fields (name + group) so users don’t have to visit Settings immediately after discovery.

### Data + validation impact

- `trackingMode` persists in `accounts.meta.wealthfolio.trackingMode`.
- The settings form schema (`newAccountSchema`) must be extended (or separately merged) so updates can write `meta` without breaking existing validation.
- Existing behavior stays the default after migration: accounts effectively behave as `Transactions` tracking unless explicitly changed.

## Impact: Account Creation (Manual Accounts)

Manual account creation today happens via the Settings Accounts modal:

- `src-front/pages/settings/accounts/components/account-form.tsx`
- Validation: `src-front/lib/schemas.ts` (`newAccountSchema`)

### Required UX change

Add a `Tracking mode` field to manual account creation so users can choose how they want to track the account from day one:

- Options:
  - `Transactions (performance)`
  - `Holdings (snapshots)`
- Default: `Transactions` (preserves today’s behavior)

Behavior notes:

- Selecting `Holdings` for a manual account should only be allowed if we support a way to input holdings snapshots manually.
  - Fallback: allow selection but show a blocking helper: `Holdings tracking requires a connected account.`
  - Later: add “Add snapshot” flow for manual accounts (outside the scope of this spec).

### Persistence

On create/update, store:

- `accounts.meta.wealthfolio.trackingMode = "TRANSACTIONS" | "HOLDINGS"`

## Impact: Onboarding (“Two ways to track”)

The onboarding step already introduces the two tracking philosophies:

- `src-front/pages/onboarding/onboarding-step1.tsx`

### Required UX alignment

- Rename the onboarding cards to match product language:
  - “Simple Tracking” → `Holdings (Snapshots)`
  - “Complete Tracking” → `Transactions (Performance)`
- Ensure the descriptions match the capabilities in this spec:
  - Holdings mode: net worth/allocation snapshots; limited performance metrics without transactions
  - Transactions mode: performance analytics; trades update cash automatically

### Recommended onboarding copy (novice-friendly)

Avoid advanced finance jargon on onboarding. Keep copy short and scannable.

**Card 1 (Holdings)**

- Title: `Holdings (Snapshots)`
- Subtitle: `Track value and allocation — no transactions needed`
- Bullets:
  - `Net worth over time`
  - `Allocation snapshots`
  - `Fast to set up`
- Bottom note: `Limited performance details`

**Card 2 (Transactions)**

- Title: `Transactions (Performance)`
- Subtitle: `Track every trade and cashflow for full analytics`
- Bullets:
  - `Returns over time`
  - `Gains and cashflow`
  - `Most accurate`
- Bottom note: `Best with broker sync or CSV`

Footer line:

- `Use different modes for different accounts.`

### Optional improvement (recommended)

Add a CTA under each card that deep-links to the appropriate next step:

- Holdings: `Create a manual account` (preselect trackingMode=HOLDINGS in the account creation modal)
- Transactions: `Connect a broker` or `Create a manual account` (preselect trackingMode=TRANSACTIONS)

### UI components

- Update `src-front/features/wealthfolio-connect/pages/connect-page.tsx`:
  - Join broker accounts to local accounts by `providerAccountId === brokerAccount.id`.
  - Render “Tracking mode” chip per account from local meta.
  - Add an “Account tracking settings” sheet component.

### Mutations / persistence

Use existing account update plumbing:

- Adapter: `updateAccount` exists (`src-front/adapters/shared/accounts.ts`)
- UI: update account `meta` JSON string by merging into `wealthfolio.trackingMode`

Edge cases:

- If `meta` is invalid JSON, treat as `{}` and overwrite with the new namespaced object.
- Never delete existing account metadata—only merge under `wealthfolio.*`.

### Status aggregation

`useAggregatedSyncStatus` currently aggregates `BrokerSyncState[]` with one status per account.

After adding per-kind sync state, aggregate should consider:

- if any kind is `RUNNING` → `running`
- else if any kind is `NEEDS_REVIEW` → `needs_review`
- else if any kind is `FAILED` → `failed`
- else `idle`

### Information architecture updates

On Connect page, adjust the header subtitle from:

- `Sync broker accounts into your local database`

to:

- `Choose what to sync for each account, then keep your data up to date.`

## Edge Cases & Guardrails

- **Holdings-only account with no market quotes**: holdings snapshot exists, but valuation charts may be incomplete. UI should still show positions/quantities and indicate “prices missing”.
- **Transactions-only account**: keep today’s behavior (snapshots derived from transactions).
- **Switching from holdings-only → transactions**:
  - On next sync, create activities; snapshots will start being derived from transactions for future dates.
  - Expectation: once the account is treated as Transactions-tracked, a full recalculation may overwrite existing broker snapshots for that account.
- **Switching from transactions → holdings-only**:
  - Stop importing new activities; keep existing activity history.
  - Holdings snapshots continue at each sync; portfolio history remains continuous.

### Switching tracking mode (data behavior)

Tracking mode changes should avoid surprising data loss, but we also need to keep the snapshot system consistent:

- Switching `HOLDINGS` → `TRANSACTIONS`:
  - Broker snapshots remain in the DB until the next portfolio snapshot rebuild for that account.
  - When that rebuild runs, it may delete/overwrite existing snapshots for the account (current snapshot repository semantics).
  - This is acceptable if we communicate: “Transactions mode rebuilds history from transactions.”
- Switching `TRANSACTIONS` → `HOLDINGS`:
  - Existing imported activities and calculated history remain; the mode change affects *future imports*.
  - If you later want strict separation, add snapshot `source` metadata and selective deletion.

### Risks (implementation)

- **New account detection drift**: if the backend cannot reliably emit `newAccounts[]`, the frontend will miss the prompt. Mitigation: derive `newAccounts[]` from the set of *accounts created during sync* where `trackingMode="NOT_SET"`.
- **Snapshot wipe on rebuild**: if portfolio job runners don’t filter out `trackingMode=HOLDINGS/NOT_SET`, “Rebuild Full History” can wipe broker snapshots. Mitigation: enforce filtering in both Tauri and Web job runners.
- **Manual HOLDINGS ambiguity**: allowing HOLDINGS for manual accounts without a snapshot entry mechanism creates “empty history forever”. Mitigation: disable HOLDINGS for manual accounts until a snapshot entry/import flow exists, or implement that flow.
- **Cloud disabled confusion**: `sync_enabled=false` looks similar to “Needs setup”. Mitigation: distinct chip label (`Sync disabled`) and CTA to Connect portal.

## Acceptance Criteria

- Per connected account, user can set `Transactions` or `Holdings` from the Connect page.
- Per manual account, user can set a `Tracking mode` from `Settings → Accounts`.
- Settings persist across app restarts and apply in both Desktop and Web builds.
- Broker sync respects settings:
  - No activity/transaction fetch unless `trackingMode=TRANSACTIONS`.
  - No holdings fetch/snapshot write unless `trackingMode=HOLDINGS`.
- Connect UI clearly communicates tradeoffs (holdings-only warning).
- Sync completion feedback (toast + recent activity) reflects what actually ran.

## Open Questions (needs your answers)

1. Holdings source: should holdings snapshots use **broker-reported market values** (preferred if available) or rely on Wealthfolio’s **quote sync** for valuation?
2. Do you want holdings snapshots to be written into existing `holdings_snapshots` (reusing charts/UI), or stored separately with a later merge?
3. Default mode for already-synced installs (existing users): keep current behavior by defaulting to `TRANSACTIONS`, or require re-confirmation?
4. When Connect sync is disabled in the portal, should the account hide from portfolio totals, or remain visible (but stale)?
5. Manual accounts: do we support `trackingMode=HOLDINGS` (manual snapshot entry/import), or should Settings/creation disable it until that exists?
6. Is the mode preference per-device or should it sync across devices (if device sync is enabled)?
