use crate::models::{Activity, ActivityType, Asset, Holding};
use crate::portfolio::holdings_service::Portfolio;
use bigdecimal::BigDecimal;
use std::str::FromStr;
use chrono::NaiveDateTime;

#[test]
fn test_basic_holding_calculations() {
    // Initialize portfolio
    let mut portfolio = Portfolio::new("USD".to_string());
    
    // Create test data
    let account_id = "TEST_ACCOUNT";
    let asset_id = "AAPL";
    let activity = Activity {
        id: "1".to_string(),
        account_id: account_id.to_string(),
        asset_id: asset_id.to_string(),
        activity_type: ActivityType::Buy.as_str().to_string(),
        activity_date: chrono::Utc::now().naive_utc(),
        quantity: 10.0,
        unit_price: 150.0,
        fee: 5.0,
        currency: "USD".to_string(),
        is_draft: false,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };
    
    let asset = Asset {
        id: asset_id.to_string(),
        symbol: asset_id.to_string(),
        name: Some("Apple Inc.".to_string()),
        isin: None,
        symbol_mapping: None,
        asset_type: Some("STOCK".to_string()),
        currency: "USD".to_string(),
        data_source: "YAHOO".to_string(),
        asset_class: Some("EQUITY".to_string()),
        asset_sub_class: Some("US STOCKS".to_string()),
        sectors: None,
        countries: None,
        categories: None,
        classes: None,
        attributes: None,
        url: None,
        notes: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    // Test buy transaction
    portfolio.process_activity(&activity, &asset).unwrap();

    // Verify holdings were created correctly
    let holdings = portfolio.get_holdings();
    assert_eq!(holdings.len(), 2, "Should have two holdings (stock and cash)");
    
    // Find the stock holding
    let stock_holding = holdings.iter().find(|h| h.symbol == asset_id).unwrap();
    assert_eq!(stock_holding.quantity, BigDecimal::from_str("10").unwrap());
    assert_eq!(stock_holding.average_cost, Some(BigDecimal::from_str("150").unwrap()));
    assert_eq!(stock_holding.book_value, BigDecimal::from_str("1500").unwrap());

    // Find the cash holding
    let cash_holding = holdings.iter().find(|h| h.symbol == "$CASH-USD").unwrap();
    assert_eq!(cash_holding.quantity, BigDecimal::from_str("-1505").unwrap()); // -1500 - 5 (fee)

    // Verify cash was adjusted correctly
    let cash_positions = portfolio.get_cash_positions();
    let account_cash = cash_positions.get(account_id).unwrap();
    let usd_cash = account_cash.get("USD").unwrap();
    assert_eq!(*usd_cash, BigDecimal::from_str("-1505").unwrap()); // -1500 - 5 (fee)

    // Test sell transaction
    let sell_activity = Activity {
        id: "2".to_string(),
        account_id: account_id.to_string(),
        asset_id: asset_id.to_string(),
        activity_type: ActivityType::Sell.as_str().to_string(),
        activity_date: chrono::Utc::now().naive_utc(),
        quantity: 5.0,
        unit_price: 160.0,
        fee: 5.0,
        currency: "USD".to_string(),
        is_draft: false,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    portfolio.process_activity(&sell_activity, &asset).unwrap();

    // Verify holdings were updated correctly
    let holdings = portfolio.get_holdings();
    assert_eq!(holdings.len(), 2, "Should still have two holdings");
    
    // Verify stock holding
    let stock_holding = holdings.iter().find(|h| h.symbol == asset_id).unwrap();
    assert_eq!(stock_holding.quantity, BigDecimal::from_str("5").unwrap());
    assert_eq!(stock_holding.average_cost, Some(BigDecimal::from_str("150").unwrap()));
    assert_eq!(stock_holding.book_value, BigDecimal::from_str("750").unwrap());

    // Verify cash holding
    let cash_holding = holdings.iter().find(|h| h.symbol == "$CASH-USD").unwrap();
    assert_eq!(cash_holding.quantity, BigDecimal::from_str("-710").unwrap()); // -1505 + (800 - 5)

    // Verify cash was adjusted correctly after sell
    let cash_positions = portfolio.get_cash_positions();
    let account_cash = cash_positions.get(account_id).unwrap();
    let usd_cash = account_cash.get("USD").unwrap();
    assert_eq!(*usd_cash, BigDecimal::from_str("-710").unwrap()); // -1505 + (800 - 5)
}

#[test]
fn test_cash_transactions() {
    let mut portfolio = Portfolio::new("USD".to_string());
    let account_id = "TEST_ACCOUNT";
    
    // Test deposit
    let deposit = Activity {
        id: "1".to_string(),
        account_id: account_id.to_string(),
        asset_id: "$CASH-USD".to_string(),
        activity_type: ActivityType::Deposit.as_str().to_string(),
        activity_date: chrono::Utc::now().naive_utc(),
        quantity: 1000.0,
        unit_price: 1.0,
        fee: 0.0,
        currency: "USD".to_string(),
        is_draft: false,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    let cash_asset = Asset {
        id: "$CASH-USD".to_string(),
        symbol: "$CASH-USD".to_string(),
        name: Some("US Dollar".to_string()),
        isin: None,
        symbol_mapping: None,
        asset_type: Some("CASH".to_string()),
        currency: "USD".to_string(),
        data_source: "SYSTEM".to_string(),
        asset_class: Some("CASH".to_string()),
        asset_sub_class: None,
        sectors: None,
        countries: None,
        categories: None,
        classes: None,
        attributes: None,
        url: None,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    portfolio.process_activity(&deposit, &cash_asset).unwrap();

    // Verify holdings
    let holdings = portfolio.get_holdings();
    assert_eq!(holdings.len(), 1, "Should have one cash holding");
    
    // Verify cash holding
    let cash_holding = holdings.first().unwrap();
    assert_eq!(cash_holding.symbol, "$CASH-USD");
    assert_eq!(cash_holding.quantity, BigDecimal::from_str("1000").unwrap());

    // Verify cash position
    let cash_positions = portfolio.get_cash_positions();
    let account_cash = cash_positions.get(account_id).unwrap();
    let usd_cash = account_cash.get("USD").unwrap();
    assert_eq!(*usd_cash, BigDecimal::from_str("1000").unwrap());

    // Test withdrawal
    let withdrawal = Activity {
        id: "2".to_string(),
        account_id: account_id.to_string(),
        asset_id: "$CASH-USD".to_string(),
        activity_type: ActivityType::Withdrawal.as_str().to_string(),
        activity_date: chrono::Utc::now().naive_utc(),
        quantity: 500.0,
        unit_price: 1.0,
        fee: 1.0,
        currency: "USD".to_string(),
        is_draft: false,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    portfolio.process_activity(&withdrawal, &cash_asset).unwrap();

    // Verify holdings
    let holdings = portfolio.get_holdings();
    assert_eq!(holdings.len(), 1, "Should still have one cash holding");
    
    // Verify cash holding
    let cash_holding = holdings.first().unwrap();
    assert_eq!(cash_holding.symbol, "$CASH-USD");
    assert_eq!(cash_holding.quantity, BigDecimal::from_str("499").unwrap()); // 1000 - 500 - 1 (fee)

    // Verify final cash position
    let cash_positions = portfolio.get_cash_positions();
    let account_cash = cash_positions.get(account_id).unwrap();
    let usd_cash = account_cash.get("USD").unwrap();
    assert_eq!(*usd_cash, BigDecimal::from_str("499").unwrap()); // 1000 - 500 - 1 (fee)
}

#[test]
fn test_complex_cash_calculations() {
    let mut portfolio = Portfolio::new("USD".to_string());
    let account_id = "6ba210ee-09ad-4f26-93bb-e35db1fe2b9a";
    let asset_id = "AAPL";

    let apple_asset = Asset {
        id: asset_id.to_string(),
        symbol: asset_id.to_string(),
        name: Some("Apple Inc.".to_string()),
        isin: None,
        symbol_mapping: None,
        asset_type: Some("STOCK".to_string()),
        currency: "USD".to_string(),
        data_source: "YAHOO".to_string(),
        asset_class: Some("EQUITY".to_string()),
        asset_sub_class: Some("US STOCKS".to_string()),
        sectors: None,
        countries: None,
        categories: None,
        classes: None,
        attributes: None,
        url: None,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    let cash_asset = Asset {
        id: "$CASH-USD".to_string(),
        symbol: "$CASH-USD".to_string(),
        name: Some("US Dollar".to_string()),
        isin: None,
        symbol_mapping: None,
        asset_type: Some("CASH".to_string()),
        currency: "USD".to_string(),
        data_source: "SYSTEM".to_string(),
        asset_class: Some("CASH".to_string()),
        asset_sub_class: None,
        sectors: None,
        countries: None,
        categories: None,
        classes: None,
        attributes: None,
        url: None,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };

    // 1. First Buy - March 1, 2024
    let first_buy = Activity {
        id: "f240bb90-57b2-4a55-a667-ec77feb5818a".to_string(),
        account_id: account_id.to_string(),
        asset_id: asset_id.to_string(),
        activity_type: ActivityType::Buy.as_str().to_string(),
        activity_date: NaiveDateTime::parse_from_str("2024-03-01T00:00:00", "%Y-%m-%dT%H:%M:%S").unwrap(),
        quantity: 20.0,
        unit_price: 179.0,
        fee: 0.0,
        currency: "USD".to_string(),
        is_draft: true,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };
    portfolio.process_activity(&first_buy, &apple_asset).unwrap();
    assert_eq!(
        portfolio.get_cash_positions().get(account_id).unwrap().get("USD").unwrap(),
        &BigDecimal::from_str("-3580").unwrap(),
        "After first buy, balance should be -$3,580"
    );

    // 2. Deposit - March 14, 2024
    let deposit = Activity {
        id: "bacf22ad-069c-4c74-adc0-4ba021c2f83a".to_string(),
        account_id: account_id.to_string(),
        asset_id: "$CASH-USD".to_string(),
        activity_type: ActivityType::Deposit.as_str().to_string(),
        activity_date: NaiveDateTime::parse_from_str("2024-03-14T04:00:00", "%Y-%m-%dT%H:%M:%S").unwrap(),
        quantity: 1.0,
        unit_price: 10000.0,
        fee: 0.0,
        currency: "USD".to_string(),
        is_draft: false,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };
    portfolio.process_activity(&deposit, &cash_asset).unwrap();
    assert_eq!(
        portfolio.get_cash_positions().get(account_id).unwrap().get("USD").unwrap(),
        &BigDecimal::from_str("6420").unwrap(),
        "After deposit of $10,000, balance should be $6,420"
    );

    // 3. Second Buy - April 19, 2024
    let second_buy = Activity {
        id: "b84e70e4-348e-4d20-af38-d2803e83c42d".to_string(),
        account_id: account_id.to_string(),
        asset_id: asset_id.to_string(),
        activity_type: ActivityType::Buy.as_str().to_string(),
        activity_date: NaiveDateTime::parse_from_str("2024-04-19T00:00:00", "%Y-%m-%dT%H:%M:%S").unwrap(),
        quantity: 5.0,
        unit_price: 165.0,
        fee: 0.0,
        currency: "USD".to_string(),
        is_draft: true,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };
    portfolio.process_activity(&second_buy, &apple_asset).unwrap();
    assert_eq!(
        portfolio.get_cash_positions().get(account_id).unwrap().get("USD").unwrap(),
        &BigDecimal::from_str("5595").unwrap(),
        "After second buy, balance should be $5,595"
    );

    // 4. Sell - June 10, 2024
    let sell = Activity {
        id: "a13ee565-f45f-490d-a2f9-f770c1da0648".to_string(),
        account_id: account_id.to_string(),
        asset_id: asset_id.to_string(),
        activity_type: ActivityType::Sell.as_str().to_string(),
        activity_date: NaiveDateTime::parse_from_str("2024-06-10T00:00:00", "%Y-%m-%dT%H:%M:%S").unwrap(),
        quantity: 10.0,
        unit_price: 196.0,
        fee: 2.0,
        currency: "USD".to_string(),
        is_draft: true,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };
    portfolio.process_activity(&sell, &apple_asset).unwrap();
    assert_eq!(
        portfolio.get_cash_positions().get(account_id).unwrap().get("USD").unwrap(),
        &BigDecimal::from_str("7553").unwrap(),
        "After sell, balance should be $7,553"
    );

    // 5. Dividend - January 1, 2025
    let dividend = Activity {
        id: "53d384a5-c89a-469e-940e-93a14a9e5791".to_string(),
        account_id: account_id.to_string(),
        asset_id: asset_id.to_string(),
        activity_type: ActivityType::Dividend.as_str().to_string(),
        activity_date: NaiveDateTime::parse_from_str("2025-01-01T00:00:00", "%Y-%m-%dT%H:%M:%S").unwrap(),
        quantity: 1.0,
        unit_price: 100.0,
        fee: 0.0,
        currency: "USD".to_string(),
        is_draft: true,
        comment: None,
        created_at: chrono::Utc::now().naive_utc(),
        updated_at: chrono::Utc::now().naive_utc(),
    };
    portfolio.process_activity(&dividend, &apple_asset).unwrap();
    assert_eq!(
        portfolio.get_cash_positions().get(account_id).unwrap().get("USD").unwrap(),
        &BigDecimal::from_str("7653").unwrap(),
        "After dividend, final balance should be $7,653"
    );

    // Verify final holdings
    let holdings = portfolio.get_holdings();
    let stock_holding = holdings.iter().find(|h| h.symbol == asset_id).unwrap();
    assert_eq!(stock_holding.quantity, BigDecimal::from_str("15").unwrap(), "Should have 15 shares left");

    let cash_holding = holdings.iter().find(|h| h.symbol == "$CASH-USD").unwrap();
    assert_eq!(cash_holding.quantity, BigDecimal::from_str("7653").unwrap(), "Cash holding should match cash position");
} 