//! Tests for asset domain models.

#[cfg(test)]
mod tests {
    use crate::assets::{Asset, AssetKind, OptionSpec, PricingMode};
    use chrono::NaiveDateTime;
    use rust_decimal_macros::dec;
    use serde_json::json;

    // Test AssetKind enum
    #[test]
    fn test_asset_kind_serialization() {
        // Test SCREAMING_SNAKE_CASE serialization
        let kind = AssetKind::Security;
        let json = serde_json::to_string(&kind).unwrap();
        assert_eq!(json, "\"SECURITY\"");
    }

    #[test]
    fn test_asset_kind_serialization_all_variants() {
        assert_eq!(
            serde_json::to_string(&AssetKind::Security).unwrap(),
            "\"SECURITY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Crypto).unwrap(),
            "\"CRYPTO\""
        );
        assert_eq!(serde_json::to_string(&AssetKind::Cash).unwrap(), "\"CASH\"");
        assert_eq!(
            serde_json::to_string(&AssetKind::FxRate).unwrap(),
            "\"FX_RATE\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Option).unwrap(),
            "\"OPTION\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Commodity).unwrap(),
            "\"COMMODITY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::PrivateEquity).unwrap(),
            "\"PRIVATE_EQUITY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Property).unwrap(),
            "\"PROPERTY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Vehicle).unwrap(),
            "\"VEHICLE\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Collectible).unwrap(),
            "\"COLLECTIBLE\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::PhysicalPrecious).unwrap(),
            "\"PHYSICAL_PRECIOUS\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Liability).unwrap(),
            "\"LIABILITY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Other).unwrap(),
            "\"OTHER\""
        );
    }

    #[test]
    fn test_asset_kind_deserialization() {
        let kind: AssetKind = serde_json::from_str("\"CRYPTO\"").unwrap();
        assert_eq!(kind, AssetKind::Crypto);
    }

    #[test]
    fn test_asset_kind_deserialization_all_variants() {
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"SECURITY\"").unwrap(),
            AssetKind::Security
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"CRYPTO\"").unwrap(),
            AssetKind::Crypto
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"CASH\"").unwrap(),
            AssetKind::Cash
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"FX_RATE\"").unwrap(),
            AssetKind::FxRate
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"OPTION\"").unwrap(),
            AssetKind::Option
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"COMMODITY\"").unwrap(),
            AssetKind::Commodity
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"PRIVATE_EQUITY\"").unwrap(),
            AssetKind::PrivateEquity
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"PROPERTY\"").unwrap(),
            AssetKind::Property
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"VEHICLE\"").unwrap(),
            AssetKind::Vehicle
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"COLLECTIBLE\"").unwrap(),
            AssetKind::Collectible
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"PHYSICAL_PRECIOUS\"").unwrap(),
            AssetKind::PhysicalPrecious
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"LIABILITY\"").unwrap(),
            AssetKind::Liability
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"OTHER\"").unwrap(),
            AssetKind::Other
        );
    }

    #[test]
    fn test_asset_kind_default() {
        let kind = AssetKind::default();
        assert_eq!(kind, AssetKind::Security);
    }

    // Test is_holdable method
    #[test]
    fn test_is_holdable_security() {
        let asset = create_test_asset(AssetKind::Security);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_crypto() {
        let asset = create_test_asset(AssetKind::Crypto);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_cash() {
        let asset = create_test_asset(AssetKind::Cash);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_fx_rate() {
        let asset = create_test_asset(AssetKind::FxRate);
        assert!(!asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_property() {
        let asset = create_test_asset(AssetKind::Property);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_vehicle() {
        let asset = create_test_asset(AssetKind::Vehicle);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_collectible() {
        let asset = create_test_asset(AssetKind::Collectible);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_physical_precious() {
        let asset = create_test_asset(AssetKind::PhysicalPrecious);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_liability() {
        let asset = create_test_asset(AssetKind::Liability);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_other() {
        let asset = create_test_asset(AssetKind::Other);
        assert!(asset.is_holdable());
    }

    // Test needs_pricing method
    #[test]
    fn test_needs_pricing_cash() {
        let asset = create_test_asset(AssetKind::Cash);
        assert!(!asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_security() {
        let asset = create_test_asset(AssetKind::Security);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_crypto() {
        let asset = create_test_asset(AssetKind::Crypto);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_property() {
        // Alternative assets need pricing (via Manual quotes)
        let asset = create_test_asset(AssetKind::Property);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_vehicle() {
        let asset = create_test_asset(AssetKind::Vehicle);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_collectible() {
        let asset = create_test_asset(AssetKind::Collectible);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_physical_precious() {
        let asset = create_test_asset(AssetKind::PhysicalPrecious);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_liability() {
        // Liabilities need pricing (balance updates via Manual quotes)
        let asset = create_test_asset(AssetKind::Liability);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_other() {
        let asset = create_test_asset(AssetKind::Other);
        assert!(asset.needs_pricing());
    }

    // Test effective_kind method (now just returns kind)
    #[test]
    fn test_effective_kind() {
        let asset = create_test_asset(AssetKind::Crypto);
        assert_eq!(asset.effective_kind(), AssetKind::Crypto);
    }

    // Test option_spec method
    #[test]
    fn test_option_spec_non_option_asset() {
        let asset = create_test_asset(AssetKind::Security);
        assert!(asset.option_spec().is_none());
    }

    #[test]
    fn test_option_spec_option_without_metadata() {
        let asset = create_test_asset(AssetKind::Option);
        assert!(asset.option_spec().is_none());
    }

    #[test]
    fn test_option_spec_option_with_metadata() {
        let mut asset = create_test_asset(AssetKind::Option);
        asset.metadata = Some(json!({
            "option": {
                "underlyingAssetId": "AAPL",
                "expiration": "2024-12-20",
                "right": "CALL",
                "strike": "150.00",
                "multiplier": "100",
                "occSymbol": "AAPL241220C00150000"
            }
        }));

        let spec = asset.option_spec();
        assert!(spec.is_some());
        let spec = spec.unwrap();
        assert_eq!(spec.underlying_asset_id, "AAPL");
        assert_eq!(spec.right, "CALL");
        assert_eq!(spec.strike, dec!(150.00));
        assert_eq!(spec.multiplier, dec!(100));
    }

    // Test OptionSpec serialization
    #[test]
    fn test_option_spec_serialization() {
        let spec = OptionSpec {
            underlying_asset_id: "AAPL".to_string(),
            expiration: chrono::NaiveDate::from_ymd_opt(2024, 12, 20).unwrap(),
            right: "CALL".to_string(),
            strike: dec!(150.00),
            multiplier: dec!(100),
            occ_symbol: Some("AAPL241220C00150000".to_string()),
        };

        let json = serde_json::to_string(&spec).unwrap();
        assert!(json.contains("\"underlyingAssetId\":\"AAPL\""));
        assert!(json.contains("\"right\":\"CALL\""));
    }

    // Helper function
    fn create_test_asset(kind: AssetKind) -> Asset {
        // Set pricing_mode based on kind (Cash = None, others = Market)
        let pricing_mode = match kind {
            AssetKind::Cash => PricingMode::None,
            _ => PricingMode::Market,
        };

        Asset {
            id: "TEST".to_string(),
            kind,
            name: Some("Test Asset".to_string()),
            symbol: "TEST".to_string(),
            exchange_mic: None,
            exchange_name: None,
            currency: "USD".to_string(),
            pricing_mode,
            preferred_provider: None,
            provider_overrides: None,
            notes: None,
            metadata: None,
            is_active: true,
            created_at: NaiveDateTime::default(),
            updated_at: NaiveDateTime::default(),
        }
    }
}
