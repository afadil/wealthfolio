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
    /// Returns map of category_id -> shortfall amount (always >= 0).
    fn calculate_category_shortfalls(
        &self,
        deviation_report: &crate::portfolio::targets::DeviationReport,
        new_total_value: Decimal,
    ) -> HashMap<String, Decimal> {
        let mut shortfalls = HashMap::new();

        for deviation in &deviation_report.deviations {
            // Calculate target value based on new total (current + cash)
            let target_value = (deviation.target_percent / dec!(100)) * new_total_value;

            // Current value stays the same (we're not selling)
            let current_value = deviation.current_value;

            // Shortfall is how much we need to buy (clamped to >= 0, buy-only)
            let shortfall = (target_value - current_value).max(Decimal::ZERO);

            if shortfall > Decimal::ZERO {
                shortfalls.insert(deviation.category_id.clone(), shortfall);
            }
        }

        shortfalls
    }

    /// Calculate per-holding shortfalls within a category (Step 3).
    /// Returns vec of (asset_id, shortfall_amount, current_price).
    fn calculate_holding_shortfalls(
        &self,
        holdings: &[HoldingSummary],
        holding_targets: &[HoldingTarget],
        category_target_percent: Decimal,
        new_total_value: Decimal,
    ) -> Vec<(String, Decimal, Decimal)> {
        let mut shortfalls = Vec::new();

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

            // Cascading calculation: target portfolio % = (category% * holding%) / 100
            let target_portfolio_percent =
                (category_target_percent * Decimal::from(target.target_percent)) / dec!(10000);

            // Target value = (target_portfolio% / 100) * new_total_value
            let target_value = (target_portfolio_percent / dec!(100)) * new_total_value;

            // Current value
            let current_value = holding.market_value;

            // Shortfall (buy-only)
            let shortfall = (target_value - current_value).max(Decimal::ZERO);

            if shortfall > Decimal::ZERO {
                shortfalls.push((target.asset_id.clone(), shortfall, current_price));
            }
        }

        shortfalls
    }

    /// Optimize whole-share purchases within a category budget (Step 4).
    /// Uses greedy algorithm to maximize improvement per dollar spent.
    fn optimize_whole_shares(
        &self,
        holdings: &[HoldingSummary],
        holding_targets: &[HoldingTarget],
        shortfalls: Vec<(String, Decimal, Decimal)>, // (asset_id, shortfall, price)
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
        let total_shortfall: Decimal = shortfalls.iter().map(|(_, s, _)| s).sum();

        // Initialize: calculate fractional shares and floor to whole shares
        let mut shares_to_buy: HashMap<String, Decimal> = HashMap::new();
        let mut remaining_budget = category_budget;

        for (asset_id, shortfall, price) in &shortfalls {
            // Scale shortfall to fit category budget
            let scaled_shortfall = if total_shortfall > Decimal::ZERO {
                shortfall * (category_budget / total_shortfall)
            } else {
                *shortfall
            };

            // Calculate fractional shares
            let fractional_shares = scaled_shortfall / price;

            // Floor to whole shares
            let whole_shares = fractional_shares.floor();

            if whole_shares > Decimal::ZERO {
                shares_to_buy.insert(asset_id.clone(), whole_shares);
                remaining_budget -= whole_shares * price;
            }
        }

        // Greedy optimization: iteratively buy 1 more share where it helps most
        loop {
            let mut best_asset: Option<String> = None;
            let mut best_improvement_per_dollar = Decimal::ZERO;

            for (asset_id, _shortfall, price) in &shortfalls {
                if *price > remaining_budget {
                    continue; // Can't afford this one
                }

                // Calculate improvement if we buy 1 more share
                let current_shares = shares_to_buy
                    .get(asset_id)
                    .copied()
                    .unwrap_or(Decimal::ZERO);
                let new_shares = current_shares + Decimal::ONE;

                // Find holding and target
                let holding = holdings.iter().find(|h| h.id == *asset_id);
                let target = holding_targets.iter().find(|t| t.asset_id == *asset_id);

                if let (Some(holding), Some(target)) = (holding, target) {
                    // Calculate current % and target %
                    let current_value_after_buy = holding.market_value + (new_shares * price);
                    let current_pct_after = (current_value_after_buy / new_total_value) * dec!(100);

                    let target_portfolio_pct = (category_target_percent
                        * Decimal::from(target.target_percent))
                        / dec!(10000);

                    let current_pct_before = (holding.market_value / new_total_value) * dec!(100);

                    // Improvement = reduction in deviation
                    let deviation_before = (current_pct_before - target_portfolio_pct).abs();
                    let deviation_after = (current_pct_after - target_portfolio_pct).abs();
                    let improvement = deviation_before - deviation_after;

                    let improvement_per_dollar = if *price > Decimal::ZERO {
                        improvement / price
                    } else {
                        Decimal::ZERO
                    };

                    if improvement_per_dollar > best_improvement_per_dollar {
                        best_improvement_per_dollar = improvement_per_dollar;
                        best_asset = Some(asset_id.clone());
                    }
                }
            }

            // If we found a beneficial purchase, make it
            if let Some(asset_id) = best_asset {
                let price = shortfalls
                    .iter()
                    .find(|(id, _, _)| id == &asset_id)
                    .map(|(_, _, p)| *p)
                    .unwrap();
                let current = shares_to_buy
                    .get(&asset_id)
                    .copied()
                    .unwrap_or(Decimal::ZERO);
                shares_to_buy.insert(asset_id.clone(), current + Decimal::ONE);
                remaining_budget -= price;
            } else {
                // No more beneficial purchases possible
                break;
            }

            if remaining_budget <= Decimal::ZERO {
                break;
            }
        }

        // Build recommendations from final share counts
        for (asset_id, shares) in shares_to_buy {
            if shares <= Decimal::ZERO {
                continue;
            }

            let holding = holdings.iter().find(|h| h.id == asset_id);
            let (_shortfall, price) = shortfalls
                .iter()
                .find(|(id, _, _)| id == &asset_id)
                .map(|(_, s, p)| (*s, *p))
                .unwrap_or_default();

            if let Some(holding) = holding {
                let total_amount = shares * price;

                recommendations.push(TradeRecommendation {
                    asset_id: asset_id.clone(),
                    symbol: holding.symbol.clone(),
                    name: holding.name.clone(),
                    category_id: category_id.to_string(),
                    category_name: category_name.to_string(),
                    action: "BUY".to_string(),
                    shares,
                    price_per_share: price,
                    total_amount,
                    impact_percent: Decimal::ZERO, // TODO: Calculate actual impact
                });
            }
        }

        recommendations
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
        let category_shortfalls =
            self.calculate_category_shortfalls(&deviation_report, new_total_value);

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

            if holding_targets.is_empty() {
                // No holding-level targets, skip this category
                continue;
            }

            // Find the deviation for this category to get target percent
            let deviation = deviation_report
                .deviations
                .iter()
                .find(|d| d.category_id == category_id);

            let category_target_percent =
                deviation.map(|d| d.target_percent).unwrap_or(Decimal::ZERO);

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
