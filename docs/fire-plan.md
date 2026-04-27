# Retirement Simulator V1 Refactor: Explicit Shares, Static Goal Reservations

## Summary

- Ship this as one atomic refactor on the unreleased branch. No compat window,
  no dual-write, no alias fields, no table rename.
- Replace the current `reservation_percent` / `countable_percent` /
  `funding_role` model with one absolute `share_percent` per `(goal, account)`.
- Lock the product behavior for v1:
  - non-retirement shares are **static while the goal is participating**
  - there is **no auto-expiry at target date**
  - there is **no auto-release into retirement**
  - there is **no auto-expansion of retirement to fill freed capacity**
- Retirement goals auto-seed explicit `100%` shares for eligible accounts at
  goal creation.
- Keep `planner_mode` (`fire` / `traditional`) and keep Monte Carlo output shape
  unchanged in this refactor.

## Contract And Data Model Changes

- Update the unreleased goals/retirement migration chain in place so
  `goals_allocation` becomes the canonical share table with:
  - `id`
  - `goal_id`
  - `account_id`
  - `share_percent REAL NOT NULL`
  - `tax_bucket TEXT NULL`
  - `created_at`
  - `updated_at`
- Drop from schema and code:
  - `percent_allocation`
  - `funding_role`
  - `reservation_percent`
  - `countable_percent`
- Keep the existing table name `goals_allocation`.
  - Do not rename it because sync/schema code already keys on that name.
- Keep the unique `(goal_id, account_id)` index.
- Update backend and frontend funding types to one unified shape:
  - `GoalFundingRule { id, goalId, accountId, sharePercent, taxBucket?, createdAt, updatedAt }`
  - `GoalFundingRuleInput { accountId, sharePercent, taxBucket? }`
- Keep `taxBucket` only as a retirement concern.
  - Persist it on the row.
  - UI only exposes it for retirement goals.
  - Non-retirement saves clear it to `null`.
- Keep `GoalPlan`, `SaveGoalPlan`, and `PlannerMode` as-is.
- Change `GoalService::new(...)` so the core service has access to
  `AccountServiceTrait`.
  - This is required for retirement-goal auto-seeding in both Tauri and web.
- Add one repository transaction path for “insert goal + optional initial
  funding rows” so retirement goal creation is atomic.
  - Do not seed in API handlers.

## Core Behavior And Refactor

- Replace the residual/countable math in goal and retirement preparation with
  absolute shares:
  - `goal_value = account_value * share_percent / 100`
  - `retirement_portfolio = sum(retirement shares only)`
- Remove all “subtract other reservations first, then apply countable percent”
  behavior.
- Introduce one core helper for “participating funding rules”.
  - Participating goal status in v1: `active`
  - Non-participating: `achieved`, `archived`
  - Result: achieved/archived non-retirement goals release their reserved shares
    automatically by lifecycle, not by date.
- Retirement input preparation should become a pure share-based builder:
  - current retirement portfolio from retirement shares only
  - tax-bucket balances from the same retirement shares only
  - planner mode from stored plan
  - retirement plan JSON from stored plan
- Keep a share-based current-value helper that works even when no retirement
  plan exists.
  - `refresh_goal_summary` for a retirement goal without a saved plan should
    still compute current value from shares.
  - In that case, target/projection fields remain unset until the plan exists.
- Remove the tax mutation bug.
  - Do not write any blended rate back into `tax.taxableWithdrawalRate`.
  - Bucket rates remain authoritative engine inputs.
  - If a blended rate is still needed for display, compute it separately and
    never store it into the plan fed to the engine.
- Keep `RetirementTimingMode` end-to-end.
  - Do not remove it from models, APIs, or engine.
  - Do not expand the current “Traditional” creation UI in this refactor unless
    that page is already intentionally being changed for another reason.

## Validation And Edge Rules

- `share_percent` must be within `[0, 100]`.
- The sum of participating shares for a single account across all goals must be
  `<= 100`.
  - Because shares are static in v1, this validation is account-level only;
    there is no interval math.
- Reject duplicate `accountId` entries in a single save payload.
- Retirement goal creation seeds explicit `100%` shares for every eligible
  account.
  - Eligible in v1: `is_active = true`, `is_archived = false`, `account_type` in
    `SECURITIES | CASH | CRYPTOCURRENCY`
- Later-added accounts do **not** auto-join an existing retirement goal.
  - They appear as unallocated accounts in the editor until the user adds shares
    manually.
- A retirement goal with zero funding rows is treated as explicitly
  unconfigured.
  - No implicit “include everything” fallback anywhere in the planner.
  - Current portfolio for planning becomes `0` until shares are added.
- Defined-contribution rules:
  - `validate_retirement_plan` must reject duplicate `linkedAccountId` values
    across DC streams.
  - `save_goal_plan` must reject linking a DC stream to an account that already
    has participating goal shares.
  - `save_goal_funding` must reject saving shares on any account already linked
    by the retirement plan.
- Because there is no plan yet at retirement-goal creation time, seeded shares
  may include accounts that the user later wants to link as DC.
  - In that case the user must first remove the share, then link the account as
    DC.

## UI And Interaction Changes

- Replace the current funding editor branching with one “Account Shares” editor.
- Retirement goal editor:
  - one `Share %` input per selected account
  - one `Tax bucket` selector per selected account
  - clear messaging that share is an absolute share of the account, not residual
    balance
  - if an account is currently linked to a DC stream, disable share editing and
    show the reason
- Non-retirement goal editor:
  - one `Share %` input per selected account
  - no tax bucket control
  - messaging: “This share stays reserved while the goal is active. It is
    released when the goal is achieved or archived.”
- Goal detail and holdings/allocation pages should derive “included accounts”
  from explicit funding rows only.
  - Remove residual-only checks such as “included ids = rules where fundingRole
    == residual_eligible”.
- Retirement goal creation flow:
  - backend auto-seeds retirement shares immediately
  - frontend still navigates to the setup page after create
  - goal plan JSON is still first persisted when the user saves retirement
    settings
- Keep planner presets outside the engine.
  - Best-effort wrapper/country presets may prefill `taxBucket`,
    `earlyWithdrawalPenaltyRate`, and `earlyWithdrawalPenaltyAge`
  - if wrapper type cannot be inferred from current account/provider metadata,
    no preset is applied and the user edits manually

## Engine Output And Reporting Changes

- Change deterministic yearly output to explicit fields instead of the
  overloaded `annualWithdrawal`.
- `YearlySnapshot` and downstream deterministic trajectory DTOs should expose:
  - `plannedExpenses`
  - `fundedExpenses`
  - `annualShortfall`
  - `annualIncome`
  - `grossPortfolioWithdrawal`
  - `netWithdrawalFromPortfolio`
  - `annualTaxes`
- Remove or stop using the current ambiguous field that stores
  `fundedExpenses + income` as “expenses”.
- Use the new deterministic fields in FIRE/traditional UI so underfunded
  traditional scenarios show the shortfall directly.
- Monte Carlo stays unchanged in this refactor.
  - No new percentile shortfall DTO work in v1.
  - Add regression coverage so the share-model refactor does not accidentally
    change MC math outside intended input changes.

## Implementation Order

1. Refactor the unreleased migration/schema/model layer for `goals_allocation`.
2. Update core/domain/frontend funding types to `sharePercent`.
3. Refactor repository save/load paths for the new table shape.
4. Inject `AccountServiceTrait` into `GoalService` and add atomic
   retirement-goal auto-seeding.
5. Replace share math in goal summaries and retirement input preparation.
6. Add DC duplicate/inverse validation and remove tax-rate mutation.
7. Update the funding editor and included-account resolution in the UI.
8. Update deterministic retirement DTOs and the UI that renders them.
9. Run full Rust/TS verification and fixture-based behavior tests.

## Test Plan

- Migration/schema tests:
  - `goals_allocation` rows round-trip with `share_percent`
  - removed legacy columns are absent from Diesel and TS contracts
- Goal share math:
  - `70% retirement + 30% home` on one account yields exact `70/30`
  - `70% retirement + 30% home + 10% car` is rejected
  - achieved/archived save-up goals no longer reserve shares
- Goal creation:
  - retirement goal auto-seeds `100%` for eligible active non-archived accounts
  - non-retirement goal does not auto-seed
  - later-added account does not appear in retirement funding until manually
    added
- Retirement input:
  - zero funding rows on a retirement goal produces current portfolio `0`
  - tax buckets are derived only from retirement shares
  - no blended-rate mutation occurs across deterministic or Monte Carlo runs
- DC validation:
  - duplicate linked DC accounts are rejected
  - linking a DC stream to an account with shares is rejected
  - saving shares onto an already linked DC account is rejected
- Reporting:
  - `plannedExpenses - fundedExpenses == annualShortfall`
  - underfunded traditional scenarios surface non-zero shortfall
  - MC success-rate regression stays stable on fixture plans except where share
    inputs intentionally differ
- Verification commands:
  - `cargo check`
  - `cargo test -p wealthfolio-core`
  - `pnpm type-check`

## Assumptions And Defaults

- v1 uses static shares only. No per-share `from/to` dates and no
  `targetDate`-driven share expiry.
- Goal lifecycle, not goal date, controls whether a non-retirement share is
  participating.
- `taxBucket` is authoritative for engine math; wrapper/country presets only
  prefill values.
- The only eligible account types in scope are the current account types already
  modeled in the app: `SECURITIES`, `CASH`, `CRYPTOCURRENCY`.
- There is still only one active retirement goal.
- Monte Carlo output shape stays as-is in this refactor.
- The retirement setup flow still saves the actual plan after create; goal
  creation only seeds goal + funding rows.
