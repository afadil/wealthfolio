//! Flow classification for performance calculation.
//!
//! This module classifies activities as external or internal flows for TWR calculation.
//! Only external flows (money crossing the portfolio boundary) affect TWR.

use crate::activities::{
    Activity, ACTIVITY_SUBTYPE_BONUS, ACTIVITY_TYPE_CREDIT, ACTIVITY_TYPE_DEPOSIT,
    ACTIVITY_TYPE_TRANSFER_IN, ACTIVITY_TYPE_TRANSFER_OUT, ACTIVITY_TYPE_WITHDRAWAL,
};

/// Flow type for performance calculation
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlowType {
    /// External flow - money crossing portfolio boundary
    /// Affects TWR calculation, counts as contribution/withdrawal
    External,

    /// Internal flow - money moving within portfolio
    /// Does not affect TWR calculation
    Internal,
}

/// Scope for performance calculation
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PerformanceScope {
    /// Portfolio-level: only DEPOSIT/WITHDRAWAL are external
    /// Transfers between accounts are internal
    Portfolio,

    /// Account-level: TRANSFER_IN/OUT are also external
    Account,
}

/// Classify flow for portfolio-level performance.
///
/// External flows:
/// - DEPOSIT, WITHDRAWAL (money entering/leaving portfolio)
/// - CREDIT with subtype BONUS (promotional credits = new money)
///
/// Internal flows:
/// - BUY, SELL, DIVIDEND, INTEREST, SPLIT (asset reallocation)
/// - TRANSFER_IN, TRANSFER_OUT (money moving between accounts)
/// - FEE, TAX (deductions from existing money)
/// - CREDIT with other subtypes (REBATE, REFUND = not new money)
pub fn classify_flow(activity: &Activity) -> FlowType {
    let effective_type = activity.effective_type();

    // External flows - money crossing portfolio boundary
    if effective_type == ACTIVITY_TYPE_DEPOSIT || effective_type == ACTIVITY_TYPE_WITHDRAWAL {
        return FlowType::External;
    }

    // CREDIT: depends on subtype
    if effective_type == ACTIVITY_TYPE_CREDIT {
        return match activity.subtype.as_deref() {
            // BONUS is external (new money entering portfolio)
            Some(ACTIVITY_SUBTYPE_BONUS) => FlowType::External,
            // REBATE, REFUND, and other subtypes are internal
            // (corrections/refunds of existing transactions, not new money)
            _ => FlowType::Internal,
        };
    }

    // Everything else is internal
    // BUY, SELL, DIVIDEND, INTEREST, TRANSFER_*, FEE, TAX, SPLIT, ADJUSTMENT
    FlowType::Internal
}

/// Classify flow for a specific scope.
///
/// For portfolio-level: transfers between accounts are internal
/// For account-level: transfers are external (money leaving/entering that account)
pub fn classify_flow_for_scope(activity: &Activity, scope: PerformanceScope) -> FlowType {
    match scope {
        PerformanceScope::Portfolio => classify_flow(activity),
        PerformanceScope::Account => {
            let effective_type = activity.effective_type();

            // For account-level, deposits/withdrawals/transfers are external
            if effective_type == ACTIVITY_TYPE_DEPOSIT
                || effective_type == ACTIVITY_TYPE_WITHDRAWAL
                || effective_type == ACTIVITY_TYPE_TRANSFER_IN
                || effective_type == ACTIVITY_TYPE_TRANSFER_OUT
            {
                return FlowType::External;
            }

            // CREDIT still follows the same rules
            if effective_type == ACTIVITY_TYPE_CREDIT {
                return match activity.subtype.as_deref() {
                    Some(ACTIVITY_SUBTYPE_BONUS) => FlowType::External,
                    _ => FlowType::Internal,
                };
            }

            FlowType::Internal
        }
    }
}

/// Check if an activity is an external flow for portfolio-level calculation
pub fn is_external_flow(activity: &Activity) -> bool {
    classify_flow(activity) == FlowType::External
}

/// Check if an activity affects net contribution
pub fn affects_net_contribution(activity: &Activity) -> bool {
    is_external_flow(activity)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::activities::ActivityStatus;
    use chrono::Utc;

    fn create_test_activity(activity_type: &str) -> Activity {
        Activity {
            id: "test-1".to_string(),
            account_id: "account-1".to_string(),
            asset_id: None,
            activity_type: activity_type.to_string(),
            activity_type_override: None,
            source_type: None,
            subtype: None,
            status: ActivityStatus::Posted,
            activity_date: Utc::now(),
            settlement_date: None,
            quantity: None,
            unit_price: None,
            amount: Some(rust_decimal::Decimal::from(100)),
            fee: None,
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

    // External flow tests
    #[test]
    fn test_deposit_is_external() {
        let activity = create_test_activity("DEPOSIT");
        assert_eq!(classify_flow(&activity), FlowType::External);
    }

    #[test]
    fn test_withdrawal_is_external() {
        let activity = create_test_activity("WITHDRAWAL");
        assert_eq!(classify_flow(&activity), FlowType::External);
    }

    #[test]
    fn test_credit_bonus_is_external() {
        let mut activity = create_test_activity("CREDIT");
        activity.subtype = Some("BONUS".to_string());
        assert_eq!(classify_flow(&activity), FlowType::External);
    }

    // Internal flow tests
    #[test]
    fn test_buy_is_internal() {
        let activity = create_test_activity("BUY");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_sell_is_internal() {
        let activity = create_test_activity("SELL");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_dividend_is_internal() {
        let activity = create_test_activity("DIVIDEND");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_interest_is_internal() {
        let activity = create_test_activity("INTEREST");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_transfer_in_is_internal_for_portfolio() {
        let activity = create_test_activity("TRANSFER_IN");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_transfer_out_is_internal_for_portfolio() {
        let activity = create_test_activity("TRANSFER_OUT");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_fee_is_internal() {
        let activity = create_test_activity("FEE");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_tax_is_internal() {
        let activity = create_test_activity("TAX");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    // CREDIT subtype tests
    #[test]
    fn test_credit_fee_refund_is_internal() {
        let mut activity = create_test_activity("CREDIT");
        activity.subtype = Some("FEE_REFUND".to_string());
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_credit_tax_refund_is_internal() {
        let mut activity = create_test_activity("CREDIT");
        activity.subtype = Some("TAX_REFUND".to_string());
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_credit_rebate_is_internal() {
        let mut activity = create_test_activity("CREDIT");
        activity.subtype = Some("REBATE".to_string());
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_credit_adjustment_is_internal() {
        let mut activity = create_test_activity("CREDIT");
        activity.subtype = Some("ADJUSTMENT".to_string());
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    #[test]
    fn test_credit_no_subtype_is_internal() {
        let activity = create_test_activity("CREDIT");
        assert_eq!(classify_flow(&activity), FlowType::Internal);
    }

    // Account scope tests
    #[test]
    fn test_transfer_in_is_external_for_account() {
        let activity = create_test_activity("TRANSFER_IN");
        assert_eq!(
            classify_flow_for_scope(&activity, PerformanceScope::Account),
            FlowType::External
        );
    }

    #[test]
    fn test_transfer_out_is_external_for_account() {
        let activity = create_test_activity("TRANSFER_OUT");
        assert_eq!(
            classify_flow_for_scope(&activity, PerformanceScope::Account),
            FlowType::External
        );
    }

    #[test]
    fn test_buy_is_internal_for_account() {
        let activity = create_test_activity("BUY");
        assert_eq!(
            classify_flow_for_scope(&activity, PerformanceScope::Account),
            FlowType::Internal
        );
    }

    // Override test
    #[test]
    fn test_respects_activity_type_override() {
        let mut activity = create_test_activity("UNKNOWN");
        activity.activity_type_override = Some("DEPOSIT".to_string());
        assert_eq!(classify_flow(&activity), FlowType::External);
    }

    // Helper function tests
    #[test]
    fn test_is_external_flow() {
        let deposit = create_test_activity("DEPOSIT");
        let buy = create_test_activity("BUY");

        assert!(is_external_flow(&deposit));
        assert!(!is_external_flow(&buy));
    }

    #[test]
    fn test_affects_net_contribution() {
        let deposit = create_test_activity("DEPOSIT");
        let dividend = create_test_activity("DIVIDEND");

        assert!(affects_net_contribution(&deposit));
        assert!(!affects_net_contribution(&dividend));
    }
}
