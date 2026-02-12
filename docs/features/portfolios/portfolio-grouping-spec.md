# Portfolio Grouping — Feature Spec

**Status**: Planned (not started)
**Date**: February 2026
**Branch**: TBD (`feature/portfolio-grouping`)
**Depends on**: Nothing (standalone cross-cutting feature)
**Consumers**: Allocations, Holdings, Insights, Dashboard

---

## Overview

Portfolios are named groups of 2+ accounts that enable unified views and
strategy management across the app. A user with accounts at Degiro, Interactive
Brokers, and a bank savings account can create "Retirement" (Degiro + IB) and
"Emergency Fund" (savings) portfolios and manage each independently.

This is a cross-cutting feature: once built, any page that uses AccountSelector
can support portfolio selection. The allocations page is the primary consumer
but holdings, insights, and dashboard benefit equally.

---

## Design Principles

- **Lightweight**: Portfolios are just named references to account IDs. No data
  duplication. All data stays in accounts/holdings tables.
- **Independent strategies**: Each portfolio gets its own allocation targets,
  performance tracking, etc.
- **Flexible UX**: Quick multi-select for ad-hoc exploration + named portfolios
  for persistent use.
- **"All Portfolio"** remains the default aggregate of all accounts.

---

## Data Model

### Database table

```sql
CREATE TABLE portfolios (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    account_ids TEXT NOT NULL,   -- JSON array: ["uuid1", "uuid2", "uuid3"]
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_portfolios_name ON portfolios(name);
```

JSON array for account_ids (simpler than junction table, sufficient for the
small number of accounts a user has).

### Domain models (Rust)

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Portfolio {
    pub id: String,
    pub name: String,
    pub account_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPortfolio {
    pub id: Option<String>,
    pub name: String,
    pub account_ids: Vec<String>,
}
```

### TypeScript types

```typescript
export interface Portfolio {
  id: string;
  name: string;
  accountIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NewPortfolio {
  id?: string;
  name: string;
  accountIds: string[];
}
```

---

## Backend

### Module structure

Following beta patterns:

```
crates/core/src/portfolio/portfolios/
  mod.rs
  portfolio_model.rs      -- Portfolio, NewPortfolio
  portfolio_traits.rs     -- PortfolioServiceTrait, PortfolioRepositoryTrait
  portfolio_service.rs    -- CRUD + validation + auto-matching

crates/storage-sqlite/src/portfolio/portfolios/
  mod.rs
  model.rs                -- Diesel DB model (JSON string ↔ Vec<String>)
  repository.rs           -- Diesel queries
```

### Service methods

- `get_all_portfolios()` → Vec<Portfolio>
- `get_portfolio(id)` → Option<Portfolio>
- `create_portfolio(new)` → Portfolio
- `update_portfolio(portfolio)` → Portfolio
- `delete_portfolio(id)` → usize
- `find_by_accounts(account_ids)` → Option<Portfolio> (order-independent match)

### Validation rules

- Name must be unique (case-insensitive)
- Minimum 2 accounts per portfolio
- All account_ids must reference existing accounts
- On account deletion: portfolio should flag as incomplete (not auto-delete)

### Commands / Routes

Tauri commands + Axum routes, same pattern as other modules:

```
get_portfolios              GET    /portfolios
get_portfolio               GET    /portfolios/{id}
create_portfolio            POST   /portfolios
update_portfolio            PUT    /portfolios/{id}
delete_portfolio            DELETE /portfolios/{id}
find_portfolio_by_accounts  POST   /portfolios/match
```

---

## Frontend

### Account/Portfolio Selector component

Replaces the current `AccountSelector` with an enhanced version that supports
both individual accounts and saved portfolios. Uses the shadcn
Command/CommandItem pattern (consistent with existing selectors).

```
┌──────────────────────────────────────┐
│ Search...                          ▼ │
├──────────────────────────────────────┤
│ All Accounts                     ✓   │
├──────────────────────────────────────┤
│ Portfolios                           │
│   Retirement Strategy            ✓   │ ← named portfolio
│   Emergency Fund                     │
├──────────────────────────────────────┤
│ Accounts                             │
│   Degiro                         ✓   │ ← multi-select with check
│   Interactive Brokers            ✓   │
│   Savings Account                    │
│   Trading212                         │
└──────────────────────────────────────┘
```

Features:
- "All Accounts" = existing PORTFOLIO_ACCOUNT_ID behavior
- Portfolios section shows saved combos
- Accounts section supports multi-select (click to toggle)
- When multi-selection matches a saved portfolio → auto-activate + toast
- When multi-selection doesn't match → show "Save as Portfolio" banner

### Settings → Portfolios page

CRUD page for managing portfolios (under Settings):

```
┌──────────────────────────────────────────────────┐
│ Settings > Portfolios                            │
├──────────────────────────────────────────────────┤
│                                                  │
│ Your Portfolios                    [+ New]       │
│                                                  │
│ ┌──────────────────────────────────────────────┐ │
│ │ Retirement Strategy                          │ │
│ │ Degiro, Interactive Brokers        [Edit][×] │ │
│ ├──────────────────────────────────────────────┤ │
│ │ Emergency Fund                               │ │
│ │ Savings Account, Revolut           [Edit][×] │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ No portfolios? Create one to group your          │
│ accounts for unified allocation tracking.        │
└──────────────────────────────────────────────────┘
```

### Auto-matching logic

When user multi-selects accounts in the selector:

```typescript
function findMatchingPortfolio(
  selectedIds: string[],
  portfolios: Portfolio[]
): Portfolio | null {
  const selectedSet = new Set(selectedIds);
  return portfolios.find(p => {
    const portfolioSet = new Set(p.accountIds);
    if (portfolioSet.size !== selectedSet.size) return false;
    for (const id of selectedSet) {
      if (!portfolioSet.has(id)) return false;
    }
    return true;
  }) ?? null;
}
```

Order-independent: {A, B, C} matches {C, B, A}.

### "Save as Portfolio" banner

When user has 2+ accounts selected that don't match any portfolio:

```
┌─────────────────────────────────────────────────────────┐
│ 💡 Viewing 2 accounts — [Save as Portfolio]             │
└─────────────────────────────────────────────────────────┘
```

Click → modal with pre-filled name (account names joined), user can edit.

### Hooks

```
hooks/use-portfolios.ts:
  usePortfolios()                    -- list all
  usePortfolio(id)                   -- single
  useCreatePortfolio()               -- mutation
  useUpdatePortfolio()               -- mutation
  useDeletePortfolio()               -- mutation
  useFindPortfolioByAccounts(ids)    -- auto-match query
```

### Adapter

```
adapters/shared/portfolios.ts:
  getPortfolios()
  getPortfolio(id)
  createPortfolio(portfolio)
  updatePortfolio(portfolio)
  deletePortfolio(id)
  findPortfolioByAccounts(accountIds)
```

---

## Integration points

When portfolio grouping is built, these pages need small updates:

| Page | Change |
|------|--------|
| Allocations | Swap AccountSelector for AccountPortfolioSelector |
| Holdings | Same swap (currently uses AccountSelector) |
| Holdings Insights | Same swap |
| Dashboard | Optional: portfolio-scoped dashboard widgets |
| Settings | Add "Portfolios" section for CRUD |
| Routes | Add settings/portfolios route |

The swap is minimal: the new selector emits the same `selectedAccount` or a
list of `selectedAccountIds`. Pages that already handle PORTFOLIO_ACCOUNT_ID
continue working. The main addition is handling multi-account aggregation
(already supported by the holdings/allocation services that accept account_id).

---

## Edge cases

### Account deletion

If an account in a portfolio is deleted:
- Portfolio still exists but is "incomplete"
- UI shows warning: "⚠ Account removed. Update or delete this portfolio."
- Portfolio continues to work with remaining accounts
- User can edit portfolio to remove the deleted account reference

### Account renaming

Portfolio displays account names dynamically (looked up from accounts table,
not stored in portfolio). Name changes reflect immediately.

### Duplicate names

Validated at backend. Frontend shows inline error "Name already exists".

### Single account remaining

If a portfolio has 2 accounts and one is deleted, it drops to 1 account.
Show warning, suggest converting to single-account view or deleting portfolio.

---

## Adaptation from old branch

The old `allocations/phase-4` branch had a working portfolio system. Key
differences in the beta codebase:

| Aspect | Old branch | Beta adaptation |
|--------|-----------|-----------------|
| Account IDs | String-based | UUID-based |
| Account model | Simple | Has tracking_mode, is_archived |
| Asset identity | Symbol-based | UUID-based instruments |
| Directory structure | `src/`, `src-core/`, `src-tauri/` | `apps/frontend/`, `crates/`, `apps/tauri/` |
| Service pattern | Direct DB calls | Trait-based with writer actor |
| Adapter pattern | `commands/` with RUN_ENV switch | `adapters/shared/` + platform adapters |
| Virtual strategies | Used for multi-account temp combos | Not needed (portfolio_targets.account_id handles it) |

The virtual strategy concept from the old branch (auto-created temporary
strategies for unsaved multi-account combos) can be simplified. In the new
architecture, when a user multi-selects accounts without saving as portfolio,
we can use a deterministic composite ID (sorted account IDs joined) as the
account_id for targets. Or we can require saving as portfolio before setting
targets (simpler, cleaner).

---

## Implementation order

1. DB migration + Rust module (models, traits, service, repository)
2. Tauri commands + Axum routes
3. Frontend adapters + hooks
4. Settings → Portfolios CRUD page
5. AccountPortfolioSelector component (replaces AccountSelector)
6. Integration: swap selector in Allocations, Holdings, Insights pages
7. Auto-matching + "Save as Portfolio" banner
8. Edge case handling (deletion, validation)

---

## Out of scope

- Portfolio-level performance tracking (separate feature)
- Portfolio sharing / export
- Portfolio templates / presets
- Nested portfolios (portfolio of portfolios)
