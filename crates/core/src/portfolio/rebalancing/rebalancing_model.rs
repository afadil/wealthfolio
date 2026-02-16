//! Rebalancing domain models.
//!
//! Data structures for the cash-first, buy-only rebalancing advisor.

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
    /// Category this holding belongs to
    pub category_id: String,
    /// Category display name
    pub category_name: String,
    /// Action type - always "BUY" (sell not supported)
    pub action: String,
    /// Whole shares to buy
    pub shares: Decimal,
    /// Current market price per share
    pub price_per_share: Decimal,
    /// Total amount = shares * price_per_share
    pub total_amount: Decimal,
    /// How much this reduces deviation (percentage points)
    pub impact_percent: Decimal,
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
    /// List of trade recommendations
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
            recommendations: Vec::new(),
        }
    }

    /// Adds a recommendation and updates totals.
    pub fn add_recommendation(&mut self, recommendation: TradeRecommendation) {
        self.total_allocated += recommendation.total_amount;
        self.recommendations.push(recommendation);
        self.remaining_cash = self.available_cash - self.total_allocated;
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
            category_id: "EQUITY".to_string(),
            category_name: "Equity".to_string(),
            action: "BUY".to_string(),
            shares: dec!(10),
            price_per_share: dec!(150),
            total_amount: dec!(1500),
            impact_percent: dec!(2.5),
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
            category_id: "EQUITY".to_string(),
            category_name: "Equity".to_string(),
            action: "BUY".to_string(),
            shares: dec!(10),
            price_per_share: dec!(150),
            total_amount: dec!(1500),
            impact_percent: dec!(2.5),
        });

        plan.add_recommendation(TradeRecommendation {
            asset_id: "MSFT".to_string(),
            symbol: "MSFT".to_string(),
            name: Some("Microsoft Corp.".to_string()),
            category_id: "EQUITY".to_string(),
            category_name: "Equity".to_string(),
            action: "BUY".to_string(),
            shares: dec!(5),
            price_per_share: dec!(300),
            total_amount: dec!(1500),
            impact_percent: dec!(2.5),
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
