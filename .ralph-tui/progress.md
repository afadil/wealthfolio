# Ralph Progress Log

This file tracks progress across iterations. It's automatically updated
after each iteration and included in agent prompts for context.

---

## ✓ Iteration 1 - US-018: Activities Advanced Options
*2026-01-13T18:34:37.622Z (553s)*

**Status:** Completed

**Notes:**
with currency only (no subtypes)\n- **WithdrawalForm** - with currency only (no subtypes)\n- **SplitForm** - with currency + subtype (STOCK_DIVIDEND, REVERSE_SPLIT)\n- **TransferForm** - with currency + subtype (OPENING_POSITION)\n\n### Acceptance Criteria Met\n- ✅ User can toggle advanced options and change the currency\n- ✅ Default currency order: asset currency, account currency, base currency\n- ✅ User can select subtype adapted to the activity type (based on `SUBTYPES_BY_ACTIVITY_TYPE`)\n\n

---
## ✓ Iteration 2 - US-019: Keyboard navigation support
*2026-01-13T18:38:16.944Z (218s)*

**Status:** Completed

**Notes:**
Home/End keys to jump to first/last option\n  - Added `aria-pressed` attribute for screen reader support\n  - Added `role=\"group\"` with `aria-label` for proper accessibility grouping\n  - The dropdown menu for secondary types (Split, Fee, Interest, Tax) already had full keyboard support via Radix DropdownMenu\n\n### Changes Made\n\n- `src-front/pages/activity/components/activity-type-picker.tsx:42-87` - Added keyboard navigation handler with arrow keys support and refs for focus management\n\n

---
