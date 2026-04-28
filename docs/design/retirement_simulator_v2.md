# Retirement Simulator V2

## Summary

- Replace the current FIRE-only calculator with a unified retirement simulation
  engine.
- Keep Rust backend core as the single owner of retirement math for desktop and
  web.
- Move from a gross-capital / pre-tax model to a spendable-cashflow model.
- Keep annual-step simulation in v1 of this redesign.
- Add taxes, account usability haircuts, expense buckets, and policy-based
  drawdown.
- Keep the product simple enough for a consumer app:
  - good defaults
  - transparent assumptions
  - explainable outputs
  - no country-specific tax complexity in the first implementation

## Why This Exists

- The current engine is directionally useful, but it mixes planning concepts:
  - retirement funding scope
  - spending target
  - gross portfolio value
  - guaranteed income
  - withdrawal strategy
  - success definition
- The result is a model that can look precise while still missing important
  real-world effects:
  - some accounts should not count at 100%
  - taxes are ignored
  - healthcare is treated specially in the UI but not generalized as an expense
    bucket
  - constant-percentage drawdown is not judged against the spending goal
  - scenario pages can use total household value instead of retirement-funded
    value

## Goals

- Answer the core retirement question:
  - "Can this household fund net spending from retirement age to planning
    horizon?"
- Make all retirement analytics use the same funded-capital base and the same
  cashflow engine:
  - overview
  - deterministic projection
  - Monte Carlo
  - scenario analysis
  - sequence-of-returns analysis
- Support both accumulation and decumulation in one model.
- Support guaranteed future income streams without double-counting linked
  assets.
- Support taxes in the simplest defensible way first, with room for
  country-specific upgrades later.
- Support account-level usability adjustments without forcing advanced setup for
  every user.
- Produce outputs that are explainable in plain language.

## Non-Goals

- Full country-specific tax law coverage in v1.
- Monthly-step simulation in v1.
- Household optimization across multiple legal entities in v1.
- Required minimum distributions, detailed Social Security claiming, or
  annuitization optimization in v1.
- A second frontend calculator.

## Product Principles

- Backend truth only.
- Show spendable outcomes, not just nominal wealth.
- Prefer one coherent model over many disconnected widgets.
- Default to safe simplifications, but do not hide them.
- Every advanced assumption must degrade gracefully to a sensible default.

## Current Gaps

- Scenario tools can run on total portfolio value rather than retirement-funded
  value.
- SORR can start from the wrong balance when actual FI age differs from desired
  retirement age.
- The current "constant-percentage" mode can report success without meeting the
  spending target.
- Guaranteed income only reduces the target if it starts by the retirement age,
  which is conservative but incomplete.
- Eligible retirement accounts are binary include/exclude with no usability
  haircut.
- Taxes are only implied through user guidance on entering net income streams.
- Healthcare has special handling, but the engine does not yet support general
  expense buckets.

## Proposed Model

### Core Idea

- Simulate one annual household retirement ledger from current age to planning
  horizon.
- Each year computes:
  - funded portfolio start value
  - contributions
  - guaranteed income
  - expenses by bucket
  - tax owed on withdrawals
  - required gross withdrawals
  - funded portfolio end value
- All outputs are derived from that same ledger.

### Planning State

- Introduce a typed retirement-planning model under `planning::retirement`.
- Keep existing FIRE settings as migration input, but move toward a richer
  structure:
  - `RetirementPlan`
  - `RetirementFundingRule`
  - `ExpenseBucket`
  - `IncomeStream`
  - `TaxProfile`
  - `WithdrawalPolicy`

### Expense Model

- Replace one `monthly_expenses_at_fire` field plus one healthcare override with
  expense buckets.
- Default buckets:
  - `living`
  - `healthcare`
  - `housing`
  - `discretionary`
- Each bucket has:
  - monthly amount in today's money
  - inflation assumption
  - optional end age
  - optional start age
  - optional essential/discretionary classification
- Migration rule:
  - existing `monthly_expenses_at_fire` -> `living`
  - existing `healthcare_monthly_at_fire` -> `healthcare`
  - existing `healthcare_inflation_rate` -> healthcare bucket inflation override

### Why Healthcare Still Matters

- Healthcare should not remain a hardcoded one-off forever.
- It should remain a first-class default bucket because:
  - users expect to see it
  - it often inflates differently from general spending
  - it is a major retirement-specific risk category
- Product rule:
  - highlight healthcare only when non-zero or materially above a threshold
  - the engine should treat it as one expense bucket among many

### Income Stream Model

- Keep both defined-benefit and defined-contribution streams.
- Represent each stream as future net cashflow from a start age onward.
- Continue blocking linked DC accounts from portfolio capital.
- Improve treatment of deferred income:
  - it should reduce future portfolio need after its start age
  - it should not be ignored just because it starts after retirement
- Product behavior:
  - overview may still show "target at retirement age"
  - simulation must use the full future stream schedule

### Funding Model

- Keep retirement funding separate from save-up reservations.
- Extend retirement funding from binary eligibility to countable usability.
- Proposed retirement funding rule fields:
  - `account_id`
  - `funding_role = residual_eligible`
  - `countable_percent`
  - `tax_bucket_override` optional
  - `notes` optional
- Default:
  - `countable_percent = 100`
- Why:
  - pretax accounts are not fully spendable at face value
  - some accounts may be partially reserved for buffer or bequest goals
  - some capital may be inaccessible without penalty before a given age

### Tax Model

- Start with a simple effective-tax model, not bracket optimization.
- Proposed `TaxProfile` fields:
  - `mode`
  - `taxable_withdrawal_rate`
  - `tax_deferred_withdrawal_rate`
  - `tax_free_withdrawal_rate`
  - `early_withdrawal_penalty_rate`
  - `early_withdrawal_penalty_age`
- Supported account tax buckets:
  - `taxable`
  - `tax_deferred`
  - `tax_free`
  - `unknown`
- Simplest v1 behavior:
  - guaranteed income streams are entered net of tax
  - expense buckets are net spending needs
  - withdrawals are grossed up so net spend after tax covers the spending gap
- If account tax type is unknown:
  - use a plan-level default chosen by the user or product default

### Withdrawal Policies

- Replace "constant-percentage as a sustainability mode" with policy-based
  drawdown.
- Policy set:
  - `constant_real`
  - `guardrails`
  - `constant_percentage` as exploratory only
- Default recommendation:
  - `guardrails`
- Guardrails design:
  - start from a real spending target
  - allow spending cuts and raises within configured bands
  - keep essential expenses fully funded before discretionary adjustments
- Product rule:
  - only policies that attempt to fund the stated spending target can drive the
    main success metric
  - `constant_percentage` may remain available in scenarios, but must be labeled
    as variable-spending mode

## Simulation Semantics

### Deterministic Projection

- Use expected returns and expected inflation.
- Simulate annual cashflows from current age to horizon.
- Before retirement:
  - apply contributions
  - grow funded portfolio
  - accumulate linked DC assets separately
- After retirement:
  - compute bucketed expenses
  - subtract active guaranteed income
  - apply withdrawal policy
  - compute taxes and penalties
  - update balances by tax bucket

### Success Definition

- A plan succeeds only if:
  - essential spending is funded every year
  - total spending under the selected policy is funded within its allowed rules
  - funded portfolio stays above zero
  - optional bequest floor, if configured, is preserved at the horizon
- This replaces the current constant-percentage proxy of "ending above 5% of
  start".

### Monte Carlo

- Continue annual Monte Carlo in v1.
- Simulate:
  - portfolio returns
  - inflation
- Use the same tax and withdrawal engine as deterministic projection.
- Main outputs:
  - success rate
  - percentile portfolio paths
  - percentile spendable-income paths
  - failure age distribution
  - median funded retirement age

### Scenario Analysis

- Scenarios should run on the same retirement-funded portfolio value as the
  overview.
- Scenario outputs should show:
  - funded retirement age
  - success/failure at horizon
  - spendable income behavior under the selected policy

### Sequence of Returns Risk

- Start from actual funded retirement age and actual portfolio at retirement.
- If FI is not reached:
  - either disable SORR
  - or explicitly run it from the desired retirement age using the projected
    funded balance at that age
- Do not mix actual FI age with target-age portfolio balance.

## Required Capital and Charting

### Current Problem

- A post-retirement "required capital" line that declines by inflation-only
  growth can imply a policy that the engine is not actually following.

### New Rule

- Post-retirement comparison lines must come from the same engine and policy as
  the displayed plan.
- Acceptable options:
  - show only projected portfolio after retirement
  - show a policy-consistent minimum sustainable capital line
  - show probability bands rather than a fake deterministic decline
- Do not draw a generic triangle unless it matches the engine output.

## UI Implications

### Overview

- Keep the current retirement detail layout.
- Replace single spending summary with bucket summary.
- Keep healthcare visible as one named bucket when present.
- Show:
  - funded portfolio now
  - spendable portfolio now
  - tax drag estimate
  - guaranteed-income coverage at retirement

### Funding Tab

- Keep current account selection flow.
- Add optional advanced column:
  - `countable %`
  - tax bucket
- Default view remains simple.

### Plan Tab

- Core section:
  - retirement age
  - horizon
  - monthly contribution
  - withdrawal policy
- Expenses section:
  - bucket editor
- Income section:
  - DB/DC streams
- Taxes section:
  - simple effective tax profile

### Scenarios Tab

- Use backend-provided retirement-funded value, not total household value.
- Label variable-spending policies clearly.
- Add copy that success means "spending funded", not merely "portfolio
  non-zero".

## Architecture Direction

- Introduce `crates/core/src/planning/retirement/` as the new home for the
  engine.
- Treat current `portfolio::fire` module as legacy math to be migrated, not
  extended indefinitely.
- Suggested module split:
  - `planning::retirement::model`
  - `planning::retirement::funding`
  - `planning::retirement::tax`
  - `planning::retirement::withdrawal`
  - `planning::retirement::engine`
  - `planning::retirement::analysis`
  - `planning::retirement::dto`

## Data Migration Strategy

- Read legacy FIRE settings and map them into V2 plan state.
- Preserve backward compatibility for existing retirement goals.
- Migration mapping:
  - `monthlyExpensesAtFire` -> `living` bucket
  - `healthcareMonthlyAtFire` -> `healthcare` bucket
  - `healthcareInflationRate` -> bucket inflation override
  - `withdrawalStrategy` -> `withdrawalPolicy`
- Existing retirement funding rules remain valid:
  - missing `countable_percent` defaults to `100`

## API and DTO Changes

- Add `portfolio_now` and `spendable_portfolio_now` as explicit retirement
  overview fields.
- Add `portfolio_at_retirement_start`.
- Split semantics:
  - `fi_age`
  - `funded_at_goal_age`
  - `eventually_reaches_fi`
- Add tax outputs:
  - `annual_taxes`
  - `lifetime_tax_estimate` optional
- Add expense bucket outputs:
  - annual bucketed expenses
  - guaranteed-income coverage

## Implementation Plan

### Phase 0: Correctness Fixes in Current Flow

- Use backend retirement-funded capital in all scenario pages.
- Add `portfolio_at_retirement_start` to retirement overview DTO.
- Split `funded_at_goal_age` from "eventually reaches FI".
- Fix SORR input selection to use matching age and balance.
- Update chart and banner logic to use `portfolioNow` instead of household
  `totalValue` where retirement scope matters.
- Add regression tests for:
  - excluded accounts
  - reserved accounts
  - linked DC accounts
  - late FI after desired age

### Phase 1: Retirement V2 Domain Model

- Add typed `RetirementPlanV2` data structures in core.
- Add expense buckets.
- Add retirement funding `countable_percent`.
- Add simple tax profile.
- Add migration adapter from legacy `FireSettings`.

### Phase 2: Unified Annual Cashflow Engine

- Build one retirement ledger engine for deterministic projection.
- Implement:
  - annual expense expansion by bucket
  - guaranteed-income schedule
  - tax gross-up on withdrawals
  - policy-based drawdown
  - per-bucket account balance updates
- Keep current outputs alive through adapters until UI migration completes.

### Phase 3: Analysis Tools on Top of the New Engine

- Rebuild Monte Carlo on top of the unified engine.
- Rebuild scenario analysis on top of the unified engine.
- Rebuild SORR on top of the unified engine.
- Define success consistently across all analytics.

### Phase 4: UI Migration

- Funding tab:
  - advanced countable-percent editor
  - tax bucket selector
- Plan tab:
  - expense bucket editor
  - simple tax profile editor
  - withdrawal policy selector
- Overview:
  - bucket summary
  - tax drag summary
  - clearer funded-capital metrics

### Phase 5: Advanced Enhancements

- Country-specific tax presets.
- Optional bracket-aware tax engine.
- Optional bequest floor.
- Optional longevity table / death-age sampling.
- Guardrails tuning and policy presets.

## Testing Plan

### Unit Tests

- Expense bucket inflation and timing.
- Healthcare bucket migration.
- Deferred income reducing future need after start age.
- Funding `countable_percent` behavior.
- Tax gross-up math by tax bucket.
- Early-withdrawal penalty behavior.
- Guardrails spending floor and ceiling behavior.

### Integration Tests

- Goal funding + latest valuations -> correct funded retirement capital.
- Retirement overview DTO uses funded portfolio, not household total.
- Scenario tools use same funded capital as overview.
- SORR uses matching retirement age and retirement-start balance.

### Property Tests

- No-tax, 100%-countable plans should approximate the current engine where
  semantics match.
- Increasing `countable_percent` should never reduce funded capital.
- Higher effective tax rate should never improve success probability.
- Later guaranteed-income start age should never improve funded status before
  that start age.

## Rollout Strategy

- Ship Phase 0 first.
- Keep legacy settings format readable during the transition.
- Gate V2 plan editor behind a feature flag if needed.
- Prefer additive DTO changes before removing legacy fields.

## Open Questions

- Which countries need first-class tax presets at launch?
- Should bequest floor be a global setting or retirement-goal-specific?
- Should variable spending below discretionary buckets be allowed by default?
- Can account tax bucket be inferred from account type with acceptable accuracy?
- Should traditional retirement mode wait for the same V2 engine, or be hidden
  until V2 is complete?

## Recommendation

- Approve Phase 0 immediately because it fixes correctness bugs without changing
  the product model.
- Build V2 as a new retirement engine under `planning::retirement`.
- Keep the current FIRE engine only as a compatibility layer during migration.
