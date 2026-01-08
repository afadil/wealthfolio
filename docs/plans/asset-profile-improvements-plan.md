# Asset Profile Page Improvements Plan

## Overview

Enhance the asset-profile page with modern UX patterns for profile editing, quick transaction recording, and comprehensive metadata management.

**Design Principles:**
- Modal/Sheet dialogs for all actions (clean page layout)
- Full-screen sheet for comprehensive profile editing (slides from right)
- Modern card-based UI, compact design
- Comprehensive metadata support (sectors, countries, fundamentals, social links, etc.)

---

## Phase 1: Quick Record Actions (Buy/Sell/Dividend)

### 1.1 Quick Action Button Group

**Location:** Asset profile page header area, next to existing "Record Transaction" button

**New Components:**
```
src-front/pages/asset/components/
├── quick-actions/
│   ├── quick-action-menu.tsx          # Dropdown menu with Buy/Sell/Dividend
│   ├── quick-buy-sheet.tsx            # Sheet for quick buy
│   ├── quick-sell-sheet.tsx           # Sheet for quick sell
│   ├── quick-dividend-sheet.tsx       # Sheet for quick dividend
│   └── quick-action-form-fields.tsx   # Shared form components
```

**UI Design:**
- Primary button "Quick Record" with dropdown chevron
- Dropdown shows: Buy, Sell, Dividend, More...
- Each action opens a compact sheet (not full-screen)
- Pre-filled with:
  - Asset symbol (from current page)
  - Current market price (if available)
  - User's default account (most used account)
  - Today's date

**Form Fields (Compact):**

| Buy/Sell Sheet | Dividend Sheet |
|----------------|----------------|
| Shares (quantity) | Amount |
| Price per share | Date |
| Total (auto-calc) | Account |
| Fee (optional) | Tax withheld (optional) |
| Account | Notes (optional) |
| Date | |
| Notes (optional) | |

**Features:**
- Real-time total calculation
- "Use market price" button to fetch current quote
- Account selector with recent accounts first
- Success toast with "View Activity" link

---

## Phase 2: Asset Profile Edit Sheet (Full-Screen)

### 2.1 Sheet Structure

**New Component:**
```
src-front/pages/asset/components/
├── asset-profile-sheet/
│   ├── asset-profile-sheet.tsx        # Main sheet container
│   ├── sections/
│   │   ├── basic-info-section.tsx     # Name, symbol, type
│   │   ├── classification-section.tsx  # Asset class, subclass
│   │   ├── allocation-section.tsx     # Sectors, countries
│   │   ├── fundamentals-section.tsx   # PE, dividend yield, market cap
│   │   ├── description-section.tsx    # Description, notes
│   │   ├── links-section.tsx          # Website, social links
│   │   ├── provider-section.tsx       # Data source settings
│   │   └── danger-zone-section.tsx    # Delete, reset
│   ├── hooks/
│   │   └── use-asset-profile-form.ts  # Form state management
│   └── schemas/
│       └── asset-profile-schema.ts    # Zod validation
```

### 2.2 Section Details

#### Basic Info Section (Card)
```
┌─────────────────────────────────────────────────────┐
│ BASIC INFORMATION                                   │
├─────────────────────────────────────────────────────┤
│ Display Name    [Apple Inc.                    ]    │
│ Symbol          AAPL (read-only)                    │
│ ISIN            [US0378331005                  ]    │
│ Exchange        NASDAQ (read-only)                  │
│ Currency        USD (read-only)                     │
└─────────────────────────────────────────────────────┘
```

#### Classification Section (Card)
```
┌─────────────────────────────────────────────────────┐
│ CLASSIFICATION                                      │
├─────────────────────────────────────────────────────┤
│ Asset Kind      [Security       ▼]                  │
│ Asset Class     [Equity         ▼]                  │
│ Asset Subclass  [Large Cap      ▼]                  │
│                                                     │
│ Custom Tags     [+ Add tag]                         │
│                 [Tech] [Growth] [US Large Cap]      │
└─────────────────────────────────────────────────────┘
```

#### Allocation Section (Card) - Visual Weight Editor
```
┌─────────────────────────────────────────────────────┐
│ SECTOR ALLOCATION                          [+ Add]  │
├─────────────────────────────────────────────────────┤
│ Technology     ████████████████░░░░  80%   [×]     │
│ Services       ████░░░░░░░░░░░░░░░░  20%   [×]     │
│                                                     │
│ COUNTRY ALLOCATION                         [+ Add]  │
├─────────────────────────────────────────────────────┤
│ United States  ████████████████████ 100%   [×]     │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Visual progress bars for weight allocation
- Drag-and-drop reordering
- Auto-suggest from predefined sector/country lists
- Weight validation (warn if doesn't sum to 100%)
- "Fetch from provider" button to auto-populate

#### Fundamentals Section (Card) - For Securities
```
┌─────────────────────────────────────────────────────┐
│ FUNDAMENTALS                        [Fetch Latest]  │
├─────────────────────────────────────────────────────┤
│ Market Cap       $2.89T         P/E Ratio    28.5  │
│ Dividend Yield   0.55%          Beta         1.28  │
│ 52W High         $199.62        52W Low      $124  │
│ Avg Volume       58.2M                             │
└─────────────────────────────────────────────────────┘
```

#### Description Section (Card)
```
┌─────────────────────────────────────────────────────┐
│ DESCRIPTION                                         │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ Apple Inc. designs, manufactures, and markets   │ │
│ │ smartphones, personal computers, tablets...     │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ NOTES (Private)                                     │
│ ┌─────────────────────────────────────────────────┐ │
│ │ Bought during 2023 dip. Long-term hold.        │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

#### Links Section (Card)
```
┌─────────────────────────────────────────────────────┐
│ LINKS & RESOURCES                                   │
├─────────────────────────────────────────────────────┤
│ Website         [https://apple.com             ]    │
│ Investor Relations [https://investor.apple.com ]    │
│                                                     │
│ Research Links                           [+ Add]    │
│ • Yahoo Finance  [https://finance.yahoo...]  [×]    │
│ • Seeking Alpha  [https://seekingalpha...]   [×]    │
└─────────────────────────────────────────────────────┘
```

#### Data Provider Section (Card)
```
┌─────────────────────────────────────────────────────┐
│ DATA PROVIDER                                       │
├─────────────────────────────────────────────────────┤
│ Pricing Mode    [Market Data    ▼]                  │
│ Provider        [Yahoo Finance  ▼]                  │
│                                                     │
│ Provider Symbol Override                            │
│ [AAPL] (leave empty to use default)                │
│                                                     │
│ Last Updated    2024-01-15 16:00 EST               │
│ [Refresh Now]                                       │
└─────────────────────────────────────────────────────┘
```

#### Danger Zone Section (Card)
```
┌─────────────────────────────────────────────────────┐
│ DANGER ZONE                                    ⚠️   │
├─────────────────────────────────────────────────────┤
│ Reset Profile   Clear all custom metadata           │
│                 [Reset to Default]                  │
│                                                     │
│ Delete Asset    Remove asset and all quotes         │
│                 (Activities will be preserved)      │
│                 [Delete Asset]                      │
└─────────────────────────────────────────────────────┘
```

---

## Phase 3: Enhanced Data Model

### 3.1 Extended Profile Schema

**Update:** `crates/core/src/assets/assets_model.rs`

```rust
// New profile structure (stored in `profile` JSON field)
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AssetProfile {
    // Existing
    pub sectors: Option<Vec<Sector>>,
    pub countries: Option<Vec<Country>>,

    // New: Description
    pub description: Option<String>,
    pub website: Option<String>,
    pub investor_relations_url: Option<String>,

    // New: External Links
    pub research_links: Option<Vec<ExternalLink>>,

    // New: Fundamentals (cached from provider)
    pub fundamentals: Option<Fundamentals>,
    pub fundamentals_updated_at: Option<NaiveDateTime>,

    // New: Custom Tags
    pub tags: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExternalLink {
    pub name: String,
    pub url: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Fundamentals {
    pub market_cap: Option<f64>,
    pub pe_ratio: Option<f64>,
    pub dividend_yield: Option<f64>,
    pub beta: Option<f64>,
    pub high_52w: Option<f64>,
    pub low_52w: Option<f64>,
    pub avg_volume: Option<f64>,
}
```

### 3.2 Frontend Types

**Update:** `src-front/types/asset.ts`

```typescript
interface AssetProfile {
  sectors?: Sector[];
  countries?: Country[];
  description?: string;
  website?: string;
  investorRelationsUrl?: string;
  researchLinks?: ExternalLink[];
  fundamentals?: Fundamentals;
  fundamentalsUpdatedAt?: string;
  tags?: string[];
}

interface ExternalLink {
  name: string;
  url: string;
}

interface Fundamentals {
  marketCap?: number;
  peRatio?: number;
  dividendYield?: number;
  beta?: number;
  high52w?: number;
  low52w?: number;
  avgVolume?: number;
}
```

---

## Phase 4: Industry-Standard SOTA Features

### 4.1 Smart Auto-Complete for Sectors/Countries

- Predefined sector list (GICS classification)
- Country list with flags
- Fuzzy search matching
- Recently used items at top

### 4.2 Provider Data Fetch

**"Fetch Profile" Button:**
- Fetches description, sector, country from Yahoo Finance
- Shows diff before applying
- User can cherry-pick which fields to update

### 4.3 Asset Health Indicators

Show badges on asset cards:
- "Missing sectors" - yellow warning
- "Stale price" - orange if >7 days old
- "Complete" - green checkmark

### 4.5 Bulk Edit Support (Future)

From holdings page, select multiple assets and:
- Set sectors for all
- Change asset class
- Add tags

### 4.6 Quick Compare (Future)

Side-by-side comparison of two assets showing:
- Price performance
- Fundamentals
- Allocation breakdown

---

## Phase 5: UI Components Needed

### 5.1 New Reusable Components

```
packages/ui/src/components/
├── allocation-editor/
│   ├── allocation-editor.tsx      # Visual weight bars
│   └── allocation-item.tsx        # Single allocation row
├── tag-input/
│   └── tag-input.tsx              # Enhanced tag input
├── full-sheet/
│   └── full-sheet.tsx             # Full-screen sheet from right
└── stat-card/
    └── stat-card.tsx              # Compact stat display
```

### 5.2 Full Sheet Component

```typescript
// Full-screen sheet that slides from right
<FullSheet
  open={isOpen}
  onOpenChange={setIsOpen}
  title="Edit Asset Profile"
  description="Update asset metadata and classification"
>
  <FullSheetContent>
    {/* Scrollable content */}
  </FullSheetContent>
  <FullSheetFooter>
    <Button variant="outline" onClick={onCancel}>Cancel</Button>
    <Button onClick={onSave}>Save Changes</Button>
  </FullSheetFooter>
</FullSheet>
```

---

## Implementation Order

### Sprint 1: Foundation (Quick Actions)
1. Create quick action menu component
2. Implement quick-buy-sheet with compact form
3. Implement quick-sell-sheet
4. Implement quick-dividend-sheet
5. Add success toasts with activity links

### Sprint 2: Profile Sheet Structure
1. Create FullSheet component
2. Create asset-profile-sheet container
3. Implement basic-info-section
4. Implement classification-section
5. Implement allocation-section with visual editor
6. Wire up form state management

### Sprint 3: Extended Features
1. Implement description-section
2. Implement links-section
3. Implement provider-section
4. Implement danger-zone-section
5. Update backend model for extended profile

### Sprint 4: Polish & SOTA
1. Add "Fetch from provider" functionality
2. Add asset health indicators
3. Optimize for mobile (responsive sheets)
4. Add animations and transitions

---

## File Changes Summary

### New Files
- `src-front/pages/asset/components/quick-actions/` (5 files)
- `src-front/pages/asset/components/asset-profile-sheet/` (10+ files)
- `packages/ui/src/components/allocation-editor/` (2 files)
- `packages/ui/src/components/full-sheet/` (1 file)

### Modified Files
- `src-front/pages/asset/asset-profile-page.tsx` - Add quick action menu, edit button
- `src-front/types/asset.ts` - Extended profile types
- `crates/core/src/assets/assets_model.rs` - Extended profile model
- `crates/core/src/assets/assets_service.rs` - Profile update logic
- `src-front/commands/market-data.ts` - New profile fetch command

---

## Success Metrics

- [ ] User can record buy/sell/dividend in <10 seconds from asset page
- [ ] Profile editing exposes all metadata fields
- [ ] Sector/country editing is visual and intuitive
- [ ] All actions accessible via launcher
- [ ] Mobile-responsive design works on tablets

---

## Open Questions

1. Should we support custom metadata fields (user-defined key-value pairs)?
2. Should "Fetch from provider" auto-run on first view?
3. Do we want historical fundamentals tracking?
4. Should research links open in-app or external browser?
