//! Rebalancing domain models.
//!
//! Data structures for the cash-first rebalancing advisor (buy-only or buy & sell).

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Input for rebalancing calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebalancingInput {
    /// Which PortfolioTarget to rebalance toward
    pub target_id: String,
    /// Cash user wants to deploy
    pub available_cash: Decimal,
    /// Base currency for calculations
    pub base_currency: String,
}

/// A single trade recommendation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeRecommendation {
    /// Asset ID (from assets table)
    pub asset_id: String,
    /// Ticker symbol
    pub symbol: String,
    /// Asset name
    pub name: Option<String>,
    /// ISIN identifier (if available)
    pub isin: Option<String>,
    /// Category this holding belongs to
    pub category_id: String,
    /// Category display name
    pub category_name: String,
    /// Action type: "BUY" or "SELL"
    pub action: String,
    /// Whole shares to buy or sell
    pub shares: Decimal,
    /// Current market price per share
    pub price_per_share: Decimal,
    /// Total amount = shares * price_per_share
    pub total_amount: Decimal,
    /// How much this reduces deviation (percentage points)
    pub impact_percent: Decimal,
    /// Current percentage of this holding within its category (e.g., "9.3% of Equity")
    pub current_percent_of_class: Decimal,
    /// Target percentage of this holding within its category (e.g., "15.0% of Equity")
    pub target_percent_of_class: Decimal,
    /// Cash that couldn't be used to buy whole shares for this holding
    pub residual_amount: Decimal,
}

/// Budget allocated to a category
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryBudget {
    /// Category ID
    pub category_id: String,
    /// Budget allocated to this category (shortfall * scale_factor)
    pub budget: Decimal,
    /// True when some portfolio holdings in this category have no holding target configured
    pub has_partial_targets: bool,
}

/// Complete rebalancing plan with recommendations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebalancingPlan {
    /// ID of the target allocation used
    pub target_id: String,
    /// Name of the target allocation
    pub target_name: String,
    /// Account ID (or "PORTFOLIO" for all accounts)
    pub account_id: String,
    /// Taxonomy ID used for categorization
    pub taxonomy_id: String,
    /// Cash available to invest
    pub available_cash: Decimal,
    /// Sum of all recommendation amounts
    pub total_allocated: Decimal,
    /// Unallocated cash = available_cash - total_allocated
    pub remaining_cash: Decimal,
    /// Additional cash needed to fully reach targets (if positive)
    pub additional_cash_needed: Decimal,
    /// Total proceeds raised by sell recommendations (buy_and_sell mode only)
    pub total_sell_amount: Decimal,
    /// Budgets allocated to each category
    pub category_budgets: Vec<CategoryBudget>,
    /// List of trade recommendations (BUY and SELL)
    pub recommendations: Vec<TradeRecommendation>,
}

impl RebalancingPlan {
    /// Creates a new empty rebalancing plan.
    pub fn new(
        target_id: String,
        target_name: String,
        account_id: String,
        taxonomy_id: String,
        available_cash: Decimal,
    ) -> Self {
        Self {
            target_id,
            target_name,
            account_id,
            taxonomy_id,
            available_cash,
            total_allocated: Decimal::ZERO,
            remaining_cash: available_cash,
            additional_cash_needed: Decimal::ZERO,
            total_sell_amount: Decimal::ZERO,
            category_budgets: Vec::new(),
            recommendations: Vec::new(),
        }
    }

    /// Adds a category budget to the plan.
    pub fn add_category_budget(
        &mut self,
        category_id: String,
        budget: Decimal,
        has_partial_targets: bool,
    ) {
        self.category_budgets.push(CategoryBudget {
            category_id,
            budget,
            has_partial_targets,
        });
    }

    /// Adds a BUY recommendation and updates buy totals.
    pub fn add_recommendation(&mut self, recommendation: TradeRecommendation) {
        self.total_allocated += recommendation.total_amount;
        self.recommendations.push(recommendation);
        self.remaining_cash = (self.available_cash + self.total_sell_amount) - self.total_allocated;
    }

    /// Adds a SELL recommendation and tracks proceeds.
    pub fn add_sell_recommendation(&mut self, recommendation: TradeRecommendation) {
        self.total_sell_amount += recommendation.total_amount;
        self.recommendations.push(recommendation);
        self.remaining_cash = (self.available_cash + self.total_sell_amount) - self.total_allocated;
    }

    /// Sets the additional cash needed to reach targets.
    pub fn set_additional_cash_needed(&mut self, amount: Decimal) {
        self.additional_cash_needed = amount;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    #[test]
    fn test_rebalancing_plan_new() {
        let plan = RebalancingPlan::new(
            "target-1".to_string(),
            "My Target".to_string(),
            "account-1".to_string(),
            "asset_classes".to_string(),
            dec!(10000),
        );

        assert_eq!(plan.target_id, "target-1");
        assert_eq!(plan.available_cash, dec!(10000));
        assert_eq!(plan.total_allocated, dec!(0));
        assert_eq!(plan.remaining_cash, dec!(10000));
        assert_eq!(plan.recommendations.len(), 0);
    }

    #[test]
    fn test_add_recommendation() {
        let mut plan = RebalancingPlan::new(
            "target-1".to_string(),
            "My Target".to_string(),
            "account-1".to_string(),
            "asset_classes".to_string(),
            dec!(10000),
        );

        let recommendation = TradeRecommendation {
            asset_id: "AAPL".to_string(),
            symbol: "AAPL".to_string(),
            name: Some("Apple Inc.".to_string()),
            isin: None,
            category_id: "EQUITY".to_string(),
            category_name: "Equity".to_string(),
            action: "BUY".to_string(),
            shares: dec!(10),
            price_per_share: dec!(150),
            total_amount: dec!(1500),
            impact_percent: dec!(2.5),
            current_percent_of_class: dec!(9.3),
            target_percent_of_class: dec!(15.0),
            residual_amount: dec!(0),
        };

        plan.add_recommendation(recommendation);

        assert_eq!(plan.total_allocated, dec!(1500));
        assert_eq!(plan.remaining_cash, dec!(8500));
        assert_eq!(plan.recommendations.len(), 1);
    }

    #[test]
    fn test_multiple_recommendations() {
        let mut plan = RebalancingPlan::new(
            "target-1".to_string(),
            "My Target".to_string(),
            "account-1".to_string(),
            "asset_classes".to_string(),
            dec!(10000),
        );

        plan.add_recommendation(TradeRecommendation {
            asset_id: "AAPL".to_string(),
            symbol: "AAPL".to_string(),
            name: Some("Apple Inc.".to_string()),
            isin: None,
            category_id: "EQUITY".to_string(),
            category_name: "Equity".to_string(),
            action: "BUY".to_string(),
            shares: dec!(10),
            price_per_share: dec!(150),
            total_amount: dec!(1500),
            impact_percent: dec!(2.5),
            current_percent_of_class: dec!(9.3),
            target_percent_of_class: dec!(15.0),
            residual_amount: dec!(0),
        });

        plan.add_recommendation(TradeRecommendation {
            asset_id: "MSFT".to_string(),
            symbol: "MSFT".to_string(),
            name: Some("Microsoft Corp.".to_string()),
            isin: None,
            category_id: "EQUITY".to_string(),
            category_name: "Equity".to_string(),
            action: "BUY".to_string(),
            shares: dec!(5),
            price_per_share: dec!(300),
            total_amount: dec!(1500),
            impact_percent: dec!(2.5),
            current_percent_of_class: dec!(12.0),
            target_percent_of_class: dec!(20.0),
            residual_amount: dec!(0),
        });

        assert_eq!(plan.total_allocated, dec!(3000));
        assert_eq!(plan.remaining_cash, dec!(7000));
        assert_eq!(plan.recommendations.len(), 2);
    }

    #[test]
    fn test_set_additional_cash_needed() {
        let mut plan = RebalancingPlan::new(
            "target-1".to_string(),
            "My Target".to_string(),
            "account-1".to_string(),
            "asset_classes".to_string(),
            dec!(10000),
        );

        plan.set_additional_cash_needed(dec!(5000));
        assert_eq!(plan.additional_cash_needed, dec!(5000));
    }
}
