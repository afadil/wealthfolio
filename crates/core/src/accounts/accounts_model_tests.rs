//! Tests for account domain models including TrackingMode.

#[cfg(test)]
mod tests {
    use crate::accounts::{get_tracking_mode, set_tracking_mode, Account, TrackingMode};
    use chrono::NaiveDateTime;

    // ==================== TrackingMode Serialization Tests ====================

    #[test]
    fn test_tracking_mode_serialization() {
        assert_eq!(
            serde_json::to_string(&TrackingMode::Transactions).unwrap(),
            "\"TRANSACTIONS\""
        );
        assert_eq!(
            serde_json::to_string(&TrackingMode::Holdings).unwrap(),
            "\"HOLDINGS\""
        );
        assert_eq!(
            serde_json::to_string(&TrackingMode::NotSet).unwrap(),
            "\"NOT_SET\""
        );
    }

    #[test]
    fn test_tracking_mode_deserialization() {
        assert_eq!(
            serde_json::from_str::<TrackingMode>("\"TRANSACTIONS\"").unwrap(),
            TrackingMode::Transactions
        );
        assert_eq!(
            serde_json::from_str::<TrackingMode>("\"HOLDINGS\"").unwrap(),
            TrackingMode::Holdings
        );
        assert_eq!(
            serde_json::from_str::<TrackingMode>("\"NOT_SET\"").unwrap(),
            TrackingMode::NotSet
        );
    }

    #[test]
    fn test_tracking_mode_default() {
        let mode = TrackingMode::default();
        assert_eq!(mode, TrackingMode::NotSet);
    }

    // ==================== get_tracking_mode Tests ====================

    #[test]
    fn test_get_tracking_mode_null_meta() {
        let account = create_test_account(None);
        assert_eq!(get_tracking_mode(&account), TrackingMode::NotSet);
    }

    #[test]
    fn test_get_tracking_mode_empty_meta() {
        let account = create_test_account(Some("".to_string()));
        assert_eq!(get_tracking_mode(&account), TrackingMode::NotSet);
    }

    #[test]
    fn test_get_tracking_mode_empty_object() {
        let account = create_test_account(Some("{}".to_string()));
        assert_eq!(get_tracking_mode(&account), TrackingMode::NotSet);
    }

    #[test]
    fn test_get_tracking_mode_invalid_json() {
        let account = create_test_account(Some("not valid json".to_string()));
        assert_eq!(get_tracking_mode(&account), TrackingMode::NotSet);
    }

    #[test]
    fn test_get_tracking_mode_transactions() {
        let account = create_test_account(Some(
            r#"{"wealthfolio":{"trackingMode":"TRANSACTIONS"}}"#.to_string(),
        ));
        assert_eq!(get_tracking_mode(&account), TrackingMode::Transactions);
    }

    #[test]
    fn test_get_tracking_mode_holdings() {
        let account = create_test_account(Some(
            r#"{"wealthfolio":{"trackingMode":"HOLDINGS"}}"#.to_string(),
        ));
        assert_eq!(get_tracking_mode(&account), TrackingMode::Holdings);
    }

    #[test]
    fn test_get_tracking_mode_not_set_explicit() {
        let account = create_test_account(Some(
            r#"{"wealthfolio":{"trackingMode":"NOT_SET"}}"#.to_string(),
        ));
        assert_eq!(get_tracking_mode(&account), TrackingMode::NotSet);
    }

    #[test]
    fn test_get_tracking_mode_invalid_value() {
        let account = create_test_account(Some(
            r#"{"wealthfolio":{"trackingMode":"INVALID"}}"#.to_string(),
        ));
        assert_eq!(get_tracking_mode(&account), TrackingMode::NotSet);
    }

    #[test]
    fn test_get_tracking_mode_with_other_fields() {
        let account = create_test_account(Some(
            r#"{"someOtherField":"value","wealthfolio":{"trackingMode":"HOLDINGS","otherWfField":"x"},"anotherField":123}"#.to_string(),
        ));
        assert_eq!(get_tracking_mode(&account), TrackingMode::Holdings);
    }

    // ==================== set_tracking_mode Tests ====================

    #[test]
    fn test_set_tracking_mode_null_meta() {
        let result = set_tracking_mode(None, TrackingMode::Transactions);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["wealthfolio"]["trackingMode"], "TRANSACTIONS");
    }

    #[test]
    fn test_set_tracking_mode_empty_meta() {
        let result = set_tracking_mode(Some("".to_string()), TrackingMode::Holdings);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["wealthfolio"]["trackingMode"], "HOLDINGS");
    }

    #[test]
    fn test_set_tracking_mode_empty_object() {
        let result = set_tracking_mode(Some("{}".to_string()), TrackingMode::Holdings);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["wealthfolio"]["trackingMode"], "HOLDINGS");
    }

    #[test]
    fn test_set_tracking_mode_invalid_json() {
        let result =
            set_tracking_mode(Some("invalid json".to_string()), TrackingMode::Transactions);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["wealthfolio"]["trackingMode"], "TRANSACTIONS");
    }

    #[test]
    fn test_set_tracking_mode_preserves_other_fields() {
        let meta = Some(r#"{"existingField":"value","count":42}"#.to_string());
        let result = set_tracking_mode(meta, TrackingMode::Holdings);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();

        assert_eq!(parsed["wealthfolio"]["trackingMode"], "HOLDINGS");
        assert_eq!(parsed["existingField"], "value");
        assert_eq!(parsed["count"], 42);
    }

    #[test]
    fn test_set_tracking_mode_overwrites_existing() {
        let meta = Some(r#"{"wealthfolio":{"trackingMode":"TRANSACTIONS"}}"#.to_string());
        let result = set_tracking_mode(meta, TrackingMode::Holdings);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();

        assert_eq!(parsed["wealthfolio"]["trackingMode"], "HOLDINGS");
    }

    #[test]
    fn test_set_tracking_mode_not_set() {
        let result = set_tracking_mode(None, TrackingMode::NotSet);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
        assert_eq!(parsed["wealthfolio"]["trackingMode"], "NOT_SET");
    }

    #[test]
    fn test_set_tracking_mode_preserves_other_wealthfolio_fields() {
        let meta = Some(r#"{"wealthfolio":{"otherField":"value"},"topLevel":"data"}"#.to_string());
        let result = set_tracking_mode(meta, TrackingMode::Holdings);
        let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();

        assert_eq!(parsed["wealthfolio"]["trackingMode"], "HOLDINGS");
        assert_eq!(parsed["wealthfolio"]["otherField"], "value");
        assert_eq!(parsed["topLevel"], "data");
    }

    // ==================== Helper Functions ====================

    fn create_test_account(meta: Option<String>) -> Account {
        Account {
            id: "test-account-id".to_string(),
            name: "Test Account".to_string(),
            account_type: "SECURITIES".to_string(),
            group: None,
            currency: "USD".to_string(),
            is_default: false,
            is_active: true,
            created_at: NaiveDateTime::default(),
            updated_at: NaiveDateTime::default(),
            platform_id: None,
            account_number: None,
            meta,
            provider: None,
            provider_account_id: None,
        }
    }
}
