## 🎯 Next Major Feature: Portfolio Rebalancer

### What User Wants

**Quote from conversation**:
> \"I would like a page where we can see properly the allocation of the assets. Plus, I would like to offer the possibility to the user to rebalance his portfolio (something important for strategy). So to have the possibility to adjust the percentage and see the whole balance. We could do this for the 'All portfolio' or also per 'Account' separately.\"

**Additional requirements**:
- Two-level hierarchy: Asset Class (the ones existing) + Individual Holdings
- Better visualization than current treemap
- Ability to set target allocations
- See what trades are needed to rebalance

---

## 📊 Research & Proposals Reviewed

User shared two detailed proposals:
1. **\"Allocation Dashboard\"** - Action-oriented with tax impact
2. **\"Calm Finance Architecture\"** - Institutional-grade with Flexoki integration

### Selected Features (From Proposal 2)

We chose these specific features to implement:
- ✅ Flexoki Design Integration (already in app!)
- ✅ 5/25 Threshold Rule (professional drift detection)
- ✅ Soft Rebalancing Priority (tax-efficient via new contributions)
- ✅ **Deposit Planner** ⭐ (calculate how to invest $1,000 to rebalance)
- ✅ Dual Metrics (relative % and absolute %)
- ✅ Database Schema (comprehensive architecture)
- ✅ Proportional Allocation Sliders (with lock mechanism)
- ✅ Combined Input/Slider Component
- ✅ Real-time Validation


---

## 🏗️ Implementation Approach

### Agreed Strategy: Phased Approach

**Phase 1** (2-3 days): Foundation
- Database + Backend (Rust commands)
- Visual UI with bars
- Basic target editing
- Rebalancing calculations
- Dual metrics
- Real-time validation
- **Deposit Planner** (killer feature!)

**Phase 2** (1-2 days): Advanced Features
- 5/25 threshold rule
- Proportional sliders
- Lock mechanism
- Per-account support

---

## 💡 Key Design Decisions

### UI Design
- **Horizontal stacked bars** instead of pie charts
- Expandable asset class cards
- Flexoki color scheme (already in app)
- Clean, \"calm finance\" aesthetic

### Technical Architecture
- SQLite database for persistence
- Rust backend commands
- React + TypeScript frontend
- Local-first (no external APIs)

### User Experience
- Progressive disclosure (expand for details)
- Two-level hierarchy (asset class → holdings)
- Real-time validation
- Tax-aware recommendations

---

## 📁 Deliverables Created

### Files Created
1. `/docs/features/allocations/allocations_project_spec.md` - Full technical spec

### Branch Setup
- Current branch: `allocations`
- Based on: `main`

---

## 🎨 UI Mockup Key Elements

Visual design includes:
1. **Header**: Account selector, page title
2. **Summary Card**: Portfolio value, drift %, trades needed
3. **Visual Bars**: Current vs target allocation (color-coded)
4. **Deposit Planner**: Smart investment calculator (★ STAR FEATURE)
5. **Asset Class Cards**: Expandable sections showing:
   - Asset class summary (Stocks, Bonds, Cash)
   - Holdings table (VTI, VXUS, QQQ, etc.)
   - Buy/sell recommendations
   - Dual metrics (relative + absolute %)

### Color Scheme (Flexoki)
- Background: #FFFCF0 (paper)
- Stocks: #4385BE (blue)
- Bonds: #8B7EC8 (purple)
- Cash: #879A39 (green)
- Buy/Underweight: #DA702C (orange)
- Warning: #8B7EC8 (purple)

---

## 🔢 Key Algorithms Defined

### 1. Deposit Planner Algorithm
**Purpose**: Calculate optimal allocation of new deposit to rebalance portfolio

**Input**:
- Current holdings
- Target allocations
- Deposit amount ($1,000)

**Output**:
- How much to buy of each asset
- New drift after deposit
- Tax impact (zero - no selling!)

**Example**:
```
Deposit: $1,000
Result:
- Buy $600 VTI (Stocks underweight)
- Buy $300 BND (Bonds underweight)
- Keep $100 Cash (overweight)
→ Drift reduced from 3.2% to 1.1%
```

### 2. 5/25 Threshold Rule
**Purpose**: Professional-grade drift detection

**Logic**:
- Trigger if absolute drift ≥5%
- OR if relative drift ≥25% of target

**Examples**:
- Stocks: 60% → 65% = 5% drift → REBALANCE
- Cash: 10% → 7.5% = 2.5% drift (25% relative) → REBALANCE
- Bonds: 30% → 31% = 1% drift (3.3% relative) → OK

### 3. Proportional Slider Logic
**Purpose**: Adjust one slider while maintaining 100% total

**Behavior**:
- Moving VTI up → VXUS and QQQ decrease proportionally
- Lock icon prevents specific holdings from changing
- If locked holdings prevent change, show error

---

## 📊 Database Schema

Three new tables:

1. **rebalancing_strategies**
   - Stores overall strategy
   - Links to account (or "All Portfolio")
   - Tracks created/updated dates

2. **asset_class_targets**
   - Links to strategy
   - Stores targets for Stocks, Bonds, Cash, etc.
   - Target percentage for each class

3. **holding_targets**
   - Links to asset class
   - Stores targets for VTI, VXUS, QQQ, etc.
   - Target percentage within class (relative)

---

## 🧪 Testing Requirements

### Phase 1 Tests
- [ ] Can create and save allocation targets
- [ ] Targets persist after app restart
- [ ] Visual bars correctly show current vs target
- [ ] Rebalancing calculations are accurate
- [ ] Dual metrics (relative/absolute) display correctly
- [ ] Validation shows remaining % to allocate
- [ ] Deposit planner calculates correct allocations
- [ ] Can edit targets via modal
- [ ] Expandable asset cards work
- [ ] Holdings table shows correct data

### Real Data Test
- [ ] Test with user's actual portfolio
- [ ] Verify calculations match manual math
- [ ] Check edge cases (holdings without asset class, fractional shares)

---

## 📈 Success Metrics

### Phase 1 Complete When:
1. User can set target allocations (e.g., 60/30/10)
2. Visual comparison is clear and accurate
3. Deposit planner provides useful recommendations
4. Rebalancing calculations match expectations
5. UI feels integrated with existing Wealthfolio design
6. All data persists correctly

### User Satisfaction Indicators:
- \"This makes rebalancing so much easier!\"
- \"The deposit planner is genius - no taxes!\"
- \"I can actually understand my allocation now\"
- \"The visual bars are way better than the treemap\"

---

## 🚀 Next Steps (When Ready to Build)

1. **Backend First**
   ```bash
   # Create migration
   touch src-tauri/migrations/YYYYMMDD_rebalancing.sql

   # Add Rust commands
   # Edit: src-tauri/src/commands/mod.rs
   # Create: src-tauri/src/commands/rebalancing.rs

   # Test
   cargo test
   ```

2. **Frontend Structure**
   ```bash
   # Create folders
   mkdir -p src/pages/allocation/components
   mkdir -p src/pages/allocation/hooks

   # Create main page
   touch src/pages/allocation/allocation-page.tsx

   # Add route to src/routes.tsx
   ```

3. **Build Components**
   - Start with allocation-overview.tsx (bars)
   - Add asset-class-card.tsx (expandable)
   - Create deposit-planner.tsx (star feature!)
   - Build holdings-table.tsx

4. **Wire Up Functionality**
   - Create hooks
   - Connect to backend
   - Test calculations
   - Polish UI

5. **Test Thoroughly**
   - Use real portfolio data
   - Verify all calculations
   - Check edge cases
   - Get user feedback

---

## 💬 Important Quotes from Conversation

**On granularity**:
> \"We can do maybe by asset class but also per asset itself (cause it can have a lot of etf in nowadays portfolio but it can be defensive or aggressive inside).\"

**On UI preferences**:
> \"In term of UI do you have some recommendations? (cause maybe Pie charts are not the best) and we need to be still aligned with the look of the app.\"

**On approach**:
> \"I think I am aligned with the Phased approach.\"

**On deposit planner** (this was the \"aha!\" moment):
> User recognized this as the \"brilliant!\" feature after seeing Proposal 2

---

## 🔄 Git Workflow Reference

### Current State
```bash
# Branch structure
main                      # Original Wealthfolio
├── spending-tracking    # Marco's fork with spending
└── allocations  # Our custom work (current)
```

### Committing Work
```bash
# Check status
git status

# After Phase 1
git add .
git commit -m \"feat: Add portfolio allocation Phase 1

- Database schema for allocation targets
- Rust backend commands
- Allocation page with visual bars
- Deposit planner functionality
- Dual metrics display
- Real-time validation\"

# Push to GitHub (if desired)
git push origin my-custom-features-clean
```

---

## 🎓 Learning Points

### Technical Insights
1. **Flexoki**: Wealthfolio uses a specific color palette for \"calm finance\"
2. **Tauri Stack**: React frontend + Rust backend + SQLite
3. **Local-First**: All data stays on device, privacy-focused
4. **Two-Level Hierarchy**: Common pattern in professional portfolio tools

### Design Insights
1. **Horizontal bars > Pie charts** for comparison
2. **Progressive disclosure** reduces cognitive load
3. **Real-time validation** prevents user errors
4. **Tax-aware design** is crucial for retail investors

### Process Insights
1. **Phased approach** reduces risk and allows testing
2. **UI mockup** aligns expectations before coding
3. **Written spec** enables continuation across conversations
4. **Research first** prevents over-engineering

---

## 📚 Resources Created

1. **Full Technical Spec**: /docs/features/allocations_project_spec.md
4. **This Summary**: /docs/features/allocations/conversation_summary.md

### How to Continue This Work
1. Open this file to remember context
2. Review UI mockup in Claude
3. Check full spec for technical details
4. Start with Phase 1 backend work
5. Test thoroughly before Phase 2

---

## 🎯 Future Enhancements (Post-MVP)

Ideas discussed but deferred for now:
- Multiple saved strategies (\"Conservative\", \"Aggressive\")
- Rebalancing history tracking
- Tax impact estimation (capital gains)
- Strategy templates (60/40, All Weather, etc.)
- Benchmark cloning (copy S&P 500 allocation)
- AI strategy assistant

---

## 🤝 Collaboration Notes

### Working Style
- User prefers phased approach (smart!)
- Values practical features over theoretical ones
- Wants to test before adding complexity
- Appreciates detailed explanations

### Communication Preferences
- Likes visual mockups
- Wants comprehensive documentation
- Prefers examples and analogies
- Values honest difficulty assessments

---

## ✅ Final Checklist Before Starting

- [x] UI design approved
- [x] Features selected
- [x] Phased approach agreed
- [x] Specification documented
- [x] Implementation plan created
- [x] Git branch prepared
- [ ] Resources saved for reference
- [ ] Backend implementation (next step!)
- [ ] Frontend implementation
- [ ] Testing with real data
- [ ] Phase 2 decision

---

**Status**: Planning Complete ✅
**Next Action**: Begin Phase 1 implementation when ready
**Reference Files**:
- /docs/feattures/allocations/allocations_project_spec.md

---

*This document serves as a complete record of our planning conversation and can be used to continue the project in future conversations or by other developers.*
