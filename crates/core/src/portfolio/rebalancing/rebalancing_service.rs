//! Rebalancing service implementation.
//!
//! Implements the cash-first, buy-only rebalancing algorithm.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use log::debug;
use rust_decimal::Decimal;
use rust_decimal_macros::dec;

use crate::errors::{Error, Result};
use crate::portfolio::allocation::AllocationServiceTrait;
use crate::portfolio::holdings::HoldingSummary;
use crate::portfolio::targets::{HoldingTarget, PortfolioTargetServiceTrait};

use super::{RebalancingInput, RebalancingPlan, TradeRecommendation};

/// Service trait for rebalancing calculations.
#[async_trait]
pub trait RebalancingService: Send + Sync {
    /// Calculate a rebalancing plan for a given target allocation.
    async fn calculate_rebalancing_plan(&self, input: RebalancingInput) -> Result<RebalancingPlan>;
}

/// Internal struct to track richer holding data during optimization
#[derive(Debug, Clone)]
struct HoldingShortfall {
    asset_id: String,
    shortfall_amount: Decimal,
    price_per_share: Decimal,
    current_percent_of_class: Decimal,
    target_percent_of_class: Decimal,
}

/// Implementation of the rebalancing service.
pub struct RebalancingServiceImpl {
    target_service: Arc<dyn PortfolioTargetServiceTrait>,
    allocation_service: Arc<dyn AllocationServiceTrait>,
}

impl RebalancingServiceImpl {
    pub fn new(
        target_service: Arc<dyn PortfolioTargetServiceTrait>,
        allocation_service: Arc<dyn AllocationServiceTrait>,
    ) -> Self {
        Self {
            target_service,
            allocation_service,
        }
    }

    /// Calculate category-level shortfalls (Step 1).
    /// In buy_only mode: returns only positive shortfalls (underweight categories).
    /// In buy_and_sell mode: returns signed deltas (negative = overweight, sell needed).
    fn calculate_category_shortfalls(
        &self,
        deviation_report: &crate::portfolio::targets::DeviationReport,
        new_total_value: Decimal,
        rebalance_mode: &str,
    ) -> HashMap<String, Decimal> {
        let mut shortfalls = HashMap::new();
        let buy_only = rebalance_mode != "buy_and_sell";

        for deviation in &deviation_report.deviations {
            let target_value = (deviation.target_percent / dec!(100)) * new_total_value;
            let current_value = deviation.current_value;
            let delta = target_value - current_value;

            let shortfall = if buy_only {
                // Buy-only: clamp to >= 0
                delta.max(Decimal::ZERO)
            } else {
                // Buy & sell: preserve sign
                delta
            };

            if shortfall != Decimal::ZERO {
                shortfalls.insert(deviation.category_id.clone(), shortfall);
            }
        }

        shortfalls
    }

    /// Calculate per-holding shortfalls within a category (Step 3).
    /// Returns vec of HoldingShortfall with all necessary data for optimization.
    fn calculate_holding_shortfalls(
        &self,
        holdings: &[HoldingSummary],
        holding_targets: &[HoldingTarget],
        category_target_percent: Decimal,
        new_total_value: Decimal,
    ) -> Vec<HoldingShortfall> {
        let mut shortfalls = Vec::new();

        // Calculate total category current value for % calculations
        let category_current_value: Decimal = holdings.iter().map(|h| h.market_value).sum();

        for target in holding_targets {
            // Find the matching holding
            let holding = holdings.iter().find(|h| h.id == target.asset_id);

            let holding = match holding {
                Some(h) => h,
                None => continue, // Skip if holding not found
            };

            // Calculate current price per share
            let current_price = if holding.quantity > Decimal::ZERO {
                holding.market_value / holding.quantity
            } else {
                Decimal::ZERO
            };

            if current_price <= Decimal::ZERO {
                continue; // Skip if no price available
            }

            // target_percent is in basis points (10000 = 100%), convert to percentage
            let target_percent_of_class = Decimal::from(target.target_percent) / dec!(100);

            // Current % of category
            let current_percent_of_class = if category_current_value > Decimal::ZERO {
                (holding.market_value / category_current_value) * dec!(100)
            } else {
                Decimal::ZERO
            };

            // Cascading calculation: target portfolio % = (category% * holding%) / 100
            let target_portfolio_percent =
                (category_target_percent * Decimal::from(target.target_percent)) / dec!(10000);

            // Target value = (target_portfolio% / 100) * new_total_value
            let target_value = (target_portfolio_percent / dec!(100)) * new_total_value;

            // Current value
            let current_value = holding.market_value;

            // Shortfall (buy-only)
            let shortfall = (target_value - current_value).max(Decimal::ZERO);

            // Include ALL holdings (even those with 0 shortfall / above target)
            // so frontend can show/hide them with the Eye toggle
            shortfalls.push(HoldingShortfall {
                asset_id: target.asset_id.clone(),
                shortfall_amount: shortfall,
                price_per_share: current_price,
                current_percent_of_class,
                target_percent_of_class,
            });
        }

        shortfalls
    }

    /// Optimize whole-share purchases within a category budget (Step 4).
    /// Uses "Efficient Rebalancing" algorithm:
    /// - Phase 1: Buy shares that reduce deviation (improve targets)
    /// - Phase 2: Use remaining budget without exceeding category ceiling
    fn optimize_whole_shares(
        &self,
        holdings: &[HoldingSummary],
        holding_targets: &[HoldingTarget],
        shortfalls: Vec<HoldingShortfall>,
        category_budget: Decimal,
        category_id: &str,
        category_name: &str,
        category_target_percent: Decimal,
        new_total_value: Decimal,
    ) -> Vec<TradeRecommendation> {
        let mut recommendations = Vec::new();

        if shortfalls.is_empty() || category_budget <= Decimal::ZERO {
            return recommendations;
        }

        // Calculate total shortfall for scaling
        let total_shortfall: Decimal = shortfalls.iter().map(|s| s.shortfall_amount).sum();

        // Initialize: calculate fractional shares and floor to whole shares
        let mut shares_to_buy: HashMap<String, Decimal> = HashMap::new();
        let mut remaining_budget = category_budget;

        for shortfall in &shortfalls {
            // Skip holdings with 0 shortfall (at or above target)
            if shortfall.shortfall_amount <= Decimal::ZERO {
                continue;
            }

            // Scale shortfall to fit category budget
            let scaled_shortfall = if total_shortfall > Decimal::ZERO {
                shortfall.shortfall_amount * (category_budget / total_shortfall)
            } else {
                shortfall.shortfall_amount
            };

            // Calculate fractional shares
            let fractional_shares = scaled_shortfall / shortfall.price_per_share;

            // Floor to whole shares
            let whole_shares = fractional_shares.floor();

            if whole_shares > Decimal::ZERO {
                shares_to_buy.insert(shortfall.asset_id.clone(), whole_shares);
                remaining_budget -= whole_shares * shortfall.price_per_share;
            }
        }

        // ============================================================
        // PHASE 1: Efficient Rebalancing - Reduce Deviation
        // Buy shares that move holdings closer to their targets
        // Continue while improvement_per_dollar > 0
        // ============================================================
        loop {
            let mut best_asset: Option<String> = None;
            let mut best_improvement_per_dollar = Decimal::ZERO;

            for shortfall in &shortfalls {
                if shortfall.price_per_share > remaining_budget {
                    continue; // Can't afford this one
                }

                // Calculate improvement if we buy 1 more share
                let current_shares = shares_to_buy
                    .get(&shortfall.asset_id)
                    .copied()
                    .unwrap_or(Decimal::ZERO);
                let new_shares = current_shares + Decimal::ONE;

                // Find holding and target
                let holding = holdings.iter().find(|h| h.id == shortfall.asset_id);
                let target = holding_targets
                    .iter()
                    .find(|t| t.asset_id == shortfall.asset_id);

                if let (Some(holding), Some(target)) = (holding, target) {
                    // Calculate target portfolio %
                    let target_portfolio_pct = (category_target_percent
                        * Decimal::from(target.target_percent))
                        / dec!(10000);

                    // Calculate current value BEFORE buying 1 more share (includes shares already bought)
                    let current_value_before =
                        holding.market_value + (current_shares * shortfall.price_per_share);
                    let current_pct_before = (current_value_before / new_total_value) * dec!(100);

                    // Calculate value AFTER buying 1 more share
                    let current_value_after =
                        holding.market_value + (new_shares * shortfall.price_per_share);
                    let current_pct_after = (current_value_after / new_total_value) * dec!(100);

                    // Improvement = reduction in deviation
                    let deviation_before = (current_pct_before - target_portfolio_pct).abs();
                    let deviation_after = (current_pct_after - target_portfolio_pct).abs();
                    let improvement = deviation_before - deviation_after;

                    let improvement_per_dollar = if shortfall.price_per_share > Decimal::ZERO {
                        improvement / shortfall.price_per_share
                    } else {
                        Decimal::ZERO
                    };

                    if improvement_per_dollar > best_improvement_per_dollar {
                        best_improvement_per_dollar = improvement_per_dollar;
                        best_asset = Some(shortfall.asset_id.clone());
                    }
                }
            }

            // If we found a beneficial purchase, make it
            if let Some(asset_id) = best_asset {
                let price = shortfalls
                    .iter()
                    .find(|s| s.asset_id == asset_id)
                    .map(|s| s.price_per_share)
                    .unwrap();
                let current = shares_to_buy
                    .get(&asset_id)
                    .copied()
                    .unwrap_or(Decimal::ZERO);
                shares_to_buy.insert(asset_id.clone(), current + Decimal::ONE);
                remaining_budget -= price;
            } else {
                // Phase 1 complete: No more purchases that reduce deviation
                break;
            }

            if remaining_budget <= Decimal::ZERO {
                break;
            }
        }

        // ============================================================
        // PHASE 2: Efficient Rebalancing - Use Remaining Budget
        // Buy shares that don't exceed category ceiling
        // ============================================================
        if remaining_budget > Decimal::ZERO {
            loop {
                let mut best_asset: Option<String> = None;
                let mut best_distance_from_ceiling = Decimal::ZERO;

                // Calculate current category total value (including Phase 1 purchases)
                let category_current_value: Decimal = holdings
                    .iter()
                    .map(|h| {
                        let shares_bought =
                            shares_to_buy.get(&h.id).copied().unwrap_or(Decimal::ZERO);
                        let price = shortfalls
                            .iter()
                            .find(|s| s.asset_id == h.id)
                            .map(|s| s.price_per_share)
                            .unwrap_or(Decimal::ZERO);
                        h.market_value + (shares_bought * price)
                    })
                    .sum();

                // Try each affordable holding
                for shortfall in &shortfalls {
                    if shortfall.price_per_share > remaining_budget {
                        continue; // Can't afford
                    }

                    // Calculate new category % if we buy 1 more share of this holding
                    let new_category_value = category_current_value + shortfall.price_per_share;
                    let new_category_percent = if new_total_value > Decimal::ZERO {
                        (new_category_value / new_total_value) * dec!(100)
                    } else {
                        Decimal::ZERO
                    };

                    // Only buy if it doesn't exceed the category ceiling
                    if new_category_percent <= category_target_percent {
                        // Score by distance from ceiling (prefer furthest below)
                        let distance = category_target_percent - new_category_percent;
                        if distance > best_distance_from_ceiling {
                            best_distance_from_ceiling = distance;
                            best_asset = Some(shortfall.asset_id.clone());
                        }
                    }
                }

                // If we found a purchase that respects the ceiling, make it
                if let Some(asset_id) = best_asset {
                    let price = shortfalls
                        .iter()
                        .find(|s| s.asset_id == asset_id)
                        .map(|s| s.price_per_share)
                        .unwrap();
                    let current = shares_to_buy
                        .get(&asset_id)
                        .copied()
                        .unwrap_or(Decimal::ZERO);
                    shares_to_buy.insert(asset_id.clone(), current + Decimal::ONE);
                    remaining_budget -= price;
                } else {
                    // Phase 2 complete: All purchases would exceed category ceiling
                    break;
                }

                if remaining_budget <= Decimal::ZERO {
                    break;
                }
            }
        }

        // Build recommendations from final share counts
        // Include ALL holdings (even with 0 shares) so frontend can show/hide them
        for shortfall in &shortfalls {
            let shares = shares_to_buy
                .get(&shortfall.asset_id)
                .copied()
                .unwrap_or(Decimal::ZERO);

            let holding = holdings.iter().find(|h| h.id == shortfall.asset_id);

            if let Some(holding) = holding {
                let total_amount = shares * shortfall.price_per_share;

                // Note: residual_amount is set to 0 here.
                // Frontend will calculate per-category residual (budget - actual spent)
                // This matches phase-4 behavior where residual is per-category, not per-holding
                let residual_amount = Decimal::ZERO;

                // Calculate impact (deviation reduction in percentage points)
                let current_pct = (holding.market_value / new_total_value) * dec!(100);
                let new_value = holding.market_value + total_amount;
                let new_pct = (new_value / new_total_value) * dec!(100);

                let target_portfolio_pct =
                    (category_target_percent * shortfall.target_percent_of_class) / dec!(100);

                let deviation_before = (current_pct - target_portfolio_pct).abs();
                let deviation_after = (new_pct - target_portfolio_pct).abs();
                let impact_percent = deviation_before - deviation_after;

                recommendations.push(TradeRecommendation {
                    asset_id: shortfall.asset_id.clone(),
                    symbol: holding.symbol.clone(),
                    name: holding.name.clone(),
                    category_id: category_id.to_string(),
                    category_name: category_name.to_string(),
                    action: "BUY".to_string(),
                    shares,
                    price_per_share: shortfall.price_per_share,
                    total_amount,
                    impact_percent,
                    current_percent_of_class: shortfall.current_percent_of_class,
                    target_percent_of_class: shortfall.target_percent_of_class,
                    residual_amount,
                });
            }
        }

        recommendations
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::portfolio::allocation::{AllocationHoldings, PortfolioAllocations};
    use crate::portfolio::holdings::{HoldingSummary, HoldingType};
    use crate::portfolio::targets::{
        AllocationDeviation, DeviationReport, HoldingTarget, NewHoldingTarget, NewPortfolioTarget,
        NewTargetAllocation, PortfolioTarget, PortfolioTargetServiceTrait, TargetAllocation,
    };
    use chrono::NaiveDateTime;
    use rust_decimal_macros::dec;

    // ---------------------------------------------------------------
    // Mock helpers
    // ---------------------------------------------------------------

    fn naive_now() -> NaiveDateTime {
        chrono::Utc::now().naive_utc()
    }

    fn make_target(id: &str, account_id: &str) -> PortfolioTarget {
        PortfolioTarget {
            id: id.to_string(),
            name: "Test Target".to_string(),
            account_id: account_id.to_string(),
            taxonomy_id: "asset_classes".to_string(),
            is_active: true,
            rebalance_mode: "buy_only".to_string(),
            created_at: naive_now(),
            updated_at: naive_now(),
        }
    }

    fn make_allocation(
        id: &str,
        target_id: &str,
        category_id: &str,
        target_percent: i32,
    ) -> TargetAllocation {
        TargetAllocation {
            id: id.to_string(),
            target_id: target_id.to_string(),
            category_id: category_id.to_string(),
            target_percent,
            is_locked: false,
            created_at: naive_now(),
            updated_at: naive_now(),
        }
    }

    fn make_holding_target(
        allocation_id: &str,
        asset_id: &str,
        target_percent: i32,
    ) -> HoldingTarget {
        HoldingTarget {
            id: format!("ht-{}", asset_id),
            allocation_id: allocation_id.to_string(),
            asset_id: asset_id.to_string(),
            target_percent,
            is_locked: false,
            created_at: naive_now(),
            updated_at: naive_now(),
        }
    }

    fn make_holding_summary(
        id: &str,
        symbol: &str,
        quantity: Decimal,
        market_value: Decimal,
    ) -> HoldingSummary {
        HoldingSummary {
            id: id.to_string(),
            symbol: symbol.to_string(),
            name: Some(symbol.to_string()),
            holding_type: HoldingType::Security,
            quantity,
            market_value,
            currency: "USD".to_string(),
            weight_in_category: Decimal::ZERO,
            instrument_type_category: None,
        }
    }

    fn make_deviation(
        category_id: &str,
        target_percent: Decimal,
        current_percent: Decimal,
        current_value: Decimal,
        total_value: Decimal,
    ) -> AllocationDeviation {
        let target_value = (target_percent / dec!(100)) * total_value;
        AllocationDeviation {
            category_id: category_id.to_string(),
            category_name: category_id.to_string(),
            color: "#000".to_string(),
            target_percent,
            current_percent,
            deviation_percent: current_percent - target_percent,
            current_value,
            target_value,
            value_delta: current_value - target_value,
            is_locked: false,
        }
    }

    // ---------------------------------------------------------------
    // Mock PortfolioTargetService
    // ---------------------------------------------------------------

    struct MockTargetService {
        target: PortfolioTarget,
        allocations: Vec<TargetAllocation>,
        deviation_report: DeviationReport,
        holding_targets: Vec<HoldingTarget>,
    }

    #[async_trait]
    impl PortfolioTargetServiceTrait for MockTargetService {
        fn get_targets_by_account(&self, _: &str) -> Result<Vec<PortfolioTarget>> {
            Ok(vec![self.target.clone()])
        }
        fn get_target(&self, _: &str) -> Result<Option<PortfolioTarget>> {
            Ok(Some(self.target.clone()))
        }
        async fn create_target(&self, _: NewPortfolioTarget) -> Result<PortfolioTarget> {
            unimplemented!()
        }
        async fn update_target(&self, _: PortfolioTarget) -> Result<PortfolioTarget> {
            unimplemented!()
        }
        async fn delete_target(&self, _: &str) -> Result<usize> {
            unimplemented!()
        }
        fn get_allocations_by_target(&self, _: &str) -> Result<Vec<TargetAllocation>> {
            Ok(self.allocations.clone())
        }
        async fn upsert_allocation(&self, _: NewTargetAllocation) -> Result<TargetAllocation> {
            unimplemented!()
        }
        async fn batch_save_target_allocations(
            &self,
            _: Vec<NewTargetAllocation>,
        ) -> Result<Vec<TargetAllocation>> {
            unimplemented!()
        }
        async fn delete_allocation(&self, _: &str) -> Result<usize> {
            unimplemented!()
        }
        async fn get_deviation_report(&self, _: &str, _: &str) -> Result<DeviationReport> {
            Ok(self.deviation_report.clone())
        }
        fn get_holding_targets_by_allocation(&self, _: &str) -> Result<Vec<HoldingTarget>> {
            Ok(self.holding_targets.clone())
        }
        async fn upsert_holding_target(&self, _: NewHoldingTarget) -> Result<HoldingTarget> {
            unimplemented!()
        }
        async fn batch_save_holding_targets(
            &self,
            _: Vec<NewHoldingTarget>,
        ) -> Result<Vec<HoldingTarget>> {
            unimplemented!()
        }
        async fn delete_holding_target(&self, _: &str) -> Result<usize> {
            unimplemented!()
        }
    }

    // ---------------------------------------------------------------
    // Mock AllocationService
    // ---------------------------------------------------------------

    struct MockAllocationService {
        holdings: Vec<HoldingSummary>,
        category_name: String,
    }

    #[async_trait]
    impl AllocationServiceTrait for MockAllocationService {
        async fn get_portfolio_allocations(
            &self,
            _: &str,
            _: &str,
        ) -> Result<PortfolioAllocations> {
            unimplemented!()
        }
        async fn get_holdings_by_allocation(
            &self,
            _: &str,
            _: &str,
            taxonomy_id: &str,
            category_id: &str,
        ) -> Result<AllocationHoldings> {
            Ok(AllocationHoldings {
                taxonomy_id: taxonomy_id.to_string(),
                taxonomy_name: taxonomy_id.to_string(),
                category_id: category_id.to_string(),
                category_name: self.category_name.clone(),
                color: "#000".to_string(),
                holdings: self.holdings.clone(),
                total_value: self.holdings.iter().map(|h| h.market_value).sum(),
                currency: "USD".to_string(),
            })
        }
    }

    fn make_service(
        target: PortfolioTarget,
        allocations: Vec<TargetAllocation>,
        deviation_report: DeviationReport,
        holding_targets: Vec<HoldingTarget>,
        holdings: Vec<HoldingSummary>,
    ) -> RebalancingServiceImpl {
        RebalancingServiceImpl::new(
            Arc::new(MockTargetService {
                target,
                allocations,
                deviation_report,
                holding_targets,
            }),
            Arc::new(MockAllocationService {
                holdings,
                category_name: "Equity".to_string(),
            }),
        )
    }

    // ---------------------------------------------------------------
    // Tests
    // ---------------------------------------------------------------

    /// Basic case: 1 category (EQUITY 70% target, currently 45%),
    /// 2 holdings, enough cash. Expect shares are bought and cash is deployed.
    #[tokio::test]
    async fn test_basic_buy_recommendations() {
        let total_value = dec!(10000);
        // VTI: 200 shares × $22.50 = $4500 (45% of portfolio)
        // Equity target: 70% → target value = $7000 (with $1000 cash: new total = $11000, target = $7700)
        let holdings = vec![make_holding_summary("vti", "VTI", dec!(200), dec!(4500))];
        let target = make_target("t1", "acc1");
        let alloc = make_allocation("alloc1", "t1", "EQUITY", 7000); // 70.00%
        let deviation = make_deviation("EQUITY", dec!(70), dec!(45), dec!(4500), total_value);
        let deviation_report = DeviationReport {
            target_id: "t1".to_string(),
            target_name: "Test".to_string(),
            account_id: "acc1".to_string(),
            taxonomy_id: "asset_classes".to_string(),
            total_value,
            deviations: vec![deviation],
        };
        // VTI is 100% of EQUITY category (10000 bps = 100.00%)
        let holding_targets = vec![make_holding_target("alloc1", "vti", 10000)];

        let svc = make_service(
            target,
            vec![alloc],
            deviation_report,
            holding_targets,
            holdings,
        );

        let input = RebalancingInput {
            target_id: "t1".to_string(),
            available_cash: dec!(1000),
            base_currency: "USD".to_string(),
        };
        let plan = svc.calculate_rebalancing_plan(input).await.unwrap();

        // Should have bought some VTI shares
        let vti_rec = plan
            .recommendations
            .iter()
            .find(|r| r.asset_id == "vti")
            .unwrap();
        assert!(
            vti_rec.shares > Decimal::ZERO,
            "Expected shares to be bought for VTI"
        );
        assert_eq!(vti_rec.action, "BUY");
        // Total allocated must not exceed available cash
        assert!(plan.total_allocated <= dec!(1000));
        assert!(plan.remaining_cash >= Decimal::ZERO);
    }

    /// When total shortfall exceeds available cash, budgets must be scaled proportionally.
    #[tokio::test]
    async fn test_budget_scaling_when_cash_insufficient() {
        let total_value = dec!(10000);
        // Two categories both underweight, combined shortfall > available cash
        // EQUITY: target 60%, current 40% → shortfall = (60% of 11000) - 4000 = $2600
        // BONDS:  target 40%, current 20% → shortfall = (40% of 11000) - 2000 = $2400
        // Total shortfall = $5000, available = $1000 → scale factor = 0.2
        let target = make_target("t1", "acc1");
        let alloc_eq = make_allocation("alloc-eq", "t1", "EQUITY", 6000);
        let alloc_bd = make_allocation("alloc-bd", "t1", "BONDS", 4000);
        let deviations = vec![
            make_deviation("EQUITY", dec!(60), dec!(40), dec!(4000), total_value),
            make_deviation("BONDS", dec!(40), dec!(20), dec!(2000), total_value),
        ];
        let deviation_report = DeviationReport {
            target_id: "t1".to_string(),
            target_name: "Test".to_string(),
            account_id: "acc1".to_string(),
            taxonomy_id: "asset_classes".to_string(),
            total_value,
            deviations,
        };
        let holding_targets_eq = vec![make_holding_target("alloc-eq", "vti", 10000)];
        let holding_targets_bd = vec![make_holding_target("alloc-bd", "bnd", 10000)];
        // MockAllocationService returns same holdings for all calls — use EQUITY holdings
        // For simplicity use a single holding per category; we combine them in the mock
        let holdings_eq = vec![make_holding_summary("vti", "VTI", dec!(178), dec!(4000))];
        let holdings_bd = vec![make_holding_summary("bnd", "BND", dec!(28), dec!(2000))];

        // Build a custom service that serves different holdings per category
        struct MultiCategoryAllocationService {
            equity_holdings: Vec<HoldingSummary>,
            bond_holdings: Vec<HoldingSummary>,
        }
        #[async_trait]
        impl AllocationServiceTrait for MultiCategoryAllocationService {
            async fn get_portfolio_allocations(
                &self,
                _: &str,
                _: &str,
            ) -> Result<PortfolioAllocations> {
                unimplemented!()
            }
            async fn get_holdings_by_allocation(
                &self,
                _: &str,
                _: &str,
                _: &str,
                category_id: &str,
            ) -> Result<AllocationHoldings> {
                let holdings = if category_id == "EQUITY" {
                    self.equity_holdings.clone()
                } else {
                    self.bond_holdings.clone()
                };
                Ok(AllocationHoldings {
                    taxonomy_id: "asset_classes".to_string(),
                    taxonomy_name: "Asset Classes".to_string(),
                    category_id: category_id.to_string(),
                    category_name: category_id.to_string(),
                    color: "#000".to_string(),
                    total_value: holdings.iter().map(|h| h.market_value).sum(),
                    holdings,
                    currency: "USD".to_string(),
                })
            }
        }

        struct MultiCategoryTargetService {
            target: PortfolioTarget,
            allocations: Vec<TargetAllocation>,
            deviation_report: DeviationReport,
            holding_targets_eq: Vec<HoldingTarget>,
            holding_targets_bd: Vec<HoldingTarget>,
        }
        #[async_trait]
        impl PortfolioTargetServiceTrait for MultiCategoryTargetService {
            fn get_targets_by_account(&self, _: &str) -> Result<Vec<PortfolioTarget>> {
                Ok(vec![self.target.clone()])
            }
            fn get_target(&self, _: &str) -> Result<Option<PortfolioTarget>> {
                Ok(Some(self.target.clone()))
            }
            async fn create_target(&self, _: NewPortfolioTarget) -> Result<PortfolioTarget> {
                unimplemented!()
            }
            async fn update_target(&self, _: PortfolioTarget) -> Result<PortfolioTarget> {
                unimplemented!()
            }
            async fn delete_target(&self, _: &str) -> Result<usize> {
                unimplemented!()
            }
            fn get_allocations_by_target(&self, _: &str) -> Result<Vec<TargetAllocation>> {
                Ok(self.allocations.clone())
            }
            async fn upsert_allocation(&self, _: NewTargetAllocation) -> Result<TargetAllocation> {
                unimplemented!()
            }
            async fn batch_save_target_allocations(
                &self,
                _: Vec<NewTargetAllocation>,
            ) -> Result<Vec<TargetAllocation>> {
                unimplemented!()
            }
            async fn delete_allocation(&self, _: &str) -> Result<usize> {
                unimplemented!()
            }
            async fn get_deviation_report(&self, _: &str, _: &str) -> Result<DeviationReport> {
                Ok(self.deviation_report.clone())
            }
            fn get_holding_targets_by_allocation(
                &self,
                allocation_id: &str,
            ) -> Result<Vec<HoldingTarget>> {
                if allocation_id == "alloc-eq" {
                    Ok(self.holding_targets_eq.clone())
                } else {
                    Ok(self.holding_targets_bd.clone())
                }
            }
            async fn upsert_holding_target(&self, _: NewHoldingTarget) -> Result<HoldingTarget> {
                unimplemented!()
            }
            async fn batch_save_holding_targets(
                &self,
                _: Vec<NewHoldingTarget>,
            ) -> Result<Vec<HoldingTarget>> {
                unimplemented!()
            }
            async fn delete_holding_target(&self, _: &str) -> Result<usize> {
                unimplemented!()
            }
        }

        let svc = RebalancingServiceImpl::new(
            Arc::new(MultiCategoryTargetService {
                target,
                allocations: vec![alloc_eq, alloc_bd],
                deviation_report,
                holding_targets_eq,
                holding_targets_bd,
            }),
            Arc::new(MultiCategoryAllocationService {
                equity_holdings: holdings_eq,
                bond_holdings: holdings_bd,
            }),
        );

        let input = RebalancingInput {
            target_id: "t1".to_string(),
            available_cash: dec!(1000),
            base_currency: "USD".to_string(),
        };
        let plan = svc.calculate_rebalancing_plan(input).await.unwrap();

        // Total allocated must not exceed available cash
        assert!(
            plan.total_allocated <= dec!(1000),
            "Over-allocated: {}",
            plan.total_allocated
        );
        // Both categories should get some budget (plan has recs for both)
        let cats: Vec<&str> = plan
            .recommendations
            .iter()
            .map(|r| r.category_id.as_str())
            .collect();
        assert!(cats.contains(&"EQUITY"), "Expected EQUITY recommendations");
        assert!(cats.contains(&"BONDS"), "Expected BONDS recommendations");
        // additional_cash_needed should reflect the unmet shortfall
        assert!(
            plan.additional_cash_needed > Decimal::ZERO,
            "Expected additional cash needed"
        );
    }

    /// Category with no holding targets gets a category-level recommendation (shares=0).
    #[tokio::test]
    async fn test_category_without_holding_targets_gets_budget_recommendation() {
        let total_value = dec!(10000);
        let target = make_target("t1", "acc1");
        let alloc = make_allocation("alloc1", "t1", "CASH", 500); // 5% target
        let deviation = make_deviation("CASH", dec!(5), dec!(2), dec!(200), total_value);
        let deviation_report = DeviationReport {
            target_id: "t1".to_string(),
            target_name: "Test".to_string(),
            account_id: "acc1".to_string(),
            taxonomy_id: "asset_classes".to_string(),
            total_value,
            deviations: vec![deviation],
        };
        // No holding targets for CASH
        let holding_targets = vec![];
        let holdings = vec![];

        let svc = make_service(
            target,
            vec![alloc],
            deviation_report,
            holding_targets,
            holdings,
        );

        let input = RebalancingInput {
            target_id: "t1".to_string(),
            available_cash: dec!(1000),
            base_currency: "USD".to_string(),
        };
        let plan = svc.calculate_rebalancing_plan(input).await.unwrap();

        let cash_rec = plan
            .recommendations
            .iter()
            .find(|r| r.category_id == "CASH")
            .unwrap();
        assert_eq!(
            cash_rec.shares,
            Decimal::ZERO,
            "Cash category should have 0 shares"
        );
        assert!(
            cash_rec.total_amount > Decimal::ZERO,
            "Cash category should have budget allocated"
        );
    }

    /// Zero available cash: plan should have zero recommendations with amounts.
    #[tokio::test]
    async fn test_zero_cash_produces_no_allocations() {
        let total_value = dec!(10000);
        let target = make_target("t1", "acc1");
        let alloc = make_allocation("alloc1", "t1", "EQUITY", 7000);
        let deviation = make_deviation("EQUITY", dec!(70), dec!(45), dec!(4500), total_value);
        let deviation_report = DeviationReport {
            target_id: "t1".to_string(),
            target_name: "Test".to_string(),
            account_id: "acc1".to_string(),
            taxonomy_id: "asset_classes".to_string(),
            total_value,
            deviations: vec![deviation],
        };
        let holding_targets = vec![make_holding_target("alloc1", "vti", 10000)];
        let holdings = vec![make_holding_summary("vti", "VTI", dec!(200), dec!(4500))];

        let svc = make_service(
            target,
            vec![alloc],
            deviation_report,
            holding_targets,
            holdings,
        );

        let input = RebalancingInput {
            target_id: "t1".to_string(),
            available_cash: dec!(0),
            base_currency: "USD".to_string(),
        };
        let plan = svc.calculate_rebalancing_plan(input).await.unwrap();

        assert_eq!(plan.total_allocated, Decimal::ZERO);
        assert_eq!(plan.remaining_cash, Decimal::ZERO);
        // No shares should be bought
        for rec in &plan.recommendations {
            assert_eq!(
                rec.shares,
                Decimal::ZERO,
                "Expected zero shares with zero cash"
            );
        }
    }

    /// Phase 2 should deploy remaining cash without exceeding category ceiling.
    #[tokio::test]
    async fn test_phase2_deploys_remaining_cash_without_overshoot() {
        // EQUITY target 70%, currently 45% ($4500), price $22.50/share
        // $1000 cash → new total = $11000, target = $7700
        // Shortfall = $3200 (only $1000 available) → scale = 1.0
        // Phase 1 buys floor($1000/$22.50) = 44 shares = $990 → $10 remaining
        // Phase 2 should not buy another share ($22.50 > $10)
        let total_value = dec!(10000);
        let holdings = vec![make_holding_summary("vti", "VTI", dec!(200), dec!(4500))];
        let target = make_target("t1", "acc1");
        let alloc = make_allocation("alloc1", "t1", "EQUITY", 7000);
        let deviation = make_deviation("EQUITY", dec!(70), dec!(45), dec!(4500), total_value);
        let deviation_report = DeviationReport {
            target_id: "t1".to_string(),
            target_name: "Test".to_string(),
            account_id: "acc1".to_string(),
            taxonomy_id: "asset_classes".to_string(),
            total_value,
            deviations: vec![deviation],
        };
        let holding_targets = vec![make_holding_target("alloc1", "vti", 10000)];

        let svc = make_service(
            target,
            vec![alloc],
            deviation_report,
            holding_targets,
            holdings,
        );

        let input = RebalancingInput {
            target_id: "t1".to_string(),
            available_cash: dec!(1000),
            base_currency: "USD".to_string(),
        };
        let plan = svc.calculate_rebalancing_plan(input).await.unwrap();

        let vti_rec = plan
            .recommendations
            .iter()
            .find(|r| r.asset_id == "vti")
            .unwrap();
        // Category ceiling: 70% of $11000 = $7700. Current after buys: $4500 + shares*$22.50
        // Must not exceed ceiling
        let shares_bought = vti_rec.shares;
        let new_value = dec!(4500) + shares_bought * dec!(22.5);
        let new_pct = (new_value / dec!(11000)) * dec!(100);
        assert!(
            new_pct <= dec!(70),
            "Category ceiling exceeded: {}%",
            new_pct
        );
        // Must not overspend
        assert!(plan.total_allocated <= dec!(1000));
    }
}

#[async_trait]
impl RebalancingService for RebalancingServiceImpl {
    async fn calculate_rebalancing_plan(&self, input: RebalancingInput) -> Result<RebalancingPlan> {
        debug!(
            "Calculating rebalancing plan for target {} with {} available cash",
            input.target_id, input.available_cash
        );

        // Step 1: Load target and get deviation report
        let target = self
            .target_service
            .get_target(&input.target_id)?
            .ok_or_else(|| {
                Error::Database(crate::errors::DatabaseError::NotFound(format!(
                    "Target {} not found",
                    input.target_id
                )))
            })?;

        let deviation_report = self
            .target_service
            .get_deviation_report(&input.target_id, &input.base_currency)
            .await?;

        let allocations = self
            .target_service
            .get_allocations_by_target(&input.target_id)?;

        // Calculate new total portfolio value (current + cash)
        let new_total_value = deviation_report.total_value + input.available_cash;

        // Step 2: Calculate category-level shortfalls
        let category_shortfalls = self.calculate_category_shortfalls(
            &deviation_report,
            new_total_value,
            &target.rebalance_mode,
        );

        let total_shortfall: Decimal = category_shortfalls.values().sum();

        // Step 3: Scale shortfalls if cash is insufficient
        let scale_factor = if total_shortfall > input.available_cash {
            input.available_cash / total_shortfall
        } else {
            Decimal::ONE
        };

        let category_budgets: HashMap<String, Decimal> = category_shortfalls
            .iter()
            .map(|(cat_id, shortfall)| (cat_id.clone(), shortfall * scale_factor))
            .collect();

        // Initialize plan
        let mut plan = RebalancingPlan::new(
            target.id.clone(),
            target.name.clone(),
            target.account_id.clone(),
            target.taxonomy_id.clone(),
            input.available_cash,
        );

        // Add category budgets to plan
        for (category_id, budget) in &category_budgets {
            plan.add_category_budget(category_id.clone(), *budget);
        }

        // Step 4: For each category with budget, calculate holding-level recommendations
        for (category_id, budget) in category_budgets {
            if budget <= Decimal::ZERO {
                continue;
            }

            // Get holdings in this category
            let holdings_data = self
                .allocation_service
                .get_holdings_by_allocation(
                    &target.account_id,
                    &input.base_currency,
                    &target.taxonomy_id,
                    &category_id,
                )
                .await?;

            let holdings = &holdings_data.holdings;

            // Get category target allocation
            let allocation = allocations.iter().find(|a| a.category_id == category_id);

            if allocation.is_none() {
                continue;
            }

            let allocation = allocation.unwrap();

            // Get holding targets for this category
            let holding_targets = self
                .target_service
                .get_holding_targets_by_allocation(&allocation.id)?;

            // Find the deviation for this category to get target percent
            let deviation = deviation_report
                .deviations
                .iter()
                .find(|d| d.category_id == category_id);

            let category_target_percent =
                deviation.map(|d| d.target_percent).unwrap_or(Decimal::ZERO);

            if holding_targets.is_empty() {
                // No holding-level targets - create a category-level recommendation
                // This allows categories like Cash to still get budget allocated
                let recommendation = TradeRecommendation {
                    asset_id: category_id.clone(),
                    symbol: category_id.clone(),
                    name: Some(holdings_data.category_name.clone()),
                    category_id: category_id.clone(),
                    category_name: holdings_data.category_name.clone(),
                    action: "BUY".to_string(),
                    shares: Decimal::ZERO,
                    price_per_share: Decimal::ZERO,
                    total_amount: budget,
                    impact_percent: Decimal::ZERO,
                    current_percent_of_class: Decimal::ZERO,
                    target_percent_of_class: Decimal::ZERO,
                    residual_amount: Decimal::ZERO,
                };
                plan.add_recommendation(recommendation);
                continue;
            }

            // Calculate holding-level shortfalls
            let holding_shortfalls = self.calculate_holding_shortfalls(
                holdings,
                &holding_targets,
                category_target_percent,
                new_total_value,
            );

            // Optimize whole-share purchases
            let recommendations = self.optimize_whole_shares(
                holdings,
                &holding_targets,
                holding_shortfalls,
                budget,
                &category_id,
                &holdings_data.category_name,
                category_target_percent,
                new_total_value,
            );

            // Add recommendations to plan
            for rec in recommendations {
                plan.add_recommendation(rec);
            }
        }

        // Calculate additional cash needed
        let additional_needed = if total_shortfall > input.available_cash {
            total_shortfall - input.available_cash
        } else {
            Decimal::ZERO
        };
        plan.set_additional_cash_needed(additional_needed);

        debug!(
            "Rebalancing plan calculated: {} recommendations, {} allocated, {} remaining",
            plan.recommendations.len(),
            plan.total_allocated,
            plan.remaining_cash
        );

        Ok(plan)
    }
}
