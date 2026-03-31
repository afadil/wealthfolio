# Goals-First Product Architecture with Retirement as One Goal Family

## Summary
- Replace the dedicated FIRE product entry with a **Goals-first** product.
- Model retirement as **one goal family**: `goal_type=retirement`.
- Within retirement, use an explicit mode field:
  - `plannerMode=fire`
  - `plannerMode=traditional`
- Keep **one retirement settings contract** shared by both modes.
- Refactor by **reusing the existing FIRE engine and UI code with targeted adaptation**, not by rewriting retirement planning from scratch.
- Use a **Goals + Plans** architecture:
  - `goals` is the user-facing root object and dashboard card.
  - `goal_plans` stores planner-specific settings and summaries for complex goals.
- V1 scope:
  - Goals dashboard as the main entry
  - Retirement goal with `fire|traditional` modes
  - generic Save-Up goal engine for Education, Wedding, Home, Emergency Fund, and Custom Save-Up
  - existing simple goals remain valid as **track-only** goals until enriched with plan data
- Chosen rollout:
  - immediate replace of FIRE entrypoints with Goals
  - no migration of legacy FIRE settings
  - existing FIRE settings become unused legacy data in v1

## Product Architecture
- **Product model**
  - `Goals` is the top-level planning surface.
  - Each goal is a user-facing object with progress, health, and a detail page.
  - Complex goal types attach a planner/plan object.
  - Retirement is one goal family with two explicit planning modes, not two separate goal types.

- **Retirement semantics**
  - `goal_type=retirement`
  - `plannerMode=fire|traditional`
  - Both modes share nearly the same settings family.
  - They differ in interpretation and primary outputs:
    - `traditional`: “Can I retire at age X sustainably?”
    - `fire`: “Am I on track to reach FI by age X, and what is my projected FI age?”
  - Keep one age input in the shared contract:
    - use `goalRetirementAge` or `desiredRetirementAge`
    - do not keep FIRE-specific naming like `targetFireAge`

- **Information architecture**
  - Replace nav item `FIRE Planner` with `Goals`.
  - Remove FIRE and Goals as product entrypoints from app Settings.
  - Add routes:
    - `/goals`
    - `/goals/new`
    - `/goals/:goalId`
    - `/goals/:goalId/edit`
  - Redirect `/fire-planner` and `/settings/fire-planner` to `/goals`.
  - Goal detail tabs:
    - Retirement: `Overview`, `Plan`, `Funding`, `Projection`, `Scenarios`
    - Save-Up: `Overview`, `Plan`, `Funding`, `Projection`
    - Track-only legacy goals: `Overview`, `Funding`, and “Add planning details”

- **Goal taxonomy**
  - `retirement`
  - `education`
  - `wedding`
  - `home`
  - `emergency_fund`
  - `custom_save_up`
  - `education|wedding|home|emergency_fund|custom_save_up` all use the Save-Up planner engine in v1

## Data Model and Interfaces
- **Goals root table**
  - Extend `goals` with:
    - `goal_type`
    - `title`
    - `description`
    - `status_lifecycle = draft|active|achieved|archived|paused`
    - `status_health = on_track|at_risk|off_track|not_applicable`
    - `is_archived`
    - `priority`
    - `cover_image_key`
    - `currency`
    - `start_date`
    - `target_date`
    - `target_amount`
    - `current_value_cached`
    - `progress_cached`
    - `projected_completion_date`
    - `projected_value_at_target_date`
    - `created_at`
    - `updated_at`
  - Keep `goals_allocation` as the funding-allocation table in v1.

- **Goal plans table**
  - Add `goal_plans` with:
    - `goal_id` primary key
    - `plan_kind = retirement|save_up`
    - `planner_mode` nullable, used by retirement
    - `settings_json`
    - `summary_json`
    - `version`
    - `created_at`
    - `updated_at`
  - Add sync support for `goal_plans`.

- **Shared retirement settings contract**
  - `RetirementPlanSettings`
    - `plannerMode`
    - `currentAge`
    - `goalRetirementAge`
    - `planningHorizonAge`
    - `monthlyExpensesAtRetirement`
    - `healthcareMonthlyAtRetirement`
    - `healthcareInflationRate`
    - `safeWithdrawalRate`
    - `withdrawalStrategy`
    - `expectedAnnualReturn`
    - `expectedReturnStdDev`
    - `inflationRate`
    - `monthlyContribution`
    - `contributionGrowthRate`
    - `currentAnnualSalary`
    - `salaryGrowthRate`
    - `additionalIncomeStreams`
    - `includedAccountIds`
    - `targetAllocations`
    - `glidePath`
  - This is intentionally a near-isomorphic successor to current `FireSettings`:
    - rename FIRE-specific fields to retirement-neutral names
    - add `plannerMode`
    - remove `linkedGoalId`
    - move generic UI metadata to the root `Goal`

- **Save-Up settings contract**
  - `SaveUpPlanSettings`
    - `startDate`
    - `targetDate`
    - `targetAmount`
    - `currentAmount`
    - `plannedMonthlyContribution`
    - `expectedAnnualReturn`
    - `includedAccountIds`
    - `targetAllocations` optional

- **Service/API changes**
  - Expand goals service with:
    - `get_goals_dashboard()`
    - `get_goal_detail(goal_id)`
    - `create_goal(goal_root, optional_plan)`
    - `update_goal_root(goal_root)`
    - `save_goal_plan(goal_id, plan_payload)`
    - `archive_goal(goal_id)`
    - `restore_goal(goal_id)`
    - `delete_goal(goal_id)`
    - `load_goal_allocations(goal_id)`
    - `upsert_goal_allocations(goal_id, allocations)`
  - Frontend hooks:
    - `useGoalsDashboard`
    - `useGoalDetail(goalId)`
    - `useGoalPlan(goalId)`
    - `useGoalFunding(goalId)`

## Implementation Strategy
- **Core principle**
  - Do **not** rewrite the retirement/FIRE planner from scratch.
  - Reuse the current FIRE calculation engine, validation, planner UI sections, and domain types where possible.
  - Refactor by adapting:
    - naming
    - storage location
    - route ownership
    - root object relationship
    - mode semantics
  - Treat this as a product and architecture relocation first, and only a targeted logic refactor second.

- **Phase 1: Goals foundation**
  - Add DB migration for expanded `goals` and new `goal_plans`.
  - Update Diesel schema, DB models, domain models, services, repositories, sync adapters, and outbox mappings.
  - Preserve backward compatibility for reading existing goal rows by defaulting new fields.

- **Phase 2: Goals dashboard**
  - Add `/goals` as the primary route and nav entry.
  - Build grouped goal cards:
    - Active
    - At Risk
    - Achieved
    - Archived
  - Card content:
    - title
    - cover image key
    - progress
    - health badge
    - date/retirement milestone
    - projected completion or projected value

- **Phase 3: Goal creation flow**
  - Add template picker on `/goals/new`.
  - Templates:
    - Retirement
    - Education
    - Wedding
    - Home
    - Emergency Fund
    - Custom Save-Up
  - For Retirement, require `plannerMode = fire|traditional` during setup.
  - Create the root goal first, then open the detail page in draft mode.

- **Phase 4: Retirement refactor using existing FIRE code**
  - Rehome current FIRE planner under retirement goal detail pages.
  - Replace app-wide FIRE settings storage with `goal_plans`.
  - Convert current FIRE UI sections into retirement goal tabs:
    - dashboard content -> retirement overview
    - settings form -> retirement plan tab
    - simulations -> retirement scenarios tab
    - account/funding selection -> funding tab
  - Rename user-facing FIRE labels to retirement-neutral labels, except where `plannerMode=fire` explicitly calls for FIRE wording.
  - Remove `linkedGoalId`; the goal is now the parent object.
  - Keep the existing calculation engine and adapt its inputs from `FireSettings` to `RetirementPlanSettings`.
  - Implement a compatibility mapper layer first:
    - `RetirementPlanSettings -> existing FireSettings-like engine input`
    - this minimizes risk and avoids a large rewrite
  - Only after the goal integration is stable, optionally rename internal symbols/files from FIRE to retirement in a later cleanup pass.

- **Phase 5: Save-Up planner**
  - Add generic save-up goal detail page and engine.
  - Projection math:
    - daily compounding
    - monthly contributions at month end
    - projected future value at target date
    - projected completion date if target missed
  - Health status:
    - `on_track` when projected FV at target date >= target
    - `at_risk` when projected FV is between 90% and 100% of target
    - `off_track` otherwise
  - Allow legacy simple goals to become full save-up plans by adding planning details.

- **Phase 6: Immediate replace cleanup**
  - Redirect old FIRE routes to `/goals`.
  - Remove FIRE product entrypoints from active IA.
  - Remove Goals from Settings as a product management page.
  - Update launcher/search and empty states to point to `/goals`.
  - Leave the old `fire_planner_settings` key untouched in v1 as dead legacy data.

## Test Plan
- **Migration and persistence**
  - Existing goal rows survive migration with correct defaults.
  - Existing goal allocations still load and compute current progress.
  - `goal_plans` syncs correctly as a new entity.
  - Legacy goals without plans open as track-only goals.
  - Legacy FIRE settings remain ignored without creating phantom retirement goals.

- **Goals dashboard**
  - Dashboard renders mixed goal types correctly.
  - Archived goals are hidden from default views and visible in archived section.
  - Health/status badges match summary calculations.
  - Card sorting uses priority, then target date.

- **Retirement goal**
  - Retirement goal can be created in both `fire` and `traditional` modes.
  - Existing FIRE calculation behavior remains intact after rehoming under Goals.
  - Retirement settings load/save through `goal_plans`, not app settings.
  - Old FIRE routes redirect correctly.
  - Mode-specific copy and metrics are correct:
    - `fire`: projected FI age, on-track-for-goal-age
    - `traditional`: sustainability at goal retirement age, funding gap

- **Save-Up goal**
  - Save-Up math works for:
    - zero return
    - non-zero return
    - zero contribution
    - past target date
    - current value already above target
  - Required monthly contribution solver is correct.
  - Health-state boundaries are correct.

- **UX and navigation**
  - No user-visible FIRE menu/settings entry remains.
  - `Goals` is the top-level nav entry.
  - Existing simple goals remain usable without forced upgrade.

## Assumptions and Defaults
- Chosen by user:
  - storage foundation = `Goals + Plans`
  - FIRE taxonomy = `Retirement mode`
  - rollout = `Immediate Replace`
  - FIRE migration = `No Migration`
  - v1 scope = `Retirement + Save-Up`
  - legacy simple goals = `Track-Only First`
- Defaults chosen for implementation:
  - `goal_plans.goal_id` is the primary key
  - bundled `cover_image_key` values only in v1
  - save-up compounding = daily compounding
  - contribution timing = end-of-month
  - `at_risk` threshold = 90% to <100% of target at target date
  - `goals_allocation` table name stays unchanged in v1
  - retirement refactor is an **adaptation of existing FIRE code**, not a rewrite
