//! Tests for asset domain models.

#[cfg(test)]
mod tests {
    use crate::assets::{
        canonicalize_market_identity, Asset, AssetKind, InstrumentType, OptionSpec, QuoteMode,
    };
    use chrono::NaiveDateTime;
    use rust_decimal_macros::dec;
    use serde_json::json;

    // Test AssetKind enum
    #[test]
    fn test_asset_kind_serialization() {
        let kind = AssetKind::Investment;
        let json = serde_json::to_string(&kind).unwrap();
        assert_eq!(json, "\"INVESTMENT\"");
    }

    #[test]
    fn test_asset_kind_serialization_all_variants() {
        assert_eq!(
            serde_json::to_string(&AssetKind::Investment).unwrap(),
            "\"INVESTMENT\""
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
            serde_json::to_string(&AssetKind::PreciousMetal).unwrap(),
            "\"PRECIOUS_METAL\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::PrivateEquity).unwrap(),
            "\"PRIVATE_EQUITY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Liability).unwrap(),
            "\"LIABILITY\""
        );
        assert_eq!(
            serde_json::to_string(&AssetKind::Other).unwrap(),
            "\"OTHER\""
        );
        assert_eq!(serde_json::to_string(&AssetKind::Fx).unwrap(), "\"FX\"");
    }

    #[test]
    fn test_asset_kind_deserialization() {
        let kind: AssetKind = serde_json::from_str("\"INVESTMENT\"").unwrap();
        assert_eq!(kind, AssetKind::Investment);
    }

    #[test]
    fn test_asset_kind_deserialization_all_variants() {
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"INVESTMENT\"").unwrap(),
            AssetKind::Investment
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
            serde_json::from_str::<AssetKind>("\"PRECIOUS_METAL\"").unwrap(),
            AssetKind::PreciousMetal
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"PRIVATE_EQUITY\"").unwrap(),
            AssetKind::PrivateEquity
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"LIABILITY\"").unwrap(),
            AssetKind::Liability
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"OTHER\"").unwrap(),
            AssetKind::Other
        );
        assert_eq!(
            serde_json::from_str::<AssetKind>("\"FX\"").unwrap(),
            AssetKind::Fx
        );
    }

    #[test]
    fn test_asset_kind_default() {
        let kind = AssetKind::default();
        assert_eq!(kind, AssetKind::Investment);
    }

    // Test is_holdable method
    #[test]
    fn test_is_holdable_investment() {
        let asset = create_test_asset(AssetKind::Investment);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_fx() {
        let asset = create_test_asset(AssetKind::Fx);
        assert!(!asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_property() {
        let asset = create_test_asset(AssetKind::Property);
        assert!(asset.is_holdable());
    }

    #[test]
    fn test_is_holdable_liability() {
        let asset = create_test_asset(AssetKind::Liability);
        assert!(asset.is_holdable());
    }

    // Test needs_pricing method
    #[test]
    fn test_needs_pricing_market() {
        let asset = create_test_asset(AssetKind::Investment);
        assert!(asset.needs_pricing());
    }

    #[test]
    fn test_needs_pricing_manual() {
        let mut asset = create_test_asset(AssetKind::Property);
        asset.quote_mode = QuoteMode::Manual;
        assert!(!asset.needs_pricing());
    }

    // Test is_alternative
    #[test]
    fn test_is_alternative() {
        assert!(AssetKind::Property.is_alternative());
        assert!(AssetKind::Vehicle.is_alternative());
        assert!(AssetKind::Collectible.is_alternative());
        assert!(AssetKind::PreciousMetal.is_alternative());
        assert!(AssetKind::Liability.is_alternative());
        assert!(AssetKind::Other.is_alternative());
        assert!(!AssetKind::Investment.is_alternative());
        assert!(!AssetKind::Fx.is_alternative());
        assert!(!AssetKind::PrivateEquity.is_alternative());
    }

    // Test is_investment
    #[test]
    fn test_is_investment() {
        assert!(AssetKind::Investment.is_investment());
        assert!(AssetKind::PrivateEquity.is_investment());
        assert!(!AssetKind::Property.is_investment());
        assert!(!AssetKind::Fx.is_investment());
    }

    // Test option_spec method
    #[test]
    fn test_option_spec_non_option_asset() {
        let asset = create_test_asset(AssetKind::Investment);
        assert!(asset.option_spec().is_none());
    }

    #[test]
    fn test_option_spec_option_with_metadata() {
        let mut asset = create_test_asset(AssetKind::Investment);
        asset.instrument_type = Some(InstrumentType::Option);
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

    // Test InstrumentType
    #[test]
    fn test_instrument_type_db_roundtrip() {
        for inst_type in [
            InstrumentType::Equity,
            InstrumentType::Crypto,
            InstrumentType::Fx,
            InstrumentType::Option,
            InstrumentType::Metal,
        ] {
            let db_str = inst_type.as_db_str();
            let parsed = InstrumentType::from_db_str(db_str).unwrap();
            assert_eq!(parsed, inst_type);
        }
    }

    // Test AssetKind db roundtrip
    #[test]
    fn test_asset_kind_db_roundtrip() {
        for kind in [
            AssetKind::Investment,
            AssetKind::Property,
            AssetKind::Vehicle,
            AssetKind::Collectible,
            AssetKind::PreciousMetal,
            AssetKind::PrivateEquity,
            AssetKind::Liability,
            AssetKind::Other,
            AssetKind::Fx,
        ] {
            let db_str = kind.as_db_str();
            let parsed = AssetKind::from_db_str(db_str).unwrap();
            assert_eq!(parsed, kind);
        }
    }

    #[test]
    fn test_canonicalize_market_identity_equity_suffix() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Equity),
            Some("SHOP.TO"),
            None,
            Some("cad"),
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("SHOP"));
        assert_eq!(canonical.display_code.as_deref(), Some("SHOP"));
        assert_eq!(canonical.instrument_exchange_mic.as_deref(), Some("XTSE"));
        assert_eq!(canonical.quote_ccy.as_deref(), Some("CAD"));
    }

    #[test]
    fn test_canonicalize_market_identity_crypto_pair() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Crypto),
            Some("CRO-USD"),
            Some("XTSE"),
            None,
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("CRO"));
        assert_eq!(canonical.display_code.as_deref(), Some("CRO"));
        assert_eq!(canonical.instrument_exchange_mic, None);
        assert_eq!(canonical.quote_ccy.as_deref(), Some("USD"));
    }

    #[test]
    fn test_canonicalize_market_identity_fx_pair() {
        let canonical = canonicalize_market_identity(
            Some(InstrumentType::Fx),
            Some("eurusd=x"),
            None,
            Some("usd"),
        );

        assert_eq!(canonical.instrument_symbol.as_deref(), Some("EUR"));
        assert_eq!(canonical.display_code.as_deref(), Some("EUR/USD"));
        assert_eq!(canonical.quote_ccy.as_deref(), Some("USD"));
        assert_eq!(canonical.instrument_exchange_mic, None);
    }

    // Helper function
    fn create_test_asset(kind: AssetKind) -> Asset {
        let quote_mode = match kind {
            AssetKind::Investment | AssetKind::Fx => QuoteMode::Market,
            _ => QuoteMode::Market, // All kinds use Market by default in tests
        };

        Asset {
            id: "test-uuid".to_string(),
            kind,
            name: Some("Test Asset".to_string()),
            display_code: Some("TEST".to_string()),
            notes: None,
            metadata: None,
            is_active: true,
            quote_mode,
            quote_ccy: "USD".to_string(),
            instrument_type: None,
            instrument_symbol: None,
            instrument_exchange_mic: None,
            instrument_key: None,
            provider_config: None,
            exchange_name: None,
            created_at: NaiveDateTime::default(),
            updated_at: NaiveDateTime::default(),
        }
    }
}
