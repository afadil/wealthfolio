
use wealthfolio_core::account::account_service::AccountService;
use wealthfolio_core::models::NewAccount;
use wealthfolio_core::activity::activity_service::ActivityService;
use wealthfolio_core::models::NewActivity;
use wealthfolio_core::market_data::market_data_service::MarketDataService;
use wealthfolio_core::models::QuoteUpdate;
use wealthfolio_core::portfolio::portfolio_service::PortfolioService;
mod common;

#[test]
fn test_historical_private_asset_portfolio_value(){
	
	// Get a connection to the DB
	let pool = common::get_db_connection_pool().unwrap();
	let mut conn = pool.get().unwrap();

	// Set a base currency
	let base_currency = "CAD";
	let account_service = AccountService::new(base_currency.to_string());

	// Create a new account
	let account =  NewAccount {
		id: Some("RealEstate".to_string()),
		name: "Real Estate".to_string(),
		account_type: "CASH".to_string(),
		group: None,
		currency: base_currency.to_string(),
		is_default: false,
		is_active: true,
		platform_id: None,
	};
	
	let account = tokio_test::block_on(account_service.
		create_account(&mut conn, account)).unwrap();

	// Create a new activity for a new private asset with a value of $900K
	let activity_service = ActivityService::new(base_currency.to_string());

	let activity =  NewActivity {
		id: None,
		account_id: account.id.clone(),
		asset_id: "Condo".to_string(),
		activity_type: "BUY".to_string(),
		activity_date: chrono::DateTime::parse_from_rfc3339("2024-02-01T00:00:00Z").unwrap().to_string(),
		quantity: 1.0,
		unit_price: 900000.0,
		currency: base_currency.to_string(),
		fee: 0.0,
		is_draft: false,
		comment: Some("New condo purchase".to_string()),
	};

	tokio_test::block_on(activity_service
		.create_activity(&mut conn, activity)).unwrap();

	// Add a manual quote for the private asset, valuing it a month after purchase at $1M
	let market_data_service = MarketDataService::new();

	let quote_update = QuoteUpdate {
		date: "2024-03-01".to_string(),
		symbol: "Condo".to_string(),
		open: 1000000.0,
		high: 1000000.0,
		low: 1000000.0,
		volume: 1.0,
		close: 1000000.0,
		data_source: "MANUAL".to_string(),
	};

	tokio_test::block_on(market_data_service).update_quote(&mut conn, quote_update).unwrap();

	// Calculate the historical portfolio value
	let portfolio_service = tokio_test::block_on( PortfolioService::new(base_currency.to_string())).unwrap();
	let account_ids = vec![account.id.clone()];
	tokio_test::block_on(portfolio_service
		.calculate_historical_data(&mut conn, Some(account_ids), false)).unwrap();
	
	// Get the portfolio history
	let account_history = portfolio_service
		.get_portfolio_history(&mut conn, Some(&account.id.clone()))
		.unwrap();
	
	// Get the portfolio value on the day four months after the purchase
	let portfolio_value_on_day = account_history
		.iter()
		.find(|x| x.date == "2024-06-01").unwrap();

	// Check that the portfolio value is $1M
	assert_eq!(portfolio_value_on_day.market_value, 1000000.0);
}