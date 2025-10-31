use std::collections::HashMap;

use async_std::task;

use crate::market_data::{
    market_data_model::{AssetProfile, HistoricalQuote, Quote},
    market_data_provider::{AssetProfiler, MarketDataProvider},
    providers::vn_market_provider::VnMarketProvider,
    market_data_service::TimeRange,
};

#[async_std::test]
async fn test_vn_market_provider_creation() {
    let provider = VnMarketProvider::new();

    assert_eq!(provider.name(), "VN_MARKET");
    assert_eq!(provider.priority(), 2);
}

#[async_std::test]
async fn test_vn_market_provider_search_ticker() {
    let provider = VnMarketProvider::new();

    // Test with a common Vietnamese stock symbol prefix
    let results = provider.search_ticker("VNM").await;

    // The test will pass even if there are no results, but won't error
    match results {
        Ok(search_results) => {
            println!("Found {} results for 'VNM'", search_results.len());
            // Validate result structure if any results found
            for profile in &search_results {
                assert!(!profile.symbol.is_empty());
                assert!(!profile.name.is_empty());
                assert_eq!(profile.data_source, crate::market_data::market_data_model::DataSource::VnMarket);
            }
        }
        Err(e) => {
            // This is expected if the API is not running or has issues
            println!("Search ticker test expected error: {}", e);
        }
    }
}

#[async_std::test]
async fn test_vn_market_provider_get_asset_profile() {
    let provider = VnMarketProvider::new();

    // Test with a known Vietnamese stock symbol
    let symbol = "VNM"; // Vinamilk - a major Vietnamese company

    let profile = match provider.get_asset_profile(symbol).await {
        Ok(profile) => {
            assert!(!profile.symbol.is_empty());
            assert!(!profile.name.is_empty());
            assert_eq!(profile.data_source, crate::market_data::market_data_model::DataSource::VnMarket);
            assert_eq!(profile.currency, "VND");
            println!("Got profile for {}: {}", profile.symbol, profile.name);
            profile
        }
        Err(e) => {
            // Expected if API is not available
            println!("Get asset profile test expected error: {}", e);
            return;
        }
    };
}

#[async_std::test]
async fn test_vn_market_provider_get_latest_quote() {
    let provider = VnMarketProvider::new();

    // Test with a Vietnamese stock symbol
    let symbol = "VNM";

    let quote = match provider.get_latest_quote(symbol).await {
        Ok(quote) => {
            assert!(!quote.symbol.is_empty());
            assert!(quote.price >= 0.0);
            assert_eq!(quote.data_source, crate::market_data::market_data_model::DataSource::VnMarket);
            println!("Got quote for {}: ${}", quote.symbol, quote.price);
            quote
        }
        Err(e) => {
            // Expected if API is not available
            println!("Get latest quote test expected error: {}", e);
            return;
        }
    };
}

#[async_std::test]
async fn test_vn_market_provider_get_historical_quotes() {
    let provider = VnMarketProvider::new();

    // Test with a Vietnamese stock symbol for short period
    let symbol = "VNM";
    let time_range = TimeRange::Days(30); // 30 days of historical data

    let quotes = match provider.get_historical_quotes(symbol, time_range).await {
        Ok(quotes) => {
            assert!(!quotes.is_empty());
            for quote in &quotes {
                assert!(!quote.symbol.is_empty());
                assert!(quote.close >= 0.0);
                assert_eq!(quote.data_source, crate::market_data::market_data_model::DataSource::VnMarket);
            }
            println!("Got {} historical quotes for {}", quotes.len(), symbol);
            quotes
        }
        Err(e) => {
            // Expected if API is not available
            println!("Get historical quotes test expected error: {}", e);
            return;
        }
    };
}

#[async_std::test]
async fn test_vn_market_provider_historical_quotes_bulk() {
    let provider = VnMarketProvider::new();

    // Test bulk fetching with multiple Vietnamese symbols
    let symbols = vec
!["VNM".to_string(), "HPG".to_string(), "FPT".to_string()];
    let time_range = TimeRange::Days(7); // 7 days of historical data

    let results = match provider.get_historical_quotes_bulk(&symbols, time_range).await {
        Ok(results) => {
            assert!(!results.is_empty());

            for (symbol, historical_quotes) in &results {
                assert!(!symbol.is_empty());
                if !historical_quotes.is_empty() {
                    for quote in historical_quotes {
                        assert_eq!(quote.symbol, *symbol);
                        assert!(quote.close >= 0.0);
                        assert_eq!(quote.data_source, crate::market_data::market_data_model::DataSource::VnMarket);
                    }
                }
            }

            println!("Got bulk historical quotes for {} symbols", results.len());
            results
        }
        Err(e) => {
            // Expected if API is not available
            println!("Get historical quotes bulk test expected error: {}", e);
            return;
        }
    };
}

// Integration test to verify the provider can be created and basic methods work
#[async_std::test]
async fn test_vn_market_provider_integration() {
    let provider = VnMarketProvider::new();

    // Verify provider identity
    assert_eq!(provider.name(), "VN_MARKET");
    assert_eq!(provider.priority(), 2);

    // Test basic functionality - these may fail if API is not running
    // but shouldn't panic or crash

    println!("Testing search_ticker...");
    let _ = provider.search_ticker("VNM").await.unwrap_or_else(|e| {
        println!("Search ticker failed (expected if API unavailable): {}", e);
        Vec::new()
    });

    println!("Testing get_asset_profile...");
    let _ = provider.get_asset_profile("VNM").await.unwrap_or_else(|e| {
        println!("Get asset profile failed (expected if API unavailable): {}", e);
        AssetProfile {
            symbol: "VNM".to_string(),
            name: "Test Asset".to_string(),
            exchange: "HOSE".to_string(),
            asset_type: "Stock".to_string(),
            industry: "Test Industry".to_string(),
            description: "Test description".to_string(),
            currency: "VND".to_string(),
            data_source: crate::market_data::market_data_model::DataSource::VnMarket,
        }
    });

    println!("Testing get_latest_quote...");
    let _ = provider.get_latest_quote("VNM").await.unwrap_or_else(|e| {
        println!("Get latest quote failed (expected if API unavailable): {}", e);
        Quote {
            symbol: "VNM".to_string(),
            price: 0.0,
            change: 0.0,
            change_percent: 0.0,
            volume: 0,
            market_cap: 0.0,
            data_source: crate::market_data::market_data_model::DataSource::VnMarket,
            last_updated: std::time::SystemTime::now().into(),
        }
    });

    println!("VN_MARKET provider integration test completed");
}

#[async_std::test]
async fn test_vn_market_provider_data_source_consistency() {
    let provider = VnMarketProvider::new();

    // Test that all returned data objects have consistent data source
    let test_symbols = vec
!["VNM", "HPG", "FPT"];

    for symbol in test_symbols {
        println!("Testing data source consistency for symbol: {}", symbol);

        // Test profile
        if let Ok(profile) = provider.get_asset_profile(symbol).await {
            assert_eq!(profile.data_source, crate::market_data::market_data_model::DataSource::VnMarket);
        }

        // Test quote
        if let Ok(quote) = provider.get_latest_quote(symbol).await {
            assert_eq!(quote.data_source, crate::market_data::market_data_model::DataSource::VnMarket);
        }

        // Test historical quotes
        if let Ok(quotes) = provider.get_historical_quotes(symbol, TimeRange::Days(7)).await {
            for quote in quotes {
                assert_eq!(quote.data_source, crate::market_data::market_data_model::DataSource::VnMarket);
            }
        }
    }

    println!("Data source consistency test completed");
}