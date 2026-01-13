# Options Trading Support - Design Document

## Executive Summary

Add full options tracking to Wealthfolio using the existing asset model (`AssetKind::Option`, `OptionSpec`) and a minimal canonical activity type system. The design keeps the holdings calculator simple by using only 5 canonical position-affecting types, with option semantics layered on top via subtypes for labeling/filtering only.

**Key Constraints:**
- No schema changes
- Quantity is always absolute (≥ 0); never use negative quantity to represent short
- Short direction is represented by canonical activity types (`SELL_SHORT` / `BUY_COVER`)
- Compiler only expands truly multi-leg events (`OPTION_EXERCISE` / `OPTION_ASSIGNMENT`)
- Expiration is stored directly as canonical `SELL @ 0` (long) or `BUY_COVER @ 0` (short) with optional `OPTION_EXPIRATION` subtype for labeling
- Option closures use close-at-0 trades to realize premium P&L without special ADJUSTMENT behavior

**Canonical Activity Types (Holdings Calculator Understands Only These):**
```
Buy        // increase long, pay cash
Sell       // decrease long, receive cash
SellShort  // increase short, receive cash
BuyCover   // decrease short, pay cash
Split      // share count transform, no cash
```

**Accounting Conventions (v1):**

| Concept | Convention |
|---------|------------|
| **Activity.quantity** | Always absolute (≥ 0). Direction comes from `activity_type`, never from sign. |
| **Position.lots** | `VecDeque<Lot>` for long lots (ownership). Each lot has positive `quantity`. |
| **Position.short_lots** | `VecDeque<ShortLot>` for short lots (obligation). Each lot has positive `quantity`. |
| **long_quantity** | `Σ lot.quantity` = total quantity in long lots. |
| **short_quantity** | `Σ short_lot.quantity` = total quantity in short lots. |
| **net_quantity** | `long_quantity − short_quantity`. **Can be negative** (net short exposure). Used for exposure display only. |
| **long_cost_basis** | `Σ lot.cost_basis` = total cash paid to acquire long lots. Always positive. |
| **total_premium_received** | `Σ short_lot.premium_received` = total cash received to open shorts. Stored positive, represents inflow. |
| **market_value** | `net_quantity × price × multiplier`. **Negative** when net short. |
| **unrealized_gain (long)** | `long_market_value − long_cost_basis`. Positive = profit, negative = loss. |
| **unrealized_gain (short)** | `total_premium_received − abs(short_market_value)`. Profit when MV (liability) < premium received. |
| **Multiplier** | **Required** in `OptionSpec`. Engine never silently assumes 100. Missing = data error; calculations skipped until corrected. |

**Critical Invariants:**
1. `quantity >= 0` for all activities
2. `Sell` may only consume `lots`, never create `short_lots` (error if closing more than owned)
3. Only `SellShort` and `BuyCover` mutate `short_lots`
4. `cost_basis` in generic views is long-only; short economics come from `premium_received`

---

## 1. System Architecture Context

This section provides context on the existing Wealthfolio calculation architecture and where options trading support will integrate.

### 1.1 High-Level Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           WEALTHFOLIO CALCULATION PIPELINE                           │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                              DATA LAYER                                      │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │    │
│  │  │ Activities│  │  Assets   │  │  Quotes   │  │ FX Rates  │  │ Accounts  │ │    │
│  │  │   Table   │  │   Table   │  │   Table   │  │   Table   │  │   Table   │ │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ │    │
│  └────────┼──────────────┼──────────────┼──────────────┼──────────────┼───────┘    │
│           │              │              │              │              │             │
│           ▼              ▼              ▼              ▼              ▼             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                           REPOSITORY LAYER                                   │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐ │    │
│  │  │ Activity  │  │  Asset    │  │  Quote    │  │    FX     │  │  Account  │ │    │
│  │  │ Repository│  │ Repository│  │ Repository│  │ Repository│  │ Repository│ │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘ │    │
│  └────────┼──────────────┼──────────────┼──────────────┼──────────────┼───────┘    │
│           │              │              │              │              │             │
│           ▼              ▼              ▼              ▼              ▼             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                            SERVICE LAYER                                     │    │
│  │                                                                              │    │
│  │  ┌───────────────┐    ┌───────────────┐    ┌───────────────────────────┐   │    │
│  │  │   Activity    │    │    Asset      │    │        FX Service         │   │    │
│  │  │   Service     │    │   Service     │    │  ┌───────────────────┐    │   │    │
│  │  │               │    │               │    │  │ Currency Converter│    │   │    │
│  │  │ • CRUD ops    │    │ • CRUD ops    │    │  │ (cached rates)    │    │   │    │
│  │  │ • Validation  │    │ • Enrichment  │    │  └───────────────────┘    │   │    │
│  │  │ • Search      │    │ • Option spec │    │  • convert_for_date()    │   │    │
│  │  └───────┬───────┘    └───────┬───────┘    └───────────┬───────────────┘   │    │
│  │          │                    │                        │                    │    │
│  └──────────┼────────────────────┼────────────────────────┼────────────────────┘    │
│             │                    │                        │                         │
│             ▼                    ▼                        ▼                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                         CALCULATION LAYER                                    │    │
│  │                                                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                      ACTIVITY COMPILER                               │    │    │
│  │  │  (In-Memory, Stateless, Deterministic)                               │    │    │
│  │  │                                                                      │    │    │
│  │  │  Expands subtypes into canonical postings:                           │    │    │
│  │  │  • DRIP → DIVIDEND + BUY                                             │    │    │
│  │  │  • STAKING_REWARD → INTEREST + BUY                                   │    │    │
│  │  │  • OPTION_EXERCISE → underlying trade + SELL option @ 0   [NEW]     │    │    │
│  │  │  • OPTION_ASSIGNMENT → underlying + BUY_COVER option @ 0  [NEW]     │    │    │
│  │  │  (OPTION_EXPIRATION: stored as canonical SELL/BUY_COVER, no expand) │    │    │
│  │  └──────────────────────────────┬──────────────────────────────────────┘    │    │
│  │                                 │                                           │    │
│  │                                 ▼                                           │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                     SNAPSHOT SERVICE                                 │    │    │
│  │  │  (Orchestrates daily snapshot calculation)                           │    │    │
│  │  │                                                                      │    │    │
│  │  │  1. Fetch activities for date range                                  │    │    │
│  │  │  2. Apply split adjustments retroactively                            │    │    │
│  │  │  3. Group by account and date                                        │    │    │
│  │  │  4. For each day: call HoldingsCalculator                            │    │    │
│  │  │  5. Store keyframes to holdings_snapshots table                      │    │    │
│  │  └──────────────────────────────┬──────────────────────────────────────┘    │    │
│  │                                 │                                           │    │
│  │                                 ▼                                           │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                    HOLDINGS CALCULATOR                               │    │    │
│  │  │  (Processes activities → updates positions & cash)                   │    │    │
│  │  │                                                                      │    │    │
│  │  │  Activity Type Handlers:                                             │    │    │
│  │  │  ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐      │    │    │
│  │  │  │   BUY   │  SELL   │ DEPOSIT │DIVIDEND │TRANSFER │   FEE   │      │    │    │
│  │  │  │         │         │         │INTEREST │ IN/OUT  │   TAX   │      │    │    │
│  │  │  │+position│-position│  +cash  │  +cash  │±pos/cash│  -cash  │      │    │    │
│  │  │  │  -cash  │  +cash  │+net_dep │         │±net_dep │         │      │    │    │
│  │  │  └─────────┴─────────┴─────────┴─────────┴─────────┴─────────┘      │    │    │
│  │  │  ┌─────────┬─────────┐                                               │    │    │
│  │  │  │  SELL_  │  BUY_   │  [NEW - Options Only]                        │    │    │
│  │  │  │  SHORT  │  COVER  │                                               │    │    │
│  │  │  │+short   │-short   │                                               │    │    │
│  │  │  │  +cash  │  -cash  │                                               │    │    │
│  │  │  └─────────┴─────────┘                                               │    │    │
│  │  │                                                                      │    │    │
│  │  │  Output: AccountStateSnapshot (positions, cash, cost_basis)          │    │    │
│  │  └──────────────────────────────┬──────────────────────────────────────┘    │    │
│  │                                 │                                           │    │
│  └─────────────────────────────────┼───────────────────────────────────────────┘    │
│                                    │                                                │
│                                    ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                          VALUATION LAYER                                     │    │
│  │                                                                              │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                      HOLDINGS SERVICE                                │    │    │
│  │  │  (Converts snapshots to display-ready Holdings)                      │    │    │
│  │  │                                                                      │    │    │
│  │  │  1. Get latest snapshot from SnapshotService                         │    │    │
│  │  │  2. Fetch asset metadata for each position                           │    │    │
│  │  │  3. Call ValuationService for market values                          │    │    │
│  │  │  4. Calculate portfolio weights                                       │    │    │
│  │  └──────────────────────────────┬──────────────────────────────────────┘    │    │
│  │                                 │                                           │    │
│  │                                 ▼                                           │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                 HOLDINGS VALUATION SERVICE                           │    │    │
│  │  │  (Adds market values and gains to holdings)                          │    │    │
│  │  │                                                                      │    │    │
│  │  │  Valuation by Asset Kind:                                            │    │    │
│  │  │  ┌────────────────┬────────────────┬────────────────┐               │    │    │
│  │  │  │   SECURITY     │  ALTERNATIVE   │     OPTION     │               │    │    │
│  │  │  │                │                │     [NEW]      │               │    │    │
│  │  │  │ price × qty    │ manual quote   │ premium × qty  │               │    │    │
│  │  │  │ from provider  │ × qty          │ × multiplier   │               │    │    │
│  │  │  └────────────────┴────────────────┴────────────────┘               │    │    │
│  │  │                                                                      │    │    │
│  │  │  • Unrealized gain = market_value - cost_basis                       │    │    │
│  │  │  • Day change from previous close                                    │    │    │
│  │  │  • FX conversion to base currency                                    │    │    │
│  │  └─────────────────────────────────────────────────────────────────────┘    │    │
│  │                                                                              │    │
│  └──────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow: Activity to Holding

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    ACTIVITY → HOLDING TRANSFORMATION PIPELINE                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│   USER INPUT                    STORAGE                      CALCULATION             │
│   ──────────                    ───────                      ───────────             │
│                                                                                      │
│   ┌─────────────┐              ┌─────────────┐                                       │
│   │  Activity   │   persist    │  activities │                                       │
│   │   Form/API  │ ──────────▶  │    table    │                                       │
│   └─────────────┘              └──────┬──────┘                                       │
│                                       │                                              │
│                                       │ fetch                                        │
│                                       ▼                                              │
│                                ┌─────────────┐                                       │
│                                │  Activity   │                                       │
│                                │  Service    │                                       │
│                                └──────┬──────┘                                       │
│                                       │                                              │
│                                       │ load activities                              │
│                                       ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐      │
│   │                         COMPILER (In-Memory)                              │      │
│   │                                                                           │      │
│   │   Input Activities          Expansion Rules           Output Postings     │      │
│   │   ────────────────          ───────────────           ───────────────     │      │
│   │                                                                           │      │
│   │   ┌─────────────┐                                    ┌─────────────┐     │      │
│   │   │ BUY AAPL    │ ──── pass through ────────────▶   │ BUY AAPL    │     │      │
│   │   │ qty: 100    │                                    │ qty: 100    │     │      │
│   │   └─────────────┘                                    └─────────────┘     │      │
│   │                                                                           │      │
│   │   ┌─────────────┐           ┌───────────┐           ┌─────────────┐     │      │
│   │   │ DRIP        │           │ DIVIDEND  │           │ DIVIDEND    │     │      │
│   │   │ subtype     │ ────▶     │     +     │ ────▶     ├─────────────┤     │      │
│   │   │             │           │    BUY    │           │ BUY shares  │     │      │
│   │   └─────────────┘           └───────────┘           └─────────────┘     │      │
│   │                                                                           │      │
│   │   ┌─────────────┐           ┌───────────┐           ┌─────────────┐     │      │
│   │   │ OPTION_     │           │BUY under- │           │ BUY AAPL    │     │      │
│   │   │ EXERCISE    │ ────▶     │  lying    │ ────▶     │ qty: 100    │     │      │
│   │   │ (CALL)      │           │     +     │           ├─────────────┤     │      │
│   │   │ [NEW]       │           │SELL opt@0 │           │ SELL option │     │      │
│   │   └─────────────┘           └───────────┘           │ @ price: 0  │     │      │
│   │                                                      └─────────────┘     │      │
│   └───────────────────────────────────┬──────────────────────────────────────┘      │
│                                       │                                              │
│                                       │ compiled postings                            │
│                                       ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐      │
│   │                      HOLDINGS CALCULATOR                                  │      │
│   │                                                                           │      │
│   │   Previous Snapshot    +    Today's Postings    =    Next Snapshot       │      │
│   │   ─────────────────         ────────────────         ─────────────       │      │
│   │                                                                           │      │
│   │   ┌─────────────┐          ┌─────────────┐          ┌─────────────┐     │      │
│   │   │ Positions:  │          │ BUY AAPL    │          │ Positions:  │     │      │
│   │   │  AAPL: 100  │    +     │ qty: 50     │    =     │  AAPL: 150  │     │      │
│   │   │             │          │ price: $150 │          │             │     │      │
│   │   │ Cash:       │          │             │          │ Cash:       │     │      │
│   │   │  $10,000    │          │             │          │  $2,500     │     │      │
│   │   └─────────────┘          └─────────────┘          └─────────────┘     │      │
│   │                                                                           │      │
│   │   Position Update Logic:                                                  │      │
│   │   • BUY: add lot to position, deduct cash                                │      │
│   │   • SELL: remove lots FIFO, add cash                                     │      │
│   │   • SELL_SHORT: add short lot, add cash (premium)           [NEW]       │      │
│   │   • BUY_COVER: remove short lots FIFO, deduct cash          [NEW]       │      │
│   │                                                                           │      │
│   └───────────────────────────────────┬──────────────────────────────────────┘      │
│                                       │                                              │
│                                       │ snapshot                                     │
│                                       ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐      │
│   │                      SNAPSHOT STORAGE                                     │      │
│   │                                                                           │      │
│   │   holdings_snapshots table:                                               │      │
│   │   ┌─────────────────────────────────────────────────────────────────┐   │      │
│   │   │ id: "ACC1_2024-01-15"                                            │   │      │
│   │   │ positions: { "AAPL": { qty: 150, lots: [...], cost_basis: ... }} │   │      │
│   │   │ cash_balances: { "USD": 2500 }                                   │   │      │
│   │   │ cost_basis: 22500                                                │   │      │
│   │   │ net_contribution: 25000                                          │   │      │
│   │   └─────────────────────────────────────────────────────────────────┘   │      │
│   │                                                                           │      │
│   │   Keyframe Strategy: Only save snapshots when activities exist           │      │
│   │   (days without activities carry forward previous snapshot)              │      │
│   │                                                                           │      │
│   └───────────────────────────────────┬──────────────────────────────────────┘      │
│                                       │                                              │
│                                       │ fetch snapshot                               │
│                                       ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐      │
│   │                      VALUATION SERVICE                                    │      │
│   │                                                                           │      │
│   │   Snapshot Position    +    Market Quote    =    Valued Holding          │      │
│   │   ─────────────────         ────────────         ─────────────           │      │
│   │                                                                           │      │
│   │   ┌─────────────┐          ┌─────────────┐          ┌─────────────┐     │      │
│   │   │ AAPL        │          │ AAPL quote  │          │ Holding:    │     │      │
│   │   │ qty: 150    │    +     │ close: $175 │    =     │ qty: 150    │     │      │
│   │   │ cost: $150  │          │             │          │ price: $175 │     │      │
│   │   │             │          │             │          │ MV: $26,250 │     │      │
│   │   │             │          │             │          │ gain: $3750 │     │      │
│   │   └─────────────┘          └─────────────┘          └─────────────┘     │      │
│   │                                                                           │      │
│   │   Option Valuation [NEW]:                                                 │      │
│   │   • market_value = qty × premium × multiplier                            │      │
│   │   • Short positions: track as obligation, inverted P&L                   │      │
│   │                                                                           │      │
│   └───────────────────────────────────┬──────────────────────────────────────┘      │
│                                       │                                              │
│                                       │ holdings                                     │
│                                       ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐      │
│   │                           UI DISPLAY                                      │      │
│   │                                                                           │      │
│   │   Holdings Page:                                                          │      │
│   │   ┌─────────────────────────────────────────────────────────────────┐   │      │
│   │   │ Symbol │   Qty  │ Price  │  Value   │ Cost Basis │   Gain     │   │      │
│   │   │────────│────────│────────│──────────│────────────│────────────│   │      │
│   │   │ AAPL   │   150  │ $175   │ $26,250  │  $22,500   │ +$3,750    │   │      │
│   │   │ AAPL   │    +2  │  $5.50 │  $1,100  │   $1,000   │   +$100    │   │      │
│   │   │ 150C   │        │        │          │            │            │   │      │
│   │   └─────────────────────────────────────────────────────────────────┘   │      │
│   │                                                                           │      │
│   └──────────────────────────────────────────────────────────────────────────┘      │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Position & Lot Model Detail

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           POSITION & LOT DATA MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  AccountStateSnapshot                                                                │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                │  │
│  │  id: "ACC1_2024-01-15"                                                        │  │
│  │  account_id: "ACC1"                                                           │  │
│  │  snapshot_date: 2024-01-15                                                    │  │
│  │  currency: "USD"                                                              │  │
│  │                                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐ │  │
│  │  │  positions: HashMap<asset_id, Position>                                  │ │  │
│  │  │                                                                          │ │  │
│  │  │  "AAPL" ──▶ Position                                                    │ │  │
│  │  │             ┌──────────────────────────────────────────────────────┐    │ │  │
│  │  │             │ asset_id: "AAPL"                                      │    │ │  │
│  │  │             │ quantity: 150          (sum of all lots)              │    │ │  │
│  │  │             │ average_cost: $150     (cost_basis / quantity)        │    │ │  │
│  │  │             │ total_cost_basis: $22,500                             │    │ │  │
│  │  │             │ currency: "USD"                                       │    │ │  │
│  │  │             │ inception_date: 2024-01-10                            │    │ │  │
│  │  │             │ is_alternative: false                                 │    │ │  │
│  │  │             │                                                       │    │ │  │
│  │  │             │ lots: VecDeque<Lot>  ──────────────────────────────┐ │    │ │  │
│  │  │             │ ┌─────────┐ ┌─────────┐ ┌─────────┐               │ │    │ │  │
│  │  │             │ │ Lot 1   │ │ Lot 2   │ │ Lot 3   │  (FIFO order) │ │    │ │  │
│  │  │             │ │ qty:50  │ │ qty:50  │ │ qty:50  │               │ │    │ │  │
│  │  │             │ │ cost:   │ │ cost:   │ │ cost:   │               │ │    │ │  │
│  │  │             │ │ $7,500  │ │ $7,500  │ │ $7,500  │               │ │    │ │  │
│  │  │             │ │ price:  │ │ price:  │ │ price:  │               │ │    │ │  │
│  │  │             │ │  $150   │ │  $150   │ │  $150   │               │ │    │ │  │
│  │  │             │ │ date:   │ │ date:   │ │ date:   │               │ │    │ │  │
│  │  │             │ │ 01-10   │ │ 01-12   │ │ 01-15   │               │ │    │ │  │
│  │  │             │ └─────────┘ └─────────┘ └─────────┘               │ │    │ │  │
│  │  │             │ ◀────────────────────────────────────────────────┘ │    │ │  │
│  │  │             │                                                       │    │ │  │
│  │  │             │ short_lots: VecDeque<ShortLot>  [NEW - for options]  │    │ │  │
│  │  │             │ (empty for regular securities)                        │    │ │  │
│  │  │             └──────────────────────────────────────────────────────┘    │ │  │
│  │  │                                                                          │ │  │
│  │  │  "OPT_AAPL_20241220_C_150" ──▶ Position (Option)                        │ │  │
│  │  │             ┌──────────────────────────────────────────────────────┐    │ │  │
│  │  │             │ asset_id: "OPT_AAPL_20241220_C_150"                   │    │ │  │
│  │  │             │ quantity: 5            (net: long - short)            │    │ │  │
│  │  │             │ currency: "USD"                                       │    │ │  │
│  │  │             │                                                       │    │ │  │
│  │  │             │ lots: VecDeque<Lot>  (long option positions)         │    │ │  │
│  │  │             │ ┌─────────┐ ┌─────────┐                               │    │ │  │
│  │  │             │ │ Lot 1   │ │ Lot 2   │                               │    │ │  │
│  │  │             │ │ qty: 3  │ │ qty: 2  │                               │    │ │  │
│  │  │             │ │ cost:   │ │ cost:   │  (premium × multiplier)       │    │ │  │
│  │  │             │ │ $1,500  │ │ $1,000  │                               │    │ │  │
│  │  │             │ └─────────┘ └─────────┘                               │    │ │  │
│  │  │             │                                                       │    │ │  │
│  │  │             │ short_lots: VecDeque<ShortLot>  [NEW]                 │    │ │  │
│  │  │             │ ┌─────────┐                                           │    │ │  │
│  │  │             │ │ShortLot │  (written/short option positions)        │    │ │  │
│  │  │             │ │ qty: 0  │                                           │    │ │  │
│  │  │             │ │ premium:│                                           │    │ │  │
│  │  │             │ │  $0     │                                           │    │ │  │
│  │  │             │ └─────────┘                                           │    │ │  │
│  │  │             └──────────────────────────────────────────────────────┘    │ │  │
│  │  │                                                                          │ │  │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                                │  │
│  │  ┌─────────────────────────────────────────────────────────────────────────┐ │  │
│  │  │  cash_balances: HashMap<currency, Decimal>                              │ │  │
│  │  │                                                                          │ │  │
│  │  │  "USD" ──▶ 5,000.00                                                     │ │  │
│  │  │  "EUR" ──▶ 1,500.00                                                     │ │  │
│  │  └─────────────────────────────────────────────────────────────────────────┘ │  │
│  │                                                                                │  │
│  │  Aggregates:                                                                  │  │
│  │  • cost_basis: $25,000 (all positions converted to account currency)         │  │
│  │  • net_contribution: $30,000 (deposits - withdrawals)                        │  │
│  │  • net_contribution_base: $30,000 (in portfolio base currency)               │  │
│  │  • cash_total_account_currency: $6,500                                       │  │
│  │  • cash_total_base_currency: $6,500                                          │  │
│  │                                                                                │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 FX Service Integration

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           FX SERVICE & CURRENCY FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Currency Hierarchy (4 levels):                                                      │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                │  │
│  │  1. ACTIVITY CURRENCY        The currency of the transaction                  │  │
│  │     └──▶ activity.currency   (e.g., EUR for European stock purchase)         │  │
│  │                                                                                │  │
│  │  2. POSITION CURRENCY        The asset's listing currency                     │  │
│  │     └──▶ asset.currency      (e.g., EUR for stock listed on Euronext)        │  │
│  │                                                                                │  │
│  │  3. ACCOUNT CURRENCY         The account's reporting currency                 │  │
│  │     └──▶ account.currency    (e.g., USD for US brokerage account)            │  │
│  │                                                                                │  │
│  │  4. BASE CURRENCY            Portfolio's base currency for aggregation        │  │
│  │     └──▶ settings.base_ccy   (e.g., USD for overall portfolio)               │  │
│  │                                                                                │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  FX Service Operations:                                                              │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                │  │
│  │  ┌────────────────────────────────────────────────────────────────────────┐  │  │
│  │  │                      CurrencyConverter (Cached)                        │  │  │
│  │  │                                                                         │  │  │
│  │  │  rates: HashMap<(from, to, date), Decimal>                             │  │  │
│  │  │                                                                         │  │  │
│  │  │  ┌─────────────────────────────────────────────────────────────────┐  │  │  │
│  │  │  │ ("EUR", "USD", 2024-01-15) ──▶ 1.0850                           │  │  │  │
│  │  │  │ ("GBP", "USD", 2024-01-15) ──▶ 1.2700                           │  │  │  │
│  │  │  │ ("USD", "EUR", 2024-01-15) ──▶ 0.9217                           │  │  │  │
│  │  │  └─────────────────────────────────────────────────────────────────┘  │  │  │
│  │  │                                                                         │  │  │
│  │  │  Methods:                                                               │  │  │
│  │  │  • convert_currency_for_date(amount, from, to, date) -> Decimal       │  │  │
│  │  │  • get_latest_exchange_rate(from, to) -> ExchangeRate                 │  │  │
│  │  │                                                                         │  │  │
│  │  └────────────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                                │  │
│  │  Used By:                                                                      │  │
│  │  • HoldingsCalculator: Convert cost basis to account currency                 │  │
│  │  • HoldingsCalculator: Convert net_contribution to base currency             │  │
│  │  • ValuationService: Convert market values to base currency                  │  │
│  │  • SnapshotService: Aggregate multi-currency positions                       │  │
│  │                                                                                │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  Conversion Example (BUY activity):                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │                                                                                │  │
│  │  Activity: BUY 100 ASML @ €700 (EUR) in USD account                          │  │
│  │                                                                                │  │
│  │  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐                   │  │
│  │  │  Activity   │      │  Position   │      │  Snapshot   │                   │  │
│  │  │  (EUR)      │      │  (EUR)      │      │  (USD)      │                   │  │
│  │  │             │      │             │      │             │                   │  │
│  │  │ qty: 100    │      │ qty: 100    │      │ cost_basis: │                   │  │
│  │  │ price: €700 │ ───▶ │ cost:       │ ───▶ │ $75,950     │                   │  │
│  │  │ cost:€70000 │  (1) │ €70,000     │  (2) │ (converted) │                   │  │
│  │  │ ccy: EUR    │      │ ccy: EUR    │      │             │                   │  │
│  │  └─────────────┘      └─────────────┘      └─────────────┘                   │  │
│  │                                                                                │  │
│  │  (1) Lot stored in position currency (EUR)                                    │  │
│  │  (2) Snapshot cost_basis converted: €70,000 × 1.085 = $75,950                │  │
│  │                                                                                │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.5 Where Options Trading Integrates

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                    OPTIONS TRADING INTEGRATION POINTS                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  LAYER                 COMPONENT                    CHANGES FOR OPTIONS              │
│  ─────                 ─────────                    ─────────────────────            │
│                                                                                      │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ CONSTANTS         activities_constants.rs                                      │  │
│  │                                                                                │  │
│  │                   + ACTIVITY_TYPE_SELL_SHORT                                  │  │
│  │                   + ACTIVITY_TYPE_BUY_COVER                                   │  │
│  │                   + ACTIVITY_SUBTYPE_OPTION_EXERCISE                          │  │
│  │                   + ACTIVITY_SUBTYPE_OPTION_ASSIGNMENT                        │  │
│  │                   + ACTIVITY_SUBTYPE_OPTION_EXPIRATION                        │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                          │
│                                           ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ MODEL              activities_model.rs                                         │  │
│  │                                                                                │  │
│  │                   ActivityType enum:                                           │  │
│  │                   + SellShort                                                  │  │
│  │                   + BuyCover                                                   │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                          │
│                                           ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ COMPILER          compiler.rs                                                  │  │
│  │                                                                                │  │
│  │                   compile() method (ONLY multi-leg events):                   │  │
│  │                   + match OPTION_EXERCISE:                                     │  │
│  │                       if CALL: emit BUY underlying + SELL option @ 0          │  │
│  │                       if PUT:  emit SELL underlying + SELL option @ 0         │  │
│  │                   + match OPTION_ASSIGNMENT:                                   │  │
│  │                       if CALL: emit SELL underlying + BUY_COVER option @ 0    │  │
│  │                       if PUT:  emit BUY underlying + BUY_COVER option @ 0     │  │
│  │                                                                                │  │
│  │                   OPTION_EXPIRATION: NO EXPANSION (stored as canonical)       │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                          │
│                                           ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ POSITION          positions_model.rs                                           │  │
│  │                                                                                │  │
│  │                   Position struct:                                             │  │
│  │                   + short_lots: VecDeque<ShortLot>                             │  │
│  │                   + net_quantity() -> long_qty - short_qty                     │  │
│  │                                                                                │  │
│  │                   + ShortLot struct (new)                                      │  │
│  │                   + reduce_short_lots_fifo()                                   │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                          │
│                                           ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ CALCULATOR        holdings_calculator.rs                                       │  │
│  │                                                                                │  │
│  │                   process_single_activity():                                   │  │
│  │                   + handle_sell_short() - create short lot, add cash          │  │
│  │                   + handle_buy_cover() - close short lot, deduct cash         │  │
│  │                                                                                │  │
│  │                   calculate_option_notional():                                 │  │
│  │                   + notional = qty × price × multiplier                        │  │
│  │                   + Apply for BUY/SELL/SELL_SHORT/BUY_COVER when Option       │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                          │
│                                           ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ VALUATION         holdings_valuation_service.rs                                │  │
│  │                                                                                │  │
│  │                   calculate_holding_valuation():                               │  │
│  │                   + if asset.kind == Option:                                   │  │
│  │                       market_value = qty × premium × multiplier               │  │
│  │                       (use manual quotes for now)                              │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                           │                                          │
│                                           ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────────┐  │
│  │ ASSET             assets_service.rs                                            │  │
│  │                                                                                │  │
│  │                   + create_option_asset() helper                               │  │
│  │                   + Option ID format: OPT_{UNDERLYING}_{DATE}_{C|P}_{STRIKE}  │  │
│  │                   + OptionSpec in metadata.option                              │  │
│  └───────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Current State Analysis

### What Already Exists

#### Asset Model (`crates/core/src/assets/assets_model.rs`)
```rust
pub enum AssetKind {
    // ... other kinds ...
    Option,  // Options contracts - ALREADY EXISTS
}

pub struct OptionSpec {
    pub underlying_asset_id: String,
    pub expiration: chrono::NaiveDate,
    pub right: String,           // CALL or PUT
    pub strike: Decimal,
    pub multiplier: Decimal,     // Usually 100 for equity options
    pub occ_symbol: Option<String>,
}
```

#### Key Observations
1. **Option is an "investment" asset** - included in TWR/IRR calculations (`is_investment() = true`)
2. **Pricing Mode**: Options return `None` from `to_instrument_id()` - no automatic market data lookup
3. **subtype** exists and is used for DRIP, STAKING_REWARD, etc.
4. **Activity economics fields** (`quantity`, `unit_price`, `amount`, `fee`) are optional in general, but **for option trading activities, `quantity` and `unit_price` are required** - missing values result in calculation errors
5. **`effective_type()`** is the authoritative type for compiler/calculator
6. **`Activity::get_meta(key)`** only reads top-level keys in metadata (no dotted paths)
7. **Compiler runs in-memory** during calculation, so expansion must be deterministic and ideally stateless

### What's Missing
1. Canonical activity types for short positions (`SELL_SHORT`, `BUY_COVER`)
2. Option-specific activity subtypes (EXERCISE, ASSIGNMENT, EXPIRATION)
3. Activity compiler rules for option events
4. Multiplier-aware notional calculations in holdings calculator
5. Option-specific valuation logic
6. UI components for options management

---

## 2. Options Trading Fundamentals

### Position Types
| Position | Description | Activity Type to Open |
|----------|-------------|----------------------|
| **Long Call** | Right to buy underlying at strike | `BUY` |
| **Long Put** | Right to sell underlying at strike | `BUY` |
| **Short Call** | Obligation to sell if assigned | `SELL_SHORT` |
| **Short Put** | Obligation to buy if assigned | `SELL_SHORT` |

### Option Lifecycle Events
1. **Open Long**: `BUY` option contract (pay premium)
2. **Close Long**: `SELL` option contract (receive premium)
3. **Open Short**: `SELL_SHORT` option contract (receive premium)
4. **Close Short**: `BUY_COVER` option contract (pay premium)
5. **Exercise**: Holder exercises their right (long positions only)
6. **Assignment**: Writer is forced to fulfill (short positions only)
7. **Expiration**: Contract expires (worthless or auto-exercised)

### Cash Flow Patterns
| Event | Long Position | Short Position |
|-------|---------------|----------------|
| Open | Pay premium (`BUY`) | Receive premium (`SELL_SHORT`) |
| Close | Receive premium (`SELL`) | Pay premium (`BUY_COVER`) |
| Exercise | Exchange at strike | N/A (invalid) |
| Assignment | N/A (invalid) | Forced exchange at strike |
| Expire Worthless | `SELL` @ 0 (realize loss) | `BUY_COVER` @ 0 (realize gain) |
| Expire ITM | Auto-exercise | Auto-assignment |

---

## 3. Proposed Design

### 3.1 Canonical Activity Types (Position-Affecting)

The holdings calculator understands exactly **5 canonical activity types** that affect positions. Everything options-specific is semantics layered on top of these, not new types.

```rust
// In activities_constants.rs - The ONLY types the calculator processes for positions

/// Increase long position, pay cash
pub const ACTIVITY_TYPE_BUY: &str = "BUY";

/// Decrease long position, receive cash
pub const ACTIVITY_TYPE_SELL: &str = "SELL";

/// Increase short position, receive cash (premium for options)
pub const ACTIVITY_TYPE_SELL_SHORT: &str = "SELL_SHORT";

/// Decrease short position, pay cash (premium for options)
pub const ACTIVITY_TYPE_BUY_COVER: &str = "BUY_COVER";

/// Share count transform, no cash (applies to any asset including options)
pub const ACTIVITY_TYPE_SPLIT: &str = "SPLIT";
```

Update trading types list:

```rust
pub const TRADING_ACTIVITY_TYPES: [&str; 5] = [
    ACTIVITY_TYPE_BUY,
    ACTIVITY_TYPE_SELL,
    ACTIVITY_TYPE_SELL_SHORT,
    ACTIVITY_TYPE_BUY_COVER,
    ACTIVITY_TYPE_SPLIT,
];
```

**v1 Restriction**: `SELL_SHORT` and `BUY_COVER` are allowed only when `asset.kind == AssetKind::Option`. Design should allow stocks later (v2+).

**Rationale**: With absolute quantities, `SELL` cannot distinguish "sell-to-close long" from "sell-to-open short". These canonicals keep the calculator simple and avoid "infer intent from state" bugs.

**Important**: Option-specific events (expiration, exercise, assignment) are NOT new canonical types - they are either:
1. Stored directly as canonical types (`SELL @ 0` for long expiration)
2. Expanded by the compiler into canonical types (exercise/assignment → underlying trade + option close)

### 3.2 Option Lifecycle Subtypes

Add these subtypes for semantic labeling and compiler inputs:

```rust
// In activities_constants.rs

/// Option exercise: Long holder exercises their option right
/// COMPILER-EXPANDED: CALL → BUY underlying + SELL option @ 0
///                    PUT  → SELL underlying + SELL option @ 0
pub const ACTIVITY_SUBTYPE_OPTION_EXERCISE: &str = "OPTION_EXERCISE";

/// Option assignment: Short writer is assigned
/// COMPILER-EXPANDED: CALL → SELL underlying + BUY_COVER option @ 0
///                    PUT  → BUY underlying + BUY_COVER option @ 0
pub const ACTIVITY_SUBTYPE_OPTION_ASSIGNMENT: &str = "OPTION_ASSIGNMENT";

/// Option expiration: Contract expires worthless (OTM at expiry)
/// NOT COMPILER-EXPANDED - stored directly as canonical:
///   Long expiration  → SELL @ 0 with subtype=OPTION_EXPIRATION
///   Short expiration → BUY_COVER @ 0 with subtype=OPTION_EXPIRATION
/// The subtype is INFORMATIONAL ONLY - compiler ignores it, calculator ignores it.
/// Used by UI/reports for chips, filters, and grouping.
pub const ACTIVITY_SUBTYPE_OPTION_EXPIRATION: &str = "OPTION_EXPIRATION";
```

**Key Design Decision - Expiration is Canonical Only:**

Expiration is represented canonically as `SELL @ 0` (long) or `BUY_COVER @ 0` (short), with optional `subtype=OPTION_EXPIRATION` for labeling. This eliminates the need for:
- Compiler expansion logic for expiration
- `metadata.option.position_type` requirement for expiration
- Any "is this long or short?" inference bugs

The compiler passes through activities with `subtype=OPTION_EXPIRATION` unchanged - they are already in canonical form.

**Note**: No separate `AUTO_EXERCISE` needed in v1; it's a UI/origin detail, not an accounting primitive.

### 3.3 Metadata Structure (Simplified)

> **⚠️ IMPORTANT - Metadata Contract:**
>
> Activity `metadata.option.*` fields are **NOT part of the core model contract**.
> The engine only reads option structure from the Asset's `OptionSpec`.
> Activity-level option fields are permitted only as raw source data for the importer
> (to initially populate the Asset), but are **ignored at runtime**.

**Design Principle**: Option structural info belongs on the **Asset**, not the Activity. Activity metadata only stores source traceability and compiler bookkeeping.

#### Asset Metadata (Primary Source)

All option structural info is stored in `assets.metadata.option`:

```json
{
  "option": {
    "underlying_asset_id": "AAPL",
    "strike": "150.00",
    "right": "CALL",
    "expiration": "2024-12-20",
    "multiplier": "100",
    "occ_symbol": "AAPL  241220C00150000"
  }
}
```

This maps to `OptionSpec` in the code. The compiler and calculator always read option details from the Asset via `asset.option_spec()`.

#### Activity Metadata (Minimal)

Activity metadata only contains:
1. **Source traceability** - original broker data for import debugging
2. **Compiler bookkeeping** - tracking for expanded legs (virtual only, not persisted)

```json
{
  "source": {
    "raw_option_type": "BTO",
    "broker_description": "Buy to Open AAPL 12/20/24 150 Call"
  },
  "compiler": {
    "compiled_from_activity_id": "ACT123",
    "compiled_group_id": "uuid-or-hash",
    "compiled_leg_index": 0
  }
}
```

**What NOT to store in Activity metadata:**
- `option.underlying_asset_id` - use `asset_id → Asset.option_spec().underlying_asset_id`
- `option.strike` - use `asset_id → Asset.option_spec().strike`
- `option.right` - use `asset_id → Asset.option_spec().right`
- `option.expiration` - use `asset_id → Asset.option_spec().expiration`
- `option.multiplier` - use `asset_id → Asset.option_spec().multiplier`
- `option.position_type` - not needed; the compiler validates using position state, not metadata

**Important - State-Based Validation:**

The compiler never relies on `metadata.position_type`. Instead, it reads the current position to validate:
- `OPTION_EXERCISE`: requires `net_quantity > 0` (must have a long position)
- `OPTION_ASSIGNMENT`: requires `net_quantity < 0` (must have a short position)

This keeps the system self-consistent and state-driven, eliminating the possibility of metadata/state disagreement.

**Metadata Fields:**

| Key | Location | Purpose | Required |
|-----|----------|---------|----------|
| `option.*` | **Asset only** | All structural option info via `OptionSpec` | Yes for options |
| `source.raw_option_type` | Activity | Original broker option type (BTO, STO, BTC, STC) | For traceability |
| `source.broker_description` | Activity | Original broker description | For debugging |
| `compiler.*` | Activity (virtual) | Expansion tracking for grouped display | Virtual only |

The `compiler.*` fields are virtual-only (not persisted). They help UI grouping/debugging for exercise/assignment legs.

### 3.4 Activity Compiler Expansion Rules

The compiler runs on-the-fly while calculating, expanding subtypes into **virtual postings** (not persisted), then passes them to the holdings calculator.

**Compiler Scope - Only Multi-Leg Events:**

The compiler should only handle events that **truly must fan out into multiple legs**:
- `OPTION_EXERCISE` - emits underlying trade + close option @ 0
- `OPTION_ASSIGNMENT` - emits underlying trade + close option @ 0
- `DRIP` - emits DIVIDEND + BUY (already implemented)
- Future: `MERGER`, `SPINOFF`, etc.

**What the Compiler Does NOT Expand:**
- `OPTION_EXPIRATION` - stored directly as canonical `SELL @ 0` or `BUY_COVER @ 0`
- Regular trades - passed through unchanged

**Key Design Decision - Close at 0 Pattern**:
Close option positions via a "close at 0 premium" trade, which naturally realizes premium P&L through existing lot logic. No special ADJUSTMENT handling required.

#### Virtual Posting Identity
Each emitted posting carries:
- `compiled_from_activity_id` (original activity id)
- `compiled_leg_index` (0..n-1)
- `compiled_group_id` (stable hash/uuid for grouping)

#### OPTION_EXPIRATION (NO COMPILER EXPANSION)

Expiration is represented canonically - **no compiler expansion needed**:
- Long expiration → `SELL` option @ price=0, subtype=OPTION_EXPIRATION
- Short expiration → `BUY_COVER` option @ price=0, subtype=OPTION_EXPIRATION

The `subtype=OPTION_EXPIRATION` is **informational only** - compiler ignores it, calculator ignores it. Used by UI/reports for chips, filters, and grouping.

**Storage Examples:**

Long option expires worthless:
```json
{
  "activity_type": "SELL",
  "subtype": "OPTION_EXPIRATION",
  "asset_id": "OPT_AAPL_20241220_C_150",
  "quantity": 2,
  "unit_price": 0
}
```
Effect: Realizes loss equal to original premium paid.

Short option expires worthless:
```json
{
  "activity_type": "BUY_COVER",
  "subtype": "OPTION_EXPIRATION",
  "asset_id": "OPT_AAPL_20241220_P_140",
  "quantity": 1,
  "unit_price": 0
}
```
Effect: Realizes gain equal to original premium received.

#### OPTION_EXERCISE (Long Positions Only)

**Long CALL exercise:**
```
Input: OPTION_EXERCISE for 1 long AAPL 150 CALL (multiplier=100)
Output:
  Leg 0: BUY AAPL: qty=100, unit_price=150.00
  Leg 1: SELL option: qty=1, unit_price=0
Effect: Acquire 100 shares at strike, close option position
```

**Long PUT exercise:**
```
Input: OPTION_EXERCISE for 1 long AAPL 150 PUT (multiplier=100)
Output:
  Leg 0: SELL AAPL: qty=100, unit_price=150.00
  Leg 1: SELL option: qty=1, unit_price=0
Effect: Sell 100 shares at strike, close option position
```

#### OPTION_ASSIGNMENT (Short Positions Only)

**Short CALL assigned:**
```
Input: OPTION_ASSIGNMENT for 1 short AAPL 150 CALL (multiplier=100)
Output:
  Leg 0: SELL AAPL: qty=100, unit_price=150.00
  Leg 1: BUY_COVER option: qty=1, unit_price=0
Effect: Forced to sell 100 shares at strike, close short option
```

**Short PUT assigned:**
```
Input: OPTION_ASSIGNMENT for 1 short AAPL 150 PUT (multiplier=100)
Output:
  Leg 0: BUY AAPL: qty=100, unit_price=150.00
  Leg 1: BUY_COVER option: qty=1, unit_price=0
Effect: Forced to buy 100 shares at strike, close short option
```

#### Basis Transfer Note (v1 Decision)

**v1**: Do NOT transfer option premium into underlying effective basis/proceeds (tax-style). Premium P&L is realized on the option close-at-0 leg. Total P&L is correct; timing differs from some tax conventions.

**v2 Enhancement**: Optionally adjust underlying effective price by remaining option basis / shares.

### 3.5 Holdings Calculator Changes

#### Critical Invariants (Hard-Enforced)

These invariants must be enforced in code and tests:

1. **`quantity >= 0` for all activities**
   - Reject any trading activity with negative quantity
   - Direction comes from activity type, never from sign

2. **`Sell` may only consume `lots`, never create `short_lots`**
   - If closing more than owned → error (not auto-short)
   - Prevents accidental short positions from overselling

3. **Only `SellShort` and `BuyCover` mutate `short_lots`**
   - `SellShort` adds to `short_lots`
   - `BuyCover` removes from `short_lots` (FIFO)
   - `Buy`/`Sell` never touch `short_lots`

4. **Negative position is always derived, never stored**
   - `net_quantity = long_quantity - short_quantity` (can be negative)
   - Individual lots always have positive quantity

#### Enforce Absolute Quantities

```rust
// In handle_buy, handle_sell, handle_sell_short, handle_buy_cover
if activity.qty() < Decimal::ZERO {
    return Err(CalculatorError::InvalidActivity(
        "Quantity must be non-negative".to_string()
    ));
}
```

#### Enforce Sell Cannot Create Short Positions

```rust
// In handle_sell
fn handle_sell(&mut self, activity: &Activity, ...) -> Result<()> {
    let qty_to_sell = activity.qty();
    let position = self.get_or_create_position(activity.asset_id.clone());

    // CRITICAL: Sell can only consume existing long lots
    if qty_to_sell > position.long_quantity() {
        return Err(CalculatorError::InvalidActivity(format!(
            "Cannot sell {} units - only {} owned. Use SELL_SHORT to open short position.",
            qty_to_sell, position.long_quantity()
        )));
    }

    // Proceed with FIFO lot consumption...
}
```

#### Add Handlers for SELL_SHORT and BUY_COVER

**v1 Restriction**: Options only (design allows stocks in v2+)

```rust
ActivityType::SellShort => {
    // v1: options only; v2+ may allow stocks
    if asset.kind != AssetKind::Option {
        return Err(CalculatorError::InvalidActivity(
            "SELL_SHORT only supported for options in v1".to_string()
        ));
    }
    self.handle_sell_short(activity, state, account_currency, asset_currency_cache)
}

ActivityType::BuyCover => {
    // v1: options only; v2+ may allow stocks
    if asset.kind != AssetKind::Option {
        return Err(CalculatorError::InvalidActivity(
            "BUY_COVER only supported for options in v1".to_string()
        ));
    }
    self.handle_buy_cover(activity, state, account_currency, asset_currency_cache)
}
```

**SELL_SHORT Handler**:
- Creates/increases `short_lots` only (never touches `lots`)
- Applies cash inflow (premium received)
- Creates `ShortLot` with `premium_received` tracking

**BUY_COVER Handler**:
- Consumes `short_lots` FIFO only (never touches `lots`)
- Applies cash outflow (premium paid to close)
- Realizes P&L = premium received - premium paid to close

#### Option Multiplier Handling (Must-Have)

**Multiplier is the PRIMARY source on the Asset, never the activity.**

```rust
// notional = qty * unit_price * multiplier
fn calculate_option_notional(
    qty: Decimal,
    price: Decimal,
    asset: &Asset,
) -> Result<Decimal, CalculatorError> {
    let option_spec = asset.option_spec()
        .ok_or_else(|| CalculatorError::InvalidAsset(
            format!("Option asset {} missing OptionSpec", asset.id)
        ))?;

    // Multiplier is REQUIRED - engine NEVER silently assumes 100
    let multiplier = option_spec.multiplier;
    if multiplier == Decimal::ZERO {
        return Err(CalculatorError::InvalidAsset(
            format!("Option {} has zero or missing multiplier. \
                     Missing multiplier is a data error; calculations skipped until corrected.",
                    asset.id)
        ));
    }

    Ok(qty * price * multiplier)
}
```

**Multiplier Safety Rules (Hard Requirements):**

1. **`OptionSpec.multiplier` is REQUIRED on the asset**
   - All calculator/valuation paths use `asset.option_spec().multiplier`
   - `activity.metadata.option.multiplier` is **ignored at runtime**

2. **Engine NEVER silently assumes 100**
   - Missing or zero multiplier = data error
   - Affected positions are flagged
   - Calculations for those contracts are skipped or marked invalid until corrected

3. **UI must surface missing multiplier prominently**
   - Show warning badge on affected positions
   - Block export/reports until resolved

**Runtime Rules:**
- The calculator and valuation **always** use `asset.option_spec().multiplier`
- `activity.metadata.option.multiplier` is **ignored** at runtime

**Import Rules:**
- If an activity carries a multiplier and the asset has none, the importer should **populate** `OptionSpec.multiplier` from the activity
- If both exist and differ, importer should **raise an error** and require manual fix
- If multiplier is unknown, fail asset creation or mark as `needs_setup`

Apply this consistently for `BUY`, `SELL`, `SELL_SHORT`, `BUY_COVER` when `asset.kind == Option`.

#### ADJUSTMENT Handling (Simplified)

Do NOT rely on ADJUSTMENT for option expiration/exercise/assignment closures in v1. Keep ADJUSTMENT for genuine corrections/transforms (RoC basis, merger/spinoff compiler inputs).

### 3.6 Short Position Lot Model

Introduce short lots that track obligation rather than ownership:

```rust
pub struct ShortLot {
    pub id: String,
    pub position_id: String,
    pub open_date: DateTime<Utc>,
    pub quantity: Decimal,           // Always positive (number of contracts)
    pub open_price: Decimal,         // Premium per contract when opened
    pub open_fees: Decimal,          // Fees paid to open the short
    pub premium_received: Decimal,   // Net cash received = (qty × price × multiplier) - fees
    pub fx_rate_to_position: Option<Decimal>,
}
```

**Short Lot Accounting Equations:**

| Event | Equation | Cash Effect |
|-------|----------|-------------|
| **Open short (SELL_SHORT)** | `premium_received = qty × price × multiplier − open_fees` | +cash (inflow) |
| **Close short (BUY_COVER)** | `close_cost = qty × close_price × multiplier + close_fees` | −cash (outflow) |
| **Realized P&L** | `realized_gain = premium_received − close_cost` | Gain if positive |
| **Unrealized P&L** | `unrealized_gain = premium_received − current_market_value` | |

**Example: Write 1 PUT @ $3.00, close @ $1.00 (multiplier=100)**
```
Open:  premium_received = 1 × 3.00 × 100 − 0.65 = $299.35  (cash in)
Close: close_cost       = 1 × 1.00 × 100 + 0.65 = $100.65  (cash out)
P&L:   realized_gain    = $299.35 − $100.65 = $198.70 profit
```

**Position Model Extension**:
```rust
pub struct Position {
    // ... existing fields ...
    pub lots: VecDeque<Lot>,           // Long lots
    pub short_lots: VecDeque<ShortLot>, // Short lots (new)
}

impl Position {
    // === Quantity Metrics ===

    pub fn long_quantity(&self) -> Decimal {
        self.lots.iter().map(|l| l.quantity).sum()
    }

    pub fn short_quantity(&self) -> Decimal {
        self.short_lots.iter().map(|l| l.quantity).sum()
    }

    /// Net quantity for exposure display. Can be negative (net short).
    pub fn net_quantity(&self) -> Decimal {
        self.long_quantity() - self.short_quantity()
    }

    // === Cost/Premium Metrics ===

    /// Total cost basis for long positions (cash paid to acquire)
    pub fn long_cost_basis(&self) -> Decimal {
        self.lots.iter().map(|l| l.cost_basis).sum()
    }

    /// Total premium received for short positions (cash received to open)
    pub fn total_premium_received(&self) -> Decimal {
        self.short_lots.iter().map(|l| l.premium_received).sum()
    }
}
```

**P&L Calculation (Explicit Long vs Short):**

```rust
impl Position {
    /// Long unrealized P&L: market_value - cost_basis
    pub fn long_unrealized_gain(&self, price: Decimal, multiplier: Decimal) -> Decimal {
        let long_market_value = self.long_quantity() * price * multiplier;
        long_market_value - self.long_cost_basis()
    }

    /// Short unrealized P&L: premium_received - |short_market_value|
    /// Profit when current MV (liability) < premium received
    pub fn short_unrealized_gain(&self, price: Decimal, multiplier: Decimal) -> Decimal {
        let short_market_value = self.short_quantity() * price * multiplier;
        self.total_premium_received() - short_market_value
    }
}
```

**Important**: In generic views (e.g., Holdings table), `cost_basis` refers to **long-only** cost basis. Short economics come from `premium_received`. If users have mixed long+short on the same contract, calculate and display long MV and short MV separately, then net for total exposure.
```

### 3.7 Option Asset Creation

**Option Asset ID**:

The `asset_id` is an **opaque identifier** - do not parse it to extract option parameters. Always read option details from `OptionSpec` in metadata.

Suggested ID format (for human readability only):
```
OPT_{UNDERLYING}_{YYYYMMDD}_{C|P}_{STRIKE}
Example: OPT_AAPL_20241220_C_150
```

**OCC Symbol** (stored in `OptionSpec.occ_symbol`, 21-char format):
```
AAPL  241220C00150000
      ↑     ↑ ↑
      │     │ └─ Strike × 1000 (8 digits)
      │     └─── C=Call, P=Put
      └───────── YYMMDD expiration
```

**Important**: The OCC symbol is for display/reference only. The `asset_id` is the primary key for lookups.

**Asset Creation Helper**:
```rust
pub fn create_option_asset(
    underlying: &str,
    expiration: NaiveDate,
    right: &str,  // "CALL" or "PUT"
    strike: Decimal,
    multiplier: Decimal,
    currency: &str,
) -> Result<NewAsset, AssetError> {
    // Validate multiplier is set
    if multiplier == Decimal::ZERO {
        return Err(AssetError::InvalidOption(
            "Multiplier is required and cannot be zero".to_string()
        ));
    }

    let strike_str = format!("{:08}", (strike * dec!(1000)).to_u64().unwrap_or(0));
    let right_char = if right == "CALL" { "C" } else { "P" };
    let occ_symbol = format!(
        "{:<6}{}{}{}",
        underlying,
        expiration.format("%y%m%d"),
        right_char,
        strike_str
    );

    let id = format!("OPT_{}_{}_{}_{}",
        underlying,
        expiration.format("%Y%m%d"),
        right_char,
        strike.normalize()
    );

    Ok(NewAsset {
        id: Some(id),
        kind: AssetKind::Option,
        symbol: occ_symbol.clone(),
        currency: currency.to_string(),
        pricing_mode: PricingMode::Manual,
        metadata: Some(json!({
            "option": {
                "underlying_asset_id": underlying,
                "expiration": expiration.to_string(),
                "right": right,
                "strike": strike.to_string(),
                "multiplier": multiplier.to_string(),
                "occ_symbol": occ_symbol
            }
        })),
        ..Default::default()
    })
}
```

**UX Safeguard: Expired Options Still Open**:

If an option position exists where `expiration < today` and `net_quantity != 0`:
1. Display a warning badge/alert in Holdings UI
2. Prompt user: "This option has expired. Please record the closing event."
3. Offer quick actions:
   - "Expired Worthless" → creates `OPTION_EXPIRATION` activity
   - "Was Exercised/Assigned" → guides to appropriate subtype entry
4. Do NOT auto-close - user must confirm the actual outcome

### 3.8 Option Valuation

**Valuation Formulas (Explicit):**

```
premium = quote.close
net_qty = long_quantity - short_quantity

market_value = net_qty × premium × multiplier
```

- Net long → positive MV (asset)
- Net short → negative MV (liability)

**Holding.quantity Sign Semantics:**

```
For non-option assets: Holding.quantity is always >= 0

For options: Holding.quantity is the SIGNED net quantity
  (long_quantity - short_quantity) and MAY BE NEGATIVE (net short).
  Valuation uses this signed quantity directly.
```

This is **by design** - do NOT "fix" it to `abs()`. The negative quantity correctly represents short exposure.

```rust
// Guard in code to document intent
match asset.kind {
    AssetKind::Option => {
        // quantity may be negative, by design (net short)
    }
    _ => {
        debug_assert!(holding.quantity >= Decimal::ZERO);
    }
}
```

**Implementation:**

```rust
async fn calculate_option_valuation(
    holding: &mut Holding,
    asset: &Asset,  // Asset already loaded, contains OptionSpec
    latest_quote_pairs: &HashMap<String, LatestQuotePair>,
) -> Result<()> {
    // Get OptionSpec directly from Asset - do NOT re-parse JSON
    let option_spec = asset.option_spec()
        .ok_or_else(|| CalculatorError::InvalidAsset(
            format!("Option asset {} missing OptionSpec", asset.id)
        ))?;

    // Multiplier is REQUIRED - engine never silently assumes 100
    let multiplier = option_spec.multiplier;
    if multiplier == Decimal::ZERO {
        return Err(CalculatorError::InvalidAsset(
            format!("Option {} has zero multiplier - data error", asset.id)
        ));
    }

    if let Some(quote_pair) = latest_quote_pairs.get(&holding.id) {
        let premium = quote_pair.latest.close;
        holding.price = Some(premium);

        // net_quantity is signed: positive (long) or negative (short)
        let net_qty = holding.quantity;  // Already net_quantity from Position

        // market_value = net_qty × premium × multiplier
        // Long:  +contracts × premium × 100 = positive (asset)
        // Short: -contracts × premium × 100 = negative (liability)
        holding.market_value.local = net_qty * premium * multiplier;
    }

    Ok(())
}
```

**Sign Conventions:**
| Position | net_quantity | market_value | Interpretation |
|----------|--------------|--------------|----------------|
| Long 2 contracts | +2 | +$1,000 | Asset worth $1,000 |
| Short 1 contract | -1 | -$500 | Liability of $500 |
| Mixed (3L, 1S) | +2 | +$1,000 | Net asset exposure |

**Net Worth Impact:**

For net worth calculations, option positions contribute `market_value` which **may be negative** for net short positions (liabilities). UI should label negative market values as "short exposure" so users aren't surprised.

```rust
// In net worth calculation
total_net_worth = cash_balances
    + Σ(stock_positions.market_value)      // always positive
    + Σ(option_positions.market_value);    // can be negative!
```

**No Greeks/Black-Scholes in v1.**

### 3.9 Lifecycle Behavior: Close-at-0 and Basis (v1 Decision)

**Confirmed Design:**
- Close options at 0 on exercise/assignment/expiration
- Do NOT roll option premium into underlying basis in v1

**Why This Works:**

Option P&L is fully realized on the option side (via premium vs close @ 0). Underlying basis on exercise/assignment is pure `strike × shares` in v1. This matches economic P&L; tax-style basis folding can be layered on in v2.

Example (Long Call Exercise):
```
Original: BUY 1 AAPL 150C @ $5.00 → cost_basis = $500
Exercise:
  - Leg 0: BUY 100 AAPL @ $150 → AAPL cost_basis = $15,000
  - Leg 1: SELL option @ $0 → realizes -$500 (loss on option)

Total economic result:
  - Paid: $500 (premium) + $15,000 (shares) = $15,500
  - Own: 100 AAPL worth (say) $18,000
  - Profit: $2,500

Tax-style basis (v2 enhancement):
  - Effective AAPL basis = $15,000 + $500 = $15,500
  - But for v1, we show: AAPL basis = $15,000, Option realized P&L = -$500
```

**v2 Enhancement**: Optionally add "effective basis" metric that folds in option P&L purely for display/tax reporting.

### 3.10 Known v1 Limitations

> **Scope Boundaries**: The following are explicitly out of scope for v1. They may be addressed in future versions.

| Limitation | Description | Future Consideration |
|------------|-------------|----------------------|
| **SELL_SHORT/BUY_COVER for non-options** | Short selling stocks/ETFs not supported | v2: Extend to all tradeable assets |
| **Tax-style basis transfer** | Option premium not rolled into underlying basis on exercise/assignment | v2: Optional basis adjustment |
| **Multi-leg strategies** | No native support for spreads, straddles, iron condors | v2: Strategy grouping/linking |
| **Auto-exercise detection** | ITM options at expiry not auto-detected | v2: Alerts + suggested actions |
| **Greeks/Black-Scholes** | No theoretical valuation, delta, theta, etc. | v2+: If pricing data available |
| **Margin/collateral tracking** | No tracking of margin requirements for short positions | v2+: Margin calculator |
| **Fractional contracts** | Assumes whole contract quantities | Unlikely to change |
| **Index options** | Cash-settled index options may need different handling | v2: Settlement type field |
| **Weekly/LEAPS distinction** | No special handling for different expiration cycles | Display only |

**v1 Focus**: Accurate position tracking, P&L calculation, and lifecycle event handling for equity options with standard 100 multiplier.

---

## 4. Database Schema

### No Schema Changes Required

The current schema already supports options through:
1. `assets.kind = 'OPTION'`
2. `assets.metadata` JSON for OptionSpec
3. `activities.metadata` JSON for option-specific fields
4. `activities.subtype` for option event subtypes
5. `activities.activity_type` for new canonicals (string field, no enum constraint)

### ActivityType Enum Update (Code Only)

```rust
pub enum ActivityType {
    Buy,
    Sell,
    SellShort,   // New
    BuyCover,    // New
    Dividend,
    Interest,
    Deposit,
    Withdrawal,
    TransferIn,
    TransferOut,
    Fee,
    Tax,
    Split,
    Credit,
    Adjustment,
    Unknown,
}
```

---

## 5. Implementation Phases

### Phase 1: Canonicals + Core Model
**Priority: High | Effort: Medium**

1. Introduce `SellShort` / `BuyCover` canonical types
2. Enforce `quantity >= 0` for all activities
3. Enforce `Sell` never creates short (error if closing more than owned)
4. Add `ShortLot` model and `short_lots` to Position
5. Implement FIFO logic for `short_lots`
6. Add multiplier-aware notional helper that **requires** `OptionSpec`

**Files to modify**:
- `crates/core/src/activities/activities_constants.rs`
- `crates/core/src/activities/activities_model.rs` (ActivityType enum)
- `crates/core/src/portfolio/snapshot/positions_model.rs`
- `crates/core/src/portfolio/snapshot/holdings_calculator.rs`
- `crates/core/src/assets/assets_service.rs`

**Tests to add**:
- Quantity validation (reject negative)
- Sell cannot exceed owned quantity
- SellShort/BuyCover only for options (v1)
- Multiplier required, zero rejected

### Phase 2: Options Lifecycle
**Priority: High | Effort: Medium**

1. Implement compiler expansion for `OPTION_EXERCISE`:
   - CALL: BUY underlying + SELL option @ 0
   - PUT: SELL underlying + SELL option @ 0
2. Implement compiler expansion for `OPTION_ASSIGNMENT`:
   - CALL: SELL underlying + BUY_COVER option @ 0
   - PUT: BUY underlying + BUY_COVER option @ 0
3. Represent expiration as canonical `SELL`/`BUY_COVER` @ 0 (NO compiler expansion)
4. Add `OPTION_EXPIRATION` subtype for labeling (informational only)

**Files to modify**:
- `crates/core/src/activities/activities_constants.rs`
- `crates/core/src/activities/compiler.rs`

**Tests to add**:
- Exercise expansion (call and put)
- Assignment expansion (call and put)
- Expiration stored directly as canonical (no expansion)

### Phase 3: Valuation
**Priority: Medium | Effort: Low**

1. Implement option valuation with signed `net_quantity` and multiplier
2. Handle negative market values for short positions
3. Add `long_unrealized_gain` / `short_unrealized_gain` methods

**Files to modify**:
- `crates/core/src/portfolio/holdings/holdings_valuation_service.rs`
- `crates/core/src/portfolio/holdings/holdings_model.rs`

**Tests to add**:
- Long position valuation
- Short position valuation (negative MV)
- Mixed long+short same contract

### Phase 4: UI / Options Tab
**Priority: Medium | Effort: High**

1. Option trade forms mapped to 4 canonicals:
   - Buy to Open (BUY)
   - Sell to Close (SELL)
   - Sell to Open (SELL_SHORT)
   - Buy to Close (BUY_COVER)
2. Exercise/assignment flows that create semantic activity + let compiler expand
3. "Expired" quick actions that generate canonical close @ 0
4. Option chain viewer (grouped by underlying/expiry/strike)
5. Options P&L summary

**Files to create**:
- `src-front/pages/options/`
- `src-front/features/options/`

### Phase 5: Enhancements (Optional)
**Priority: Low | Effort: Varies**

1. Tax-style basis transfer on exercise/assignment
2. Market data integration for option quotes
3. Strategy linking (spreads, covered calls)
4. Expiration calendar/alerts
5. Greeks display (if data available)
6. Extend `SellShort`/`BuyCover` to stocks (short selling)

---

## 5.1 Golden Tests Matrix

**CRITICAL**: These tests ensure correctness across all option scenarios. Each should cross-check cash + positions + P&L.

| Test Case | Activity Sequence | Expected Result |
|-----------|-------------------|-----------------|
| **BTO → STC (profit)** | BUY option @ $5, SELL @ $8 | +$300 realized gain per contract |
| **BTO → STC (loss)** | BUY option @ $5, SELL @ $2 | -$300 realized loss per contract |
| **STO → BTC (profit)** | SELL_SHORT @ $3, BUY_COVER @ $1 | +$200 realized gain per contract |
| **STO → BTC (loss)** | SELL_SHORT @ $3, BUY_COVER @ $5 | -$200 realized loss per contract |
| **STO put → assignment** | SELL_SHORT put @ $3, ASSIGNMENT | +100 shares, option closed, +$300 premium realized |
| **BTO call → exercise** | BUY call @ $5, EXERCISE | +100 shares @ strike, option closed, -$500 premium realized |
| **Long expiration** | BUY @ $5, SELL @ $0 (exp) | -$500 realized loss |
| **Short expiration** | SELL_SHORT @ $3, BUY_COVER @ $0 (exp) | +$300 realized gain |
| **Multi-lot FIFO** | BUY 2 @ $3, BUY 1 @ $5, SELL 2 @ $6 | First 2 lots closed, $600 gain |
| **Partial close** | BUY 5 @ $4, SELL 2 @ $7 | 3 remaining, $600 realized on closed |
| **Mixed long+short** | BUY 3 @ $4, SELL_SHORT 1 @ $3 | net_qty=2, separate P&L tracking |

**Test Invariants to Verify:**
- `cash_delta` matches expected for each activity
- `position.long_quantity()` + `position.short_quantity()` always ≥ 0
- `net_quantity = long_quantity - short_quantity`
- All realized P&L flows through lot consumption
- Multiplier applied correctly (100× for equity options)

---

## 6. Data Flow Examples

### Example 1: Buy to Open (Long Call)

**User Action**: Buy 2 AAPL Dec 150 Calls @ $5.00 premium

**Activity Created**:
```json
{
  "activity_type": "BUY",
  "asset_id": "OPT_AAPL_20241220_C_150",
  "quantity": 2,
  "unit_price": 5.00,
  "currency": "USD",
  "fee": 1.30,
  "metadata": {
    "source": {
      "raw_option_type": "BTO",
      "broker_description": "Buy to Open AAPL 12/20/24 150 Call"
    }
  }
}
```

> **Note**: Option structure (strike, expiration, multiplier) is read from the Asset's `OptionSpec`, not activity metadata.

**Holdings Impact**:
- Position: +2 contracts (long lots)
- Cost Basis: (2 * 5.00 * 100) + 1.30 = $1,001.30
- Cash: -$1,001.30

### Example 2: Sell to Open (Short Put) - Writing

**User Action**: Write 1 AAPL Dec 140 Put @ $3.00 premium

**Activity Created**:
```json
{
  "activity_type": "SELL_SHORT",
  "asset_id": "OPT_AAPL_20241220_P_140",
  "quantity": 1,
  "unit_price": 3.00,
  "currency": "USD",
  "fee": 0.65,
  "metadata": {
    "source": {
      "raw_option_type": "STO",
      "broker_description": "Sell to Open AAPL 12/20/24 140 Put"
    }
  }
}
```

**Holdings Impact**:
- Position: 1 contract (short lot)
- Premium Received: (1 * 3.00 * 100) - 0.65 = $299.35
- Cash: +$299.35

### Example 3: Exercise (Long Call)

**User Action**: Exercise 1 AAPL Dec 150 Call

**Activity Created**:
```json
{
  "activity_type": "BUY",
  "subtype": "OPTION_EXERCISE",
  "asset_id": "OPT_AAPL_20241220_C_150",
  "quantity": 1,
  "currency": "USD",
  "metadata": {
    "source": {
      "broker_description": "Exercise AAPL 12/20/24 150 Call"
    }
  }
}
```

> **Validation**: Compiler reads option structure from Asset's `OptionSpec`. Exercise requires `net_quantity > 0` (long position).

**Compiler Expands To**:
```
Leg 0: BUY AAPL, qty=100, unit_price=150.00
Leg 1: SELL OPT_AAPL_20241220_C_150, qty=1, unit_price=0
```

**Holdings Impact**:
- Option Position: -1 contract (closed via SELL @ 0)
- AAPL Position: +100 shares @ $150 cost basis
- Cash: -$15,000
- Realized P&L on option: Loss of premium paid

### Example 4: Assignment (Short Put)

**User Action**: Assigned on 1 short AAPL Dec 140 Put

**Activity Created**:
```json
{
  "activity_type": "BUY",
  "subtype": "OPTION_ASSIGNMENT",
  "asset_id": "OPT_AAPL_20241220_P_140",
  "quantity": 1,
  "currency": "USD",
  "metadata": {
    "source": {
      "broker_description": "Assignment AAPL 12/20/24 140 Put"
    }
  }
}
```

> **Validation**: Assignment requires `net_quantity < 0` (short position).

**Compiler Expands To**:
```
Leg 0: BUY AAPL, qty=100, unit_price=140.00
Leg 1: BUY_COVER OPT_AAPL_20241220_P_140, qty=1, unit_price=0
```

**Holdings Impact**:
- Option Position: Short closed (BUY_COVER @ 0)
- AAPL Position: +100 shares @ $140 cost basis
- Cash: -$14,000
- Realized P&L on option: Gain of premium received ($300)

### Example 5: Expiration (Worthless)

**User Action**: Long AAPL 150 Call expires worthless

**Activity Created**:
```json
{
  "activity_type": "SELL",
  "subtype": "OPTION_EXPIRATION",
  "asset_id": "OPT_AAPL_20241220_C_150",
  "quantity": 1,
  "unit_price": 0,
  "currency": "USD",
  "metadata": {
    "source": {
      "broker_description": "Expired worthless AAPL 12/20/24 150 Call"
    }
  }
}
```

> **Note**: The `activity_type` (`SELL` for long, `BUY_COVER` for short) already encodes the direction. No `position_type` field needed.

**Compiler Output**: Pass-through (already canonical)

**Holdings Impact**:
- Option Position: Closed (SELL @ 0)
- Cash: $0
- Realized P&L: Loss of entire premium paid

---

## 7. Risk Considerations

### Validation Rules
- **OPTION_EXERCISE** requires `net_quantity > 0` (must have long position) - state-based validation
- **OPTION_ASSIGNMENT** requires `net_quantity < 0` (must have short position) - state-based validation
- **v1 restriction**: `SELL_SHORT`/`BUY_COVER` rejected for non-options
- **Multiplier must be present** in `OptionSpec` - missing = data error, calculations skipped
- **Quantity must be non-negative** in all trading activities
- **Sell cannot exceed owned quantity** - error if attempting to close more than long_quantity

### Edge Cases
1. **Partial Exercise**: Allow exercising fewer contracts than held
2. **Cash Settlement**: Index options settle in cash, not shares (future)
3. **Early Exercise**: American options can be exercised before expiration
4. **Expired Option Cleanup**: Auto-mark positions as zero after expiry date

### Performance
- Option chains can have many contracts (multiple expirations × strikes)
- Consider lazy loading for option chain views
- Index on underlying_asset_id for efficient filtering

---

## 8. Future Enhancements

1. **Tax-style Basis Transfer**: Adjust underlying effective price by option premium on exercise/assignment
2. **Market Data Integration**: Option quote fetching from providers
3. **Spreads and Strategies**: Track multi-leg strategies as linked positions
4. **Greeks Display**: Delta, gamma, theta, vega from market data
5. **Risk Analysis**: Portfolio-level option exposure analysis
6. **Expiration Alerts**: Notifications for approaching expirations
7. **Roll Tracking**: Link roll transactions (close old, open new)
8. **Cash-Settled Options**: Support index options that settle in cash

---

## 9. Architecture Diagrams

### 9.1 System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPTIONS TRADING SYSTEM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │   UI Layer   │───▶│   Activity   │───▶│   Compiler   │───▶│  Holdings │ │
│  │              │    │   Service    │    │  (In-Memory) │    │ Calculator│ │
│  └──────────────┘    └──────────────┘    └──────────────┘    └───────────┘ │
│         │                   │                   │                   │       │
│         │                   ▼                   ▼                   ▼       │
│         │            ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│         │            │   Activity   │    │   Virtual    │    │  Position │ │
│         └───────────▶│   Storage    │    │   Postings   │    │   & Lots  │ │
│                      │  (Persisted) │    │ (Not Saved)  │    │ (Snapshot)│ │
│                      └──────────────┘    └──────────────┘    └───────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Canonical Activity Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ACTIVITY TYPE MATRIX                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        LONG POSITIONS              SHORT POSITIONS           │
│                    ┌─────────────────────┐    ┌─────────────────────┐       │
│                    │                     │    │                     │       │
│     OPEN           │        BUY          │    │     SELL_SHORT      │       │
│                    │    (pay premium)    │    │  (receive premium)  │       │
│                    │                     │    │                     │       │
│                    └─────────────────────┘    └─────────────────────┘       │
│                              │                          │                    │
│                              ▼                          ▼                    │
│                    ┌─────────────────────┐    ┌─────────────────────┐       │
│                    │                     │    │                     │       │
│     CLOSE          │        SELL         │    │      BUY_COVER      │       │
│                    │  (receive premium)  │    │    (pay premium)    │       │
│                    │                     │    │                     │       │
│                    └─────────────────────┘    └─────────────────────┘       │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ KEY CONSTRAINT: Quantity is ALWAYS >= 0. Direction from activity type │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Option Lifecycle State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPTION POSITION LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                              ┌─────────┐                                     │
│                              │ NO POS  │                                     │
│                              └────┬────┘                                     │
│                     ┌────────────┴────────────┐                             │
│                     │                          │                             │
│                     ▼                          ▼                             │
│              ┌─────────────┐           ┌─────────────┐                      │
│              │    LONG     │           │    SHORT    │                      │
│              │  (via BUY)  │           │(via SELL_   │                      │
│              │             │           │   SHORT)    │                      │
│              └──────┬──────┘           └──────┬──────┘                      │
│                     │                          │                             │
│      ┌──────────────┼──────────────┐    ┌─────┼─────────────┐              │
│      │              │              │    │     │             │              │
│      ▼              ▼              ▼    ▼     ▼             ▼              │
│  ┌───────┐    ┌──────────┐   ┌────────────┐  ┌──────────┐  ┌───────┐      │
│  │ SELL  │    │ EXERCISE │   │ EXPIRATION │  │ASSIGNMENT│  │BUY_   │      │
│  │(close)│    │(long only│   │ (worthless)│  │(short    │  │COVER  │      │
│  │       │    │ + under- │   │            │  │only +    │  │(close)│      │
│  │       │    │  lying)  │   │            │  │underlying│  │       │      │
│  └───┬───┘    └────┬─────┘   └─────┬──────┘  └────┬─────┘  └───┬───┘      │
│      │             │               │              │            │           │
│      └─────────────┴───────────────┴──────────────┴────────────┘           │
│                                    │                                        │
│                                    ▼                                        │
│                              ┌─────────┐                                    │
│                              │ CLOSED  │                                    │
│                              │(pos = 0)│                                    │
│                              └─────────┘                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.4 Compiler Expansion Rules

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPILER EXPANSION RULES                                  │
│                 (ONLY Multi-Leg Events Are Expanded)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT (Stored Activity)              OUTPUT (Virtual Postings)             │
│  ──────────────────────               ─────────────────────────             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTION_EXPIRATION - NOT COMPILER-EXPANDED                            │   │
│  │                                                                       │   │
│  │   Stored directly as canonical:                                       │   │
│  │   • Long expiration:  SELL @ 0, subtype=OPTION_EXPIRATION            │   │
│  │   • Short expiration: BUY_COVER @ 0, subtype=OPTION_EXPIRATION       │   │
│  │                                                                       │   │
│  │   The subtype is INFORMATIONAL ONLY for UI/reports.                  │   │
│  │   Compiler passes through unchanged.                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTION_EXERCISE (Long CALL) - COMPILER-EXPANDED                      │   │
│  │                                                                       │   │
│  │   { subtype: "OPTION_EXERCISE",      ──▶   Leg 0: BUY underlying     │   │
│  │     asset_id: "OPT_AAPL_C_150",              qty: N × multiplier     │   │
│  │     quantity: N,                             unit_price: strike      │   │
│  │     right: "CALL" }                                                  │   │
│  │                                             Leg 1: SELL option       │   │
│  │                                              qty: N                  │   │
│  │                                              unit_price: 0           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTION_EXERCISE (Long PUT)                                           │   │
│  │                                                                       │   │
│  │   { subtype: "OPTION_EXERCISE",      ──▶   Leg 0: SELL underlying    │   │
│  │     asset_id: "OPT_AAPL_P_150",              qty: N × multiplier     │   │
│  │     quantity: N,                             unit_price: strike      │   │
│  │     right: "PUT" }                                                   │   │
│  │                                             Leg 1: SELL option       │   │
│  │                                              qty: N                  │   │
│  │                                              unit_price: 0           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTION_ASSIGNMENT (Short CALL)                                       │   │
│  │                                                                       │   │
│  │   { subtype: "OPTION_ASSIGNMENT",    ──▶   Leg 0: SELL underlying    │   │
│  │     asset_id: "OPT_AAPL_C_150",              qty: N × multiplier     │   │
│  │     quantity: N,                             unit_price: strike      │   │
│  │     right: "CALL" }                                                  │   │
│  │                                             Leg 1: BUY_COVER option  │   │
│  │                                              qty: N                  │   │
│  │                                              unit_price: 0           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTION_ASSIGNMENT (Short PUT)                                        │   │
│  │                                                                       │   │
│  │   { subtype: "OPTION_ASSIGNMENT",    ──▶   Leg 0: BUY underlying     │   │
│  │     asset_id: "OPT_AAPL_P_150",              qty: N × multiplier     │   │
│  │     quantity: N,                             unit_price: strike      │   │
│  │     right: "PUT" }                                                   │   │
│  │                                             Leg 1: BUY_COVER option  │   │
│  │                                              qty: N                  │   │
│  │                                              unit_price: 0           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.5 Position & Lot Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       POSITION & LOT MODEL                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Position (for option asset OPT_AAPL_20241220_C_150)                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  LONG LOTS (VecDeque<Lot>)                                      │  │  │
│  │  │  ─────────────────────────                                      │  │  │
│  │  │                                                                  │  │  │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │  │  │
│  │  │  │  Lot 1   │  │  Lot 2   │  │  Lot 3   │  ...                  │  │  │
│  │  │  │ qty: 2   │  │ qty: 1   │  │ qty: 3   │                       │  │  │
│  │  │  │ price:$5 │  │ price:$6 │  │ price:$4 │                       │  │  │
│  │  │  │ cost:    │  │ cost:    │  │ cost:    │                       │  │  │
│  │  │  │  $1000   │  │  $600    │  │  $1200   │                       │  │  │
│  │  │  │ date:    │  │ date:    │  │ date:    │                       │  │  │
│  │  │  │ 2024-01  │  │ 2024-02  │  │ 2024-03  │                       │  │  │
│  │  │  └──────────┘  └──────────┘  └──────────┘                       │  │  │
│  │  │                                                                  │  │  │
│  │  │  long_quantity() = 2 + 1 + 3 = 6 contracts                      │  │  │
│  │  │  long_cost_basis() = $1000 + $600 + $1200 = $2800               │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │  SHORT LOTS (VecDeque<ShortLot>)                                │  │  │
│  │  │  ───────────────────────────────                                │  │  │
│  │  │                                                                  │  │  │
│  │  │  ┌──────────┐  ┌──────────┐                                     │  │  │
│  │  │  │ ShortLot1│  │ ShortLot2│  ...                                │  │  │
│  │  │  │ qty: 1   │  │ qty: 2   │                                     │  │  │
│  │  │  │ price:$3 │  │ price:$4 │                                     │  │  │
│  │  │  │ premium: │  │ premium: │                                     │  │  │
│  │  │  │  $300    │  │  $800    │                                     │  │  │
│  │  │  │ date:    │  │ date:    │                                     │  │  │
│  │  │  │ 2024-04  │  │ 2024-05  │                                     │  │  │
│  │  │  └──────────┘  └──────────┘                                     │  │  │
│  │  │                                                                  │  │  │
│  │  │  short_quantity() = 1 + 2 = 3 contracts                         │  │  │
│  │  │  premium_received() = $300 + $800 = $1100                       │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │  net_quantity() = long_quantity() - short_quantity() = 6 - 3 = 3      │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.6 Close-at-0 P&L Realization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CLOSE-AT-0 P&L REALIZATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  WHY CLOSE-AT-0?                                                            │
│  ───────────────                                                            │
│  • Uses existing FIFO lot logic for P&L calculation                         │
│  • No special ADJUSTMENT handling required                                   │
│  • Deterministic and auditable                                              │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ LONG POSITION EXPIRATION (Loss Realization)                           │  │
│  │                                                                        │  │
│  │   Opening:   BUY 1 contract @ $5.00 premium                           │  │
│  │              Cost basis = $5.00 × 100 = $500                          │  │
│  │                                                                        │  │
│  │   Closing:   SELL 1 contract @ $0.00 (expiration)                     │  │
│  │              Proceeds = $0.00 × 100 = $0                              │  │
│  │                                                                        │  │
│  │   P&L:       Proceeds - Cost = $0 - $500 = -$500 (LOSS)              │  │
│  │                                                                        │  │
│  │   ┌─────────┐                    ┌─────────┐                          │  │
│  │   │  Lot    │   SELL @ $0        │  Lot    │                          │  │
│  │   │ qty: 1  │  ───────────▶      │ qty: 0  │  Realized: -$500        │  │
│  │   │cost:$500│                    │cost: $0 │                          │  │
│  │   └─────────┘                    └─────────┘                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ SHORT POSITION EXPIRATION (Gain Realization)                          │  │
│  │                                                                        │  │
│  │   Opening:   SELL_SHORT 1 contract @ $3.00 premium                    │  │
│  │              Premium received = $3.00 × 100 = $300                    │  │
│  │                                                                        │  │
│  │   Closing:   BUY_COVER 1 contract @ $0.00 (expiration)                │  │
│  │              Cost to close = $0.00 × 100 = $0                         │  │
│  │                                                                        │  │
│  │   P&L:       Premium received - Cost to close = $300 - $0 = +$300    │  │
│  │                                                                        │  │
│  │   ┌─────────┐                    ┌─────────┐                          │  │
│  │   │ShortLot │  BUY_COVER @ $0    │ShortLot │                          │  │
│  │   │ qty: 1  │  ───────────▶      │ qty: 0  │  Realized: +$300        │  │
│  │   │prem:$300│                    │prem: $0 │                          │  │
│  │   └─────────┘                    └─────────┘                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.7 Exercise/Assignment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXERCISE / ASSIGNMENT FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LONG CALL EXERCISE (right to BUY underlying at strike)                     │
│  ─────────────────────────────────────────────────────                      │
│                                                                              │
│  Before:                                                                     │
│  ┌────────────────┐     ┌────────────────┐                                  │
│  │ Option Position│     │ Cash           │                                  │
│  │ Long 1 AAPL    │     │ $20,000        │                                  │
│  │ 150 CALL       │     │                │                                  │
│  │ cost: $500     │     │                │                                  │
│  └────────────────┘     └────────────────┘                                  │
│                                                                              │
│  Exercise (strike=$150, multiplier=100):                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Leg 0: BUY AAPL          qty=100, price=$150    cash: -$15,000       │   │
│  │ Leg 1: SELL option @ 0   qty=1,   price=$0      realizes: -$500      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  After:                                                                      │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐           │
│  │ Option Position│     │ AAPL Position  │     │ Cash           │           │
│  │ qty: 0         │     │ qty: 100       │     │ $5,000         │           │
│  │ (closed)       │     │ cost: $15,000  │     │ (-$15,000)     │           │
│  │                │     │                │     │                │           │
│  │ Realized P&L:  │     │                │     │                │           │
│  │ -$500 (premium)│     │                │     │                │           │
│  └────────────────┘     └────────────────┘     └────────────────┘           │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════    │
│                                                                              │
│  SHORT PUT ASSIGNMENT (obligation to BUY underlying at strike)              │
│  ────────────────────────────────────────────────────────────               │
│                                                                              │
│  Before:                                                                     │
│  ┌────────────────┐     ┌────────────────┐                                  │
│  │ Option Position│     │ Cash           │                                  │
│  │ Short 1 AAPL   │     │ $20,000        │                                  │
│  │ 140 PUT        │     │ (includes $300 │                                  │
│  │ premium: $300  │     │  premium rcvd) │                                  │
│  └────────────────┘     └────────────────┘                                  │
│                                                                              │
│  Assignment (strike=$140, multiplier=100):                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ Leg 0: BUY AAPL            qty=100, price=$140  cash: -$14,000       │   │
│  │ Leg 1: BUY_COVER option @0 qty=1,   price=$0    realizes: +$300      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  After:                                                                      │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐           │
│  │ Option Position│     │ AAPL Position  │     │ Cash           │           │
│  │ qty: 0         │     │ qty: 100       │     │ $6,000         │           │
│  │ (closed)       │     │ cost: $14,000  │     │ (-$14,000)     │           │
│  │                │     │                │     │                │           │
│  │ Realized P&L:  │     │                │     │                │           │
│  │ +$300 (premium)│     │                │     │                │           │
│  └────────────────┘     └────────────────┘     └────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.8 Multiplier Impact

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    OPTION MULTIPLIER HANDLING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Standard equity option multiplier = 100                                     │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ NOTIONAL VALUE CALCULATION                                            │  │
│  │                                                                        │  │
│  │   notional = contracts × premium × multiplier                         │  │
│  │                                                                        │  │
│  │   Example: Buy 2 AAPL 150 CALLs @ $5.00 premium                       │  │
│  │                                                                        │  │
│  │   ┌─────────────────────────────────────────────────────────────┐     │  │
│  │   │  WITHOUT multiplier (WRONG):  2 × $5.00 = $10.00           │     │  │
│  │   │  WITH multiplier (CORRECT):   2 × $5.00 × 100 = $1,000.00  │     │  │
│  │   └─────────────────────────────────────────────────────────────┘     │  │
│  │                                                                        │  │
│  │   ⚠️  Missing multiplier = P&L off by 100x!                           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ UNDERLYING SHARES ON EXERCISE/ASSIGNMENT                              │  │
│  │                                                                        │  │
│  │   shares = contracts × multiplier                                     │  │
│  │                                                                        │  │
│  │   Example: Exercise 3 AAPL 150 CALLs                                  │  │
│  │                                                                        │  │
│  │   ┌─────────────────────────────────────────────────────────────┐     │  │
│  │   │  Shares acquired = 3 × 100 = 300 shares                    │     │  │
│  │   │  Cash required   = 300 × $150 = $45,000                    │     │  │
│  │   └─────────────────────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ MULTIPLIER SOURCE (Single Source of Truth)                            │  │
│  │                                                                        │  │
│  │   Runtime: asset.option_spec().multiplier (via OptionSpec)            │  │
│  │                                                                        │  │
│  │   ⚠️  There is NO runtime default of 100.                             │  │
│  │   ⚠️  Missing multiplier is a DATA ERROR - calculations are skipped.  │  │
│  │                                                                        │  │
│  │   Import: activity.metadata.option.multiplier may be used only        │  │
│  │   at import-time to POPULATE OptionSpec, but the calculator/          │  │
│  │   valuation NEVER read it at runtime.                                 │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Summary

### Design Decisions Table

| Aspect | Design Decision |
|--------|-----------------|
| **Canonical Types** | Only 5: `Buy`, `Sell`, `SellShort`, `BuyCover`, `Split` - nothing else affects positions |
| **Direction** | Canonicals encode direction; quantity is always ≥ 0 |
| **Sell Invariant** | `Sell` can only consume long lots, never create short (error if over-selling) |
| **Short Invariant** | Only `SellShort`/`BuyCover` mutate `short_lots` |
| **Compiler Scope** | Only multi-leg events (`OPTION_EXERCISE`, `OPTION_ASSIGNMENT`); expiration is NOT expanded |
| **Expiration** | Stored as canonical `SELL @ 0` or `BUY_COVER @ 0` with optional subtype for labeling |
| **Option Closures** | Close-at-0 trades realize premium P&L through existing lot logic |
| **Multiplier** | **Required** in `OptionSpec` on asset; engine never assumes 100; missing = error |
| **Metadata** | Option structure on Asset only; Activity metadata only for source traceability |
| **P&L** | Long: `market_value - cost_basis`; Short: `premium_received - |market_value|` |
| **Schema** | No changes; all data in existing metadata JSON |
| **v1 Restrictions** | `SellShort`/`BuyCover` only for options (design allows stocks in v2+) |

### Implementation Checklist

```
Phase 1: Canonicals + Core Model
├── [ ] Add SELL_SHORT, BUY_COVER canonical types
├── [ ] Enforce quantity >= 0 for all activities
├── [ ] Enforce Sell cannot create short positions
├── [ ] Add ShortLot model and short_lots to Position
├── [ ] Implement FIFO for short_lots
└── [ ] Add multiplier-aware notional (REQUIRES OptionSpec)

Phase 2: Options Lifecycle
├── [ ] Implement compiler for OPTION_EXERCISE (call + put)
├── [ ] Implement compiler for OPTION_ASSIGNMENT (call + put)
├── [ ] Expiration as canonical SELL/BUY_COVER @ 0 (NO compiler expansion)
└── [ ] Add OPTION_EXPIRATION subtype for labeling

Phase 3: Valuation
├── [ ] Implement option valuation with signed net_quantity
├── [ ] Handle negative market values for short positions
└── [ ] Add long_unrealized_gain / short_unrealized_gain

Phase 4: UI / Options Tab
├── [ ] Option trade forms (BTO, STC, STO, BTC)
├── [ ] Exercise/assignment flows
├── [ ] "Expired" quick actions (generate canonical @ 0)
├── [ ] Option chain viewer
└── [ ] Options P&L summary
```

### Key Files to Modify

```
crates/core/src/activities/
├── activities_constants.rs    # New types & subtypes
├── activities_model.rs        # ActivityType enum
└── compiler.rs                # Expansion rules

crates/core/src/portfolio/snapshot/
├── positions_model.rs         # ShortLot, Position changes
└── holdings_calculator.rs     # New handlers, multiplier

crates/core/src/assets/
└── assets_service.rs          # Option asset creation

crates/core/src/portfolio/holdings/
├── holdings_model.rs          # Option fields
└── holdings_valuation_service.rs  # Option valuation
```

### How This Answers User Feature Requests

With this design:

| User Request | How It's Handled |
|--------------|------------------|
| **"Negative positions"** | Derived `net_quantity < 0` from `short_lots` → surfaces as short positions in UI |
| **"Credit from sell put/call"** | `SellShort` on option asset → cash inflow from premium |
| **"Debit to buy put/call"** | `Buy` on option asset → cash outflow from premium |
| **"Track option expiration"** | Stored as `SELL @ 0` or `BUY_COVER @ 0` → realizes P&L correctly |
| **"Exercise my call"** | `OPTION_EXERCISE` subtype → compiler expands to BUY shares + close option |
| **"Got assigned on put"** | `OPTION_ASSIGNMENT` subtype → compiler expands to BUY shares + close option |
| **"Show option P&L"** | Close-at-0 pattern naturally realizes premium P&L through lot logic |
| **"Options value in net worth"** | `market_value = net_qty × premium × multiplier` (can be negative for shorts) |

This design:
- Stays consistent with the existing calculation pipeline
- Avoids overloading subtypes with accounting semantics
- Is easier to implement and test
- Matches what power users actually want for options tracking
