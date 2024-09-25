use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
use crate::error::{PortfolioError, Result};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{Holding, Performance};
use diesel::SqliteConnection;
use std::collections::{HashMap, HashSet};

pub struct HoldingsService {
    account_service: AccountService,
    activity_service: ActivityService,
    asset_service: AssetService,
    fx_service: CurrencyExchangeService,
    base_currency: String,
}

impl HoldingsService {
    pub async fn new(base_currency: String) -> Self {
        HoldingsService {
            account_service: AccountService::new(base_currency.clone()),
            activity_service: ActivityService::new(base_currency.clone()),
            asset_service: AssetService::new().await,
            fx_service: CurrencyExchangeService::new(),
            base_currency,
        }
    }

    pub fn compute_holdings(&self, conn: &mut SqliteConnection) -> Result<Vec<Holding>> {
        let start_time = std::time::Instant::now();
        let mut holdings: HashMap<String, Holding> = HashMap::new();
        let accounts = self.account_service.get_active_accounts(conn)?;
        let activities = self.activity_service.get_trading_activities(conn)?;
        let assets = self.asset_service.get_assets(conn)?;
        self.fx_service
            .initialize(conn)
            .map_err(|e| PortfolioError::CurrencyConversionError(e.to_string()))?;

        println!(
            "Found {} accounts, {} activities, and {} assets",
            accounts.len(),
            activities.len(),
            assets.len()
        );

        for activity in activities {
            let asset = assets
                .iter()
                .find(|a| a.id == activity.asset_id)
                .ok_or_else(|| PortfolioError::AssetNotFoundError(activity.asset_id.clone()))?;

            let account = accounts
                .iter()
                .find(|a| a.id == activity.account_id)
                .ok_or_else(|| PortfolioError::InvalidDataError("Account not found".to_string()))?;

            let key = format!("{}-{}", activity.account_id, activity.asset_id);

            let holding = holdings.entry(key.clone()).or_insert_with(|| Holding {
                id: key,
                symbol: activity.asset_id.clone(),
                symbol_name: asset.name.clone(),
                holding_type: asset.asset_type.clone().unwrap_or_default(),
                quantity: 0.0,
                currency: activity.currency.clone(),
                base_currency: self.base_currency.clone(),
                market_price: None,
                average_cost: None,
                market_value: 0.0,
                book_value: 0.0,
                market_value_converted: 0.0,
                book_value_converted: 0.0,
                performance: Performance {
                    total_gain_percent: 0.0,
                    total_gain_amount: 0.0,
                    total_gain_amount_converted: 0.0,
                    day_gain_percent: Some(0.0),
                    day_gain_amount: Some(0.0),
                    day_gain_amount_converted: Some(0.0),
                },
                account: Some(account.clone()),
                asset_class: asset.asset_class.clone(),
                asset_sub_class: asset.asset_sub_class.clone(),
                sectors: asset
                    .sectors
                    .clone()
                    .map(|s| serde_json::from_str(&s).unwrap_or_default()),
            });

            match activity.activity_type.as_str() {
                "BUY" => {
                    holding.quantity += activity.quantity;
                    holding.book_value += activity.quantity * activity.unit_price + activity.fee;
                }
                "SELL" => {
                    holding.quantity -= activity.quantity;
                    holding.book_value -= activity.quantity * activity.unit_price + activity.fee;
                }
                _ => println!("Unhandled activity type: {}", activity.activity_type),
            }
        }

        // Collect all unique symbols from holdings
        let unique_symbols: HashSet<String> = holdings
            .values()
            .map(|holding| holding.symbol.clone())
            .collect();

        let symbols: Vec<String> = unique_symbols.into_iter().collect();

        // Fetch quotes for each symbol asynchronously
        let mut quotes = HashMap::new();
        for symbol in symbols {
            match self.asset_service.get_latest_quote(conn, &symbol) {
                Ok(quote) => {
                    quotes.insert(symbol.clone(), quote);
                }
                Err(e) => {
                    eprintln!("Error fetching quote for symbol {}: {}", symbol, e);
                }
            }
        }

        // Post-processing for each holding
        for holding in holdings.values_mut() {
            if let Some(quote) = quotes.get(&holding.symbol) {
                holding.market_price = Some(quote.close);

                // Calculate day gain using quote open and close prices
                let opening_value = holding.quantity * quote.open;
                let closing_value = holding.quantity * quote.close;
                holding.performance.day_gain_amount = Some(closing_value - opening_value);
                holding.performance.day_gain_percent = Some(if opening_value != 0.0 {
                    (closing_value - opening_value) / opening_value * 100.0
                } else {
                    0.0
                });
            }
            holding.average_cost = Some(holding.book_value / holding.quantity);
            holding.market_value = holding.quantity * holding.market_price.unwrap_or(0.0);

            // Get exchange rate for the holding's currency to base currency
            let exchange_rate = match self
                .fx_service
                .get_latest_exchange_rate(&holding.currency, &self.base_currency.clone())
            {
                Ok(rate) => rate,
                Err(e) => {
                    eprintln!(
                        "Error getting exchange rate for {} to {}: {}. Using 1 as default.",
                        holding.currency,
                        self.base_currency.clone(),
                        e
                    );
                    1.0
                }
            };

            holding.market_value_converted = holding.market_value * exchange_rate;
            holding.book_value_converted = holding.book_value * exchange_rate;

            // Calculate performance metrics
            holding.performance.total_gain_amount = holding.market_value - holding.book_value;
            holding.performance.total_gain_percent = if holding.book_value != 0.0 {
                holding.performance.total_gain_amount / holding.book_value * 100.0
            } else {
                0.0
            };
            holding.performance.total_gain_amount_converted =
                holding.performance.total_gain_amount * exchange_rate;

            // Convert day gain to base currency
            if let Some(day_gain_amount) = holding.performance.day_gain_amount {
                holding.performance.day_gain_amount_converted =
                    Some(day_gain_amount * exchange_rate);
            }
        }

        let duration = start_time.elapsed();
        println!("Computed {} holdings in {:?}", holdings.len(), duration);

        Ok(holdings
            .into_values()
            .filter(|holding| holding.quantity > 0.0)
            .collect())
    }
}
