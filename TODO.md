# Portfolio Equity and Loan Tracking Enhancement

## Overview
Enhance the dashboard to show 4 different portfolio metrics with clear separation between actual equity and borrowed funds.

## Terminology
- **Portfolio Equity**: Total Value minus outstanding loans (what you'd have if you sold everything and repaid loans)
- **Outstanding Loans**: Current balance of borrowed money (LOAN_TAKEN - LOAN_REPAID)
- **Total Value**: Current behavior (includes loan money)
- **Net Deposit**: Current behavior (your actual money invested, excludes loans)

## UI Changes Required

### Dashboard Graph Enhancement
- [ ] **Default view (2 graphs shown)**:
  1. **Portfolio Equity** (primary line, positive values)
  2. **Outstanding Loans** (secondary line, negative values, different color/style)

- [ ] **Hover view (additional 2 graphs)**:
  3. **Total Value** (current behavior, includes loans)
  4. **Net Deposit** (current behavior, excludes loans)

### Graph Styling
- [ ] Portfolio Equity: Primary color (blue/green), solid line
- [ ] Outstanding Loans: Warning color (red/orange), dashed/dotted line, negative values
- [ ] Total Value: Secondary color (gray), shown on hover only
- [ ] Net Deposit: Tertiary color (purple), shown on hover only
- [ ] Add proper legend with toggle controls
- [ ] Update tooltips to show all 4 values clearly

## Backend/Data Changes Required

### New Calculations Needed
- [ ] **Calculate Outstanding Loan Balance**:
  - Sum all LOAN_TAKEN amounts
  - Subtract all LOAN_REPAID amounts
  - Track this over time for historical graphs

- [ ] **Calculate Portfolio Equity**:
  - Portfolio Equity = Total Value - Outstanding Loans
  - Ensure this is calculated for all historical dates

### Database Schema Evaluation
- [ ] **Option A**: Add loan tracking to existing `account_valuation` table
  - Add `outstanding_loans` column
  - Add `portfolio_equity` column

- [ ] **Option B**: Create separate loan tracking table
  - Track loan balances separately
  - Join with portfolio data for calculations

- [ ] **Option C**: Calculate on-the-fly from activities
  - No schema changes
  - Calculate loan balance from LOAN_TAKEN/LOAN_REPAID activities
  - May impact performance for large datasets

### Core Service Updates
- [ ] Update `portfolio/valuation/valuation_calculator.rs`:
  - Add loan balance calculation from activities
  - Add portfolio equity calculation
  - Ensure historical accuracy

- [ ] Update `portfolio/snapshot/holdings_calculator.rs`:
  - Track loan balance in snapshots
  - Include loan data in account state

- [ ] Update portfolio service APIs:
  - Include loan data in responses
  - Ensure frontend gets all 4 metrics

## Code Dependency Evaluation

### Critical Dependencies to Review
- [ ] **Performance Calculations**:
  - `src-core/src/portfolio/performance/` - Check if returns are calculated using Total Value
  - Verify that performance metrics should use Portfolio Equity instead
  - Update ROI, IRR, and other return calculations

- [ ] **Comparison Features**:
  - Account comparisons
  - Benchmark comparisons
  - Time period comparisons
  - Ensure consistency in which value is used

- [ ] **Export Functionality**:
  - CSV exports
  - Report generation
  - Check which portfolio values are exported

- [ ] **Dashboard Components**:
  - Summary cards
  - Account overview
  - Holdings view
  - Income tracking

### Frontend Dependencies
- [ ] **Chart Components**:
  - `src/components/dashboard/` - Portfolio chart components
  - `src/components/portfolio/` - Portfolio-specific charts
  - Line chart configurations

- [ ] **Data Fetching**:
  - Portfolio hooks and queries
  - Account data fetching
  - Historical data loading

- [ ] **Display Components**:
  - Portfolio summary cards
  - Account balance displays
  - Performance indicators

## Implementation Plan

### Phase 1: Backend Foundation ✅ COMPLETE & FULLY OPERATIONAL
1. [✅] **Implement loan balance calculation logic**
   - [✅] Updated DailyAccountValuation struct with outstanding_loans, portfolio_equity fields
   - [✅] Updated DailyAccountValuationDb struct and conversions
   - [✅] Updated AccountStateSnapshot struct with outstanding_loans, outstanding_loans_base fields  
   - [✅] Updated AccountStateSnapshotDB struct and conversions
   - [✅] Update database schema (schema.rs) to include new columns
   - [✅] Update holdings calculator to calculate loan balances from activities
   - [✅] Fixed AccountStateSnapshot constructors in snapshot service
   - [✅] **Migration successfully applied to database - all loan columns added!**
   - [✅] **Resolved critical field mapping issue - struct field order now matches schema**
   - [✅] **Successfully compiles and builds!**
2. [✅] **Add Portfolio Equity calculation**
   - [✅] Added portfolio equity calculation to valuation calculator (Total Value - Outstanding Loans)
   - [✅] **Valuation calculator now receives correct loan data from snapshots**
3. [✅] **Update valuation services to include loan data**
   - [✅] Core calculation logic implemented 
   - [✅] **Loan data transfer from snapshots to valuations working correctly**
   - [✅] APIs automatically expose new metrics via DailyAccountValuation struct
4. [✅] **APIs now serve all 4 metrics - VERIFIED WORKING**
   - [✅] `get_historical_valuations` returns outstanding_loans, portfolio_equity, total_value, net_contribution
   - [✅] `get_latest_valuations` returns outstanding_loans, portfolio_equity, total_value, net_contribution
   - [✅] **All loan tracking data flows correctly through the system**
   - [✅] **Build validates successfully and loan tracking operational!**

### Phase 2: Frontend Data Integration
1. [ ] Update TypeScript types for new data structure
2. [ ] Modify data fetching hooks
3. [ ] Update portfolio context/state management

### Phase 3: UI Implementation
1. [ ] Enhance chart component to handle 4 series
2. [ ] Implement show/hide toggle functionality
3. [ ] Add proper styling and colors
4. [ ] Update tooltips and legends

### Phase 4: Performance & Dependencies
1. [ ] Review and update performance calculations
2. [ ] Audit all components using portfolio values
3. [ ] Ensure consistent usage of appropriate metrics
4. [ ] Update exports and reports

### Phase 5: Testing & Polish
1. [ ] Test with historical data
2. [ ] Verify loan balance accuracy
3. [ ] Test graph interactions and toggles
4. [ ] Performance testing with large datasets

## Questions to Resolve
- [ ] Should Portfolio Equity be the new "primary" metric for performance calculations?
- [ ] How to handle accounts with no loans (should loan line be hidden?)
- [ ] Should there be a separate "Loan Overview" page?
- [ ] How to handle multiple currencies in loan calculations?
- [ ] Should loan balances be shown per account or aggregated?

## Success Criteria
- [ ] Users can see their actual equity separate from borrowed funds
- [ ] Loan balances are clearly visible as negative impact
- [ ] Historical accuracy of all 4 metrics
- [ ] Performance calculations use appropriate base values
- [ ] Clean, intuitive UI that doesn't overwhelm users
- [ ] No performance degradation from additional calculations

## Technical Considerations
- [ ] Ensure loan balance calculations are efficient
- [ ] Consider caching for complex historical calculations
- [ ] Handle edge cases (loans in different currencies)
- [ ] Maintain backward compatibility with existing data
- [ ] Consider impact on mobile/responsive design
