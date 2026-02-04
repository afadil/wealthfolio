# Phase 4: Allocation Preferences & Holdings Table View

## Overview

**Goal:** Enhance allocation management with visual sub-pie charts,
user-configurable preferences, and a dedicated holdings table view for detailed
allocation analysis.

**Timeline:** 5-7 days across 3 sprints

**Date Created:** February 1, 2026

**Priority Features:**

1. Sub-pie chart visualization in side panel
2. Allocation preferences (Settings page)
3. Strict mode validation (asset class + holdings)
4. Holdings allocation table view (new tab)

---

## 1. Architectural Decisions

### 1.1 Settings Storage: Database Key-Value Pattern

**Why Database (not localStorage):**

- Consistent with existing pattern (theme, currency, font)
- Cross-device sync support
- Included in database backups
- Server-side validation of values
- Won't be lost on browser cache clear

**New Settings Keys:**

```typescript
{
  "allocation_holding_target_mode": "preview" | "strict",
  "allocation_rebalancing_default_view": "overview" | "detailed",
  "allocation_settings_banner_dismissed": "true" | "false"
}
```

**Default Values:**

- `allocation_holding_target_mode`: `"preview"` (maintains Phase 3 behavior)
- `allocation_rebalancing_default_view`: `"detailed"` (current default)
- `allocation_settings_banner_dismissed`: `"false"`

**Implementation Pattern:**

- Backend: Add keys to `SettingsService` (Rust)
- Frontend: Add fields to `Settings` TypeScript type
- Context: Use existing `SettingsProvider` for global state
- Persistence: Automatic via existing settings infrastructure

### 1.2 Strict Mode: Dual-Level Validation

**Philosophy:** Strict mode applies to BOTH asset class AND holding targets for
consistency.

**Rationale:**

- **Consistency**: "Strict = everything must sum to 100%" is clear mental model
- **User intent**: Advanced users choosing strict mode want full control at all
  levels
- **No surprises**: Mixed behavior (strict holdings, relaxed asset classes)
  would be confusing

**Validation Rules:**

**Asset Class Level (Strict Mode):**

```typescript
const total = assetClassTargets.reduce((sum, t) => sum + t.targetPercent, 0);
if (total !== 100) {
  showError(
    `Asset classes must sum to 100%. Current total: ${total.toFixed(1)}%`,
  );
  blockSave();
}
```

**Holding Level (Strict Mode):**

```typescript
// Per asset class
assetClassTargets.forEach((assetClass) => {
  const holdings = holdingTargets.filter(
    (h) => h.assetClassId === assetClass.id,
  );
  const total = holdings.reduce((sum, h) => sum + h.targetPercentOfClass, 0);

  if (holdings.length > 0 && total !== 100) {
    showError(
      `${assetClass.name} holdings must sum to 100%. Current: ${total.toFixed(1)}%`,
    );
    blockSave();
  }
});
```

**Preview Mode Behavior (unchanged from Phase 3):**

- No strict validation
- Auto-distribution for unset holdings
- Live preview with bold (user-set) vs italic (auto-calculated)
- "Save All Targets" commits all values

### 1.3 Tab Structure: Holdings Table as Separate View

**Current Tabs (Phase 3):**

```
1. Targets
2. Composition
3. Allocation Overview (pie chart + side panel)
4. Rebalancing Suggestions
```

**New Tabs (Phase 4):**

```
1. Targets
2. Composition
3. Allocation Overview (pie chart + side panel)
4. Holdings Table ← NEW: Detailed tabular view
5. Rebalancing Suggestions
```

**Why Separate Tab (not toggle):**

- Clear separation: Table view = detailed editing, Pie chart = visual overview
- Consistent with existing tab pattern
- Users can switch without losing context
- Easier to implement and maintain

**Note:** Targets and Composition tabs may be removed in future (pre-production
cleanup).

---

## 2. UI/UX Decisions

### 2.1 Sub-Pie Chart Location

**Placement in Side Panel:**

```
┌─────────────────────────────────────┐
│ Asset Class: Equity (60%)           │
├─────────────────────────────────────┤
│ [Allocation Target Section]         │ ← Slider/Input for asset class %
│   Target: 60%                       │
│   [Progress Bar]                    │
├─────────────────────────────────────┤
│ [SUB-PIE CHART]                     │ ← NEW: Visual breakdown
│   Shows holdings distribution       │
│   - VTI: 50% (green slice)         │
│   - VOO: 30% (green slice)         │
│   - VXUS: 20% (green slice)        │
│   Legend with percentages           │
├─────────────────────────────────────┤
│ [Holdings by Type]                  │ ← Existing: Holding target rows
│   Equity ETF (3 holdings)          │
│   ├─ VTI  [50%] [Lock] [Delete]   │
│   ├─ VOO  [30%] [Lock] [Delete]   │
│   └─ VXUS [20%] [Lock] [Delete]   │
└─────────────────────────────────────┘
```

**Design Requirements:**

- Compact size: 200-250px diameter (fits side panel width)
- Color scheme: Green tones (consistent with asset class colors)
- Interactive: Hover shows holding details
- Legend: Below chart with symbol + name + percentage
- Empty state: "Set holding targets to see breakdown"

### 2.2 Settings Page: Allocation Section

**Location:** Settings → Allocation (new section)

**Layout:**

```
┌────────────────────────────────────────────────────────┐
│ Settings > Allocation                                  │
├────────────────────────────────────────────────────────┤
│                                                        │
│ Holding Target Behavior                               │
│ ┌────────────────────────────────────────────────┐   │
│ │ ○ Preview Mode (Recommended)                   │   │
│ │   Auto-distribute unset targets. Click "Save   │   │
│ │   All Targets" to commit changes.              │   │
│ │                                                │   │
│ │ ● Strict Mode                                  │   │
│ │   Targets must sum to 100% before saving.      │   │
│ │   Best for advanced users who want explicit    │   │
│ │   control over all allocations.                │   │
│ └────────────────────────────────────────────────┘   │
│                                                        │
│ Rebalancing Suggestions                                │
│ ┌────────────────────────────────────────────────┐   │
│ │ Default View:                                  │   │
│ │ ● Detailed (shows per-holding suggestions)     │   │
│ │ ○ Overview (shows only asset class level)      │   │
│ └────────────────────────────────────────────────┘   │
│                                                        │
│ [Save Changes]                                         │
└────────────────────────────────────────────────────────┘
```

**UI Components:**

- Radio buttons for mutually exclusive options
- Descriptive help text under each option
- Save button (updates `app_settings` table)
- Toast notification on successful save
- Changes take effect immediately (React Context update)

### 2.3 Holdings Allocation Table View

**Tab Label:** "Holdings Table"

**Table Columns:**

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Symbol │ Name              │ Asset Class │ Type      │ Target % │ Target % │ Current % │
│        │                   │             │           │ (Class)  │ (Total)  │ (Total)   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ VTI    │ Vanguard Total... │ Equity      │ Equity ETF│  50.0%   │  30.0%   │  28.5%    │
│ VOO    │ Vanguard S&P...   │ Equity      │ Equity ETF│  30.0%   │  18.0%   │  16.2%    │
│ VXUS   │ Vanguard Total... │ Equity      │ Equity ETF│  20.0%   │  12.0%   │  11.8%    │
│ BND    │ Vanguard Total... │ Fixed Income│ Bond ETF  │  60.0%   │  18.0%   │  19.5%    │
│ BNDX   │ Vanguard Total... │ Fixed Income│ Bond ETF  │  40.0%   │  12.0%   │  10.5%    │
└────────────────────────────────────────────────────────────────────────────────────────┘

Additional Columns (scroll right):
│ Deviation │ Value      │ Target Value │ Locked │ Actions        │
├───────────────────────────────────────────────────────────────────┤
│  -1.5%    │ $14,250    │ $15,000      │  🔒    │ [View Details] │
│  -1.8%    │  $8,100    │  $9,000      │        │ [View Details] │
│  -0.2%    │  $5,900    │  $6,000      │        │ [View Details] │
│  +1.5%    │  $9,750    │  $9,000      │        │ [View Details] │
│  -1.5%    │  $5,250    │  $6,000      │  🔒    │ [View Details] │
└───────────────────────────────────────────────────────────────────┘
```

**Features:**

- **Reuse existing component**: Adapt `HoldingsTable` from
  `src/pages/holdings/components/holdings-table.tsx`
- **Filtering**: By asset class, type, locked status
- **Sorting**: All columns sortable
- **Search**: Filter by symbol or name
- **Color coding**: Deviation column shows red (under-allocated) / green
  (over-allocated)
- **Lock indicator**: 🔒 icon for locked holdings
- **Click to edit**: "View Details" navigates to holding detail page
- **Read-only mode**: This view is for analysis; editing happens in side panel
  (Allocation Overview tab)

**Empty State:**

```
┌─────────────────────────────────────────────────┐
│                                                 │
│           No Holding Targets Set                │
│                                                 │
│   Go to "Allocation Overview" to set targets   │
│   for individual holdings within asset classes. │
│                                                 │
│   [Go to Allocation Overview]                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 2.4 One-Time Notification Banner (Optional)

**When:** First visit to Allocation page after Phase 4 upgrade

**Design:**

```
┌─────────────────────────────────────────────────────────────┐
│ 💡 New: Allocation Settings                           [×]   │
│ You can now customize how allocation targets work.          │
│ Visit Settings → Allocation to choose your preference.      │
│ [Go to Settings]                                            │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**

- Blue info banner (not warning/error)
- Appears at top of Allocation page
- Dismissible with × button
- "Go to Settings" navigates to Settings → Allocation
- Dismissal stored in `allocation_settings_banner_dismissed` setting
- Shows only once per user

**Implementation Priority:** Nice-to-have (defer if time-constrained)

---

## 3. Component Architecture

### 3.1 New Components

**Sub-Pie Chart Component:**

```typescript
// src/pages/allocation/components/sub-pie-chart.tsx

interface SubPieChartProps {
  holdingTargets: HoldingTarget[];
  holdings: Holding[];
  assetClassName: string;
  totalValue: number;
}

export function SubPieChart({
  holdingTargets,
  holdings,
  assetClassName,
  totalValue,
}: SubPieChartProps) {
  // Use recharts PieChart or custom d3 implementation
  // Color scheme: Green tones (lighter to darker based on %)
  // Interactive tooltips on hover
  // Compact legend below chart
}
```

**Holdings Allocation Table:**

```typescript
// src/pages/allocation/components/holdings-allocation-table.tsx

interface HoldingsAllocationTableProps {
  holdings: Holding[];
  holdingTargets: HoldingTarget[];
  assetClassTargets: AssetClassTarget[];
  totalPortfolioValue: number;
  baseCurrency: string;
}

export function HoldingsAllocationTable({
  holdings,
  holdingTargets,
  assetClassTargets,
  totalPortfolioValue,
  baseCurrency,
}: HoldingsAllocationTableProps) {
  // Reuse DataTable component from Holdings page
  // Add allocation-specific columns
  // Calculate cascaded percentages and deviations
  // Color-coded deviation indicators
}
```

**Allocation Settings Section:**

```typescript
// src/pages/settings/allocation/allocation-settings-page.tsx

export function AllocationSettingsPage() {
  const { settings, updateSettings } = useSettingsContext();

  const [holdingTargetMode, setHoldingTargetMode] = useState(
    settings?.allocationHoldingTargetMode || "preview",
  );
  const [defaultRebalancingView, setDefaultRebalancingView] = useState(
    settings?.allocationRebalancingDefaultView || "detailed",
  );

  const handleSave = async () => {
    await updateSettings({
      allocationHoldingTargetMode: holdingTargetMode,
      allocationRebalancingDefaultView: defaultRebalancingView,
    });
    toast.success("Allocation settings updated");
  };

  // Radio buttons for each setting
  // Help text explaining each mode
  // Save button
}
```

**One-Time Banner Component:**

```typescript
// src/pages/allocation/components/allocation-settings-banner.tsx

export function AllocationSettingsBanner() {
  const { settings, updateSettings } = useSettingsContext();
  const navigate = useNavigate();

  if (settings?.allocationSettingsBannerDismissed === "true") {
    return null;
  }

  const handleDismiss = async () => {
    await updateSettings({
      allocationSettingsBannerDismissed: "true",
    });
  };

  // Blue banner with icon, message, buttons
  // Navigate to settings on click
  // Persist dismissal to database
}
```

### 3.2 Modified Components

**Allocation Overview (index.tsx):**

- Add sub-pie chart to side panel (after target section, before holdings list)
- Read `allocationHoldingTargetMode` from settings
- Apply strict validation when mode = "strict"
- Block save button when validation fails
- Show inline error messages

**Rebalancing Advisor:**

- Read `allocationRebalancingDefaultView` from settings
- Set initial view mode from settings (instead of hardcoded "detailed")
- User can still toggle during session

**Side Panel (Sheet):**

- Add sub-pie chart component after `TargetPercentInput`
- Conditionally render based on holdings count
- Empty state when no holding targets exist

### 3.3 New Hooks

**useAllocationSettings:**

```typescript
// src/pages/allocation/hooks/use-allocation-settings.ts

export function useAllocationSettings() {
  const { settings } = useSettingsContext();

  return {
    holdingTargetMode: settings?.allocationHoldingTargetMode || "preview",
    rebalancingDefaultView:
      settings?.allocationRebalancingDefaultView || "detailed",
    isStrictMode: settings?.allocationHoldingTargetMode === "strict",
    isPreviewMode: settings?.allocationHoldingTargetMode === "preview",
  };
}
```

**useStrictModeValidation:**

```typescript
// src/pages/allocation/hooks/use-strict-mode-validation.ts

export function useStrictModeValidation(
  assetClassTargets: AssetClassTarget[],
  holdingTargets: HoldingTarget[],
) {
  const { isStrictMode } = useAllocationSettings();

  if (!isStrictMode) {
    return { isValid: true, errors: [] };
  }

  const errors: string[] = [];

  // Validate asset class level
  const assetClassTotal = assetClassTargets.reduce(
    (sum, t) => sum + t.targetPercent,
    0,
  );
  if (assetClassTotal !== 100) {
    errors.push(
      `Asset classes must sum to 100%. Current: ${assetClassTotal.toFixed(1)}%`,
    );
  }

  // Validate holding level (per asset class)
  assetClassTargets.forEach((assetClass) => {
    const holdings = holdingTargets.filter(
      (h) => h.assetClassId === assetClass.id,
    );
    if (holdings.length === 0) return;

    const total = holdings.reduce((sum, h) => sum + h.targetPercentOfClass, 0);
    if (total !== 100) {
      errors.push(
        `${assetClass.assetClass} holdings must sum to 100%. Current: ${total.toFixed(1)}%`,
      );
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}
```

---

## 4. Implementation Plan

### Sprint 1: Settings Infrastructure ✅ COMPLETE (2 days)

**Completed:** February 1, 2026

**Backend (Rust):**

- ✅ Add new setting keys to `SettingsService`
- ✅ Update `Settings` model with new fields:
  - `allocation_holding_target_mode`
  - `allocation_default_view` (renamed from
    `allocation_rebalancing_default_view`)
  - `allocation_settings_banner_dismissed`
- ✅ Add default values in repository
- ✅ Test settings CRUD operations

**Frontend (TypeScript):**

- ✅ Update `Settings` type in `src/lib/types.ts`:
  ```typescript
  export interface Settings {
    // ... existing fields
    allocationHoldingTargetMode?: "preview" | "strict";
    allocationDefaultView?: "overview" | "holdings-table";
    allocationSettingsBannerDismissed?: "true" | "false";
  }
  ```
- ✅ Create `useAllocationSettings.ts` hook
- ✅ Create tabbed Settings > Allocation page with two tabs:
  - **Preferences Tab:** Holding Target Mode + Allocation Default View settings
  - **Maintenance Tab:** Virtual Portfolio Cleanup section
- ✅ Add "Allocation" section to Settings navigation
- ✅ Implement radio buttons and save functionality
- ✅ Test settings persistence and retrieval

**Additional Enhancements:**

- ✅ **Tabbed Interface:** Split settings into Preferences and Maintenance tabs
  (similar to exports page)
- ✅ **Virtual Portfolio Cleanup Improvements:**
  - ✅ Add backend endpoint to get full list of unused virtual strategies (not
    just count)
  - ✅ Add backend endpoint to delete individual virtual strategies with
    validation
  - ✅ Create collapsible list showing unused portfolios with account names
  - ✅ Individual delete buttons per portfolio (trash icon)
  - ✅ Extract and display account names instead of technical UUIDs
  - ✅ Real-time updates when virtual portfolios created/deleted
- ✅ **Icon Consistency:** Changed Allocations menu icon to PieChart (matches
  Settings icon)

**Deliverables:**

- ✅ Database can store/retrieve allocation settings
- ✅ Settings page shows Allocation section with two tabs
- ✅ Users can toggle between Preview/Strict mode
- ✅ Users can set default allocation view
- ✅ Virtual portfolio cleanup with individual and bulk delete options
- ✅ Changes persist across sessions
- ✅ Real-time query invalidation ensures fresh data

---

### Sprint 2: Sub-Pie Chart & Strict Mode ✅ COMPLETE (1 day)

**Completed:** February 1, 2026

**Sub-Pie Chart Component:**

- ✅ Install/configure charting library (recharts already installed)
- ✅ Create `SubPieChart` component:
  - Calculate holding percentages
  - Render compact pie chart (200-250px)
  - Green color scheme (consistent with asset classes)
  - Interactive tooltips
  - Legend with symbol + percentage
- ✅ Empty state: "Set holding targets to see breakdown"
- ✅ Integrate into side panel (below target, above holdings)
- ✅ Responsive sizing for side panel width

**Strict Mode Validation:**

- ✅ Create `useStrictModeValidation` hook
- ✅ Asset class level validation:
  - Check sum = 100%
  - Show error message if not
  - Block "Save All Targets" button
- ✅ Holding level validation (per asset class):
  - Check each asset class holdings sum = 100%
  - Show specific error per asset class
  - Block save button
- ✅ Error message display:
  ```tsx
  {
    !validation.isValid && (
      <div className="text-destructive space-y-1 text-sm">
        {validation.errors.map((error, i) => (
          <div key={i}>• {error}</div>
        ))}
      </div>
    );
  }
  ```
- ✅ Visual feedback: Disable button with opacity when validation fails
- ✅ Preview mode: No changes (existing Phase 3 behavior)

**Testing:**

- Verify sub-pie chart renders correctly
- Test strict mode validation at both levels
- Test preview mode still works (no regressions)
- Test switching between modes in Settings

**Deliverables:**

- Sub-pie chart visible in side panel
- Strict mode enforces 100% at both levels
- Clear error messages guide users
- Preview mode unchanged

---

### Sprint 3: Holdings Allocation Table (2 days)

**Table Component:**

- ✅ Create `holdings-allocation-table.tsx`
- ✅ Reuse `DataTable` component from Holdings page
- ✅ Define columns:
  - Symbol (with TickerAvatar)
  - Name
  - Asset Class
  - Type (subclass)
  - Target % (of class)
  - Target % (of total) - cascaded calculation
  - Current % (of total)
  - Deviation (target - current)
  - Value (current market value)
  - Target Value
  - Locked (🔒 icon flat design)
  - Actions ([View Details] button)
- ✅ Calculate cascaded percentages:
  ```typescript
  const targetPortfolioPercent =
    (holdingTarget.targetPercentOfClass / 100) * assetClassTarget.targetPercent;
  ```
- ✅ Color-coded deviation:
  - Red (negative): Under-allocated
  - Green (positive): Over-allocated
  - Gray: On target (within ±0.5%)
- ✅ Filtering: By asset class, type, locked status
- ✅ Sorting: All columns sortable
- ✅ Search: Filter by symbol/name
- ✅ Empty state with CTA to Allocation Overview

**Tab Integration:**

- ✅ Add "Holdings Table" tab to allocation page
- ✅ Update `TabType` type: `'holdings-table'`
- ✅ Add tab button in navigation
- ✅ Render table when tab is active
- ✅ Tab order:
  1. Targets
  2. Composition
  3. Allocation Overview
  4. **Holdings Table** ← NEW
  5. Rebalancing Suggestions

**Data Flow:**

- Fetch holdings from current allocation hook
- Fetch holding targets from query
- Fetch asset class targets from query
- Calculate all derived values in component
- Read-only display (no inline editing)

**Testing:**

- Verify table displays correct data
- Test filtering and sorting
- Test deviation calculations
- Test navigation to holding details
- Verify empty state shows correctly

**Deliverables:**

- Holdings Table tab functional
- All columns display correct data
- Filtering, sorting, search work
- Color-coded deviations guide users
- Table complements pie chart view

---

### Optional: One-Time Banner (if time permits)

- ✅ Create `AllocationSettingsBanner` component
- ✅ Check `allocationSettingsBannerDismissed` setting
- ✅ Render banner at top of allocation page
- ✅ Dismiss button updates setting
- ✅ "Go to Settings" navigation
- ✅ Show only once per user

---

## 5. Technical Details

### 5.1 Settings Schema Updates

**Backend (Rust):**

```rust
// src-core/src/settings/settings_model.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    // ... existing fields
    #[serde(rename = "allocationHoldingTargetMode")]
    pub allocation_holding_target_mode: Option<String>, // "preview" | "strict"

    #[serde(rename = "allocationRebalancingDefaultView")]
    pub allocation_rebalancing_default_view: Option<String>, // "overview" | "detailed"

    #[serde(rename = "allocationSettingsBannerDismissed")]
    pub allocation_settings_banner_dismissed: Option<String>, // "true" | "false"
}

// src-core/src/settings/settings_repository.rs
impl SettingsRepository {
    fn get_default_settings() -> HashMap<String, String> {
        let mut defaults = HashMap::new();
        // ... existing defaults
        defaults.insert("allocation_holding_target_mode".to_string(), "preview".to_string());
        defaults.insert("allocation_rebalancing_default_view".to_string(), "detailed".to_string());
        defaults.insert("allocation_settings_banner_dismissed".to_string(), "false".to_string());
        defaults
    }
}
```

**Frontend (TypeScript):**

```typescript
// src/lib/types.ts
export interface Settings {
  theme: string;
  font: string;
  baseCurrency: string;
  // ... other existing fields
  allocationHoldingTargetMode?: "preview" | "strict";
  allocationRebalancingDefaultView?: "overview" | "detailed";
  allocationSettingsBannerDismissed?: "true" | "false";
}
```

### 5.2 Sub-Pie Chart Implementation

**Recommended Library:** recharts (already used in project)

**Component Structure:**

```tsx
import {
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export function SubPieChart({
  holdingTargets,
  holdings,
  assetClassName,
}: SubPieChartProps) {
  // Prepare data
  const data = holdingTargets.map((target) => {
    const holding = holdings.find((h) => h.id === target.holdingId);
    return {
      name: holding?.instrument?.symbol || "Unknown",
      value: target.targetPercentOfClass,
      displayName: holding?.instrument?.name || holding?.instrument?.symbol,
    };
  });

  // Green color palette (lighter to darker)
  const COLORS = [
    "#86efac", // green-300
    "#4ade80", // green-400
    "#22c55e", // green-500
    "#16a34a", // green-600
    "#15803d", // green-700
  ];

  if (data.length === 0) {
    return (
      <div className="text-muted-foreground py-4 text-center text-sm">
        Set holding targets to see breakdown
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => `${value.toFixed(1)}%`}
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value, entry) =>
            `${entry.payload.name} (${entry.payload.value.toFixed(1)}%)`
          }
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

### 5.3 Strict Mode Validation Logic

**Validation Hook:**

```typescript
export function useStrictModeValidation(
  assetClassTargets: AssetClassTarget[],
  holdingTargets: HoldingTarget[],
) {
  const { isStrictMode } = useAllocationSettings();

  return useMemo(() => {
    if (!isStrictMode) {
      return { isValid: true, errors: [], canSave: true };
    }

    const errors: string[] = [];

    // Validate asset class level
    const assetClassTotal = assetClassTargets.reduce(
      (sum, t) => sum + t.targetPercent,
      0,
    );

    if (Math.abs(assetClassTotal - 100) > 0.01) {
      errors.push(
        `Asset classes must sum to 100%. Current total: ${assetClassTotal.toFixed(1)}%`,
      );
    }

    // Validate holding level per asset class
    assetClassTargets.forEach((assetClass) => {
      const classHoldings = holdingTargets.filter(
        (h) => h.assetClassId === assetClass.id,
      );

      if (classHoldings.length === 0) return; // No holdings = OK

      const total = classHoldings.reduce(
        (sum, h) => sum + h.targetPercentOfClass,
        0,
      );

      if (Math.abs(total - 100) > 0.01) {
        errors.push(
          `${assetClass.assetClass} holdings must sum to 100%. Current: ${total.toFixed(1)}%`,
        );
      }
    });

    return {
      isValid: errors.length === 0,
      errors,
      canSave: errors.length === 0,
    };
  }, [isStrictMode, assetClassTargets, holdingTargets]);
}
```

**Usage in Component:**

```tsx
const validation = useStrictModeValidation(assetClassTargets, holdingTargets);

return (
  <div>
    {/* Validation errors */}
    {!validation.isValid && (
      <div className="bg-destructive/10 border-destructive text-destructive space-y-1 rounded-md border p-3 text-sm">
        {validation.errors.map((error, i) => (
          <div key={i}>• {error}</div>
        ))}
      </div>
    )}

    {/* Save button */}
    <Button
      onClick={handleSave}
      disabled={!validation.canSave || isLoading}
      className="w-full"
    >
      Save All Targets
    </Button>
  </div>
);
```

### 5.4 Holdings Allocation Table Columns

**Column Definitions:**

```typescript
const columns: ColumnDef<HoldingWithAllocation>[] = [
  {
    accessorKey: 'symbol',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Symbol" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <TickerAvatar symbol={row.original.instrument?.symbol} />
        <span className="font-medium">{row.original.instrument?.symbol}</span>
      </div>
    ),
  },
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <div className="max-w-[200px] truncate">
        {row.original.instrument?.name || row.original.instrument?.symbol}
      </div>
    ),
  },
  {
    accessorKey: 'assetClass',
    header: 'Asset Class',
    cell: ({ row }) => row.original.assetClass,
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => row.original.instrument?.assetSubclass,
  },
  {
    id: 'targetPercentOfClass',
    header: 'Target % (Class)',
    cell: ({ row }) => {
      const target = row.original.holdingTarget;
      return target ? `${target.targetPercentOfClass.toFixed(1)}%` : '-';
    },
  },
  {
    id: 'targetPercentOfPortfolio',
    header: 'Target % (Total)',
    cell: ({ row }) => {
      const cascaded = row.original.targetPortfolioPercent;
      return cascaded ? `${cascaded.toFixed(1)}%` : '-';
    },
  },
  {
    id: 'currentPercent',
    header: 'Current %',
    cell: ({ row }) => {
      const current = row.original.currentPortfolioPercent;
      return `${current.toFixed(1)}%`;
    },
  },
  {
    id: 'deviation',
    header: 'Deviation',
    cell: ({ row }) => {
      const deviation = row.original.deviation || 0;
      const color = Math.abs(deviation) < 0.5
        ? 'text-muted-foreground'
        : deviation < 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-green-600 dark:text-green-400';

      return (
        <span className={color}>
          {deviation > 0 ? '+' : ''}{deviation.toFixed(1)}%
        </span>
      );
    },
  },
  {
    id: 'locked',
    header: 'Locked',
    cell: ({ row }) => {
      const isLocked = row.original.holdingTarget?.isLocked;
      return isLocked ? <Lock className="h-4 w-4" /> : null;
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(`/holdings/${row.original.instrument?.symbol}`)}
      >
        View Details
      </Button>
    ),
  },
];
```

---

## 6. User Workflows

### 6.1 Configure Allocation Preferences

**User Journey:**

1. User navigates to Settings → Allocation
2. Sees two preference sections:
   - Holding Target Behavior (Preview/Strict)
   - Rebalancing Suggestions Default View (Overview/Detailed)
3. Selects preferred options
4. Clicks "Save Changes"
5. Toast confirms: "Allocation settings updated"
6. Settings take effect immediately in allocation page

### 6.2 Use Strict Mode

**User Journey:**

1. User enables Strict Mode in Settings
2. Navigates to Allocation Overview
3. Opens side panel for an asset class
4. Sets holding targets that sum to 95%
5. Tries to click "Save All Targets"
6. Button is disabled
7. Error message shows: "Equity holdings must sum to 100%. Current: 95.0%"
8. User adjusts targets to sum to 100%
9. Error clears, button enables
10. User saves successfully

### 6.3 View Sub-Pie Chart

**User Journey:**

1. User opens side panel for an asset class (e.g., Equity)
2. Views allocation target section (slider/input)
3. Sees sub-pie chart below showing holding breakdown:
   - VTI: 50% (green slice)
   - VOO: 30% (green slice)
   - VXUS: 20% (green slice)
4. Hovers over slices to see tooltips with details
5. Scrolls down to see holdings list with input fields
6. Visual feedback confirms targets match chart

### 6.4 Analyze Holdings in Table View

**User Journey:**

1. User navigates to "Holdings Table" tab
2. Sees all holdings with allocation data in table format
3. Sorts by "Deviation" column to find biggest gaps
4. Filters to show only "Equity" asset class
5. Identifies VTI is -1.5% under-allocated
6. Clicks "View Details" to see holding page
7. Returns to Allocation Overview to adjust targets
8. Switches back to Holdings Table to verify changes

### 6.5 First-Time User (Banner)

**User Journey:**

1. User upgrades to Phase 4
2. Visits Allocation page for first time
3. Sees blue banner at top: "New: Allocation Settings"
4. Reads message about customization options
5. Clicks "Go to Settings" button
6. Navigates to Settings → Allocation
7. Reviews preferences, keeps defaults (Preview Mode)
8. Returns to Allocation page
9. Banner is dismissed (never shows again)

---

## 7. Testing Strategy

### 7.1 Unit Tests (Vitest)

**Settings Hook:**

- `useAllocationSettings` returns correct values from context
- Defaults to "preview" and "detailed" when settings undefined
- `isStrictMode` and `isPreviewMode` flags work correctly

**Validation Hook:**

- `useStrictModeValidation` returns `isValid: true` in preview mode
- Returns correct errors when totals ≠ 100% in strict mode
- Handles edge cases (empty holdings, missing targets)

**Sub-Pie Chart:**

- Renders empty state when no targets
- Calculates percentages correctly
- Handles missing holding data gracefully

### 7.2 Integration Tests

**Settings Persistence:**

- Save allocation preferences in Settings page
- Navigate to Allocation page
- Verify strict mode is active (validation shown)
- Verify rebalancing default view applied

**Tab Navigation:**

- Switch between all 5 tabs
- Verify Holdings Table loads data
- Verify Allocation Overview shows pie chart
- Verify state persists when switching tabs

**Strict Mode Workflow:**

- Enable strict mode
- Create targets that sum to 95%
- Verify save is blocked
- Fix totals to 100%
- Verify save succeeds

### 7.3 Manual Testing Scenarios

**Settings Page:**

- [ ] Allocation section visible in Settings nav
- [ ] Radio buttons toggle correctly
- [ ] Save button updates database
- [ ] Toast confirms successful save
- [ ] Preferences persist after page reload

**Sub-Pie Chart:**

- [ ] Chart renders in side panel
- [ ] Positioned below target, above holdings
- [ ] Shows correct percentages
- [ ] Tooltips display on hover
- [ ] Legend shows symbol + percentage
- [ ] Empty state when no targets
- [ ] Responsive to side panel width

**Strict Mode:**

- [ ] Asset class targets validate to 100%
- [ ] Holding targets validate per asset class
- [ ] Error messages are specific and helpful
- [ ] Save button disabled when invalid
- [ ] Preview mode still works (no strict validation)
- [ ] Switching modes in Settings takes effect immediately

**Holdings Table:**

- [ ] Tab appears in navigation
- [ ] Table displays all holdings with targets
- [ ] Columns show correct data
- [ ] Cascaded percentages calculate correctly
- [ ] Deviation column shows color-coded values
- [ ] Locked icon appears for locked holdings
- [ ] Filtering works (asset class, type)
- [ ] Sorting works on all columns
- [ ] Search filters by symbol/name
- [ ] "View Details" navigates to holding page
- [ ] Empty state when no targets

**Banner (Optional):**

- [ ] Shows on first visit after upgrade
- [ ] Dismissible with × button
- [ ] "Go to Settings" navigates correctly
- [ ] Never shows again after dismissal
- [ ] Banner setting persists in database

---

## 8. Known Constraints & Trade-offs

### 8.1 Table View is Read-Only

**Decision:** Holdings Table tab is for analysis only, not editing.

**Rationale:**

- Editing happens in side panel (Allocation Overview tab)
- Avoids duplication of edit UI
- Table optimized for sorting, filtering, comparison
- Side panel optimized for focused editing with visual feedback

**User Impact:** Users must switch to Allocation Overview to edit targets.

### 8.2 Strict Mode Applies to Both Levels

**Decision:** Strict mode validates asset classes AND holdings.

**Trade-off:** Less flexible than "strict only for holdings."

**Rationale:** Consistency and clear mental model outweigh flexibility.

**Mitigation:** Preview mode (default) provides full flexibility.

### 8.3 Sub-Pie Chart Uses Same Color Scheme

**Decision:** Green tones for all holdings within asset class.

**Limitation:** Can't use asset class colors (would conflict with main pie).

**Rationale:** Visual consistency, stays within green palette for holdings.

**Enhancement (future):** Different color palettes per asset class (e.g., equity
= greens, bonds = blues).

### 8.4 Settings Stored in Database (Not localStorage)

**Decision:** Use `app_settings` table for allocation preferences.

**Trade-off:** Requires backend call vs instant localStorage.

**Benefit:** Cross-device sync, persistent, included in backups.

**Performance:** Minimal impact (settings cached in React Context).

---

## 9. Sprint Status & Progress Tracking

### Sprint 1: Settings Infrastructure ✅ COMPLETE

**Status:** Completed February 1, 2026

**Completed Tasks:**

- [x] Backend: Add settings keys to SettingsService
- [x] Backend: Update Settings model with new fields
- [x] Frontend: Update Settings TypeScript type
- [x] Frontend: Create useAllocationSettings hook
- [x] Settings Page: Create tabbed Allocation section (Preferences +
      Maintenance)
- [x] Settings Page: Radio buttons for preferences
- [x] Settings Page: Save functionality
- [x] Test: Settings persistence
- [x] **Bonus:** Enhanced virtual portfolio cleanup with individual delete
- [x] **Bonus:** Real-time query invalidation
- [x] **Bonus:** Icon consistency (PieChart icon)

**Actual Duration:** 2 days

**Commits:**

- `d46f778a` - feat(allocation): enhance Settings > Allocation with tabbed
  interface and individual cleanup
- `c40469e5` - fix(allocation): ensure unused virtual portfolios list updates in
  real-time

---

### Sprint 2: Sub-Pie Chart & Strict Mode ✅ COMPLETE

**Status:** Completed February 1, 2026

**Completed Tasks:**

- [x] Install/configure recharts (already installed)
- [x] Create SubPieChart component
- [x] Green color palette (7 shades)
- [x] Interactive tooltips and legend
- [x] Empty state ("Set holding targets to see breakdown")
- [x] Integrate into side panel (between target and holdings sections)
- [x] Create useStrictModeValidation hook
- [x] Asset class level validation (sum to 100%)
- [x] Holding level validation (per asset class sum to 100%)
- [x] Error message display (specific errors with bullet points)
- [x] Disable save button when invalid (opacity + disabled state)
- [x] Test strict mode vs preview mode

**Actual Duration:** 1 day

**Commits:**

- `b4214f04` - feat(allocation): add sub-pie chart and strict mode validation

---

### Sprint 3: Holdings Allocation Table ✅ COMPLETE

**Status:** Completed

**Tasks:**

- [x] Create HoldingsAllocationTable component
- [x] Reuse DataTable component
- [x] Define columns (symbol, name, targets, deviation, etc.)
- [x] Calculate cascaded percentages
- [x] Color-coded deviation column
- [x] Filtering by asset class, type, locked
- [x] Sorting on all columns
- [x] Search by symbol/name
- [x] Empty state with CTA
- [x] Add "Holdings Table" tab
- [x] Update tab navigation
- [x] Test filtering, sorting, navigation

**Implementation Notes:**

- Created `holdings-allocation-table.tsx` component
- Added new tab type `'holdings-table'` to `TabType`
- Tab order: Targets → Composition → Allocation Overview → Holdings Table →
  Rebalancing Suggestions
- Table columns: Symbol, Name, Asset Class, Type, Value, Target % (Class),
  Target % (Total), Current %, Deviation, Locked, Actions
- Deviation color coding: Red (under-allocated), Green (over-allocated), Gray
  (on target ±0.5%)
- Filters: Asset Class, Type, Lock Status
- Search: By symbol or name

**Estimated Duration:** 2 days

---

### Optional: One-Time Banner ⏳ DEFERRED

**Status:** Nice-to-have, implement if time permits

**Tasks:**

- [ ] Create AllocationSettingsBanner component
- [ ] Check dismissed setting
- [ ] Render at top of allocation page
- [ ] Dismiss button updates setting
- [ ] Navigation to Settings
- [ ] Test banner lifecycle

**Estimated Duration:** 0.5 day

---

## 10. Success Criteria

**Phase 4 is complete when:**

- ✅ Users can configure allocation preferences in Settings → Allocation
- ✅ Strict mode enforces 100% validation at asset class AND holding levels
- ✅ Preview mode maintains Phase 3 behavior (auto-distribution, no strict
  validation)
- ✅ Sub-pie chart displays holding breakdown in side panel
- ✅ Sub-pie chart appears below target section, above holdings list
- ✅ Holdings Table tab shows all holdings with allocation data
- ✅ Holdings Table supports filtering, sorting, and search
- ✅ Deviation column color-codes under/over-allocation
- ✅ Settings persist in database across sessions
- ✅ Rebalancing default view setting applied on page load
- ✅ All tests pass (unit + integration)
- ✅ Desktop and web modes both work
- ✅ No regressions in Phase 3 functionality

**Optional (nice-to-have):**

- ⏳ One-time banner notifies users of new settings

---

## 11. Future Enhancements (Phase 5+)

**Not included in Phase 4:**

### 11.1 Historical Tracking

- Track target changes over time
- Timeline view of allocation adjustments
- Audit log: "User changed VTI target from 40% to 50% on 2026-02-15"

### 11.2 Drift Alerts

- Notify when holdings deviate >5% from targets
- Email/push notifications (requires notification system)
- Dashboard widget: "3 holdings need rebalancing"

### 11.3 Drag-and-Drop Reordering

- Visual reordering of holdings in side panel
- Affects display order only (not allocation logic)
- Persist order preference per user

### 11.4 Bulk Import/Export

- CSV import: Upload holding targets in bulk
- CSV export: Download all targets for backup
- Template generator for import

### 11.5 Multi-Currency Target Display

- Show targets in multiple currencies simultaneously
- Currency conversion in Holdings Table
- Toggle between base currency and local currency

### 11.6 Advanced Color Schemes

- Different color palettes per asset class in sub-pie charts
- User-customizable colors (Settings → Appearance → Allocation Colors)
- Accessibility: High-contrast mode, color-blind friendly palettes

### 11.7 Mobile Optimization

- Touch-friendly sub-pie charts
- Responsive Holdings Table (horizontal scroll or stacked layout)
- Mobile-specific gestures for tab switching

---

## 12. Migration & Upgrade Path

### 12.1 Database Migration

**No new tables required.**

Allocation preferences use existing `app_settings` key-value table.

**Migration Steps:**

1. No schema changes needed
2. On first load, `SettingsService` returns defaults for new keys
3. Users start with Preview Mode by default
4. Banner (optional) informs users of new settings

### 12.2 Existing Users

**Defaults for Phase 4 Users:**

- `allocation_holding_target_mode`: `"preview"` (maintains current behavior)
- `allocation_rebalancing_default_view`: `"detailed"` (current default)
- `allocation_settings_banner_dismissed`: `"false"` (show banner once)

**No breaking changes:**

- All Phase 3 features continue to work identically
- Strict mode is opt-in
- Holdings Table is additive (new tab)
- Sub-pie chart is additive (enhances side panel)

### 12.3 Rollback Plan

If Phase 4 needs to be rolled back:

1. Remove "Holdings Table" tab from navigation
2. Remove sub-pie chart from side panel
3. Remove Allocation section from Settings
4. Settings keys remain in database (harmless, ignored)
5. Phase 3 functionality fully intact

---

## 13. Open Questions

**Before starting implementation:**

1. **Sub-pie chart library:** Confirm recharts is preferred, or use d3.js
   directly?
   - Recommendation: recharts (simpler, already in project)

2. **Strict mode UX:** Should we show a warning when switching to strict mode if
   current targets don't sum to 100%?
   - Recommendation: Yes, show info dialog explaining targets will need
     adjustment

3. **Holdings Table default sort:** What should be the initial sort order?
   - Recommendation: Sort by "Asset Class" (ascending), then "Deviation"
     (descending) to highlight issues

4. **Banner priority:** Should we implement the one-time banner, or defer to
   Phase 5?
   - Recommendation: Defer if time-constrained; not critical for Phase 4

5. **Settings section name:** "Allocation" or "Allocation Preferences"?
   - Recommendation: "Allocation" (shorter, consistent with other sections like
     "Appearance")

6. **Tab removal timing:** When will "Targets" and "Composition" tabs be
   removed?
   - Note: Plan for removal before production, but Phase 4 includes all 5 tabs

---

## 14. Critical Implementation Reminders

**DO NOT FORGET:**

✅ **Strict Mode Applies to Both Levels:**

- Validate asset class targets sum to 100%
- Validate holding targets (per asset class) sum to 100%
- Show specific error messages for each level
- Block save when any validation fails

✅ **Sub-Pie Chart Placement:**

- Must appear AFTER allocation target section
- Must appear BEFORE holdings list
- Compact size (200-250px) to fit side panel
- Empty state when no holding targets exist

✅ **Settings Integration:**

- Use existing `SettingsProvider` context (don't create new one)
- Update Settings TypeScript type with new fields
- Add default values in Rust repository
- Test settings persistence across page reloads

✅ **Holdings Table Tab Order:**

- Insert between "Allocation Overview" and "Rebalancing Suggestions"
- Update `TabType` type definition
- Maintain tab state when switching
- Empty state directs users to Allocation Overview

✅ **Backward Compatibility:**

- All Phase 3 features must continue working
- Preview mode is the default (no behavior change for existing users)
- Strict mode is opt-in
- No breaking changes to existing hooks or components

✅ **Component Reuse:**

- Reuse `DataTable` from Holdings page for table view
- Reuse existing color palette constants
- Reuse `TickerAvatar` component
- Don't duplicate validation logic (use shared hook)

✅ **Error Messaging:**

- Be specific: "Equity holdings must sum to 100%. Current: 95.0%"
- Not generic: "Invalid allocation"
- Show all errors simultaneously (don't hide after first error)
- Clear errors when user fixes the issue

✅ **Testing Priority:**

- Settings persistence is critical (affects all features)
- Strict mode validation must be bulletproof
- Holdings Table calculations must be accurate (cascaded percentages)
- Sub-pie chart must handle edge cases (no data, missing holdings)

---

## 15. Pre-Release Checklist

### 15.1 Dark Mode UI Review

Before release, conduct a full dark mode review to ensure all allocation
components match the rest of the UI:

- [ ] Sub-pie chart colors (grey gradient in light mode, orange gradient in dark
      mode)
- [ ] Allocation target bars (Target/Actual bar colors and text contrast)
- [ ] Side panel backgrounds and borders
- [ ] Holdings table row styling
- [ ] Progress bars and status indicators
- [ ] Validation error message colors
- [ ] Tab navigation styling
- [ ] Empty state styling
- [ ] Banner/notification colors

**Testing approach:**

1. Toggle dark mode in system settings or app settings
2. Navigate through all allocation views (Targets, Composition, Pie Chart,
   Holdings Table, Rebalancing)
3. Open side panel and verify all elements are readable
4. Check hover/active states on interactive elements
5. Verify color contrast meets accessibility standards

---

**Last Updated:** February 2, 2026  
**Status:** Planning Complete - Ready for Sprint 1  
**Current Focus:** Awaiting approval to begin implementation  
**Next Step:** Sprint 1 - Settings Infrastructure (1-2 days)
