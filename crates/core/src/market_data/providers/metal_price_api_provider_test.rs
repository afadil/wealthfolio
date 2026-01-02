#[cfg(test)]
mod tests {
    use super::super::metal_price_api_provider::MetalPriceApiProvider;
    use crate::market_data::{market_data_errors::MarketDataError, AssetProfiler};

    #[tokio::test]
    async fn test_get_asset_profile_gold() {
        let provider = MetalPriceApiProvider::new("test_api_key".to_string());
        let result = provider.get_asset_profile("XAU").await;

        assert!(result.is_ok());
        let profile = result.unwrap();

        // Check all required fields are populated
        assert_eq!(profile.symbol, "XAU");
        assert_eq!(profile.id, Some("XAU".to_string()));
        assert_eq!(profile.name, Some("Gold".to_string()));
        assert_eq!(profile.asset_type, Some("Commodity".to_string()));
        assert_eq!(profile.asset_class, Some("Commodity".to_string()));
        assert_eq!(profile.asset_sub_class, Some("Precious Metal".to_string()));
        assert_eq!(profile.currency, "USD");
        assert_eq!(profile.data_source, "METAL_PRICE_API");
        assert_eq!(profile.countries, Some("Global".to_string()));
        assert_eq!(
            profile.categories,
            Some("Precious Metals,Physical Commodities".to_string())
        );
        assert_eq!(profile.classes, Some("Physical Commodity".to_string()));
        assert_eq!(
            profile.attributes,
            Some("Safe Haven,Inflation Hedge,Store of Value".to_string())
        );
        assert_eq!(profile.sectors, Some("Materials,Commodities".to_string()));
        assert!(profile.notes.is_some());
        assert!(profile
            .notes
            .as_ref()
            .unwrap()
            .contains("Gold is a precious metal"));
        assert!(profile.url.is_some());
        assert!(profile.url.as_ref().unwrap().contains("metalpriceapi.com"));
        assert_eq!(profile.isin, None); // Precious metals don't have ISIN codes
        assert_eq!(profile.quote_symbol, Some("XAU".to_string()));
    }

    #[tokio::test]
    async fn test_get_asset_profile_silver() {
        let provider = MetalPriceApiProvider::new("test_api_key".to_string());
        let result = provider.get_asset_profile("XAG").await;

        assert!(result.is_ok());
        let profile = result.unwrap();

        assert_eq!(profile.symbol, "XAG");
        assert_eq!(profile.name, Some("Silver".to_string()));
        assert!(profile
            .categories
            .as_ref()
            .unwrap()
            .contains("Industrial Metals"));
        assert!(profile
            .attributes
            .as_ref()
            .unwrap()
            .contains("Industrial Use"));
    }

    #[tokio::test]
    async fn test_get_asset_profile_platinum() {
        let provider = MetalPriceApiProvider::new("test_api_key".to_string());
        let result = provider.get_asset_profile("XPT").await;

        assert!(result.is_ok());
        let profile = result.unwrap();

        assert_eq!(profile.symbol, "XPT");
        assert_eq!(profile.name, Some("Platinum".to_string()));
        assert!(profile
            .attributes
            .as_ref()
            .unwrap()
            .contains("Automotive Industry"));
    }

    #[tokio::test]
    async fn test_get_asset_profile_palladium() {
        let provider = MetalPriceApiProvider::new("test_api_key".to_string());
        let result = provider.get_asset_profile("XPD").await;

        assert!(result.is_ok());
        let profile = result.unwrap();

        assert_eq!(profile.symbol, "XPD");
        assert_eq!(profile.name, Some("Palladium".to_string()));
        assert!(profile
            .notes
            .as_ref()
            .unwrap()
            .contains("catalytic converters"));
    }

    #[tokio::test]
    async fn test_get_asset_profile_rhodium() {
        let provider = MetalPriceApiProvider::new("test_api_key".to_string());
        let result = provider.get_asset_profile("XRH").await;

        assert!(result.is_ok());
        let profile = result.unwrap();

        assert_eq!(profile.symbol, "XRH");
        assert_eq!(profile.name, Some("Rhodium".to_string()));
        assert!(profile.attributes.as_ref().unwrap().contains("Rare Metal"));
    }

    #[tokio::test]
    async fn test_get_asset_profile_unsupported_symbol() {
        let provider = MetalPriceApiProvider::new("test_api_key".to_string());
        let result = provider.get_asset_profile("INVALID").await;

        assert!(result.is_err());
        match result {
            Err(MarketDataError::NotFound(symbol)) => assert_eq!(symbol, "INVALID"),
            _ => panic!("Expected NotFound error"),
        }
    }

    #[tokio::test]
    async fn test_all_supported_metals_have_complete_profiles() {
        let provider = MetalPriceApiProvider::new("test_api_key".to_string());
        let metals = vec!["XAU", "XAG", "XPT", "XPD", "XRH", "XRU", "XIR", "XOS"];

        for metal in metals {
            let result = provider.get_asset_profile(metal).await;
            assert!(result.is_ok(), "Failed to get profile for {}", metal);

            let profile = result.unwrap();

            // Ensure all required fields are populated
            assert!(profile.id.is_some(), "Missing id for {}", metal);
            assert!(profile.name.is_some(), "Missing name for {}", metal);
            assert!(
                profile.asset_type.is_some(),
                "Missing asset_type for {}",
                metal
            );
            assert!(
                profile.asset_class.is_some(),
                "Missing asset_class for {}",
                metal
            );
            assert!(
                profile.asset_sub_class.is_some(),
                "Missing asset_sub_class for {}",
                metal
            );
            assert!(profile.notes.is_some(), "Missing notes for {}", metal);
            assert!(
                profile.countries.is_some(),
                "Missing countries for {}",
                metal
            );
            assert!(
                profile.categories.is_some(),
                "Missing categories for {}",
                metal
            );
            assert!(profile.classes.is_some(), "Missing classes for {}", metal);
            assert!(
                profile.attributes.is_some(),
                "Missing attributes for {}",
                metal
            );
            assert!(profile.sectors.is_some(), "Missing sectors for {}", metal);
            assert!(profile.url.is_some(), "Missing url for {}", metal);
            assert!(
                !profile.currency.is_empty(),
                "Missing currency for {}",
                metal
            );
            assert!(
                !profile.data_source.is_empty(),
                "Missing data_source for {}",
                metal
            );
            assert_eq!(profile.symbol, metal, "Symbol mismatch for {}", metal);
        }
    }
}
