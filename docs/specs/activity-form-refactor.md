# Activity Form Refactoring Spec

## Executive Summary

Refactor the activity form from a **5-tab category-based structure** to a **frequency-based type picker** with unified Transfer handling and progressive disclosure. The goal is to reduce cognitive load, match broker export semantics, and optimize for common workflows while keeping power-user features accessible.

---

## Current State Analysis

### Existing Structure
```
ActivityForm (Sheet)
├── Tabs: Trade | Holdings | Cash | Income | Other
├── Trade → Buy/Sell + symbol + quantity + price + fee
├── Holdings → Add/Remove position (TRANSFER_IN/OUT with is_external=true)
├── Cash → Deposit/Withdrawal/Transfer (cash between accounts)
├── Income → Dividend/Interest
└── Other → Split/Fee/Tax
```

### Problems Identified
1. **Mode proliferation**: 5 tabs with sub-modes inside each
2. **Duplicate concepts**: "Transfer" in both Cash and Holdings tabs
3. **Equal treatment**: Rare events (Split) treated same as frequent ones (Buy)
4. **Static layout**: All fields visible regardless of context
5. **Manual pricing confusion**: Checkbox when it should be inferred from asset type

---

## Target Architecture

### Type Visibility (Frequency-Based)

**Primary Types (6 visible buttons):**
| Type | Icon | Form Required |
|------|------|---------------|
| Buy | ArrowDown | Symbol, Quantity, Price, Fee |
| Sell | ArrowUp | Symbol, Quantity, Price, Fee |
| Dividend | Income | Symbol, Amount, (Subtype) |
| Interest | Percent | Amount, (Symbol optional) |
| Deposit | Plus | Amount |
| Withdrawal | Minus | Amount |

**"More" Dropdown (4 items):**
| Type | Form Required |
|------|---------------|
| Transfer | From/To dropdowns, Amount or Symbol+Quantity |
| Split | Symbol, Split Ratio |
| Fee | Amount, (Symbol optional) |
| Tax | Amount, (Symbol optional) |

### Desktop Flow (Inline Type Picker)

```
┌─────────────────────────────────────────────────────────┐
│ Add Activity                                       [X]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [Buy] [Sell] [Dividend] [Interest] [Deposit] [Withdraw]│
│                                              [More ▼]   │
│                                                         │
│  ─────────────────────────────────────────────────────  │
│                                                         │
│  [Contextual form fields load here based on type]       │
│                                                         │
│  ┌─ Advanced ──────────────────────────────────────┐    │
│  │ FX Rate: [____]  Subtype: [________▼]           │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Total: $8,116.50                                       │
│                                                         │
│                            [Cancel]  [Add Activity]     │
└─────────────────────────────────────────────────────────┘
```

### Edit Mode Flow

When editing an existing activity:
- Skip type selection entirely
- Show type badge at top (non-interactive, provides context)
- Load directly into detail form with fields populated

```
┌─────────────────────────────────────────────────────────┐
│ Edit Activity                                      [X]  │
├─────────────────────────────────────────────────────────┤
│  [Buy Badge]                                            │
│                                                         │
│  [Pre-populated form fields]                            │
│                                                         │
│                            [Cancel]  [Update Activity]  │
└─────────────────────────────────────────────────────────┘
```

### Mobile Flow

Keep existing stepped wizard pattern but apply same type organization:
- Step 1: Type selection (6 primary + "More" for 4 additional)
- Step 2: Contextual detail form
- Apply same visual grouping as desktop

---

## Unified Transfer Design

### Mental Model
Replace separate "Cash Transfer" and "Holdings Transfer" with single **Transfer** action using Source/Destination model.

### UI Components
```
From: [Account Dropdown ▼ | External]
To:   [Account Dropdown ▼ | External]
What: [Cash ○ | Asset ○]

If Cash:  Amount: [____]
If Asset: Symbol: [____]  Quantity: [____]
```

### Valid Combinations
| From | To | Backend Mapping | Use Case |
|------|-----|-----------------|----------|
| Account A | Account B | TRANSFER_OUT (A) + TRANSFER_IN (B) | Move between accounts |
| External | Account | TRANSFER_IN with `is_external=true` | Add holdings (migration) |
| Account | External | TRANSFER_OUT with `is_external=true` | Remove holdings |
| External | External | **DISABLED** | Invalid |

### Implementation Notes
- Keep paired record creation for Account→Account (preserves audit trail per account)
- `is_external` flag in metadata determines if it affects net_contribution
- UI shows as single transfer, backend creates appropriate records

---

## Form Field Tiers

### Essential Fields (Always Visible)
| Activity Type | Fields |
|---------------|--------|
| Buy/Sell | Account, Symbol, Quantity, Price, Fee, Date |
| Dividend | Account, Symbol, Amount, Date |
| Interest | Account, Amount, Date, (Symbol optional) |
| Deposit/Withdrawal | Account, Amount, Date |
| Transfer | From, To, What, Amount/Quantity, Date |
| Split | Account, Symbol, Split Ratio, Date |
| Fee/Tax | Account, Amount, Date, (Symbol optional) |

### Advanced Section (Collapsible)
- **FX Rate**: Show when currency differs from account currency
- **Subtype**: Show contextually for types that have subtypes
- **Notes/Comment**: User notes field

### Fields Removed
- **Manual Pricing checkbox**: Inferred from "Create custom asset" in symbol search
- **Show Currency Select checkbox**: Replace with smart detection

### Subtype Visibility Rules
| Type | Subtypes Available | Show When |
|------|-------------------|-----------|
| Dividend | DRIP, QUALIFIED, ORDINARY, RETURN_OF_CAPITAL | Always show for Dividend |
| Interest | STAKING_REWARD, LENDING_INTEREST, COUPON | Always show for Interest |
| Split | STOCK_DIVIDEND, REVERSE_SPLIT | Always show for Split |
| Buy/Sell | OPTION_ASSIGNMENT, OPTION_EXERCISE | Only in Advanced |
| Fee | MANAGEMENT_FEE, ADR_FEE | Only in Advanced |
| Tax | WITHHOLDING, NRA_WITHHOLDING | Only in Advanced |

---

## Computed Fields

### Trade Total Display
For Buy/Sell activities, show computed total below form fields:

```
Shares: [50]  Price: [$162.30]  Fee: [$1.50]

Total: $8,116.50
```

- Display format: Just the total number (no formula breakdown)
- Update in real-time as user types
- Formula: `(quantity * unitPrice) + fee` for Buy, `(quantity * unitPrice) - fee` for Sell

---

## Validation Strategy

### Approach: Advisory Only
- Cash balance warnings remain advisory (show warning, allow submission)
- User might have information system doesn't (pending deposit, etc.)
- No hard blocks on form submission

### Schema Independence
- Form validation schemas can diverge from import schemas
- Form: Stricter, UX-optimized validation
- Import: More lenient, accepts varied formats

---

## Technical Constraints

### Must Preserve
- Backend `ActivityCreate` / `ActivityUpdate` payload structure
- Existing activity type enum values
- Paired record creation for transfers
- `metadata.flow.is_external` flag semantics

### Can Change
- Frontend form components and structure
- Validation schemas (form-specific)
- Default values (date now defaults to current time)
- UI organization and field visibility

---

## Component Architecture

### Keep Separate Implementations
```
src/pages/activity/components/
├── activity-form.tsx          # Desktop: Sheet with inline type picker
├── mobile-forms/
│   └── mobile-activity-form.tsx  # Mobile: Stepped wizard
├── forms/
│   ├── trade-form.tsx         # Buy/Sell fields
│   ├── income-form.tsx        # Dividend/Interest fields
│   ├── cash-form.tsx          # Deposit/Withdrawal fields
│   ├── transfer-form.tsx      # NEW: Unified transfer form
│   ├── split-form.tsx         # NEW: Dedicated split form
│   ├── fee-form.tsx           # NEW: Dedicated fee form
│   ├── tax-form.tsx           # NEW: Dedicated tax form
│   └── common.tsx             # Shared field components
```

### New Components Needed
1. **ActivityTypePicker**: Primary buttons + "More" dropdown
2. **TransferForm**: Unified transfer with From/To/What
3. **SplitForm**: Dedicated split ratio form
4. **FeeForm**: Dedicated fee/charge form
5. **TaxForm**: Dedicated tax form
6. **ComputedTotal**: Real-time total display
7. **AdvancedSection**: Collapsible FX/Subtype fields
8. **TypeBadge**: Non-interactive type indicator for edit mode

---

## Default Values

| Field | Current Default | New Default |
|-------|-----------------|-------------|
| Date/Time | 4:00 PM (market close) | Current time |
| Account | First if only one | First if only one |
| Fee | 0 | 0 |
| FX Rate | null | null (auto-detect) |
| Subtype | null | null |

---

## Migration Path

### Phase 1: Desktop Refactor
1. Create ActivityTypePicker component
2. Refactor main activity-form.tsx to use inline type picker
3. Create dedicated forms for Split, Fee, Tax
4. Implement unified TransferForm
5. Add ComputedTotal component
6. Implement AdvancedSection collapsible

### Phase 2: Mobile Alignment
1. Update mobile type selection to match desktop grouping
2. Apply same 6 primary + 4 "More" organization
3. Visual polish and consistency

### Phase 3: Cleanup
1. Remove Holdings tab (merged into Transfer)
2. Remove Manual Pricing checkbox
3. Remove old tab-based structure
4. Update tests

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Flat vs grouped types? | Frequency-based (6 primary + More) |
| Transfer unification? | Yes, single Transfer with From/To model |
| Progressive disclosure? | Yes, Essential + collapsible Advanced |
| Desktop flow? | Inline type picker in Sheet (not wizard) |
| Mobile flow? | Keep stepped wizard, apply same type grouping |
| Edit flow? | Direct to details, show type badge |
| Manual pricing? | Remove checkbox, infer from custom asset |
| Computed total? | Yes, show just the number |
| Validation? | Advisory only |
| Paired transfer records? | Keep (audit trail) |
| Default time? | Current time |

---

## Success Metrics

1. **Reduced clicks**: Common flows (Buy, Deposit) require fewer interactions
2. **Mental model alignment**: Type picker matches broker export categories
3. **Power user efficiency**: Advanced features accessible but not blocking
4. **Consistency**: Desktop and mobile use same type organization
5. **Maintainability**: Distinct forms per type easier to evolve

---

## Appendix: Activity Type Reference

| Type | Category | Frequency | Primary/More |
|------|----------|-----------|--------------|
| BUY | Trade | High | Primary |
| SELL | Trade | High | Primary |
| DIVIDEND | Income | High | Primary |
| INTEREST | Income | Medium | Primary |
| DEPOSIT | Cash | High | Primary |
| WITHDRAWAL | Cash | Medium | Primary |
| TRANSFER_IN | Transfer | Low | More |
| TRANSFER_OUT | Transfer | Low | More |
| SPLIT | Adjustment | Rare | More |
| FEE | Adjustment | Low | More |
| TAX | Adjustment | Low | More |
