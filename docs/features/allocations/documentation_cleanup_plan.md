# Documentation Cleanup Plan

**Goal**: Consolidate 20 markdown files into a clean, organized structure with one master file per phase.

**Date**: January 2025
**Status**: ✅ COMPLETED

---

## Final State (4 files + archive/)

```
docs/features/allocations/
├── readme.md                              ✅ Entry point & index
├── phase-3-plan.md                        ✅ Master document (714 lines)
├── phase-2-summary.md                     ✅ Historical reference
├── documentation-cleanup-plan.md          ✅ This file
└── archive/                               ✅ 5 historical docs
    ├── historical-planning-consolidated.md   (NEW - consolidates 5 docs)
    ├── lock-state-persistence.md
    ├── session-end-state.md
    ├── ui-information-architecture.md
    └── readme-old.md
```

**Legend:**
- ✅ All filenames now lowercase
- 📦 Archive reduced from 9 files to 5 files (4 kept + 1 new consolidated)
- 🔄 5 redundant files merged into historical-planning-consolidated.md

---

## Execution Summary

### ✅ Step 1: Main Files Renamed to Lowercase
```bash
DOCUMENTATION_CLEANUP_PLAN.md → documentation-cleanup-plan.md
PHASE_2_SUMMARY.md → phase-2-summary.md
PHASE_3_PLAN.md → phase-3-plan.md
README.md → readme.md
```

### ✅ Step 2: Archive Files Renamed to Lowercase
```bash
LOCK_STATE_PERSISTENCE_IMPLEMENTATION.md → lock-state-persistence.md
SESSION_END_STATE.md → session-end-state.md
UI_INFORMATION_ARCHITECTURE.md → ui-information-architecture.md
README.old.md → readme-old.md
```

### ✅ Step 3: Consolidated 5 Archive Files
Created `historical-planning-consolidated.md` merging:
- allocations_project_spec.md (original project spec)
- conversation_summary.md (design decisions)
- database-schema-fixes.md (schema evolution)
- phase-0-setup-guide.md (implementation guide)
- selected-features-difficulty.md (complexity assessment)

### ✅ Step 4: Deleted Redundant Files from Main Folder
Deleted during earlier cleanup (merged into phase-3-plan.md):
- CURRENT_STATE.md → Superseded by phase-3-plan.md section 9
- IMPLEMENTATION_STATUS.md → Superseded by phase-3-plan.md section 9
- implementation-review.md → Superseded by phase-3-plan.md
- PORTFOLIO__ARCHITECTURE.md → Merged into phase-3-plan.md section 1.3
- MULTI_ACCOUNT_STRATEGY_PROPOSAL.md → Implemented, merged into phase-3-plan.md
- executive-summary.md → Outdated
- QUICK_START.md + quick-start-checklist.md → Duplicates

### ✅ Step 5: Relocated BUILD_TROUBLESHOOTING.md
```bash
docs/features/allocations/BUILD_TROUBLESHOOTING.md → docs/troubleshooting/BUILD_TROUBLESHOOTING.md
```
(Not allocation-specific, belongs in root docs)

### ✅ Step 6: Updated readme.md Links
All internal links updated to use lowercase filenames:
- PHASE_3_PLAN.md → phase-3-plan.md
- PHASE_2_SUMMARY.md → phase-2-summary.md
- README.md → readme.md

---

## Changes Summary

**Before**: 20 files (confusing, overlapping content, mixed case)
**After**: 4 files + 5 archive files (clear, single source of truth, all lowercase)

**Key Improvements**:
1. ✅ **All filenames lowercase** (consistent naming convention)
2. ✅ phase-3.md now includes Portfolio architecture (section 1.3)
3. ✅ Sprint Status tracking in phase-3-plan.md (section 9)
4. ✅ Known Issues documented (section 10)
5. ✅ One master file per phase
6. ✅ **Archive consolidated**: 9 files → 5 files (saved 4 redundant files)
7. ✅ historical-planning-consolidated.md created (single reference for early planning)
8. ✅ Clean readme.md as entry point

**Files Reduction**:
- Main folder: 20 files → 4 files (80% reduction)
- Archive: 9 files → 5 files (44% reduction)
- **Total: 20 files → 9 files (55% reduction)**

---

## Verification Checklist

After cleanup:
- [x] Only 4 files in docs/features/allocations/ (readme, phase-3, phase-2, cleanup-plan)
- [x] archive/ contains 5 files (consolidated + 4 historical)
- [x] phase-3.md has Portfolio section (1.3)
- [x] readme.md updated as index with lowercase links
- [x] No duplicate content
- [x] All links in readme.md work (lowercase)
- [x] phase-2-summary.md untouched (standalone historical reference)
- [x] All filenames are lowercase

---

## Archive Contents

**Consolidated Planning (NEW)**:
- `historical-planning-consolidated.md` — Merges 5 planning documents into single reference

**Implementation History (KEPT)**:
- `lock_state_persistence.md` — Lock state database implementation
- `session_end_state.md` — Sprint 1 completion checkpoint (Jan 21, 2026)
- `ui_information_architecture.md` — Original UI/UX architectural decisions
- `readme-old.md` — Original README before consolidation

**What Was Merged into Consolidated**:
1. allocations_project_spec.md (original spec)
2. conversation_summary.md (design decisions)
3. database-schema-fixes.md (schema evolution)
4. phase-0-setup-guide.md (setup guide)
5. selected-features-difficulty.md (complexity assessment)

---

## Commit Message

```
docs: consolidate and standardize allocations documentation

- Renamed all files to lowercase for consistency
- Consolidated 5 archive planning docs into historical_planning_consolidated.md
- Reduced total files from 20 to 9 (55% reduction)
- Updated all internal links to lowercase
- Archived 5 historical documents (lock_state, session_end, ui_arch, readme-old, consolidated)
- Relocated build_troubleshooting.md to docs/troubleshooting/
```
