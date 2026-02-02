# Asset Creation Architecture Fix Plan

## Purpose
Provide a comprehensive, actionable plan to address the issues raised in the review and improve asset creation consistency, safety, and maintainability across all entry points.

## Assumptions
- The plan is scoped to the existing codebase and avoids new product features.
- Changes should be incremental and minimize risk to existing workflows.
- Backward compatibility for existing asset IDs must be preserved (no breaking migrations without explicit steps).

## Goals (Verifiable)
- Remove the `dryRun` flag and legacy validation side effects entirely.
- Make validation strictly read-only across all callers.
- Eliminate `SEC:*:UNKNOWN` duplication and placeholder asset collisions.
- Standardize exchange MIC handling and normalization in all asset creation paths.
- Ensure asset creation emits consistent domain events.
- Align broker sync behavior with core asset creation rules.

## Plan (Phased)

### Phase 0 — Baseline & Safety (No functional change yet)
1. **Inventory current behaviors and consumers**
   - Confirm all callers of the activity import validation endpoint and where `dryRun` is passed today.
   - Files to inspect:
     - `/workspace/wealthfolio/src-server/src/api/activities.rs`
     - `/workspace/wealthfolio/src-front/pages/activity/import/steps/review-step.tsx`
     - `/workspace/wealthfolio/src-front/addons/addons-runtime-context.ts`

2. **Add/confirm coverage for critical behaviors**
   - Add unit tests for:
     - Exchange MIC normalization (`None` vs empty string).
     - `SEC:*:UNKNOWN` merge behavior once implemented.
     - Alternative asset ID validation including `PEQ` prefix.
   - Suggested locations:
     - `/workspace/wealthfolio/crates/core/src/assets/asset_id.rs`
     - `/workspace/wealthfolio/crates/core/src/portfolio/snapshot/snapshot_service_tests.rs`

**Verification:** Tests for new edge cases fail before the fix, pass after.

---

### Phase 1 — Validation Endpoint Safety (High Priority)
1. **Remove `dryRun` and legacy behavior**
   - Delete the `dryRun` parameter from request/handler types and adapters.
   - Remove the legacy branch that creates assets/FX pairs during validation.
   - Files:
     - `/workspace/wealthfolio/src-server/src/api/activities.rs`
     - `/workspace/wealthfolio/crates/core/src/activities/activities_service.rs`
     - `/workspace/wealthfolio/src-front/adapters/shared/activities.ts`
     - `/workspace/wealthfolio/src-front/pages/activity/import/steps/review-step.tsx`
     - `/workspace/wealthfolio/src-front/addons/addons-runtime-context.ts`

2. **Clarify contract in shared adapter docs/comments**
   - Update comments to state validation is always read-only.
   - File: `/workspace/wealthfolio/src-front/adapters/shared/activities.ts`.

**Verification:** Manual audit that `check_activities_import` never creates assets/FX pairs and accepts no `dryRun` flag.

---

### Phase 2 — Exchange MIC Normalization & Unknown Asset Dedup (High Priority)
1. **Normalize empty MICs to `None`**
   - Ensure any empty string MIC is treated as `None` before `canonical_asset_id` generation.
   - Targets:
     - `/workspace/wealthfolio/crates/core/src/assets/asset_id.rs`
     - `/workspace/wealthfolio/crates/core/src/activities/activities_service.rs`
     - `/workspace/wealthfolio/crates/core/src/portfolio/snapshot/manual_snapshot_service.rs`
     - `/workspace/wealthfolio/crates/connect/src/broker/service.rs`

2. **Introduce deterministic merge path for `SEC:*:UNKNOWN`**
   - When a canonical ID with a known MIC is created and an `UNKNOWN` asset exists for the same symbol+currency, migrate/merge:
     - Update existing activities to point to the resolved asset.
     - Deactivate the `UNKNOWN` asset (or mark hidden) after migration.
   - Implement in core asset or activity service so it is reused by all paths.
   - Files likely impacted:
     - `/workspace/wealthfolio/crates/core/src/assets/assets_service.rs`
     - `/workspace/wealthfolio/crates/core/src/activities/activities_service.rs`
     - `/workspace/wealthfolio/crates/storage-sqlite/src/assets/repository.rs`

3. **Broker sync placeholder fix**
   - When broker activities lack a symbol or resolvable MIC, skip asset creation and set:
     - `asset_id = NULL` (already allowed by schema) and
     - `needs_review = 1` with raw symbol metadata for UI remediation.
   - **No foreign key removal required**: `activities.asset_id` is nullable and uses `ON DELETE SET NULL` per the core schema redesign migration.
   - File: `/workspace/wealthfolio/crates/connect/src/broker/service.rs`.

**Verification:** Import/broker sync no longer collapses multiple unknown symbols into a single asset; existing `UNKNOWN` assets are merged when MIC is resolved.

---

### Phase 3 — Broker Sync Consistency (High Priority)
1. **Acknowledge current behavior (issue confirmation)**
   - Broker sync bypasses the core service layer and writes assets/activities directly to SQLite.
   - This is a confirmed source of inconsistencies (taxonomy assignment, event emission, metadata refresh).
   - File: `/workspace/wealthfolio/crates/connect/src/broker/service.rs`.

2. **Route broker asset creation through core service**
   - Introduce a bulk-safe API in `AssetService` for broker sync that:
     - Normalizes MIC
     - Ensures taxonomy assignment for cash assets
     - Emits domain events consistently
   - Replace direct `AssetDB` insert usage in:
     - `/workspace/wealthfolio/crates/connect/src/broker/service.rs`.

3. **Upgrade asset upsert policy**
   - Change `ON CONFLICT DO NOTHING` for assets to `DO UPDATE` (safe fields only) to refresh symbol/name/metadata from broker.
   - Ensure user-editable fields are not overwritten.
   - File: `/workspace/wealthfolio/crates/connect/src/broker/service.rs`.

**Verification:** Broker sync updates asset metadata when new info arrives and cash assets get taxonomy assignment.

---

### Phase 4 — Alternative Assets & FX Event Consistency (Medium Priority)
1. **Emit creation events for alternative assets and FX assets**
   - Alternative assets currently do not emit `assets_created`.
   - FX asset creation should also emit asset creation to trigger enrichment/refresh workflows.
   - Files:
     - `/workspace/wealthfolio/crates/core/src/assets/alternative_assets_service.rs`
     - `/workspace/wealthfolio/crates/storage-sqlite/src/fx/repository.rs`

2. **Update alternative asset ID validation**
   - Include `PEQ` in the alternative asset ID regex validation.
   - File: `/workspace/wealthfolio/crates/core/src/assets/asset_id.rs`.

**Verification:** Creation paths emit events, and `PEQ` assets validate correctly.

---

### Phase 5 — Optional Improvements (Low Priority)
1. **Persist symbol → MIC resolution cache**
   - Add a small table to cache resolved MICs to avoid repeated lookups in imports.
   - Files:
     - `/workspace/wealthfolio/crates/storage-sqlite/src/assets/` (new repo)
     - `/workspace/wealthfolio/crates/core/src/assets/assets_service.rs`

2. **Log warnings for invalid pricing mode hints**
   - File: `/workspace/wealthfolio/crates/core/src/assets/assets_service.rs`.

**Verification:** Cache hits reduce quote service queries; invalid hints are visible in logs.

---

## Risk Notes
- Any change to asset ID generation must preserve existing IDs and references.
- Broker sync changes must not break the “skip user-modified activities” logic.
- Migrations for unknown assets require careful testing to avoid data loss.

## Deliverables
- Implementation PRs aligned to each phase.
- Migration script or one-time job for `SEC:*:UNKNOWN` merges.
- Updated tests covering MIC normalization, alternative asset ID validation, and validation endpoint behavior.

## Impact Analysis (Removing `dryRun` and legacy behavior)
- **Frontend import UI:** remove `dryRun` from requests and update any UI copy that implies side effects.
- **Add-ons and external callers:** remove or ignore `dryRun` usage; validation becomes a guaranteed read-only call.
- **Core service:** delete legacy branch that creates assets and registers FX pairs during validation.
- **Test updates:** adjust any tests or fixtures that expect validation to create assets/FX pairs.

## Migration Notes
- Start from `/workspace/wealthfolio/crates/storage-sqlite/migrations/2026-01-01-000001_core_schema_redesign` for any data migration that touches asset IDs or activity foreign keys.
- The schema already allows `activities.asset_id` to be NULL with `ON DELETE SET NULL`, so broker sync can safely omit `asset_id` for unresolved symbols without schema changes.

## Verification Checklist
- [ ] Validation endpoint never creates assets/FX pairs and no longer accepts `dryRun`.
- [ ] `SEC:*:UNKNOWN` duplicates are prevented or merged.
- [ ] Broker sync does not collapse unrelated assets into a single placeholder.
- [ ] Alternative asset and FX creation emit consistent events.
- [ ] Tests added for normalization and validation edge cases.
