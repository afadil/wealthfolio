# Goals Planning Master Plan

## Summary

- Make `Goals` the main planning product in the app.
- Keep the **current Goals dashboard visual design**. It is already the right
  direction.
- Use one unified model:
  - `Goal` = user-facing object
  - `GoalPlan` = typed planning settings
  - `GoalFunding` = how account capital contributes
  - `GoalSummary` = backend-derived cached dashboard/detail metrics
- Support two goal families in v1:
  - `save_up` goals: home, education, wedding, car, emergency fund, custom
  - `retirement` goal: one active long-term goal per portfolio/household
- Inside the retirement goal, support **analysis modes**, not separate competing
  goals:
  - `FIRE` first
  - `Traditional retirement` later
- Make the backend core the single source of truth for all planning calculations
  for both desktop and web.
- Reuse and evolve the current Rust FIRE engine; remove frontend TypeScript as a
  second calculator owner.

## Product Model

- `Goals` page is the top-level planning home.
- Each goal is a card on the dashboard and a detail page when opened.
- There is **one active retirement goal** per planning context.
- FIRE and Traditional do **not** exist as separate goal cards against the same
  portfolio.
- FIRE and Traditional are **modes/scenarios inside the retirement goal**.
- In v1:
  - expose `FIRE` as the only polished/active retirement mode
  - architect for `Traditional`, but keep it hidden until mode-correct
- Other goal types remain separate top-level goals:
  - `home`
  - `education`
  - `wedding`
  - `car`
  - `emergency_fund`
  - `custom_save_up`

## Goals Dashboard Spec

- Keep the current card-grid design and overall aesthetics.
- Sections:
  - `Active Goals`
  - collapsible `Archived`
- Do **not** add a separate `Needs Attention` section.
- Goal health is shown as a **badge on the card**, not as a grouping section.
- Top-right page CTA remains `New Goal`.
- Active goal sorting:
  1. `priority`
  2. nearest `targetDate` / desired retirement age
  3. undated goals last
  4. stable tie-break by `createdAt`
- Do **not** sort by amount.

### Goal Card Content

- Cover image / visual
- Goal title
- Goal type label and target date if relevant
- Status/health badge:
  - `On Track`
  - `At Risk`
  - `Off Track`
  - `Achieved`
- Current value
- Target value
- Progress percentage
- Progress bar

### Dashboard Responsibilities

- Read-only summary surface
- Fast scan of all goals
- No detailed planning controls
- Numbers must come from backend-derived goal summaries only

## Shared Goal Detail Shell

- Keep one shared shell for all goal types:
  - header with back button
  - title
  - subtitle
  - right-side `Edit` and `Delete`
  - tabs
- Tabs:
  - `Overview`
  - `Plan`
  - `Funding`
  - `Scenarios`
  - `Allocation`

### Detail Shell Behavior

- `Overview` is read-first
- `Plan` is edit-first
- `Funding` is capital attribution
- `Scenarios` is deeper analytics
- `Allocation` is target mix / drift

## Retirement Goal UX

- The goal is called `Retirement`.
- The page header should say:
  - title = user goal title, default `Retirement`
  - subtitle = `Retirement goal`
- Inside the retirement goal:
  - primary active mode in v1 = `FIRE`
- Product meaning:
  - `Retirement` is the long-term goal
  - `FIRE` is the first analysis mode of that goal

### FIRE Mode Semantics

- Primary question:
  - “At what age do I become financially independent?”
- Primary output:
  - `Projected FI age`
- Secondary comparison:
  - `Desired FIRE age`
- Only show status such as `On track`, `2 years late`, `3 years early` if a
  desired FIRE age exists.
- Do not let desired FIRE age replace the main FI-age result.

### Traditional Mode Semantics

- Primary question:
  - “Is retirement at age X sustainable?”
- Primary output:
  - `Funded / underfunded at chosen age`
- This mode is architected now, but should not be user-visible until:
  - copy is mode-specific
  - KPIs are mode-specific
  - charts are mode-specific
  - scenarios are mode-specific

## Retirement Overview Spec

- Layout:
  - main column + sticky right rail on desktop
  - stacked on mobile
- Main column order:
  1. alert / forecast banner
  2. hero summary card
  3. hero chart
  4. budget-at-FIRE card
  5. milestones / yearly snapshots card
- Right rail order:
  1. `Forecast`
  2. `Core Assumptions`
  3. `Coast FIRE`
  4. `Funding Scope`

### Alert Banner

- Show only for important states:
  - FI already reached
  - underfunded by desired FIRE age
  - not reachable by planning horizon
  - projected FI materially earlier/later than desired
- Copy should be short and actionable.

### Hero Summary Card

- Headline:
  - `Projected FI age`
- Supporting line:
  - `Desired FIRE age` if set
- Additional line:
  - current portfolio vs net FIRE target
  - shortfall/surplus at desired age
  - required extra monthly contribution if applicable
- Visual:
  - radial or compact progress element
  - thin progress bar below

### Forecast Card

- Small summary card in the rail
- States:
  - `You can retire now`
  - `On your way`
  - `Short by X`
  - `Not reachable by horizon`
- Always show one clear next action:
  - save `$X` more/month
  - reduce spending by `$Y`
  - move desired FIRE age to `Z`

### Core Assumptions Card

- Yes: keep assumptions in the right rail with a toggle edit mode.
- Default:
  - read-only summary rows
- Rows:
  - desired FIRE age
  - monthly contribution
  - monthly spending
  - healthcare
  - SWR
  - expected return
  - inflation
- Card action:
  - `Quick edit`
- Quick edit mode:
  - inline editable fields for those same core assumptions
  - `Save`
  - `Cancel`
  - `Advanced settings`
- `Advanced settings` navigates to the `Plan` tab
- Do **not** put all assumptions here.

### Coast FIRE Card

- Amount needed today
- Current gap/surplus
- Reached badge
- One explanatory line only

### Funding Scope Card

- Included account count
- Linked income stream count
- Current funded capital
- Link to `Funding`

## FIRE Chart Spec

- Use the current dashboard’s visual tone, but improve the chart semantics.
- The chart should resemble the reference aesthetically:
  - one large clean hero chart
  - gold filled portfolio area
  - dashed comparison line
  - direct annotations instead of a big legend
  - minimal grid
  - lots of whitespace

### Chart Rules

- Do **not** force a triangle or automatic post-retirement decline.
- If the model produces a rising path after FIRE, show it.
- If the model produces a declining path after FIRE, show it.
- The chart must reflect the backend model, not an illustrative template.

### Chart Semantics

- X-axis:
  - age
- Default Y-axis:
  - real dollars
- Series:
  - gold area = projected portfolio path
  - dashed line = required capital path
- Markers:
  - desired FIRE age
  - actual withdrawal-start age
  - projected FI age if different
- Data source:
  - backend-provided end-of-year balances
  - backend-provided required-capital series
- Interpolation:
  - `linear`, not `monotone`

### Chart Tooltip

- age
- phase
- portfolio start
- annual contribution
- annual income
- annual expenses
- net withdrawal from portfolio
- portfolio end
- required capital

### Chart Callouts

- Direct labels such as:
  - `What you'll have`
  - `What you'll need`
- Use only at key points:
  - desired FIRE age
  - projected FI age
  - horizon if helpful

## Retirement Plan Tab Spec

- Replace the current long form with grouped sections:
  - `Core`
  - `Income Streams`
  - `Investment Assumptions`
  - `Advanced`
- `Advanced` stays collapsed by default.
- `Core` mirrors the Overview quick-edit card.
- `Income Streams` contains DB/DC stream configuration and linked accounts.
- `Investment Assumptions` contains returns, volatility, inflation, glide path.
- `Advanced` contains:
  - withdrawal strategy
  - healthcare inflation override
  - salary/contribution growth
  - DC accumulation return
  - other technical controls
- Keep auto-detect from portfolio as a compact helper card, not the dominant
  first block.

## Save-Up Goal UX

- Save-up goals use the same detail shell and overview pattern, but with simpler
  outputs.

### Save-Up Overview

- Main column:
  - hero progress card
  - projected savings chart
  - milestones if needed
- Right rail:
  - `Plan Details`
  - `Projections`
  - `Account Funding`
- Primary outputs:
  - current value
  - target amount
  - projected value at target date
  - required monthly contribution
  - projected completion date
- Quick-edit assumptions:
  - target amount
  - target date
  - monthly contribution
  - expected return

### Save-Up Chart

- Gold area/line for projected savings
- Optional optimistic / nominal / pessimistic overlays
- Target reference line
- Much simpler than retirement/FIRE charting

## Funding Model

- Keep a dedicated goal funding layer.
- Save-up goals:
  - explicit account reservations
- Retirement goal:
  - eligible retirement accounts using centralized residual/scoped capital logic
- Rules:
  - same dollar cannot count twice
  - linked DC stream accounts cannot also count as portfolio capital
- Funding is edited only in the `Funding` tab.
- Dashboard and detail summaries consume backend-derived outputs based on
  funding + latest valuations.

## Architecture Direction

- Backend core becomes the only calculation owner.
- Reuse and evolve the current Rust FIRE engine as the foundation.
- Move toward a dedicated planning module structure in core, for example:
  - `planning::retirement`
  - `planning::save_up`
- Desktop and web both call the same core planning logic.
- Frontend responsibilities:
  - render DTOs
  - capture edits
  - manage tab/mode state
  - draw charts
- Backend responsibilities:
  - deterministic projections
  - FI age detection
  - funded-at-goal-age evaluation
  - shortfall/surplus
  - required additional monthly contribution
  - required capital series
  - budget breakdown
  - scenario analysis
  - Monte Carlo
  - SORR
  - sensitivity
  - save-up projection math
  - funding-aware capital resolution
  - summary recomputation

## Data Model Direction

- `goals`
  - root user-facing entity
- `goal_plans`
  - typed settings per goal
- `goal_funding`
  - funding rules
- `goal summary`
  - backend-derived cached fields on goal + optional detail summary JSON

### Goal Types

- `retirement`
- `home`
- `education`
- `wedding`
- `car`
- `emergency_fund`
- `custom_save_up`

### Retirement Plan Settings

- `analysisMode`
- `currentAge`
- `desiredFireAge`
- `planningHorizonAge`
- `monthlySpendingAtRetirement`
- `monthlyHealthcareAtRetirement`
- `safeWithdrawalRate`
- `withdrawalStrategy`
- `expectedAnnualReturn`
- `expectedReturnStdDev`
- `inflationRate`
- `monthlyContribution`
- `contributionGrowthRate`
- `incomeStreams`
- `glidePath`

### Save-Up Plan Settings

- `targetAmount`
- `targetDate`
- `monthlyContribution`
- `expectedAnnualReturn`
- optional save-up specific planning fields if needed later

## API / DTO Direction

- Frontend must consume backend planning DTOs only.

### Retirement DTOs

- `RetirementOverview`
- `RetirementTrajectoryPoint`
- `RetirementScenarios`
- key fields:
  - `analysisMode`
  - `status`
  - `desiredFireAge`
  - `retirementStartAge`
  - `fiAge`
  - `fundedAtGoalAge`
  - `portfolioNow`
  - `portfolioAtGoalAge`
  - `requiredCapitalAtGoalAge`
  - `shortfallAtGoalAge`
  - `surplusAtGoalAge`
  - `requiredAdditionalMonthlyContribution`
  - `suggestedGoalAgeIfUnchanged`
  - `coastAmountToday`
  - `coastReached`
  - `budgetBreakdown`
  - `trajectory`

### Save-Up DTOs

- `SaveUpOverview`
- `SaveUpTrajectoryPoint`
- key fields:
  - `currentValue`
  - `targetAmount`
  - `projectedValueAtTargetDate`
  - `requiredMonthlyContribution`
  - `projectedCompletionDate`
  - `trajectory`

### Operations

- load goal overview
- load goal scenarios
- save plan settings
- save funding rules
- refresh goal summary
- desktop and web must expose the same conceptual planning operations

## Implementation Steps

- **Step 1: Lock product semantics**
  - keep one active retirement goal rule
  - keep FIRE as the only exposed retirement mode in v1
  - align UI copy to `Retirement goal` + `FIRE mode`
  - deliverable: stable product framing
- **Step 2: Finalize dashboard direction**
  - keep current Goals dashboard card design
  - remove any alternative section/grouping experiments
  - enforce sort order: priority, then target date
  - deliverable: locked dashboard IA and visual direction
- **Step 3: Shared backend planning module**
  - formalize retirement and save-up planning under one core planning layer
  - reuse current Rust FIRE engine
  - define overview/trajectory/scenario DTOs
  - deliverable: backend calculation contracts
- **Step 4: Web parity**
  - expose the same retirement/save-up planning APIs in Axum
  - make web and desktop consume identical backend planning outputs
  - deliverable: platform parity
- **Step 5: Retirement Overview redesign**
  - implement main-column + sticky-rail layout
  - add forecast, assumptions, coast, and funding-scope cards
  - replace current chart with backend-driven hero chart
  - deliverable: production-ready FIRE Overview
- **Step 6: Quick edit assumptions**
  - implement right-rail quick-edit mode
  - wire save/cancel/advanced settings navigation
  - deliverable: overview editing workflow
- **Step 7: Plan tab redesign**
  - restructure to `Core`, `Income Streams`, `Investment Assumptions`,
    `Advanced`
  - collapse advanced section by default
  - deliverable: cleaner editing workspace
- **Step 8: Funding hardening**
  - ensure funding drives all summaries consistently
  - prevent cross-goal double counting
  - ensure dashboard/detail numbers match
  - deliverable: trustworthy capital attribution
- **Step 9: Save-up goal polish**
  - apply same shell/right-rail conventions to save-up goals
  - implement backend-driven save-up overview DTOs and charts
  - deliverable: strong non-retirement planning experience
- **Step 10: Scenario parity**
  - move scenario pages fully to backend DTOs
  - remove frontend local calculation ownership
  - deliverable: consistent advanced analytics
- **Step 11: Traditional mode architecture completion**
  - implement mode-specific copy, KPIs, chart semantics, scenarios
  - keep hidden until fully coherent
  - deliverable: second retirement analysis mode without separate goal
    duplication

## Acceptance Criteria

- Goals dashboard keeps the current design and card layout.
- Active goals are sorted by priority, then target date.
- Health is shown as a card badge, not a separate section.
- There is only one active retirement goal.
- FIRE is exposed inside the retirement goal, not as a separate goal.
- Backend is the sole owner of planning calculations.
- Desktop and web return identical planning outputs.
- Retirement Overview uses backend trajectory and required-capital series.
- Overview quick edit is limited to core assumptions.
- Advanced settings live in Plan.
- Save-up and retirement detail pages share one shell but different calculation
  models.
- Dashboard and detail summaries always agree.

## Test Plan

- Dashboard ordering and grouping are correct.
- One active retirement goal rule is enforced.
- Backend overview/scenario DTOs are consistent between desktop and web.
- No frontend page derives business metrics locally after migration.
- Retirement chart uses backend-provided end-of-year values and actual phase
  markers.
- Rising or falling post-FIRE paths render honestly.
- Quick edit updates overview outputs consistently.
- Funding changes update summaries consistently across dashboard and detail.
- Save-up goals compute projected value, completion date, and required monthly
  correctly.
- Traditional mode remains hidden until all mode-specific behaviors are
  complete.

## Assumptions and Defaults

- Goals remains the product home.
- Current dashboard design is retained.
- One retirement goal per planning context.
- FIRE is the first polished retirement mode.
- Backend core is the single planning calculator owner.
- Overview is read-first; Plan is edit-first.
- Quick edit is limited to core assumptions.
- Advanced settings stay in Plan.
- Save-up and retirement goals share shell patterns but not business logic.
