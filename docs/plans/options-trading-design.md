# Options Trading Support - Design Document

## Executive Summary

Add full options tracking to Wealthfolio using the existing asset model (`AssetKind::Option`, `OptionSpec`) and the existing subtype + compiler expansion pattern. The compiler runs in-memory during calculation and expands semantic option events (exercise/assignment/expiration) into canonical trading postings that the holdings calculator already understands.

**Key Constraints:**
- No schema changes
- Quantity is always absolute (>= 0); never use negative quantity to represent short
- Short direction is represented by canonical activity types (`SELL_SHORT` / `BUY_COVER`)
- Option lifecycle events are represented by subtypes (`OPTION_EXERCISE` / `OPTION_ASSIGNMENT` / `OPTION_EXPIRATION`)
- Option closures use canonical close-at-0 trades to realize premium P&L without special ADJUSTMENT behavior

**Accounting Conventions (v1):**

| Concept | Convention |
|---------|------------|
| **Activity.quantity** | Always absolute (≥ 0). Direction comes from `activity_type`, never from sign. |
| **Position.lots** | `VecDeque<Lot>` for long lots (ownership). Each lot has positive `quantity`. |
| **Position.short_lots** | `VecDeque<ShortLot>` for short lots (obligation). Each lot has positive `quantity`. |
| **net_quantity** | `long_quantity() − short_quantity()`. **Can be negative** (net short exposure). |
| **cost_basis (long)** | `Σ lot.cost_basis` = total cash paid to acquire long lots. Always positive. |
| **cost_basis (short)** | `Σ short_lot.premium_received` = total cash received to open shorts. Stored positive, represents inflow. |
| **market_value** | `sign(net_quantity) × abs(net_quantity) × price × multiplier`. **Negative** when net short. |
| **unrealized_gain (long)** | `market_value − cost_basis`. Positive = profit, negative = loss. |
| **unrealized_gain (short)** | `premium_received − abs(market_value)`. Profit when MV (liability) < premium received. |
| **Multiplier** | Required for options. Do NOT silently default to 100; require it or flag `needs_review`. |

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
│  │  │  • OPTION_EXPIRATION → SELL/BUY_COVER @ 0                 [NEW]     │    │    │
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
│  │                   compile() method:                                            │  │
│  │                   + match OPTION_EXERCISE:                                     │  │
│  │                       if CALL: emit BUY underlying + SELL option @ 0          │  │
│  │                       if PUT:  emit SELL underlying + SELL option @ 0         │  │
│  │                   + match OPTION_ASSIGNMENT:                                   │  │
│  │                       if CALL: emit SELL underlying + BUY_COVER option @ 0    │  │
│  │                       if PUT:  emit BUY underlying + BUY_COVER option @ 0     │  │
│  │                   + match OPTION_EXPIRATION:                                   │  │
│  │                       if LONG:  emit SELL option @ 0                          │  │
│  │                       if SHORT: emit BUY_COVER option @ 0                     │  │
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
4. **Activity economics fields** (`quantity`, `unit_price`, `amount`, `fee`) are optional
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

### 3.1 New Canonical Activity Types

Add two canonical types to represent short direction explicitly:

```rust
// In activities_constants.rs

/// Open or increase a short position. Receives cash (premium for options).
pub const ACTIVITY_TYPE_SELL_SHORT: &str = "SELL_SHORT";

/// Close or decrease a short position. Pays cash (premium for options).
pub const ACTIVITY_TYPE_BUY_COVER: &str = "BUY_COVER";
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

**v1 Restriction**: `SELL_SHORT` and `BUY_COVER` are allowed only when `asset.kind == AssetKind::Option`.

**Rationale**: With absolute quantities, `SELL` cannot distinguish "sell-to-close long" from "sell-to-open short". These two canonicals keep the calculator simple and avoid "infer intent from state" bugs.

### 3.2 Option Lifecycle Subtypes (Compiler Inputs)

Add these subtypes:

```rust
// In activities_constants.rs

/// Option exercise: Long holder exercises their option right
/// CALL: Expands to BUY underlying + SELL option @ 0
/// PUT: Expands to SELL underlying + SELL option @ 0
pub const ACTIVITY_SUBTYPE_OPTION_EXERCISE: &str = "OPTION_EXERCISE";

/// Option assignment: Short writer is assigned
/// CALL: Expands to SELL underlying + BUY_COVER option @ 0
/// PUT: Expands to BUY underlying + BUY_COVER option @ 0
pub const ACTIVITY_SUBTYPE_OPTION_ASSIGNMENT: &str = "OPTION_ASSIGNMENT";

/// Option expiration: Contract expires worthless (OTM at expiry)
/// Long: Expands to SELL option @ 0 (realizes loss)
/// Short: Expands to BUY_COVER option @ 0 (realizes gain)
pub const ACTIVITY_SUBTYPE_OPTION_EXPIRATION: &str = "OPTION_EXPIRATION";
```

**Note**: No separate `AUTO_EXERCISE` needed in v1; it's a UI/origin detail, not an accounting primitive.

### 3.3 Activity Metadata for Options

Store option details nested under a top-level `"option"` key (compatible with `get_meta("option")`):

```json
{
  "option": {
    "underlying_asset_id": "AAPL",
    "strike": "150.00",
    "right": "CALL",
    "expiration": "2024-12-20",
    "multiplier": "100",
    "position_type": "LONG|SHORT"
  },
  "source": {
    "raw_option_type": "BTO",
    "broker_description": "Buy to Open AAPL 12/20/24 150 Call"
  },
  "compiler": {
    "reason": "EXERCISE|ASSIGNMENT|EXPIRATION",
    "compiled_from_activity_id": "ACT123",
    "compiled_group_id": "uuid-or-hash",
    "compiled_leg_index": 0
  }
}
```

**Metadata Fields:**

| Key | Purpose | Required |
|-----|---------|----------|
| `option.underlying_asset_id` | Reference to underlying security | Yes |
| `option.strike` | Strike price (string for precision) | Yes |
| `option.right` | `"CALL"` or `"PUT"` | Yes |
| `option.expiration` | Expiry date (YYYY-MM-DD) | Yes |
| `option.multiplier` | Contracts multiplier (default 100 for equities) | Yes |
| `option.position_type` | `"LONG"` or `"SHORT"` (required for OPTION_EXPIRATION) | For expiration |
| `source.raw_option_type` | Original broker option type (BTO, STO, BTC, STC, etc.) | For traceability |
| `source.broker_description` | Original broker description | For debugging |
| `compiler.*` | Compiler expansion tracking | Virtual only |

The `compiler.*` fields are optional; they help UI grouping/debugging. Since compilation is in-memory, these can be virtual-only (not persisted).

The `source.*` fields preserve original broker data for traceability and debugging import issues.

### 3.4 Activity Compiler Expansion Rules

The compiler runs on-the-fly while calculating, so it expands subtypes into **virtual postings** (not persisted), then passes them to the holdings calculator.

**Key Design Decision - Close at 0 Pattern**:
To avoid special-case ADJUSTMENT realizing/erasing P&L, close option positions via a "close at 0 premium" trade, which naturally realizes premium P&L through existing lot logic.

#### Virtual Posting Identity
Each emitted posting carries:
- `compiled_from_activity_id` (original activity id)
- `compiled_leg_index` (0..n-1)
- `compiled_group_id` (stable hash/uuid for grouping)

#### OPTION_EXPIRATION

**Statelessness Requirement**: The compiler must NOT inspect current position state to determine long vs short. The activity metadata MUST include `position_type`:

```json
{
  "option": {
    "position_type": "LONG"  // or "SHORT" - REQUIRED for OPTION_EXPIRATION
  }
}
```

If `position_type` is missing, the compiler should reject with an error or emit a `needs_review` flag.

**Alternative**: Instead of using `OPTION_EXPIRATION` subtype, users/importers can directly record the canonical close legs:
- Long expiration → `SELL` option @ price=0
- Short expiration → `BUY_COVER` option @ price=0

This alternative avoids subtype expansion entirely and is equally valid.

**Long option expires worthless:**
```
Input: OPTION_EXPIRATION for 2 AAPL 150 CALLs
       metadata.option.position_type = "LONG"
Output:
  Leg 0: SELL option: qty=2, unit_price=0, subtype=OPTION_EXPIRATION
Effect: Realizes loss equal to original premium paid
```

**Short option expires worthless:**
```
Input: OPTION_EXPIRATION for 1 AAPL 150 PUT
       metadata.option.position_type = "SHORT"
Output:
  Leg 0: BUY_COVER option: qty=1, unit_price=0, subtype=OPTION_EXPIRATION
Effect: Realizes gain equal to original premium received
```

**Compiler Pseudocode:**
```rust
fn expand_option_expiration(activity: &Activity) -> Result<Vec<VirtualPosting>> {
    let position_type = activity.get_meta("option")
        .and_then(|o| o.get("position_type"))
        .ok_or_else(|| CompilerError::MissingRequiredField(
            "OPTION_EXPIRATION requires metadata.option.position_type"
        ))?;

    let close_type = match position_type.as_str() {
        Some("LONG") => ActivityType::Sell,
        Some("SHORT") => ActivityType::BuyCover,
        _ => return Err(CompilerError::InvalidPositionType),
    };

    Ok(vec![VirtualPosting {
        activity_type: close_type,
        asset_id: activity.asset_id.clone(),
        quantity: activity.quantity,
        unit_price: Decimal::ZERO,
        ..from_parent(activity)
    }])
}
```

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

#### Enforce Absolute Quantities

Reject negative `quantity` in trading activities. The direction comes from canonical type, not sign.

```rust
// In handle_buy, handle_sell, etc.
if activity.qty() < Decimal::ZERO {
    return Err(CalculatorError::InvalidActivity(
        "Quantity must be non-negative".to_string()
    ));
}
```

#### Add Handlers for SELL_SHORT and BUY_COVER

**v1 Restriction**: Options only

```rust
ActivityType::SellShort => {
    // Validate: options only in v1
    if asset.kind != AssetKind::Option {
        return Err(CalculatorError::InvalidActivity(
            "SELL_SHORT only supported for options in v1".to_string()
        ));
    }
    self.handle_sell_short(activity, state, account_currency, asset_currency_cache)
}

ActivityType::BuyCover => {
    // Validate: options only in v1
    if asset.kind != AssetKind::Option {
        return Err(CalculatorError::InvalidActivity(
            "BUY_COVER only supported for options in v1".to_string()
        ));
    }
    self.handle_buy_cover(activity, state, account_currency, asset_currency_cache)
}
```

**SELL_SHORT Handler**:
- Creates/increases short lots
- Applies cash inflow (premium received)
- Track lots with negative cost basis (premium received, not paid)

**BUY_COVER Handler**:
- Consumes short lots FIFO
- Applies cash outflow (premium paid to close)
- Realizes P&L = premium received - premium paid to close

#### Option Multiplier Handling (Must-Have)

Any time the calculator computes notional/trade value for an option:

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

    // Multiplier is REQUIRED - do NOT silently default to 100
    let multiplier = option_spec.multiplier;
    if multiplier == Decimal::ZERO {
        return Err(CalculatorError::InvalidAsset(
            format!("Option {} has zero or missing multiplier - please set multiplier in asset metadata", asset.id)
        ));
    }

    Ok(qty * price * multiplier)
}
```

**Multiplier Safety Rules:**
1. **Never silently default** to 100 - this hides data errors
2. **Require multiplier** in `OptionSpec` for all option assets
3. If multiplier is missing/zero during import, set `activity.needs_review = true` and use 100 as placeholder
4. UI must prompt user to confirm/edit multiplier before calculations proceed

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
    pub fn net_quantity(&self) -> Decimal {
        self.long_quantity() - self.short_quantity()
    }

    pub fn long_quantity(&self) -> Decimal {
        self.lots.iter().map(|l| l.quantity).sum()
    }

    pub fn short_quantity(&self) -> Decimal {
        self.short_lots.iter().map(|l| l.quantity).sum()
    }

    pub fn total_premium_received(&self) -> Decimal {
        self.short_lots.iter().map(|l| l.premium_received).sum()
    }
}
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

**Market Value Calculation**:

The holding's `net_quantity` (from `Position::net_quantity()`) is signed: positive for net long, negative for net short. Market value preserves this sign to correctly represent exposure.

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

    // Multiplier is REQUIRED - do not silently default
    let multiplier = option_spec.multiplier;
    if multiplier == Decimal::ZERO {
        return Err(CalculatorError::InvalidAsset(
            format!("Option {} has zero multiplier", asset.id)
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

    // Unrealized gain for display:
    // Long:  market_value - cost_basis
    // Short: premium_received - |market_value| (stored separately)
    Ok(())
}
```

**Sign Conventions:**
| Position | net_quantity | market_value | Interpretation |
|----------|--------------|--------------|----------------|
| Long 2 contracts | +2 | +$1,000 | Asset worth $1,000 |
| Short 1 contract | -1 | -$500 | Liability of $500 |
| Mixed (3L, 1S) | +2 | +$1,000 | Net asset exposure |

**No Greeks/Black-Scholes in v1.**

### 3.9 Known v1 Limitations

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

### Phase 1: Long Options + Lifecycle
**Priority: High | Effort: Medium**

1. Add option subtypes to `activities_constants.rs`:
   - `OPTION_EXERCISE`
   - `OPTION_EXPIRATION`
2. Implement in-memory compiler expansion in `compiler.rs`:
   - `EXPIRATION` => `SELL` option @ 0 (long)
   - `EXERCISE` => underlying leg + `SELL` option @ 0
3. Ensure holdings calculator applies option multiplier to trade value
4. Add option asset creation helpers

**Files to modify**:
- `crates/core/src/activities/activities_constants.rs`
- `crates/core/src/activities/activities_model.rs` (ActivityType enum)
- `crates/core/src/activities/compiler.rs`
- `crates/core/src/portfolio/snapshot/holdings_calculator.rs`
- `crates/core/src/assets/assets_service.rs`

### Phase 2: Short Options
**Priority: High | Effort: Medium**

1. Add canonical types: `SELL_SHORT`, `BUY_COVER`
2. Add `ShortLot` model and `short_lots` to Position
3. Calculator handlers for `SELL_SHORT` and `BUY_COVER` (options-only)
4. Implement compiler expansion:
   - `ASSIGNMENT` => underlying leg + `BUY_COVER` option @ 0
   - `EXPIRATION` => `BUY_COVER` option @ 0 (short)

**Files to modify**:
- `crates/core/src/activities/activities_constants.rs`
- `crates/core/src/activities/activities_model.rs`
- `crates/core/src/portfolio/snapshot/positions_model.rs`
- `crates/core/src/portfolio/snapshot/holdings_calculator.rs`
- `crates/core/src/activities/compiler.rs`

### Phase 3: Option Valuation
**Priority: Medium | Effort: Low**

1. Add option-specific valuation logic
2. Apply `premium * contracts * multiplier` formula
3. Handle short position exposure display

**Files to modify**:
- `crates/core/src/portfolio/holdings/holdings_valuation_service.rs`
- `crates/core/src/portfolio/holdings/holdings_model.rs`

### Phase 4: UI Components
**Priority: Medium | Effort: High**

1. Option activity forms (buy/sell/write options)
2. Exercise/assignment/expiration action flows
3. Option chain viewer (grouped by underlying/expiry/strike)
4. Show compiled legs grouped (using `compiled_group_id`)
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
    "option": {
      "underlying_asset_id": "AAPL",
      "right": "CALL",
      "strike": "150.00",
      "expiration": "2024-12-20",
      "multiplier": "100"
    }
  }
}
```

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
    "option": {
      "underlying_asset_id": "AAPL",
      "right": "PUT",
      "strike": "140.00",
      "expiration": "2024-12-20",
      "multiplier": "100"
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
    "option": {
      "underlying_asset_id": "AAPL",
      "strike": "150.00",
      "multiplier": "100",
      "position_type": "LONG"
    }
  }
}
```

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
    "option": {
      "underlying_asset_id": "AAPL",
      "strike": "140.00",
      "multiplier": "100",
      "position_type": "SHORT"
    }
  }
}
```

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
    "option": {
      "position_type": "LONG"
    }
  }
}
```

**Compiler Output**: Pass-through (already canonical)

**Holdings Impact**:
- Option Position: Closed (SELL @ 0)
- Cash: $0
- Realized P&L: Loss of entire premium paid

---

## 7. Risk Considerations

### Validation Rules
- **OPTION_EXERCISE** requires net long option position
- **OPTION_ASSIGNMENT** requires net short option position
- **v1 restriction**: `SELL_SHORT`/`BUY_COVER` rejected for non-options
- **Multiplier must be present** or defaulted; otherwise P&L off by 100x
- **Quantity must be non-negative** in all trading activities

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
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT (Stored Activity)              OUTPUT (Virtual Postings)             │
│  ──────────────────────               ─────────────────────────             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTION_EXPIRATION (Long)                                             │   │
│  │                                                                       │   │
│  │   { subtype: "OPTION_EXPIRATION",    ──▶   Leg 0: SELL option        │   │
│  │     asset_id: "OPT_AAPL...",                 qty: N                  │   │
│  │     quantity: N,                             unit_price: 0           │   │
│  │     position_type: "LONG" }                                          │   │
│  │                                                                       │   │
│  │   Effect: Realizes LOSS = original premium paid                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTION_EXPIRATION (Short)                                            │   │
│  │                                                                       │   │
│  │   { subtype: "OPTION_EXPIRATION",    ──▶   Leg 0: BUY_COVER option   │   │
│  │     asset_id: "OPT_AAPL...",                 qty: N                  │   │
│  │     quantity: N,                             unit_price: 0           │   │
│  │     position_type: "SHORT" }                                         │   │
│  │                                                                       │   │
│  │   Effect: Realizes GAIN = original premium received                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTION_EXERCISE (Long CALL)                                          │   │
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
│  │ MULTIPLIER SOURCES (in order of preference)                           │  │
│  │                                                                        │  │
│  │   1. asset.metadata.option.multiplier  (explicit)                     │  │
│  │   2. activity.metadata.option.multiplier  (activity-level override)   │  │
│  │   3. Default: 100  (standard equity option)                           │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Summary

### Design Decisions Table

| Aspect | Design Decision |
|--------|-----------------|
| **Direction** | Canonicals encode direction (`BUY`/`SELL` for long, `SELL_SHORT`/`BUY_COVER` for short) |
| **Quantity** | Always absolute (>= 0); never negative |
| **Lifecycle Events** | Subtypes (`OPTION_EXERCISE`, `OPTION_ASSIGNMENT`, `OPTION_EXPIRATION`) compile to canonical postings |
| **Option Closures** | Close-at-0 trades realize premium P&L through existing lot logic |
| **Multiplier** | Mandatory for correctness; default 100 |
| **Schema** | No changes; all data in existing metadata JSON |
| **v1 Restrictions** | `SELL_SHORT`/`BUY_COVER` only for options |

### Implementation Checklist

```
Phase 1: Long Options + Lifecycle
├── [ ] Add OPTION_EXERCISE, OPTION_EXPIRATION subtypes
├── [ ] Implement compiler expansion for long positions
├── [ ] Add multiplier-aware notional calculation
└── [ ] Add option asset creation helpers

Phase 2: Short Options
├── [ ] Add SELL_SHORT, BUY_COVER canonical types
├── [ ] Add ShortLot model to Position
├── [ ] Implement calculator handlers for short types
├── [ ] Implement compiler expansion for OPTION_ASSIGNMENT
└── [ ] Add short expiration handling (BUY_COVER @ 0)

Phase 3: Valuation
├── [ ] Add option-specific valuation logic
├── [ ] Apply premium × contracts × multiplier formula
└── [ ] Handle short position exposure display

Phase 4: UI Components
├── [ ] Option activity forms
├── [ ] Exercise/assignment/expiration flows
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

This design leverages existing infrastructure (subtypes, metadata, compiler) to add comprehensive options support with minimal changes while maintaining accounting correctness through the established lot-based P&L model.
