# Record Activity Tool Specification

Natural language transaction recording via AI chat.

## Overview

New `record_activity` tool enables users to record transactions conversationally (e.g., "Buy 20 AAPL at 240 yesterday"). Returns editable draft preview; user confirms via UI button.

## Design Decisions

| Decision | Choice |
|----------|--------|
| Tool model | Single tool + UI confirm (no LLM involvement in submit) |
| Account ambiguity | LLM asks for clarification + UI dropdown in preview |
| Edit mode | Inline editing in card using existing activity form controls |
| Asset lookup | Rust tool validates and resolves symbol → asset_id |
| Symbol collision | Auto-pick exchange matching user's base currency |
| Date parsing | LLM parses relative dates → ISO format |
| Missing fields | Return partial draft; user fills in UI or chats for new draft |
| Post-submit UX | Success badge + summary + "View in Activities" link |
| Activity types | All 15 types supported |
| Batch input | Single activity per call; LLM makes multiple calls for batch |
| Currency | Use asset's native currency |
| Tool name | `record_activity` |
| Submit error | Inline error below card + keep draft editable for retry |
| Price fetching | Auto-fetch historical price when qty provided but price missing |
| State persistence | Update tool result in DB with created_activity_id |
| Undo capability | No undo in chat; link to Activities page only |

---

## Backend (Rust)

### Tool: `record_activity`

**Location:** `crates/ai/src/tools/record_activity.rs`

#### Args Schema (LLM input)

```rust
#[derive(Deserialize, JsonSchema)]
pub struct RecordActivityArgs {
    /// Activity type: BUY, SELL, DIVIDEND, DEPOSIT, WITHDRAWAL, TRANSFER_IN,
    /// TRANSFER_OUT, INTEREST, FEE, SPLIT, TAX, etc.
    pub activity_type: String,

    /// Symbol (e.g., "AAPL", "BTC"). Required for trading activities.
    pub symbol: Option<String>,

    /// ISO 8601 date (e.g., "2026-01-17"). LLM converts "yesterday" → ISO.
    pub activity_date: String,

    /// Number of shares/units. Required for BUY/SELL.
    pub quantity: Option<f64>,

    /// Price per unit. If omitted, tool fetches historical price.
    pub unit_price: Option<f64>,

    /// Total amount. For DEPOSIT/WITHDRAWAL/DIVIDEND/etc.
    pub amount: Option<f64>,

    /// Transaction fee.
    pub fee: Option<f64>,

    /// Account name or ID. If ambiguous/missing, tool returns available accounts.
    pub account: Option<String>,

    /// Activity subtype: DRIP, QUALIFIED, STAKING_REWARD, etc.
    pub subtype: Option<String>,

    /// Optional notes.
    pub notes: Option<String>,
}
```

#### Output Schema (to frontend)

```rust
#[derive(Serialize)]
pub struct RecordActivityOutput {
    /// Draft preview data
    pub draft: ActivityDraft,

    /// Validation status
    pub validation: ValidationResult,

    /// Available accounts (for dropdown)
    pub available_accounts: Vec<AccountOption>,

    /// Resolved asset info (if symbol provided)
    pub resolved_asset: Option<ResolvedAsset>,

    /// Available subtypes for this activity type (for dropdown)
    pub available_subtypes: Vec<SubtypeOption>,
}

#[derive(Serialize)]
pub struct SubtypeOption {
    pub value: String,        // e.g., "DRIP"
    pub label: String,        // e.g., "Dividend Reinvested"
}

#[derive(Serialize)]
pub struct ActivityDraft {
    pub activity_type: String,
    pub activity_date: String,            // ISO 8601
    pub symbol: Option<String>,
    pub asset_id: Option<String>,         // Resolved canonical ID (e.g., "SEC:AAPL:XNAS")
    pub asset_name: Option<String>,       // Display name
    pub quantity: Option<f64>,
    pub unit_price: Option<f64>,
    pub amount: Option<f64>,              // Computed or provided
    pub fee: Option<f64>,
    pub currency: String,                 // From asset or account
    pub account_id: Option<String>,       // Resolved account ID
    pub account_name: Option<String>,     // Display name
    pub subtype: Option<String>,          // Activity subtype
    pub notes: Option<String>,

    /// Price source: "user", "historical", "none"
    pub price_source: String,

    /// Pricing mode: "MARKET" or "MANUAL"
    pub pricing_mode: String,

    /// True if asset not found and needs custom creation
    pub is_custom_asset: bool,

    /// Asset kind for custom assets: "SECURITY", "CRYPTO", "OTHER"
    pub asset_kind: Option<String>,
}

#[derive(Serialize)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub missing_fields: Vec<String>,      // ["account_id", "quantity"]
    pub errors: Vec<ValidationError>,     // Semantic errors
}

#[derive(Serialize)]
pub struct ValidationError {
    pub field: String,
    pub message: String,
}

#[derive(Serialize)]
pub struct AccountOption {
    pub id: String,
    pub name: String,
    pub currency: String,
}

#[derive(Serialize)]
pub struct ResolvedAsset {
    pub asset_id: String,                 // e.g., "SEC:AAPL:XNAS"
    pub symbol: String,
    pub name: String,
    pub currency: String,
    pub exchange: Option<String>,
}
```

#### Tool Logic

1. **Parse activity_type** → validate against 15 canonical types
2. **Resolve account** (if provided):
   - Match by ID or fuzzy name match
   - If ambiguous → return all accounts, `account_id: None`
   - If not found → error in `validation.errors`
3. **Resolve asset** (if symbol provided):
   - Query market data service for symbol
   - If multiple matches → pick by user's base currency preference
   - If not found → error in `validation.errors`
   - Extract native currency from asset
4. **Fetch price** (if quantity provided, price missing, asset resolved):
   - Query historical price for `activity_date`
   - Set `price_source: "historical"`
   - If fetch fails → leave price null, `price_source: "none"`
5. **Compute amount** (if not provided):
   - `amount = quantity × unit_price + fee`
6. **Validate required fields** based on activity_type:
   - BUY/SELL: quantity, unit_price (or amount), account_id, asset
   - DEPOSIT/WITHDRAWAL: amount, account_id
   - DIVIDEND: amount OR (quantity × unit_price), account_id, asset
   - etc.
7. **Return output** with draft, validation, accounts list

---

## Frontend (React)

### Tool UI Component

**Location:** `src-front/features/ai-assistant/components/tool-uis/record-activity-tool-ui.tsx`

#### States

1. **Loading** - Skeleton while tool executes
2. **Draft** - Editable preview with validation indicators
3. **Submitting** - Disabled inputs, spinner on button
4. **Success** - Checkmark badge, summary, "View" link
5. **Error** - Inline error message, draft still editable

#### Draft State UI

```
┌─────────────────────────────────────────────────────┐
│ 📝 Record Activity                                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Type:     [BUY ▾]           Date: [📅 2026-01-17] │
│                                                     │
│  Account:  [Brokerage ▾]     ⚠️ Required           │
│                                                     │
│  Asset:    [🔍 AAPL - Apple Inc.]                  │
│            └─ ⚠️ Not found. [Create custom asset]   │  ← shown if is_custom_asset
│                                                     │
│  Quantity: [20        ]      Price: [$240.00    ]  │
│                               └─ Historical price   │
│                                                     │
│  Fee:      [$0.00     ]      Total: $4,800.00      │
│                                                     │
│  ▸ Advanced Options                                 │  ← collapsible
│    Subtype: [None ▾]                               │
│    Notes:   [                                    ]  │
│                                                     │
├─────────────────────────────────────────────────────┤
│                              [Cancel]  [✓ Confirm]  │
└─────────────────────────────────────────────────────┘
```

**Custom Asset Inline Creation** (when "Create custom asset" clicked):
```
│  Asset:    [MYCOIN            ]                    │
│            Kind: [CRYPTO ▾]  Currency: [USD ▾]     │
│            Name: [My Custom Coin              ]    │
```

#### Field Components (reuse existing)

- **Type**: `ActivityTypeSelect` (existing dropdown)
- **Date**: `DatePicker` (existing)
- **Account**: `AccountSelect` (existing dropdown, filtered by `available_accounts`)
- **Asset**: `AssetSearchInput` (existing autocomplete)
- **Quantity/Price/Fee**: `CurrencyInput` or `NumberInput` (existing)
- **Notes**: `Textarea`

#### Validation Display

- Missing required fields: Red border + "Required" badge
- Semantic errors: Inline error text below field
- Valid: Green checkmark or neutral

#### Submit Flow

1. User clicks "Confirm"
2. Set state → `submitting`
3. Build `NewActivity` payload from draft + edits
4. Call `invoke("create_activity", { activity })`
5. On success:
   - Update tool result in DB via new command (see below)
   - Set state → `success`
   - Show activity summary + "View in Activities" link
6. On error:
   - Set state → `error`
   - Show inline error message
   - Keep draft editable for retry

#### Cancel Behavior

- "Cancel" button simply collapses/hides the tool card
- Draft remains in chat history (can re-expand)

---

## New Tauri Command

**Location:** `src-tauri/src/commands/chat.rs`

```rust
#[tauri::command]
pub async fn update_tool_result(
    thread_id: String,
    message_id: String,
    tool_call_id: String,
    result_patch: serde_json::Value,  // Merged into existing result
    state: State<Arc<ServiceContext>>,
) -> Result<(), String> {
    // 1. Load message
    // 2. Find tool result part by tool_call_id
    // 3. Merge result_patch into result
    // 4. Save message
}
```

**Usage:** After successful create_activity, frontend calls:
```typescript
await invoke("update_tool_result", {
  threadId,
  messageId,
  toolCallId,
  resultPatch: {
    submitted: true,
    created_activity_id: activity.id,
    created_at: new Date().toISOString(),
  }
});
```

On reload, tool UI checks `result.submitted` → render success state.

---

## Tool Registration

### Backend

**`crates/ai/src/tools/mod.rs`:**
```rust
pub struct ToolSet<E: AiEnvironment> {
    // ... existing tools
    pub record_activity: RecordActivityTool<E>,
}
```

### Frontend

**`src-front/features/ai-assistant/components/tool-uis/index.ts`:**
```typescript
export const toolUIs = {
  // ... existing
  record_activity: RecordActivityToolUI,
} as const;
```

---

## LLM Prompting

Add to system prompt or tool description:

```
record_activity: Record investment transactions from natural language.

Guidelines:
- Parse dates to ISO 8601 format (e.g., "yesterday" → "2026-01-17")
- If user doesn't specify account and has multiple, ask which account
- For BUY/SELL, require symbol and quantity at minimum
- For DEPOSIT/WITHDRAWAL, require amount at minimum
- Tool returns draft preview; user confirms via UI
- Use subtypes when user specifies: DRIP dividends, staking rewards, qualified dividends, etc.

Examples:
- "Buy 20 AAPL at 240" → {activity_type: "BUY", symbol: "AAPL", quantity: 20, unit_price: 240}
- "Deposit $5000 to my Roth IRA" → {activity_type: "DEPOSIT", amount: 5000, account: "Roth IRA"}
- "Got $150 dividend from MSFT yesterday" → {activity_type: "DIVIDEND", symbol: "MSFT", amount: 150, activity_date: "..."}
- "Reinvested dividend of 2 shares AAPL" → {activity_type: "DIVIDEND", symbol: "AAPL", quantity: 2, subtype: "DRIP"}
- "Received 0.5 ETH staking reward" → {activity_type: "INTEREST", symbol: "ETH", quantity: 0.5, subtype: "STAKING_REWARD"}
- "Qualified dividend $50 from VTI" → {activity_type: "DIVIDEND", symbol: "VTI", amount: 50, subtype: "QUALIFIED"}
```

---

## File Checklist

### New Files
- [ ] `crates/ai/src/tools/record_activity.rs` - Tool implementation
- [ ] `src-front/features/ai-assistant/components/tool-uis/record-activity-tool-ui.tsx` - UI component

### Modified Files
- [ ] `crates/ai/src/tools/mod.rs` - Register tool in ToolSet
- [ ] `crates/ai/src/chat.rs` - Add tool to agent
- [ ] `src-tauri/src/commands/chat.rs` - Add update_tool_result command
- [ ] `src-tauri/src/lib.rs` - Register new command
- [ ] `src-front/features/ai-assistant/components/tool-uis/index.ts` - Register UI
- [ ] `src-front/commands/chat.ts` - Add updateToolResult function

---

## Resolved Design Questions

Based on existing activity form patterns:

### 1. Historical Price Source

**Pattern:** Form uses `searchTicker()` → `search_symbol` Tauri command for asset lookup. Pricing mode toggle: MARKET (auto-fetch current) vs MANUAL (user enters).

**Decision:** Tool attempts price fetch via market data service. If asset has MARKET pricing mode and date is recent, fetch works. For historical dates or MANUAL assets, price stays null.

### 2. No-Price Handling

**Pattern:** Form requires `unitPrice` for BUY/SELL (Zod: `positive()` validation). User must enter manually if auto-fetch fails.

**Decision:** If price fetch fails and user didn't provide price:
- Mark `unit_price` in `missing_fields`
- UI shows price field with red border + "Required"
- **Confirm button disabled** until price provided
- User can enter price inline or chat "the price was $240"

### 3. FX Rate Handling

**Pattern:** Backend auto-registers FX pairs on activity save when currency mismatch detected. `FxService` fetches rates automatically. No user input in form.

**Decision:** Tool does NOT handle FX. Backend `activities_service` auto-registers pairs:
- Activity currency ≠ account currency → registers pair
- Asset currency ≠ account currency → registers pair
- FX rate lookup happens at reporting time, not entry time

### 4. Unknown Asset / Custom Asset Creation

**Pattern:** Form shows "Create custom asset: {SYMBOL}" option when search returns no results. Opens `CreateCustomAssetDialog`. Custom assets get:
- Asset ID: `SEC:{SYMBOL}:UNKNOWN`
- Pricing mode: MANUAL (user maintains prices)
- `dataSource: MANUAL`

**Decision:** Tool supports custom asset creation:
- If symbol search returns no results → `resolved_asset: null`, `validation.errors` includes suggestion
- UI shows "Asset not found" with option to create custom asset inline
- Custom asset fields in draft: `is_custom_asset: true`, `asset_kind: "SECURITY"|"CRYPTO"|"OTHER"`
- On confirm with custom asset → create asset first, then activity

### 5. Subtype Support

**Pattern:** Form has `AdvancedOptionsSection` with subtype dropdown. Available subtypes mapped by activity type in `SUBTYPES_BY_ACTIVITY_TYPE`.

**Decision:** Full subtype support from v1:

| Activity Type | Available Subtypes |
|--------------|-------------------|
| DIVIDEND | DRIP, QUALIFIED, ORDINARY, RETURN_OF_CAPITAL, DIVIDEND_IN_KIND |
| INTEREST | STAKING_REWARD, LENDING_INTEREST, COUPON |
| SPLIT | STOCK_DIVIDEND, REVERSE_SPLIT |
| BUY/SELL | OPTION_ASSIGNMENT, OPTION_EXERCISE |
| FEE | MANAGEMENT_FEE, ADR_FEE, INTEREST_CHARGE |
| TAX | WITHHOLDING, NRA_WITHHOLDING |
| TRANSFER_IN | OPENING_POSITION |

Tool args include optional `subtype` field. UI shows subtype dropdown in advanced section when applicable.
