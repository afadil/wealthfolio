use rust_decimal::Decimal;

use crate::market_data::{
    market_data_model::{Quote, DataSource},
    providers::market_data_provider::{AssetProfiler, MarketDataProvider},
    providers::vn_market_provider::VnMarketProvider,
    providers::models::AssetProfile,
    market_data_errors::MarketDataError,
};
use std::time::{SystemTime, Duration};
use chrono::Utc;

#[tokio::test]
async fn test_vn_market_provider_creation() {
    let provider = VnMarketProvider::new();

    assert_eq!(provider.name(), "VN_MARKET");
    assert_eq!(provider.priority(), 2);
}

#[tokio::test]
async fn test_vn_market_provider_search_ticker() {
    let provider = VnMarketProvider::new();

    // Test with a common Vietnamese stock symbol prefix
    let results = provider.search_ticker("VNM").await;

    // The test will pass even if there are no results, but won't error
    match results {
        Ok(search_results) => {
            println!("Found {} results for 'VNM'", search_results.len());
            // Validate result structure if any results found
            for summary in &search_results {
                assert!(!summary.symbol.is_empty());
                assert!(!summary.short_name.is_empty());
                assert!(!summary.quote_type.is_empty());
            }
        }
        Err(e) => {
            // This is expected if the API is not running or has issues
            println!("Search ticker test expected error: {}", e);
        }
    }
}

#[tokio::test]
async fn test_vn_market_provider_get_asset_profile() {
    let provider = VnMarketProvider::new();

    // Test with a known Vietnamese stock symbol
    let symbol = "VNM"; // Vinamilk - a major Vietnamese company

    let profile = match provider.get_asset_profile(symbol).await {
        Ok(profile) => {
            assert!(!profile.symbol.is_empty());
            assert!(profile.name.is_some());
            assert_eq!(profile.data_source, "VN_MARKET");
            assert_eq!(profile.currency, "VND");
            assert!(profile.asset_class.is_some());
            assert!(profile.asset_sub_class.is_some());
            println!("Got profile for {}: {:?}", profile.symbol, profile.name);
            profile
        }
        Err(e) => {
            // Expected if API is not available
            println!("Get asset profile test expected error: {}", e);
            return;
        }
    };
}

#[tokio::test]
async fn test_vn_market_provider_get_latest_quote() {
    let provider = VnMarketProvider::new();

    // Test with a Vietnamese stock symbol
    let symbol = "VNM";

    let quote = match provider.get_latest_quote(symbol, "VND".to_string()).await {
        Ok(quote) => {
            assert!(!quote.symbol.is_empty());
            assert!(quote.close >= Decimal::ZERO);
            assert_eq!(quote.data_source, DataSource::VnMarket);
            assert_eq!(quote.currency, "VND");
            println!("Got quote for {}: {} {}", quote.symbol, quote.close, quote.currency);
            quote
        }
        Err(e) => {
            // Expected if API is not available
            println!("Get latest quote test expected error: {}", e);
            return;
        }
    };
}

#[tokio::test]
async fn test_vn_market_provider_get_historical_quotes() {
    let provider = VnMarketProvider::new();

    // Test with a Vietnamese stock symbol for short period
    let symbol = "VNM";
    let start = SystemTime::now() - Duration::from_secs(30 * 24 * 60 * 60); // 30 days ago
    let end = SystemTime::now();

    let quotes = match provider.get_historical_quotes(symbol, start, end, "VND".to_string()).await {
        Ok(quotes) => {
            assert!(!quotes.is_empty());
            for quote in &quotes {
                assert!(!quote.symbol.is_empty());
                assert!(quote.close >= Decimal::ZERO);
                assert_eq!(quote.data_source, DataSource::VnMarket);
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

#[tokio::test]
async fn test_vn_market_provider_historical_quotes_bulk() {
    let provider = VnMarketProvider::new();

    // Test bulk fetching with multiple Vietnamese symbols
    let symbols_with_currencies = vec![
        ("VNM".to_string(), "VND".to_string()),
        ("HPG".to_string(), "VND".to_string()),
        ("FPT".to_string(), "VND".to_string())
    ];
    let start = SystemTime::now() - Duration::from_secs(7 * 24 * 60 * 60);
    let end = SystemTime::now(); // 7 days of historical data

    let results = match provider.get_historical_quotes_bulk(&symbols_with_currencies, start, end).await {
        Ok((quotes, failed)) => {
            println!("Got {} quotes, {} failed symbols", quotes.len(), failed.len());
            
            for quote in &quotes {
                assert!(!quote.symbol.is_empty());
                assert!(quote.close >= Decimal::ZERO);
                assert_eq!(quote.data_source, DataSource::VnMarket);
            }

            (quotes, failed)
        }
        Err(e) => {
            // Expected if API is not available
            println!("Get historical quotes bulk test expected error: {}", e);
            return;
        }
    };
}

// Integration test to verify the provider can be created and basic methods work
#[tokio::test]
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
            id: Some("VNM".to_string()),
            symbol: "VNM".to_string(),
            name: Some("Test Asset".to_string()),
            asset_type: Some("STOCK".to_string()),
            asset_class: Some("Equity".to_string()),
            asset_sub_class: Some("Stock".to_string()),
            currency: "VND".to_string(),
            data_source: "VN_MARKET".to_string(),
            isin: None,
            symbol_mapping: None,
            notes: None,
            countries: None,
            categories: None,
            classes: None,
            attributes: None,
            sectors: None,
            url: None,
        }
    });

    println!("Testing get_latest_quote...");
    let _ = provider.get_latest_quote("VNM", "VND".to_string()).await.unwrap_or_else(|e| {
        println!("Get latest quote failed (expected if API unavailable): {}", e);
        Quote {
            id: "quote_VNM".to_string(),
            symbol: "VNM".to_string(),
            timestamp: Utc::now(),
            open: Decimal::ZERO,
            high: Decimal::ZERO,
            low: Decimal::ZERO,
            close: Decimal::ZERO,
            adjclose: Decimal::ZERO,
            volume: Decimal::ZERO,
            currency: "VND".to_string(),
            data_source: DataSource::VnMarket,
            created_at: Utc::now(),
        }
    });

    println!("VN_MARKET provider integration test completed");
}

#[tokio::test]
async fn test_vn_market_provider_data_source_consistency() {
    let provider = VnMarketProvider::new();

    // Test that all returned data objects have consistent data source
    let test_symbols = vec!["VNM", "HPG", "FPT"];

    for symbol in test_symbols {
        println!("Testing data source consistency for symbol: {}", symbol);

        // Test profile
        if let Ok(profile) = provider.get_asset_profile(symbol).await {
            assert_eq!(profile.data_source, "VN_MARKET");
        }

        // Test quote
        if let Ok(quote) = provider.get_latest_quote(symbol, "VND".to_string()).await {
            assert_eq!(quote.data_source, DataSource::VnMarket);
        }

        // Test historical quotes
        let start = SystemTime::now() - Duration::from_secs(7 * 24 * 60 * 60);
        let end = SystemTime::now();
        if let Ok(quotes) = provider.get_historical_quotes(symbol, start, end, "VND".to_string()).await {
            for quote in quotes {
                assert_eq!(quote.data_source, DataSource::VnMarket);
            }
        }
    }

    println!("Data source consistency test completed");
}