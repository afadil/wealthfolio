use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
use crate::error::{PortfolioError, Result};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{Account, Holding, Performance};
use bigdecimal::BigDecimal;
use bigdecimal::FromPrimitive;
use diesel::SqliteConnection;
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

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
                quantity: BigDecimal::from(0),
                currency: activity.currency.clone(),
                base_currency: self.base_currency.clone(),
                market_price: None,
                average_cost: None,
                market_value: BigDecimal::from(0),
                book_value: BigDecimal::from(0),
                market_value_converted: BigDecimal::from(0),
                book_value_converted: BigDecimal::from(0),
                performance: Performance {
                    total_gain_percent: BigDecimal::from(0),
                    total_gain_amount: BigDecimal::from(0),
                    total_gain_amount_converted: BigDecimal::from(0),
                    day_gain_percent: Some(BigDecimal::from(0)),
                    day_gain_amount: Some(BigDecimal::from(0)),
                    day_gain_amount_converted: Some(BigDecimal::from(0)),
                },
                account: Some(account.clone()),
                asset_class: asset.asset_class.clone(),
                asset_sub_class: asset.asset_sub_class.clone(),
                sectors: asset
                    .sectors
                    .clone()
                    .map(|s| serde_json::from_str(&s).unwrap_or_default()),
                portfolio_percent: None,
            });

            let quantity = BigDecimal::from_str(&activity.quantity.to_string())
                .unwrap()
                .round(6);
            let unit_price = BigDecimal::from_str(&activity.unit_price.to_string())
                .unwrap()
                .round(6);
            let fee = BigDecimal::from_str(&activity.fee.to_string())
                .unwrap()
                .round(6);

            let old_quantity = holding.quantity.clone();
            let old_book_value = holding.book_value.clone();

            match activity.activity_type.as_str() {
                "BUY" => {
                    holding.quantity = (&holding.quantity + &quantity).round(6);
                    holding.book_value =
                        (&holding.book_value + &quantity * &unit_price + &fee).round(6);
                }
                "SELL" => {
                    holding.quantity = (&holding.quantity - &quantity).round(6);
                    // For sell transactions, we should reduce the book value proportionally
                    if old_quantity != BigDecimal::from(0) {
                        let sell_ratio = (&quantity / &old_quantity).round(6);
                        holding.book_value =
                            (&holding.book_value - &sell_ratio * &old_book_value).round(6);
                    }
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
                holding.market_price = Some(BigDecimal::from_f64(quote.close).unwrap().round(6));

                // Calculate market_value in stock currency
                holding.market_value = (&holding.quantity
                    * holding
                        .market_price
                        .clone()
                        .unwrap_or_else(|| BigDecimal::from(0)))
                .round(6);

                // Calculate day gain using quote open and close prices
                let opening_value =
                    (&holding.quantity * BigDecimal::from_f64(quote.open).unwrap()).round(6);
                let closing_value =
                    (&holding.quantity * BigDecimal::from_f64(quote.close).unwrap()).round(6);
                holding.performance.day_gain_amount =
                    Some((&closing_value - &opening_value).round(6));
                holding.performance.day_gain_percent =
                    Some(if opening_value != BigDecimal::from(0) {
                        ((&closing_value - &opening_value) / &opening_value * BigDecimal::from(100))
                            .round(6)
                    } else {
                        BigDecimal::from(0)
                    });
            }

            holding.average_cost = if holding.quantity != BigDecimal::from(0) {
                Some((&holding.book_value / &holding.quantity).round(6))
            } else {
                None
            };

            // Get exchange rate for the holding's currency to base currency
            let exchange_rate = match self
                .fx_service
                .get_latest_exchange_rate(&holding.currency, &self.base_currency.clone())
            {
                Ok(rate) => BigDecimal::from_f64(rate).unwrap(),
                Err(e) => {
                    eprintln!(
                        "Error getting exchange rate for {} to {}: {}. Using 1 as default.",
                        holding.currency,
                        self.base_currency.clone(),
                        e
                    );
                    BigDecimal::from_f64(1.0).unwrap()
                }
            };

            // Calculate market_value_converted in base currency
            holding.market_value_converted = (&holding.market_value * &exchange_rate).round(6);
            holding.book_value_converted = (&holding.book_value * &exchange_rate).round(6);

            // Calculate performance metrics
            holding.performance.total_gain_amount =
                (&holding.market_value - &holding.book_value).round(6);
            holding.performance.total_gain_percent = if holding.book_value != BigDecimal::from(0) {
                (&holding.performance.total_gain_amount / &holding.book_value
                    * BigDecimal::from(100))
                .round(6)
            } else {
                BigDecimal::from(0)
            };
            holding.performance.total_gain_amount_converted =
                (&holding.performance.total_gain_amount * &exchange_rate).round(6);

            // Convert day gain to base currency
            if let Some(day_gain_amount) = holding.performance.day_gain_amount.as_ref() {
                holding.performance.day_gain_amount_converted =
                    Some((day_gain_amount * &exchange_rate).round(6));
            }
        }

        // Aggregate holdings for the TOTAL account
        let mut total_holdings: HashMap<String, Holding> = HashMap::new();

        for holding in holdings.values() {
            let total_key = holding.symbol.clone();
            let total_holding = total_holdings.entry(total_key).or_insert_with(|| Holding {
                id: format!("TOTAL-{}", holding.symbol),
                symbol: holding.symbol.clone(),
                symbol_name: holding.symbol_name.clone(),
                holding_type: holding.holding_type.clone(),
                quantity: BigDecimal::from(0),
                currency: holding.currency.clone(), // Use the original currency
                base_currency: self.base_currency.clone(),
                market_price: None,
                average_cost: None,
                market_value: BigDecimal::from(0),
                book_value: BigDecimal::from(0),
                market_value_converted: BigDecimal::from(0),
                book_value_converted: BigDecimal::from(0),
                performance: Performance::default(),
                account: Some(Account {
                    id: "TOTAL".to_string(),
                    name: "Total Portfolio".to_string(),
                    account_type: "Virtual".to_string(),
                    group: None,
                    currency: self.base_currency.clone(),
                    is_default: false,
                    is_active: true,
                    created_at: chrono::Utc::now().naive_utc(),
                    updated_at: chrono::Utc::now().naive_utc(),
                    platform_id: None,
                }),
                asset_class: holding.asset_class.clone(),
                asset_sub_class: holding.asset_sub_class.clone(),
                sectors: holding.sectors.clone(),
                portfolio_percent: None,
            });

            // Aggregate quantities and values
            total_holding.quantity += &holding.quantity;
            total_holding.market_value += &holding.market_value;
            total_holding.market_value_converted += &holding.market_value_converted;
            total_holding.book_value += &holding.book_value;
            total_holding.book_value_converted += &holding.book_value_converted;
        }

        // Calculate performance metrics for total holdings
        for total_holding in total_holdings.values_mut() {
            total_holding.market_price = Some(if total_holding.quantity != BigDecimal::from(0) {
                (&total_holding.market_value / &total_holding.quantity).round(6)
            } else {
                BigDecimal::from(0)
            });

            total_holding.average_cost = Some(if total_holding.quantity != BigDecimal::from(0) {
                (&total_holding.book_value / &total_holding.quantity).round(6)
            } else {
                BigDecimal::from(0)
            });

            total_holding.performance.total_gain_amount =
                (&total_holding.market_value - &total_holding.book_value).round(6);
            total_holding.performance.total_gain_amount_converted =
                (&total_holding.market_value_converted - &total_holding.book_value_converted)
                    .round(6);

            total_holding.performance.total_gain_percent =
                if total_holding.book_value != BigDecimal::from(0) {
                    (&total_holding.performance.total_gain_amount / &total_holding.book_value
                        * BigDecimal::from(100))
                    .round(6)
                } else {
                    BigDecimal::from(0)
                };

            // Calculate day gain for total holdings
            if let Some(quote) = quotes.get(&total_holding.symbol) {
                let opening_value =
                    (&total_holding.quantity * BigDecimal::from_f64(quote.open).unwrap()).round(6);
                let closing_value =
                    (&total_holding.quantity * BigDecimal::from_f64(quote.close).unwrap()).round(6);

                total_holding.performance.day_gain_amount =
                    Some((&closing_value - &opening_value).round(6));

                total_holding.performance.day_gain_percent =
                    Some(if opening_value != BigDecimal::from(0) {
                        ((&closing_value - &opening_value) / &opening_value * BigDecimal::from(100))
                            .round(6)
                    } else {
                        BigDecimal::from(0)
                    });

                // Convert day gain to base currency
                let exchange_rate = match self
                    .fx_service
                    .get_latest_exchange_rate(&total_holding.currency, &self.base_currency.clone())
                {
                    Ok(rate) => BigDecimal::from_f64(rate).unwrap(),
                    Err(e) => {
                        eprintln!(
                            "Error getting exchange rate for {} to {}: {}. Using 1 as default.",
                            total_holding.currency,
                            self.base_currency.clone(),
                            e
                        );
                        BigDecimal::from_f64(1.0).unwrap()
                    }
                };
                total_holding.performance.day_gain_amount_converted = total_holding
                    .performance
                    .day_gain_amount
                    .as_ref()
                    .map(|amount| (amount * &exchange_rate).round(6));
            }
        }

        // Calculate total portfolio value
        let total_portfolio_value: BigDecimal = total_holdings
            .values()
            .map(|h| &h.market_value_converted)
            .sum();

        // Calculate portfolio percentage for each total holding
        for total_holding in total_holdings.values_mut() {
            if total_portfolio_value != BigDecimal::from(0) {
                total_holding.portfolio_percent = Some(
                    (&total_holding.market_value_converted / &total_portfolio_value
                        * BigDecimal::from(100))
                    .round(2),
                );
            } else {
                total_holding.portfolio_percent = Some(BigDecimal::from(0));
            }
        }

        // Combine individual holdings with total holdings
        let mut all_holdings: Vec<Holding> = holdings.into_values().collect();
        all_holdings.extend(total_holdings.into_values());

        // When filtering holdings, use a small threshold for comparison
        let threshold = BigDecimal::from_str("0.000001").unwrap();

        let filtered_holdings: Vec<_> = all_holdings
            .into_iter()
            .filter(|holding| holding.quantity.abs() > threshold)
            .collect();

        Ok(filtered_holdings)
    }
}
