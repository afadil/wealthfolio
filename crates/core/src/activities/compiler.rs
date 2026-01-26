//! Activity Compiler - expands stored events into canonical postings.
//!
//! The compiler takes stored activities (events) and expands them into
//! canonical postings that the calculator understands. This allows:
//! - One stored row per real-world event
//! - Rich semantic variations via subtypes
//! - Stable calculator that only understands primitives

use crate::activities::activities_constants::*;
use crate::activities::Activity;
use crate::Result;
use rust_decimal::Decimal;

/// Compiles a stored activity (event) into canonical postings for the calculator.
///
/// Contract:
/// - Must be deterministic (same input = same output)
/// - Must preserve traceability (synthetic IDs derived from source ID)
/// - Must not require schema changes for new subtypes
pub trait ActivityCompiler {
    /// Compile a single activity into 1..N canonical postings
    fn compile(&self, activity: &Activity) -> Result<Vec<Activity>>;

    /// Compile multiple activities, preserving order
    fn compile_all(&self, activities: &[Activity]) -> Result<Vec<Activity>> {
        let mut result = Vec::new();
        for activity in activities {
            result.extend(self.compile(activity)?);
        }
        Ok(result)
    }
}

/// Default compiler implementation
pub struct DefaultActivityCompiler;

impl ActivityCompiler for DefaultActivityCompiler {
    fn compile(&self, activity: &Activity) -> Result<Vec<Activity>> {
        // Skip non-posted activities
        if !activity.is_posted() {
            return Ok(vec![]);
        }

        // Use effective_type() to respect user overrides
        let activity_type = activity.effective_type();
        let subtype = activity.subtype.as_deref();

        match (activity_type, subtype) {
            // DRIP: Dividend + Buy
            (ACTIVITY_TYPE_DIVIDEND, Some(ACTIVITY_SUBTYPE_DRIP)) => {
                Ok(self.compile_drip(activity))
            }

            // Staking Reward: Interest + Buy
            (ACTIVITY_TYPE_INTEREST, Some(ACTIVITY_SUBTYPE_STAKING_REWARD)) => {
                Ok(self.compile_staking_reward(activity))
            }

            // Dividend in Kind: Dividend + Add Holding (different asset)
            (ACTIVITY_TYPE_DIVIDEND, Some(ACTIVITY_SUBTYPE_DIVIDEND_IN_KIND)) => {
                Ok(self.compile_dividend_in_kind(activity))
            }

            // Default: Pass through unchanged
            _ => Ok(vec![activity.clone()]),
        }
    }
}

impl DefaultActivityCompiler {
    /// Create a new compiler instance
    pub fn new() -> Self {
        Self
    }

    /// DRIP: One stored row → DIVIDEND + BUY
    ///
    /// Stored:
    ///   activity_type = DIVIDEND, subtype = DRIP
    ///   amount = dividend cash amount
    ///   quantity = shares received
    ///   unit_price = reinvestment price
    ///
    /// Compiled:
    ///   1. DIVIDEND: income recognition (amount)
    ///   2. BUY: share acquisition (qty @ unit_price)
    ///
    /// Net cash effect: ~0 (dividend received = purchase cost)
    fn compile_drip(&self, activity: &Activity) -> Vec<Activity> {
        // Leg 1: DIVIDEND (income recognition)
        let mut dividend_leg = activity.clone();
        dividend_leg.id = format!("{}:dividend", activity.id);
        dividend_leg.subtype = None; // Clear subtype for calculator
        dividend_leg.quantity = None;
        dividend_leg.unit_price = None;
        // amount stays as-is for income tracking

        // Leg 2: BUY (share acquisition)
        let mut buy_leg = activity.clone();
        buy_leg.id = format!("{}:buy", activity.id);
        buy_leg.activity_type = ACTIVITY_TYPE_BUY.to_string();
        buy_leg.activity_type_override = None;
        buy_leg.subtype = None;
        // quantity and unit_price stay as-is
        buy_leg.amount = None; // BUY computes from qty * price
        buy_leg.fee = Some(Decimal::ZERO); // Fee already in dividend leg

        vec![dividend_leg, buy_leg]
    }

    /// Staking Reward: One stored row → INTEREST + BUY
    ///
    /// Stored:
    ///   activity_type = INTEREST, subtype = STAKING_REWARD
    ///   asset_id = rewarded token
    ///   quantity = reward quantity
    ///   unit_price = FMV at receipt
    ///   amount = quantity * unit_price
    ///
    /// Compiled:
    ///   1. INTEREST: income recognition
    ///   2. BUY: token acquisition at FMV
    ///
    /// Net cash effect: 0
    fn compile_staking_reward(&self, activity: &Activity) -> Vec<Activity> {
        // Leg 1: INTEREST (income recognition)
        let mut interest_leg = activity.clone();
        interest_leg.id = format!("{}:interest", activity.id);
        interest_leg.subtype = None;
        interest_leg.quantity = None;
        interest_leg.unit_price = None;
        // amount stays for income tracking

        // Leg 2: BUY (token acquisition)
        let mut buy_leg = activity.clone();
        buy_leg.id = format!("{}:buy", activity.id);
        buy_leg.activity_type = ACTIVITY_TYPE_BUY.to_string();
        buy_leg.activity_type_override = None;
        buy_leg.subtype = None;
        buy_leg.amount = None;
        buy_leg.fee = Some(Decimal::ZERO);

        vec![interest_leg, buy_leg]
    }

    /// Dividend in Kind: Stock dividend where you receive a different asset
    ///
    /// Stored:
    ///   activity_type = DIVIDEND, subtype = DIVIDEND_IN_KIND
    ///   asset_id = the asset that pays the dividend
    ///   metadata.received_asset_id = the asset received
    ///   quantity = shares received of the different asset
    ///   unit_price = FMV at receipt
    ///   amount = value of shares received
    ///
    /// Compiled:
    ///   1. DIVIDEND: income recognition
    ///   2. TRANSFER_IN (internal): receive different asset (cost basis from FMV, no portfolio-boundary contribution)
    fn compile_dividend_in_kind(&self, activity: &Activity) -> Vec<Activity> {
        // Get the received asset ID from metadata
        let received_asset_id = activity
            .get_meta::<String>("received_asset_id")
            .or_else(|| activity.asset_id.clone());

        // Leg 1: DIVIDEND (income recognition from the paying asset)
        let mut dividend_leg = activity.clone();
        dividend_leg.id = format!("{}:dividend", activity.id);
        dividend_leg.subtype = None;
        dividend_leg.quantity = None;
        dividend_leg.unit_price = None;

        // Leg 2: TRANSFER_IN (receive the different asset)
        let mut transfer_in_leg = activity.clone();
        transfer_in_leg.id = format!("{}:transfer_in", activity.id);
        transfer_in_leg.activity_type = ACTIVITY_TYPE_TRANSFER_IN.to_string();
        transfer_in_leg.activity_type_override = None;
        transfer_in_leg.subtype = None;
        transfer_in_leg.asset_id = received_asset_id;
        // quantity and unit_price define the cost basis
        transfer_in_leg.amount = None;
        transfer_in_leg.fee = Some(Decimal::ZERO);
        // Strip metadata from the generated leg: dividend-in-kind is income, not a portfolio-boundary contribution.
        transfer_in_leg.metadata = None;

        vec![dividend_leg, transfer_in_leg]
    }
}

impl Default for DefaultActivityCompiler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::activities::ActivityStatus;
    use chrono::Utc;
    use rust_decimal_macros::dec;

    fn create_test_activity() -> Activity {
        Activity {
            id: "test-1".to_string(),
            account_id: "account-1".to_string(),
            asset_id: Some("AAPL".to_string()),
            activity_type: ACTIVITY_TYPE_DIVIDEND.to_string(),
            activity_type_override: None,
            source_type: None,
            subtype: None,
            status: ActivityStatus::Posted,
            activity_date: Utc::now(),
            settlement_date: None,
            quantity: Some(dec!(10)),
            unit_price: Some(dec!(150)),
            amount: Some(dec!(100)),
            fee: Some(dec!(0)),
            currency: "USD".to_string(),
            fx_rate: None,
            notes: None,
            metadata: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
            idempotency_key: None,
            import_run_id: None,
            is_user_modified: false,
            needs_review: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn test_compile_passthrough_for_simple_types() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_BUY.to_string();
        activity.subtype = None;

        let result = compiler.compile(&activity).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, activity.id);
        assert_eq!(result[0].activity_type, ACTIVITY_TYPE_BUY);
    }

    #[test]
    fn test_compile_skips_non_posted() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.status = ActivityStatus::Draft;

        let result = compiler.compile(&activity).unwrap();

        assert!(result.is_empty());
    }

    #[test]
    fn test_compile_skips_pending() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.status = ActivityStatus::Pending;

        let result = compiler.compile(&activity).unwrap();

        assert!(result.is_empty());
    }

    #[test]
    fn test_compile_skips_void() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.status = ActivityStatus::Void;

        let result = compiler.compile(&activity).unwrap();

        assert!(result.is_empty());
    }

    #[test]
    fn test_compile_drip_produces_two_legs() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();
        activity.subtype = Some(ACTIVITY_SUBTYPE_DRIP.to_string());
        activity.quantity = Some(dec!(5)); // shares received
        activity.unit_price = Some(dec!(20)); // reinvestment price
        activity.amount = Some(dec!(100)); // dividend amount

        let result = compiler.compile(&activity).unwrap();

        assert_eq!(result.len(), 2);

        // First leg: DIVIDEND
        assert_eq!(result[0].id, "test-1:dividend");
        assert_eq!(result[0].activity_type, ACTIVITY_TYPE_DIVIDEND);
        assert!(result[0].subtype.is_none());
        assert_eq!(result[0].amount, Some(dec!(100)));
        assert!(result[0].quantity.is_none());
        assert!(result[0].unit_price.is_none());

        // Second leg: BUY
        assert_eq!(result[1].id, "test-1:buy");
        assert_eq!(result[1].activity_type, ACTIVITY_TYPE_BUY);
        assert!(result[1].subtype.is_none());
        assert_eq!(result[1].quantity, Some(dec!(5)));
        assert_eq!(result[1].unit_price, Some(dec!(20)));
        assert!(result[1].amount.is_none());
        assert_eq!(result[1].fee, Some(dec!(0)));
    }

    #[test]
    fn test_compile_drip_preserves_metadata() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();
        activity.subtype = Some(ACTIVITY_SUBTYPE_DRIP.to_string());
        activity.account_id = "my-account".to_string();
        activity.asset_id = Some("MSFT".to_string());
        activity.currency = "EUR".to_string();

        let result = compiler.compile(&activity).unwrap();

        // Both legs should preserve core metadata
        for leg in &result {
            assert_eq!(leg.account_id, "my-account");
            assert_eq!(leg.asset_id, Some("MSFT".to_string()));
            assert_eq!(leg.currency, "EUR");
        }
    }

    #[test]
    fn test_compile_staking_reward_produces_two_legs() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_INTEREST.to_string();
        activity.subtype = Some(ACTIVITY_SUBTYPE_STAKING_REWARD.to_string());
        activity.asset_id = Some("ETH".to_string());
        activity.quantity = Some(dec!(0.01)); // ETH received
        activity.unit_price = Some(dec!(2000)); // FMV at receipt
        activity.amount = Some(dec!(20)); // Value = 0.01 * 2000

        let result = compiler.compile(&activity).unwrap();

        assert_eq!(result.len(), 2);

        // First leg: INTEREST
        assert_eq!(result[0].id, "test-1:interest");
        assert_eq!(result[0].activity_type, ACTIVITY_TYPE_INTEREST);
        assert!(result[0].subtype.is_none());
        assert_eq!(result[0].amount, Some(dec!(20)));
        assert!(result[0].quantity.is_none());
        assert!(result[0].unit_price.is_none());

        // Second leg: BUY
        assert_eq!(result[1].id, "test-1:buy");
        assert_eq!(result[1].activity_type, ACTIVITY_TYPE_BUY);
        assert!(result[1].subtype.is_none());
        assert_eq!(result[1].quantity, Some(dec!(0.01)));
        assert_eq!(result[1].unit_price, Some(dec!(2000)));
        assert!(result[1].amount.is_none());
        assert_eq!(result[1].fee, Some(dec!(0)));
    }

    #[test]
    fn test_compile_dividend_in_kind_produces_two_legs() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();
        activity.subtype = Some(ACTIVITY_SUBTYPE_DIVIDEND_IN_KIND.to_string());
        activity.asset_id = Some("PARENT_CO".to_string());
        activity.quantity = Some(dec!(10)); // shares of spinoff received
        activity.unit_price = Some(dec!(25)); // FMV at receipt
        activity.amount = Some(dec!(250)); // Value
        activity.metadata = Some(serde_json::json!({
            "received_asset_id": "SPINOFF_CO"
        }));

        let result = compiler.compile(&activity).unwrap();

        assert_eq!(result.len(), 2);

        // First leg: DIVIDEND
        assert_eq!(result[0].id, "test-1:dividend");
        assert_eq!(result[0].activity_type, ACTIVITY_TYPE_DIVIDEND);
        assert!(result[0].subtype.is_none());
        assert_eq!(result[0].asset_id, Some("PARENT_CO".to_string()));
        assert_eq!(result[0].amount, Some(dec!(250)));

        // Second leg: TRANSFER_IN (internal)
        assert_eq!(result[1].id, "test-1:transfer_in");
        assert_eq!(result[1].activity_type, ACTIVITY_TYPE_TRANSFER_IN);
        assert!(result[1].subtype.is_none());
        assert_eq!(result[1].asset_id, Some("SPINOFF_CO".to_string()));
        assert_eq!(result[1].quantity, Some(dec!(10)));
        assert_eq!(result[1].unit_price, Some(dec!(25)));
        assert!(result[1].amount.is_none());
        assert!(result[1].metadata.is_none());
    }

    #[test]
    fn test_compile_dividend_in_kind_fallback_to_same_asset() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();
        activity.subtype = Some(ACTIVITY_SUBTYPE_DIVIDEND_IN_KIND.to_string());
        activity.asset_id = Some("AAPL".to_string());
        // No metadata with received_asset_id

        let result = compiler.compile(&activity).unwrap();

        assert_eq!(result.len(), 2);
        // TRANSFER_IN should fall back to the original asset_id
        assert_eq!(result[1].asset_id, Some("AAPL".to_string()));
    }

    #[test]
    fn test_compile_respects_override() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_UNKNOWN.to_string();
        activity.activity_type_override = Some(ACTIVITY_TYPE_BUY.to_string());

        let result = compiler.compile(&activity).unwrap();

        assert_eq!(result.len(), 1);
        // The override should be used by effective_type()
        assert_eq!(
            result[0].activity_type_override,
            Some(ACTIVITY_TYPE_BUY.to_string())
        );
    }

    #[test]
    fn test_compile_drip_with_override_uses_override() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_UNKNOWN.to_string();
        activity.activity_type_override = Some(ACTIVITY_TYPE_DIVIDEND.to_string());
        activity.subtype = Some(ACTIVITY_SUBTYPE_DRIP.to_string());
        activity.quantity = Some(dec!(5));
        activity.unit_price = Some(dec!(20));
        activity.amount = Some(dec!(100));

        let result = compiler.compile(&activity).unwrap();

        // Should expand to 2 legs because effective_type is DIVIDEND with DRIP subtype
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].id, "test-1:dividend");
        assert_eq!(result[1].id, "test-1:buy");
    }

    #[test]
    fn test_compile_all() {
        let compiler = DefaultActivityCompiler::new();

        let mut buy = create_test_activity();
        buy.id = "buy-1".to_string();
        buy.activity_type = ACTIVITY_TYPE_BUY.to_string();

        let mut drip = create_test_activity();
        drip.id = "drip-1".to_string();
        drip.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();
        drip.subtype = Some(ACTIVITY_SUBTYPE_DRIP.to_string());

        let activities = vec![buy, drip];
        let result = compiler.compile_all(&activities).unwrap();

        // buy = 1 leg, drip = 2 legs
        assert_eq!(result.len(), 3);
        assert_eq!(result[0].id, "buy-1");
        assert_eq!(result[1].id, "drip-1:dividend");
        assert_eq!(result[2].id, "drip-1:buy");
    }

    #[test]
    fn test_compile_all_preserves_order() {
        let compiler = DefaultActivityCompiler::new();

        let mut first = create_test_activity();
        first.id = "first".to_string();
        first.activity_type = ACTIVITY_TYPE_BUY.to_string();

        let mut second = create_test_activity();
        second.id = "second".to_string();
        second.activity_type = ACTIVITY_TYPE_SELL.to_string();

        let mut third = create_test_activity();
        third.id = "third".to_string();
        third.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();

        let activities = vec![first, second, third];
        let result = compiler.compile_all(&activities).unwrap();

        assert_eq!(result.len(), 3);
        assert_eq!(result[0].id, "first");
        assert_eq!(result[1].id, "second");
        assert_eq!(result[2].id, "third");
    }

    #[test]
    fn test_compile_all_filters_non_posted() {
        let compiler = DefaultActivityCompiler::new();

        let mut posted = create_test_activity();
        posted.id = "posted".to_string();
        posted.activity_type = ACTIVITY_TYPE_BUY.to_string();
        posted.status = ActivityStatus::Posted;

        let mut draft = create_test_activity();
        draft.id = "draft".to_string();
        draft.activity_type = ACTIVITY_TYPE_BUY.to_string();
        draft.status = ActivityStatus::Draft;

        let activities = vec![posted, draft];
        let result = compiler.compile_all(&activities).unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "posted");
    }

    #[test]
    fn test_compile_deterministic() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();
        activity.subtype = Some(ACTIVITY_SUBTYPE_DRIP.to_string());
        activity.quantity = Some(dec!(5));
        activity.unit_price = Some(dec!(20));
        activity.amount = Some(dec!(100));

        // Compile multiple times and verify same output
        let result1 = compiler.compile(&activity).unwrap();
        let result2 = compiler.compile(&activity).unwrap();
        let result3 = compiler.compile(&activity).unwrap();

        assert_eq!(result1.len(), result2.len());
        assert_eq!(result2.len(), result3.len());

        for i in 0..result1.len() {
            assert_eq!(result1[i].id, result2[i].id);
            assert_eq!(result2[i].id, result3[i].id);
            assert_eq!(result1[i].activity_type, result2[i].activity_type);
            assert_eq!(result2[i].activity_type, result3[i].activity_type);
        }
    }

    #[test]
    fn test_synthetic_ids_traceable() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.id = "original-uuid-123".to_string();
        activity.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();
        activity.subtype = Some(ACTIVITY_SUBTYPE_DRIP.to_string());

        let result = compiler.compile(&activity).unwrap();

        // All synthetic IDs should contain the original ID for traceability
        for leg in &result {
            assert!(
                leg.id.starts_with("original-uuid-123"),
                "Synthetic ID {} should start with source ID",
                leg.id
            );
        }
    }

    #[test]
    fn test_buy_leg_clears_override() {
        let compiler = DefaultActivityCompiler::new();
        let mut activity = create_test_activity();
        activity.activity_type = ACTIVITY_TYPE_DIVIDEND.to_string();
        activity.activity_type_override = Some(ACTIVITY_TYPE_DIVIDEND.to_string()); // Has an override
        activity.subtype = Some(ACTIVITY_SUBTYPE_DRIP.to_string());

        let result = compiler.compile(&activity).unwrap();

        // The BUY leg should have its override cleared
        assert_eq!(result[1].activity_type, ACTIVITY_TYPE_BUY);
        assert!(result[1].activity_type_override.is_none());
    }
}
