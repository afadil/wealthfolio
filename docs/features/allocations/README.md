# Allocation Feature Documentation

This folder contains documentation for the Wealthfolio Allocation feature, which enables users to set target percentages for asset classes and individual holdings, with a live rebalancing advisor.

---

## Quick Navigation

### 📘 Master Documentation
- **[phase-3.md](phase-3.md)** — Complete Phase 3 specification
  - Architecture decisions (data model, rebalancing, portfolio/multi-account)
  - UI/UX decisions
  - Component architecture
  - Implementation plan (Sprint 1-3)
  - Portfolio feature implementation (section 1.4 - **complete before Sprint 2**)
  - Sprint status tracking
  - Known issues
  - Testing strategy

### 📚 Historical Reference
- **[phase-2.md](phase-2.md)** — Phase 2: Asset Class Allocation summary
- **[archive/](archive/)** — Historical documents and planning artifacts

---

## Feature Overview

**What is the Allocation feature?**

The Allocation feature helps users:
1. Set target allocation percentages for asset classes (e.g., 60% Equity, 40% Fixed Income)
2. Set target percentages for individual holdings within each asset class
3. Get automated rebalancing advice (which holdings to buy/sell)
4. View allocation across portfolios (multiple accounts grouped together)

**Current Status**: Phase 3 Sprint 2 (85% complete)

---

## Development Status

### Phase 3: Per-Holding Target Allocation

**Sprint 1: Backend Foundation** ✅ COMPLETE
- Database schema, Rust commands, migrations

**Sprint 2: Enhanced Side Panel UI** 🔄 85% COMPLETE
- HoldingTargetRow component with text input
- Lock/delete functionality
- Custom toast notifications
- Proportional calculations

**Remaining for Sprint 2**:
- Live Preview functionality (bold vs italic)
- "Save All Targets" button
- Total % indicator

**Sprint 3: Rebalancing Integration** ⏳ NOT STARTED

---

## Architecture Highlights

### Multi-Level Target System
```
Portfolio (All Accounts)
└── Asset Class Target: 60% Equity
    └── Holding Target: 40% VWCE
    └── Holding Target: 60% VTI
```

### Portfolio & Multi-Account Support
- Create named portfolios combining 2+ accounts
- View allocation strategies at the portfolio level
- Quick multi-select accounts for ad-hoc exploration
- Independent strategies per portfolio/account

### Rebalancing Model: Cash-First Allocation
- User has cash to invest → system suggests which holdings to buy
- Prioritizes largest gaps from target allocation
- No sell suggestions (tax-efficient, long-term investing)

---

## Key Files

**Frontend:**
- `src/pages/allocation/index.tsx` — Main allocation page
- `src/pages/allocation/components/allocation-pie-chart-view.tsx` — Target vs Actual section
- `src/pages/allocation/components/holding-target-row.tsx` — Side panel holding row
- `src/pages/allocation/hooks/use-holding-target-mutations.ts` — Mutation hooks

**Backend:**
- `src-core/src/models/holding_target.rs` — Core data model
- `src-core/src/asset/holding_service.rs` — Business logic
- `src-tauri/src/commands/holding.rs` — Tauri commands

**Database:**
- `src-core/migrations/*_create_holding_targets.sql` — Schema

---

## Getting Started

### For Developers
1. Read [phase-3.md](phase-3.md) sections 1-4 for architecture understanding
2. **PRIORITY**: Complete section 1.4 (Portfolio Implementation) before Sprint 2
3. Review Sprint Status (section 9) for current progress
4. Check Known Issues (section 10) before reporting bugs
5. See User Workflows (section 6) for feature usage patterns

### For QA/Testing
1. Review Testing Strategy (phase-3.md section 7)
2. Test Portfolio feature scenarios (phase-3.md section 1.4)
3. Check Sprint 2 checklist for features to test
4. Known issue: Toast appears behind side panel (minor UX issue)

### For Product/Planning
1. Read Overview and Architecture Highlights above
2. Review Sprint Status to see what's complete vs in-progress
3. See phase-3.md section 8 for Phase 4 scope
4. Portfolio feature (section 1.4) required before Sprint 2 completion

---

## Contributing

When working on the Allocation feature:
- Follow frontend rules in `.cursor/rules/frontend-rules.mdc`
- Follow Rust backend rules in `.cursor/rules/rust-rules.mdc`
- **Complete Portfolio implementation (phase-3.md section 1.4) before Sprint 2**
- Update phase-3.md Sprint Status when completing tasks
- Document known issues in section 10
- Keep readme.md updated as entry point

---

## Document History

- **Jan 2025**: Documentation consolidation — merged 20 files into single master phase-3.md
- **Dec 2024**: Phase 3 Sprint 2 implementation
- **Nov 2024**: Phase 2 completion (asset class allocation)

For historical documents, see [archive/](archive/).
