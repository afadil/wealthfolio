use bigdecimal::BigDecimal;
use chrono::Utc;
use crate::{
    models::{Activity, Asset},
    portfolio::{
        holdings_service::Portfolio,
        transaction::{BuyTransaction, ConversionInTransaction, ConversionOutTransaction, DepositTransaction, SellTransaction, SplitTransaction, Transaction, TransferInTransaction, TransferOutTransaction, WithdrawalTransaction},
    },
};

fn create_test_portfolio() -> Portfolio {
    Portfolio::new("USD".to_string())
}

fn create_test_activity(
    activity_type: &str,
    quantity: f64,
    unit_price: f64,
    fee: f64,
    currency: &str,
) -> Activity {
    Activity {
        id: "test".to_string(),
        account_id: "test_account".to_string(),
        asset_id: "test_asset".to_string(),
        activity_type: activity_type.to_string(),
        activity_date: Utc::now().naive_utc(),
        quantity,
        unit_price,
        currency: currency.to_string(),
        fee,
        is_draft: false,
        comment: None,
        created_at: Utc::now().naive_utc(),
        updated_at: Utc::now().naive_utc(),
    }
}

fn create_test_asset() -> Asset {
    Asset {
        id: "test_asset".to_string(),
        isin: None,
        name: Some("Test Asset".to_string()),
        asset_type: Some("STOCK".to_string()),
        symbol: "TEST".to_string(),
        symbol_mapping: None,
        asset_class: Some("Equity".to_string()),
        asset_sub_class: Some("Stock".to_string()),
        notes: None,
        countries: None,
        categories: None,
        classes: None,
        attributes: None,
        created_at: Utc::now().naive_utc(),
        updated_at: Utc::now().naive_utc(),
        currency: "USD".to_string(),
        data_source: "TEST".to_string(),
        sectors: None,
        url: None,
    }
}

mod buy_tests {
    use super::*;

    #[test]
    fn test_buy_transaction() {
        let mut portfolio = create_test_portfolio();
        let activity = create_test_activity("BUY", 10.0, 100.0, 10.0, "USD");
        let asset = create_test_asset();

        let transaction = BuyTransaction;
        transaction.process(&mut portfolio, &activity, &asset).unwrap();

        let holding = portfolio.get_holding_mut("test_account", "test_asset").unwrap();
        assert_eq!(holding.quantity, BigDecimal::from(10));
        assert_eq!(holding.average_cost, Some(BigDecimal::from(100)));
        assert_eq!(holding.book_value, BigDecimal::from(1000));

        let cash = portfolio.cash_positions.get("test_account").unwrap();
        assert_eq!(cash.get("USD").unwrap(), &BigDecimal::from(-1010)); // -1000 - 10 (fee)
    }

    #[test]
    fn test_buy_zero_quantity() {
        let mut portfolio = create_test_portfolio();
        let activity = create_test_activity("BUY", 0.0, 100.0, 10.0, "USD");
        let asset = create_test_asset();

        let result = BuyTransaction.process(&mut portfolio, &activity, &asset);
        assert!(result.is_ok()); // Buying zero shares is allowed, though unusual
    }
}

mod sell_tests {
    use super::*;

    #[test]
    fn test_sell_transaction() {
        let mut portfolio = create_test_portfolio();
        
        // First buy some shares
        let buy_activity = create_test_activity("BUY", 10.0, 100.0, 10.0, "USD");
        let asset = create_test_asset();
        BuyTransaction.process(&mut portfolio, &buy_activity, &asset).unwrap();

        // Then sell half
        let sell_activity = create_test_activity("SELL", 5.0, 120.0, 10.0, "USD");
        SellTransaction.process(&mut portfolio, &sell_activity, &asset).unwrap();

        let holding = portfolio.get_holding_mut("test_account", "test_asset").unwrap();
        assert_eq!(holding.quantity, BigDecimal::from(5));
        assert_eq!(holding.book_value, BigDecimal::from(500));

        let cash = portfolio.cash_positions.get("test_account").unwrap();
        assert_eq!(cash.get("USD").unwrap(), &BigDecimal::from(-420)); // -1010 + (600 - 10)
    }

    #[test]
    fn test_sell_zero_quantity() {
        let mut portfolio = create_test_portfolio();
        let asset = create_test_asset();
        
        // Buy 10 shares
        let buy_activity = create_test_activity("BUY", 10.0, 100.0, 10.0, "USD");
        BuyTransaction.process(&mut portfolio, &buy_activity, &asset).unwrap();

        // Try to sell 0 shares
        let sell_activity = create_test_activity("SELL", 0.0, 120.0, 10.0, "USD");
        let result = SellTransaction.process(&mut portfolio, &sell_activity, &asset);
        assert!(result.is_err());
    }
}

mod cash_transaction_tests {
    use super::*;

    #[test]
    fn test_deposit_transaction() {
        let mut portfolio = create_test_portfolio();
        let activity = create_test_activity("DEPOSIT", 1000.0, 1.0, 10.0, "USD");
        let asset = create_test_asset();

        let transaction = DepositTransaction;
        transaction.process(&mut portfolio, &activity, &asset).unwrap();

        let cash = portfolio.cash_positions.get("test_account").unwrap();
        assert_eq!(cash.get("USD").unwrap(), &BigDecimal::from(990)); // 1000 - 10 (fee)
    }

    #[test]
    fn test_withdrawal_transaction() {
        let mut portfolio = create_test_portfolio();
        
        // First deposit some money
        let deposit_activity = create_test_activity("DEPOSIT", 1000.0, 1.0, 10.0, "USD");
        let asset = create_test_asset();
        DepositTransaction.process(&mut portfolio, &deposit_activity, &asset).unwrap();

        // Then withdraw some
        let withdrawal_activity = create_test_activity("WITHDRAWAL", 500.0, 1.0, 10.0, "USD");
        WithdrawalTransaction.process(&mut portfolio, &withdrawal_activity, &asset).unwrap();

        let cash = portfolio.cash_positions.get("test_account").unwrap();
        assert_eq!(cash.get("USD").unwrap(), &BigDecimal::from(480)); // 990 - (500 + 10)
    }
}

mod transfer_tests {
    use super::*;

    #[test]
    fn test_transfer_in_cash() {
        let mut portfolio = create_test_portfolio();
        let mut activity = create_test_activity("TRANSFER_IN", 1000.0, 1.0, 10.0, "USD");
        activity.asset_id = "$CASH-USD".to_string();
        let asset = create_test_asset();

        TransferInTransaction.process(&mut portfolio, &activity, &asset).unwrap();

        let cash = portfolio.cash_positions.get("test_account").unwrap();
        assert_eq!(cash.get("USD").unwrap(), &BigDecimal::from(990)); // 1000 - 10 (fee)
    }

    #[test]
    fn test_transfer_out_cash() {
        let mut portfolio = create_test_portfolio();
        let asset = create_test_asset();

        // First transfer in some cash
        let mut transfer_in = create_test_activity("TRANSFER_IN", 1000.0, 1.0, 10.0, "USD");
        transfer_in.asset_id = "$CASH-USD".to_string();
        TransferInTransaction.process(&mut portfolio, &transfer_in, &asset).unwrap();

        // Then transfer out some cash
        let mut transfer_out = create_test_activity("TRANSFER_OUT", 500.0, 1.0, 10.0, "USD");
        transfer_out.asset_id = "$CASH-USD".to_string();
        TransferOutTransaction.process(&mut portfolio, &transfer_out, &asset).unwrap();

        let cash = portfolio.cash_positions.get("test_account").unwrap();
        assert_eq!(cash.get("USD").unwrap(), &BigDecimal::from(480)); // 990 - (500 + 10)
    }
}

mod split_tests {
    use super::*;

    #[test]
    fn test_split_transaction() {
        let mut portfolio = create_test_portfolio();
        
        // First buy some shares
        let buy_activity = create_test_activity("BUY", 10.0, 100.0, 10.0, "USD");
        let asset = create_test_asset();
        BuyTransaction.process(&mut portfolio, &buy_activity, &asset).unwrap();

        // Then do a 2:1 split
        let split_activity = create_test_activity("SPLIT", 0.0, 2.0, 0.0, "USD");
        SplitTransaction.process(&mut portfolio, &split_activity, &asset).unwrap();

        let holding = portfolio.get_holding_mut("test_account", "test_asset").unwrap();
        assert_eq!(holding.quantity, BigDecimal::from(20));
        assert_eq!(holding.average_cost, Some(BigDecimal::from(50))); // 100 / 2
    }

    #[test]
    fn test_split_no_holding() {
        let mut portfolio = create_test_portfolio();
        let split_activity = create_test_activity("SPLIT", 0.0, 2.0, 0.0, "USD");
        let asset = create_test_asset();

        // Split on non-existent holding should succeed (no-op)
        let result = SplitTransaction.process(&mut portfolio, &split_activity, &asset);
        assert!(result.is_ok());
    }
}

mod currency_tests {
    use super::*;

    #[test]
    fn test_multiple_currency_transactions() {
        let mut portfolio = create_test_portfolio();
        let asset = create_test_asset();

        // Deposit USD
        let usd_deposit = create_test_activity("DEPOSIT", 1000.0, 1.0, 10.0, "USD");
        DepositTransaction.process(&mut portfolio, &usd_deposit, &asset).unwrap();

        // Deposit EUR
        let eur_deposit = create_test_activity("DEPOSIT", 1000.0, 1.0, 10.0, "EUR");
        DepositTransaction.process(&mut portfolio, &eur_deposit, &asset).unwrap();

        let cash = portfolio.cash_positions.get("test_account").unwrap();
        assert_eq!(cash.get("USD").unwrap(), &BigDecimal::from(990));
        assert_eq!(cash.get("EUR").unwrap(), &BigDecimal::from(990));
    }

    #[test]
    fn test_conversion() {
        let mut portfolio = create_test_portfolio();
        let asset = create_test_asset();

        // Convert USD to EUR
        let conversion_out = create_test_activity("CONVERSION_OUT", 1000.0, 1.0, 10.0, "USD");
        ConversionOutTransaction.process(&mut portfolio, &conversion_out, &asset).unwrap();

        let conversion_in = create_test_activity("CONVERSION_IN", 920.0, 1.0, 10.0, "EUR");
        ConversionInTransaction.process(&mut portfolio, &conversion_in, &asset).unwrap();

        let cash = portfolio.cash_positions.get("test_account").unwrap();
        assert_eq!(cash.get("USD").unwrap(), &BigDecimal::from(-1010)); // -1000 - 10 (fee)
        assert_eq!(cash.get("EUR").unwrap(), &BigDecimal::from(910)); // 920 - 10 (fee)
    }
} 