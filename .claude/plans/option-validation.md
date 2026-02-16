# Plan: Validate OCC Option Symbol Before Creating Activity

## Goal
When a user clicks "Add Transaction" for an option, validate that the OCC symbol exists on Yahoo Finance. If not found, show a warning dialog letting them choose to continue anyway or go back and fix the input.

## Approach

### User Flow
1. User fills in option details (underlying, expiration, strike, call/put)
2. User clicks "Add Transaction"
3. System builds OCC symbol and checks Yahoo
4. **If found:** Proceed normally, create asset and activity
5. **If not found:** Show warning dialog:
   - "Option symbol MU270115C00550000 was not found on Yahoo Finance. This may mean the expiration date or strike price doesn't exist for this underlying."
   - Two buttons: "Go Back" (cancel) and "Add Anyway" (proceed)

### Implementation

#### 1. Backend: Add option symbol validation endpoint

**File:** `src-server/src/api/market_data.rs`

Add new endpoint: `GET /api/v1/market-data/validate-symbol?symbol=<OCC_SYMBOL>`

- Calls Yahoo provider to fetch a quote for the symbol
- Returns `{ exists: boolean, quote?: QuoteSummary }`
- If Yahoo returns data, `exists: true`
- If Yahoo returns "Not Found" error, `exists: false`

This is simpler than fetching full option chains - just check if the specific symbol returns data.

#### 2. Backend: Implement in market data service

**File:** `src-core/src/market_data/market_data_service.rs`

Add method: `validate_symbol(symbol: &str) -> Result<bool>`

- Use existing Yahoo provider infrastructure
- Make a simple quote request for the symbol
- Return true if quote data returned, false if not found

#### 3. Frontend: Add validation command

**File:** `src/commands/market-data.ts`

Add function:
```typescript
export async function validateSymbol(symbol: string): Promise<boolean>
```

Calls the new backend endpoint.

#### 4. Frontend: Add web adapter route

**File:** `src/adapters/web.ts`

Add route mapping for `validate_symbol` → `GET /market-data/validate-symbol`

#### 5. Frontend: Add warning dialog component

**File:** `src/pages/activity/components/option-validation-dialog.tsx` (new)

Simple alert dialog with:
- Warning icon
- Message explaining the symbol wasn't found
- "Go Back" button (closes dialog, returns to form)
- "Add Anyway" button (proceeds with submission)

#### 6. Frontend: Integrate validation into form submission

**File:** `src/pages/activity/activity-manager-page.tsx`

Modify `onSubmit` handler for option activities:

```typescript
// After building occSymbol, before upsertAsset:
if (isOptionActivity(submitData.activityType)) {
  const exists = await validateSymbol(occSymbol);
  if (!exists) {
    // Show dialog and wait for user decision
    const proceed = await showValidationWarning(occSymbol);
    if (!proceed) {
      return; // User chose to go back
    }
  }
}
// Continue with upsertAsset and activity creation
```

#### 7. State management for dialog

Use React state in activity-manager-page.tsx:
- `validationWarning: { show: boolean, symbol: string, resolve?: (proceed: boolean) => void }`
- Dialog calls resolve(true) for "Add Anyway", resolve(false) for "Go Back"

### Files to Change

| File | Change |
|------|--------|
| `src-core/src/market_data/market_data_service.rs` | Add `validate_symbol` method |
| `src-core/src/market_data/market_data_service_trait.rs` | Add trait method signature |
| `src-server/src/api/market_data.rs` | Add `/validate-symbol` endpoint |
| `src/commands/market-data.ts` | Add `validateSymbol` function |
| `src/adapters/web.ts` | Add route mapping |
| `src/adapters/tauri.ts` | Add Tauri command mapping (if needed) |
| `src/pages/activity/components/option-validation-dialog.tsx` | New dialog component |
| `src/pages/activity/activity-manager-page.tsx` | Add validation call and dialog state |
| `src/pages/activity/components/activity-form.tsx` | Same changes (duplicate form) |

### Testing

1. Add option with valid OCC symbol → should proceed without warning
2. Add option with invalid expiration date → should show warning
3. Add option with invalid strike → should show warning
4. Click "Go Back" → should return to form with data intact
5. Click "Add Anyway" → should create the option despite warning

### Edge Cases

- Network error during validation → Proceed without warning (don't block on validation failure)
- Slow validation → Show loading state on submit button
- User rapidly clicks submit → Debounce/disable button during validation
