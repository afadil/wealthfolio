# Product Requirements Document: Activity Form Refactoring

## 1. Overview

### 1.1 Product Name

Activity Form Refactoring (Wealthfolio v3)

### 1.2 Summary

Refactor the activity form from a 5-tab category-based structure to a
streamlined type picker design with a visual grid for primary activity types and
a dropdown menu for less common types. This is a UI-only refactor with no schema
changes.

### 1.3 Problem Statement

The current activity form uses a 5-tab layout (Trade, Income, Cash, Transfer,
Fee) which:

- Creates cognitive overhead for users choosing where to log activities
- Duplicates form logic across multiple tab components
- Makes mobile adaptation difficult
- Increases maintenance burden with scattered validation logic

### 1.4 Goals

- Simplify activity entry for individual investors manually entering trades
- Reduce form components from 5+ tab-specific forms to a unified architecture
- Improve code maintainability through shared field components
- Establish foundation for future mobile alignment

### 1.5 Non-Goals (Out of Scope)

- Recurring/scheduled activities
- Internationalization (English only)
- Schema/database changes
- Data migration

---

## 2. User Personas

### Primary Persona: Individual Investor

- Manually enters trades and portfolio activities
- Needs quick, intuitive activity logging
- Most frequently uses: BUY, SELL, DEPOSIT, WITHDRAWAL, DIVIDEND
- Less frequently uses: SPLIT, TRANSFER, FEE, INTEREST

---

## 3. Functional Requirements

### 3.1 Activity Type Picker

#### 3.1.1 Visual Grid (Primary Types)

Display as clickable icon/cards in a grid layout: | Type | Icon | Description |
|------|------|-------------| | BUY | TrendUp | Purchase securities | | SELL |
TrendDown | Sell securities | | DEPOSIT | ArrowDownLeft | Add cash to account |
| WITHDRAWAL | ArrowUpRight | Remove cash from account | | DIVIDEND | Coins |
Dividend payment | | TRANSFER | ArrowsLeftRight | Move between accounts |

#### 3.1.2 Dropdown Menu (Secondary Types)

Accessible via "More..." button or dropdown:

- SPLIT (stock split)
- FEE (account/transaction fees)
- INTEREST (interest income)
- TAX (tax payments)

#### 3.1.3 Selection Behavior

- Clicking a type immediately shows the corresponding form
- Selected type is visually highlighted
- Type can be changed at any time (form resets)

### 3.2 Form Architecture

#### 3.2.1 Component Structure

Separate form components per activity type, sharing common field components:

```
components/
  activity-form/
    ActivityTypePicker.tsx       # Grid + dropdown selector
    forms/
      BuyForm.tsx
      SellForm.tsx
      DepositForm.tsx
      WithdrawalForm.tsx
      DividendForm.tsx
      TransferForm.tsx
      SplitForm.tsx
      FeeForm.tsx
      InterestForm.tsx
      TaxForm.tsx

```

#### 3.2.2 Field Mapping by Activity Type

| Field    | BUY       | SELL      | DEPOSIT | WITHDRAWAL | DIVIDEND | TRANSFER     | SPLIT     | FEE | INTEREST | TAX |
| -------- | --------- | --------- | ------- | ---------- | -------- | ------------ | --------- | --- | -------- | --- |
| Account  | ✓         | ✓         | ✓       | ✓          | ✓        | ✓ (from/to)  | ✓         | ✓   | ✓        | ✓   |
| Symbol   | ✓         | ✓         | -       | -          | ✓        | ✓ (optional) | ✓         | -   | -        | -   |
| Date     | ✓         | ✓         | ✓       | ✓          | ✓        | ✓            | ✓         | ✓   | ✓        | ✓   |
| Quantity | ✓         | ✓         | -       | -          | -        | ✓ (optional) | ✓ (ratio) | -   | -        | -   |
| Price    | ✓         | ✓         | -       | -          | -        | -            | -         | -   | -        | -   |
| Amount   | ✓ (total) | ✓ (total) | ✓       | ✓          | ✓        | ✓            | -         | ✓   | ✓        | ✓   |
| Fee      | ✓         | ✓         | -       | -          | -        | -            | -         | -   | -        | -   |
| Notes    | ✓         | ✓         | ✓       | ✓          | ✓        | ✓            | ✓         | ✓   | ✓        | ✓   |

### 3.3 Form Validation

#### 3.3.1 Validation Strategy

- **Trigger**: On blur (field loses focus) + on submit
- **Library**: React Hook Form with schema validation (Zod)
- **Feedback**: Inline field-level error messages

#### 3.3.2 Validation Rules by Field

| Field    | Rules                                                                  |
| -------- | ---------------------------------------------------------------------- |
| Account  | Required                                                               |
| Symbol   | Required (when applicable), must exist in portfolio or be valid ticker |
| Date     | Required, must not be future date                                      |
| Quantity | Required (when applicable), must be positive number                    |
| Price    | Required (when applicable), must be positive number                    |
| Amount   | Required (when applicable), must be positive number                    |
| Fee      | Optional, must be non-negative if provided                             |

#### 3.3.3 Cross-Field Validation

- BUY/SELL: `amount ≈ quantity × price + fee` (show warning if mismatch > 1%)
- TRANSFER: `fromAccount ≠ toAccount`
- SELL: `quantity ≤ current holdings` (warning only, allow override)

### 3.4 Edge Cases

#### 3.4.1 Accounts with No Holdings

- Allow entry for all activity types
- User might add holdings later or enter historical activities
- Symbol search should still function (search all available symbols)

#### 3.4.2 Form Reset on Type Change

- Changing activity type clears all form fields
- No confirmation dialog required

---

## 4. Technical Requirements

### 4.1 Technology Stack

- React with TypeScript
- React Hook Form for form state management
- Zod for schema validation
- Existing Wealthfolio UI component library
- Tauri backend (unchanged)

### 4.2 API Integration

No new API endpoints required. Uses existing activity CRUD operations:

### 4.3 State Management

- Form state: React Hook Form (local)
- Account/portfolio data: Existing query cache
- No global state changes required

---

## 5. Implementation Phases

### Phase 1: Desktop Refactor

1. Create `ActivityTypePicker` component with grid + dropdown
2. Use/adapt shared field components
3. Create individual form components per activity type
4. Integrate with existing activity creation flow
5. Remove old tab-based form components
6. Unit tests for all form components

### Phase 2: Mobile Alignment

1. Responsive adjustments to type picker grid
2. Touch-friendly field components
3. Mobile-specific validation feedback (toast vs inline)

### Phase 3: Polish & Optimization

1. Keyboard navigation support
2. Form autosave/draft functionality (if needed)
3. Performance optimization for symbol search

---

## 6. Testing Requirements

### 6.1 Unit Tests

- Each form component renders correctly
- Validation rules trigger on blur
- Form submission with valid data succeeds
- Form submission with invalid data shows errors
- Setup vitest if not yet done

### 6.2 Integration Tests

- Activity type selection shows correct form
- Form data correctly maps to API payload
- Created activity appears in activity list

### 6.3 Browser Testing (dev:web)

**Happy Path Scenarios:**

1. Create BUY activity with all required fields
2. Create SELL activity with all required fields
3. Create DEPOSIT activity
4. Create WITHDRAWAL activity
5. Create DIVIDEND activity
6. Create TRANSFER between two accounts
7. Create activity using "More" dropdown types

**Validation Error Scenarios:**

1. Submit form with missing required fields
2. Enter invalid date (future date)
3. Enter negative quantity/amount
4. Transfer to same account
5. Sell more than holdings (warning behavior)

### 6.4 Test Commands

```bash
# Run unit tests
pnpm run test

# Start dev server for browser testing
pnpm run dev:web
# Then navigate to http://localhost:1420
```

---

## 7. Success Metrics

| Metric                     | Target                         |
| -------------------------- | ------------------------------ |
| Form components reduced    | From 5+ to shared architecture |
| Code duplication           | < 10% between form components  |
| Test coverage              | > 80% for form logic           |
| All browser test scenarios | Pass                           |

---

## 8. UI/UX Specifications

### 8.1 Type Picker Layout

```
┌─────────────────────────────────────────────────┐
│  Select Activity Type                           │
├─────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │   ↑     │ │   ↓     │ │   ↙     │           │
│  │  BUY    │ │  SELL   │ │ DEPOSIT │           │
│  └─────────┘ └─────────┘ └─────────┘           │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │   ↗     │ │   ◉     │ │   ↔     │           │
│  │WITHDRAW │ │DIVIDEND │ │TRANSFER │           │
│  └─────────┘ └─────────┘ └─────────┘           │
│                                                 │
│  [ More ▾ ]  ← Dropdown for SPLIT, FEE, etc.   │
└─────────────────────────────────────────────────┘
```

### 8.2 Form Layout (Example: BUY)

```
┌─────────────────────────────────────────────────┐
│  BUY                                    [Back]  │
├─────────────────────────────────────────────────┤
│  Account *                                      │
│  ┌─────────────────────────────────────────┐   │
│  │ Select account...                    ▾  │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Symbol *                                       │
│  ┌─────────────────────────────────────────┐   │
│  │ Search symbol...                        │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Date *                    Quantity *           │
│  ┌──────────────────┐     ┌──────────────────┐ │
│  │ 2026-01-13    📅 │     │ 0               │ │
│  └──────────────────┘     └──────────────────┘ │
│                                                 │
│  Price *                   Total Amount         │
│  ┌──────────────────┐     ┌──────────────────┐ │
│  │ 0.00             │     │ 0.00 (calculated)│ │
│  └──────────────────┘     └──────────────────┘ │
│                                                 │
│  Fee (optional)                                 │
│  ┌─────────────────────────────────────────┐   │
│  │ 0.00                                    │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  Notes                                          │
│  ┌─────────────────────────────────────────┐   │
│  │                                         │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│                              [Cancel]  [Save]   │
└─────────────────────────────────────────────────┘
```

---

## 9. Dependencies

| Dependency             | Status   | Notes                   |
| ---------------------- | -------- | ----------------------- |
| React Hook Form        | Existing | Already in project      |
| Zod                    | Existing | Already in project      |
| Phosphor Icons         | Existing | For activity type icons |
| Account/Portfolio APIs | Existing | No changes needed       |

---

## 10. Risks & Mitigations

| Risk                               | Impact | Mitigation                              |
| ---------------------------------- | ------ | --------------------------------------- |
| Breaking existing activity editing | High   | Thorough testing of edit flows          |
| Performance with many symbols      | Medium | Debounced symbol search                 |
| User confusion with new layout     | Medium | Clear visual hierarchy, intuitive icons |

---

## 11. Appendix

### A. Activity Type Definitions

Reference: `src-core/src/activities/activity_model.rs`

### B. Related Files

- Current forms: `src-front/pages/activity/components/`
- Activity service: `src-core/src/activities/`
- UI components: `src-front/components/ui/`

### C. Reference Spec

See: `docs/specs/activity-form-spec.md`
