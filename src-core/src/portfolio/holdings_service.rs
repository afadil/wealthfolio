use crate::accounts::Account;
use crate::activities::ActivityService;
use crate::assets::AssetError;
use crate::assets::AssetService;
use crate::assets::Asset;
use crate::errors::{ Error, Result, ValidationError};
use crate::fx::FxService;
use crate::market_data::MarketDataService;
use crate::market_data::Quote;
use crate::models::{ Holding, Performance};
use crate::portfolio::transaction::get_transaction_handler;
use crate::{Activity, ActivityType};
use rust_decimal::Decimal;
use diesel::SqliteConnection;
use diesel::r2d2::{Pool, ConnectionManager};
use log::error;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

const ROUNDING_SCALE: u32 = 6;
const PORTFOLIO_PERCENT_SCALE: u32 = 2;
const QUANTITY_THRESHOLD: &str = "0.0000001";
const PORTFOLIO_ACCOUNT_ID: &str = "TOTAL";

impl Holding {
    pub fn add_position(&mut self, quantity: Decimal, price: Decimal) {
        let position_value = quantity * price;
        let old_value = self.quantity * self.average_cost.unwrap_or_default();
        let new_value = old_value + position_value;

        self.quantity = self.quantity + quantity;

        if self.quantity != Decimal::ZERO {
            self.average_cost = Some(new_value / self.quantity);
        }
        self.book_value = self.book_value + position_value;
        // Don't update book_value_converted here - will be handled by update_converted_values
    }

    pub fn reduce_position(&mut self, quantity: Decimal) -> Result<()> {
        if quantity <= Decimal::ZERO {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Quantity to reduce must be positive".to_string(),
            )));
        }
        if !Portfolio::is_quantity_significant(&self.quantity) {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Cannot reduce position with zero quantity".to_string(),
            )));
        }

        let sell_ratio = quantity / self.quantity;
        let book_value_reduction = self.book_value * sell_ratio;

        self.quantity = self.quantity - quantity;
        self.book_value = self.book_value - book_value_reduction;
        // Don't update book_value_converted here - will be handled by update_converted_values

        if !Portfolio::is_quantity_significant(&self.quantity) {
            self.quantity = Decimal::ZERO;
            self.average_cost = None;
            self.book_value = Decimal::ZERO;
            self.book_value_converted = Decimal::ZERO;
        }

        Ok(())
    }
    
    // New method to centralize currency conversion
    pub fn update_converted_values(&mut self, exchange_rate: Decimal) {
        self.book_value_converted = self.book_value * exchange_rate;
        
        if self.holding_type.to_uppercase() == "CASH" {
            self.market_value = self.quantity;
            self.book_value = self.quantity;
            self.market_value_converted = self.market_value * exchange_rate;
            return;
        }
        
        if let Some(market_price) = self.market_price {
            self.market_value = self.quantity * market_price;
            self.market_value_converted = self.market_value * exchange_rate;
            
            // Update performance metrics
            if let Some(day_gain) = self.performance.day_gain_amount {
                self.performance.day_gain_amount_converted = Some(day_gain * exchange_rate);
            }
            
            if self.book_value != Decimal::ZERO {
                self.performance.total_gain_amount = self.market_value - self.book_value;
                self.performance.total_gain_amount_converted = self.market_value_converted - self.book_value_converted;
            }
        }
    }
}

#[derive(Debug)]
pub struct Portfolio {
    pub holdings: HashMap<String, HashMap<String, Holding>>, // account_id -> asset_id -> Holding
    pub cash_positions: HashMap<String, HashMap<String, Decimal>>, // account_id -> currency -> amount
    pub base_currency: String,
}

pub struct HoldingsService {
    activity_service: ActivityService,
    asset_service: AssetService,
    fx_service: FxService,
    market_data_service: MarketDataService,
    base_currency: String,
}

impl Portfolio {
    pub fn new(base_currency: String) -> Self {
        Portfolio {
            holdings: HashMap::new(),
            cash_positions: HashMap::new(),
            base_currency,
        }
    }

    pub fn is_quantity_significant(quantity: &Decimal) -> bool {
        quantity.abs() >= Decimal::from_str(QUANTITY_THRESHOLD).unwrap_or_default()
    }

    pub fn remove_holding(&mut self, account_id: &str, asset_id: &str) {
        if let Some(holdings) = self.holdings.get_mut(account_id) {
            holdings.remove(asset_id);
            // Remove empty account holdings map
            if holdings.is_empty() {
                self.holdings.remove(account_id);
            }
        }
    }

    pub fn adjust_cash(&mut self, account_id: &str, currency: &str, amount: Decimal) {
        let account_cash = self
            .cash_positions
            .entry(account_id.to_string())
            .or_default();
        let balance = account_cash
            .entry(currency.to_string())
            .or_insert(Decimal::ZERO);
        *balance = *balance + amount;
    }

    pub fn process_activity(
        &mut self,
        activity: &Activity,
        asset: &Asset,
    ) -> Result<()> {
        let activity_type = ActivityType::from_str(&activity.activity_type)
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e)))?;
        let transaction = get_transaction_handler(activity_type);
        transaction.process(self, activity, asset)
    }

    pub fn get_holding_mut(&mut self, account_id: &str, asset_id: &str) -> Option<&mut Holding> {
        self.holdings
            .get_mut(account_id)
            .and_then(|holdings| holdings.get_mut(asset_id))
    }

    pub fn get_or_create_holding(
        &mut self,
        account_id: &str,
        asset_id: &str,
        activity: &Activity,
        asset: &Asset,
    ) -> &mut Holding {
        let account_holdings = self.holdings.entry(account_id.to_string()).or_default();

        account_holdings
            .entry(asset_id.to_string())
            .or_insert_with(|| Holding {
                id: format!("{}-{}", account_id, asset_id),
                symbol: asset_id.to_string(),
                symbol_name: asset.name.clone(),
                holding_type: asset.asset_type.clone().unwrap_or_default(),
                currency: activity.currency.clone(),
                base_currency: self.base_currency.clone(),
                asset_class: asset.asset_class.clone(),
                asset_sub_class: asset.asset_sub_class.clone(),
                asset_data_source: Some(asset.data_source.clone()),
                sectors: asset
                    .sectors
                    .clone()
                    .and_then(|s| serde_json::from_str(&s).ok()),
                countries: asset
                    .countries
                    .clone()
                    .and_then(|c| serde_json::from_str(&c).ok()),
                account: Some(Account {
                    id: account_id.to_string(),
                    name: format!("Account {}", account_id),
                    account_type: "UNKNOWN".to_string(),
                    group: None,
                    currency: activity.currency.clone(),
                    is_default: false,
                    is_active: true,
                    created_at: chrono::Utc::now().naive_utc(),
                    updated_at: chrono::Utc::now().naive_utc(),
                    platform_id: None,
                }),
                ..Default::default()
            })
    }

    pub fn update_market_prices(
        &mut self,
        quotes: &HashMap<String, Quote>,
        fx_service: &FxService,
    ) -> Result<()> {
        // First update all market prices
        for (_, account_holdings) in self.holdings.iter_mut() {
            for (_, holding) in account_holdings.iter_mut() {
                // Skip market price update for cash holdings
                if holding.holding_type.to_uppercase() == "CASH" {
                    continue;
                }

                if let Some(quote) = quotes.get(&holding.symbol) {
                    let market_price = Decimal::from_str(&quote.close.to_string())?;
                    holding.market_price = Some(market_price);
                    
                    // Calculate day gain without converted values yet
                    let opening_value = holding.quantity * Decimal::from_str(&quote.open.to_string())?;
                    let closing_value = holding.quantity * market_price;
                    holding.performance.day_gain_amount = Some(closing_value - opening_value);
                    
                    if opening_value != Decimal::ZERO {
                        holding.performance.day_gain_percent = Some((closing_value - opening_value) / opening_value * Decimal::ONE_HUNDRED);
                    }
                }
            }
        }
        
        // Then update all converted values in a separate pass
        self.update_converted_values(fx_service)?;
        
        Ok(())
    }

    // New method to centralize all currency conversion
    pub fn update_converted_values(&mut self, fx_service: &FxService) -> Result<()> {
        for (_, account_holdings) in self.holdings.iter_mut() {
            for (_, holding) in account_holdings.iter_mut() {
                // Get the exchange rate for converting to base currency
                let exchange_rate = fx_service
                    .get_latest_exchange_rate(&holding.currency, &self.base_currency)
                    .unwrap_or_else(|_| {
                        // Log an error when exchange rate isn't found
                        error!("Exchange rate not found for {}->{}, using 1.0", 
                              holding.currency, self.base_currency);
                        Decimal::ONE
                    });
                
                // Use the centralized method to update all converted values
                holding.update_converted_values(exchange_rate);
            }
        }
        Ok(())
    }

    pub fn get_holdings(&self) -> Vec<Holding> {
        let mut holdings = self
            .holdings
            .values()
            .flat_map(|account_holdings| account_holdings.values().cloned())
            .collect::<Vec<_>>();

        // Add cash holdings
        holdings.extend(self.get_cash_holdings());

        holdings
    }

    #[allow(dead_code)]
    pub fn get_cash_positions(&self) -> &HashMap<String, HashMap<String, Decimal>> {
        &self.cash_positions
    }

    pub fn get_total_portfolio(&self) -> Vec<Holding> {
        let mut total_by_symbol: HashMap<String, Holding> = HashMap::new();

        // Aggregate holdings by symbol across all accounts
        for account_holdings in self.holdings.values() {
            for holding in account_holdings.values() {
                let total = total_by_symbol
                    .entry(holding.symbol.clone())
                    .or_insert_with(|| Holding {
                        id: format!("{}-{}", PORTFOLIO_ACCOUNT_ID, holding.symbol),
                        symbol: holding.symbol.clone(),
                        symbol_name: holding.symbol_name.clone(),
                        holding_type: holding.holding_type.clone(),
                        currency: holding.currency.clone(),
                        base_currency: self.base_currency.clone(),
                        market_price: holding.market_price.clone(),
                        asset_class: holding.asset_class.clone(),
                        asset_sub_class: holding.asset_sub_class.clone(),
                        asset_data_source: holding.asset_data_source.clone(),
                        sectors: holding.sectors.clone(),
                        countries: holding.countries.clone(),
                        account: Some(Account {
                            id: PORTFOLIO_ACCOUNT_ID.to_string(),
                            name: "Total Portfolio".to_string(),
                            account_type: "PORTFOLIO".to_string(),
                            group: None,
                            currency: self.base_currency.clone(),
                            is_default: false,
                            is_active: true,
                            created_at: chrono::Utc::now().naive_utc(),
                            updated_at: chrono::Utc::now().naive_utc(),
                            platform_id: None,
                        }),
                        ..Default::default()
                    });

                total.quantity = (total.quantity + holding.quantity).round_dp(ROUNDING_SCALE);
                total.market_value = (total.market_value + holding.market_value).round_dp(ROUNDING_SCALE);
                total.book_value = (total.book_value + holding.book_value).round_dp(ROUNDING_SCALE);
                total.market_value_converted = (total.market_value_converted + holding.market_value_converted).round_dp(ROUNDING_SCALE);
                total.book_value_converted = (total.book_value_converted + holding.book_value_converted).round_dp(ROUNDING_SCALE);

                if let Some(day_gain) = &holding.performance.day_gain_amount {
                    total.performance.day_gain_amount = Some((total.performance.day_gain_amount.unwrap_or_default() + day_gain).round_dp(ROUNDING_SCALE));
                }
                if let Some(day_gain_converted) = &holding.performance.day_gain_amount_converted {
                    total.performance.day_gain_amount_converted = Some((total.performance.day_gain_amount_converted.unwrap_or_default() + day_gain_converted).round_dp(ROUNDING_SCALE));
                }
            }
        }

        // Add cash positions
        let mut total_cash: HashMap<String, Decimal> = HashMap::new();
        for currencies in self.cash_positions.values() {
            for (currency, amount) in currencies {
                // Only include positive cash balances
                if *amount > Decimal::ZERO {
                    *total_cash.entry(currency.clone()).or_default() += amount;
                }
            }
        }

        // Add total cash positions as holdings
        for (currency, amount) in total_cash {
            total_by_symbol.insert(
                format!("$CASH-{}", currency),
                Holding {
                    id: format!("{}-$CASH-{}", PORTFOLIO_ACCOUNT_ID, currency),
                    symbol: format!("$CASH-{}", currency),
                    symbol_name: Some(format!("Cash {}", currency)),
                    holding_type: "CASH".to_string(),
                    quantity: amount,
                    currency: currency.clone(),
                    base_currency: self.base_currency.clone(),
                    market_price: Some(Decimal::ONE),
                    average_cost: Some(Decimal::ONE),
                    market_value: amount,
                    book_value: amount,
                    market_value_converted: amount,
                    book_value_converted: amount,
                    performance: Performance::default(),
                    account: Some(Account {
                        id: PORTFOLIO_ACCOUNT_ID.to_string(),
                        name: "Total Portfolio".to_string(),
                        account_type: "PORTFOLIO".to_string(),
                        group: None,
                        currency: self.base_currency.clone(),
                        is_default: false,
                        is_active: true,
                        created_at: chrono::Utc::now().naive_utc(),
                        updated_at: chrono::Utc::now().naive_utc(),
                        platform_id: None,
                    }),
                    asset_class: Some("CASH".to_string()),
                    asset_sub_class: Some("CASH".to_string()),
                    asset_data_source: None,
                    sectors: None,
                    countries: None,
                    portfolio_percent: None,
                },
            );
        }

        // Calculate performance metrics for each total holding
        let mut total_holdings: Vec<Holding> = total_by_symbol.into_values().collect();
        let total_portfolio_value: Decimal = total_holdings
            .iter()
            .map(|h| &h.market_value_converted)
            .sum();

        for total in &mut total_holdings {
            // Calculate portfolio percentage
            if total_portfolio_value != Decimal::ZERO {
                total.portfolio_percent = Some((total.market_value_converted / total_portfolio_value * Decimal::ONE_HUNDRED).round_dp(PORTFOLIO_PERCENT_SCALE));
            }

            // Calculate average cost
            if total.quantity != Decimal::ZERO {
                total.average_cost = Some((total.book_value / total.quantity).round_dp(ROUNDING_SCALE));
            }

            // Calculate performance metrics
            if total.book_value != Decimal::ZERO {
                total.performance.total_gain_amount = total.market_value - total.book_value;
                total.performance.total_gain_amount_converted = total.market_value_converted - total.book_value_converted;
                total.performance.total_gain_percent = ((total.market_value / total.book_value - Decimal::ONE) * Decimal::ONE_HUNDRED).round_dp(ROUNDING_SCALE);
            }

            if let Some(day_gain) = &total.performance.day_gain_amount {
                if total.market_value != Decimal::ZERO {
                    total.performance.day_gain_percent = Some((day_gain / (total.market_value - day_gain)) * Decimal::ONE_HUNDRED);
                }
            }
        }

        total_holdings
    }

    fn get_cash_holdings(&self) -> Vec<Holding> {
        let mut cash_holdings = Vec::new();

        // Convert cash positions to holdings
        for (account_id, currencies) in &self.cash_positions {
            for (currency, amount) in currencies {
                let amount = amount.clone();
                // Skip negative cash balances to match history service behavior
                if amount <= Decimal::ZERO {
                    continue;
                }
                
                let holding = Holding {
                    id: format!("{}-$CASH-{}", account_id, currency),
                    symbol: format!("$CASH-{}", currency),
                    symbol_name: Some(format!("Cash {}", currency)),
                    holding_type: "CASH".to_string(),
                    quantity: amount.clone(),
                    currency: currency.clone(),
                    base_currency: self.base_currency.clone(),
                    market_price: Some(Decimal::ONE),
                    average_cost: Some(Decimal::ONE),
                    market_value: amount.clone(),
                    book_value: amount.clone(),
                    market_value_converted: amount.clone(),
                    book_value_converted: amount,
                    performance: Performance::default(),
                    account: Some(Account {
                        id: account_id.clone(),
                        name: format!("Account {}", account_id),
                        account_type: "CASH".to_string(),
                        group: None,
                        currency: currency.clone(),
                        is_default: false,
                        is_active: true,
                        created_at: chrono::Utc::now().naive_utc(),
                        updated_at: chrono::Utc::now().naive_utc(),
                        platform_id: None,
                    }),
                    asset_class: Some("Cash".to_string()),
                    asset_sub_class: None,
                    asset_data_source: None,
                    sectors: None,
                    countries: None,
                    portfolio_percent: None,
                };
                cash_holdings.push(holding);
            }
        }

        cash_holdings
    }
}

impl HoldingsService {
     pub async fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, base_currency: String) -> Result<Self> {
        let fx_service = FxService::new(pool.clone());
        let activity_service = ActivityService::new(pool.clone(), base_currency.clone()).await
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))?;
        let asset_service = AssetService::new(pool.clone()).await
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))?;
        let market_data_service = MarketDataService::new(pool.clone()).await?;

        Ok(HoldingsService {
            activity_service,
            asset_service,
            fx_service,
            market_data_service,
            base_currency,
        })
    }

    /// Computes all holdings including totals
    pub async fn compute_holdings(&self) -> Result<Vec<Holding>> {
    
        // Load data
        let activities = self.activity_service.get_activities()?;
        let assets = self.asset_service.get_assets()?;

        // Create lookup maps for better performance
        let assets_map: HashMap<_, _> = assets.iter().map(|a| (&a.id, a)).collect();

        // Initialize FX service
        self.fx_service.initialize()?;

        // Create portfolio
        let mut portfolio = Portfolio::new(self.base_currency.clone());

        // Process activities in batches for better performance
        for activities_chunk in activities.chunks(1000) {
            for activity in activities_chunk {
                let asset = match self.get_asset_for_activity(&assets_map, activity) {
                    Ok(asset) => asset,
                    Err(e) => {
                        error!("Error getting asset for activity: {}", e);
                        continue;
                    }
                };

                if let Err(e) = portfolio.process_activity(activity, asset) {
                    error!("Error processing activity: {}", e);
                }
            }
        }

        // Get holdings before updating prices to optimize quote fetching
        let holdings = portfolio.get_holdings();

        // Skip price update if no holdings
        if !holdings.is_empty() {
            // Update market prices
            let quotes = self.market_data_service.get_latest_quotes_for_symbols(&holdings.iter().map(|h| h.symbol.clone()).collect::<Vec<_>>())?;
            portfolio.update_market_prices(&quotes, &self.fx_service)?;
        }

        // Get final holdings including totals
        let mut final_holdings = portfolio.get_holdings();
        final_holdings.extend(portfolio.get_total_portfolio());

        // Filter out insignificant quantities before returning
        final_holdings.retain(|h| Portfolio::is_quantity_significant(&h.quantity));

        Ok(final_holdings)
    }


    fn get_asset_for_activity<'a>(
        &self,
        assets_map: &'a HashMap<&String, &'a Asset>,
        activity: &Activity,
    ) -> Result<&'a Asset> {
        assets_map
            .get(&activity.asset_id)
            .copied()
            .ok_or_else(|| Error::from(AssetError::NotFound(activity.asset_id.clone())))
    }

}