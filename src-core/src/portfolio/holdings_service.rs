use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
use crate::errors::{AssetError, CurrencyError, Error, Result, ValidationError};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{Account, Activity, Asset, Holding, Performance, Quote};
use bigdecimal::BigDecimal;
use diesel::SqliteConnection;
use log::{error, warn};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

/// Type alias for the composite key used in holdings maps
type HoldingKey = (String, String); // (account_id, asset_id)

/// Constants for business logic
const ROUNDING_SCALE: i64 = 6;
const PORTFOLIO_PERCENT_SCALE: i64 = 2;
const QUANTITY_THRESHOLD: &str = "0.000001";

/// Service for managing portfolio holdings
pub struct HoldingsService {
    account_service: AccountService,
    activity_service: ActivityService,
    asset_service: AssetService,
    fx_service: CurrencyExchangeService,
    base_currency: String,
}

/// Core service implementation
impl HoldingsService {
    pub async fn new(base_currency: String) -> Self {
        Self {
            account_service: AccountService::new(base_currency.clone()),
            activity_service: ActivityService::new(base_currency.clone()),
            asset_service: AssetService::new().await,
            fx_service: CurrencyExchangeService::new(),
            base_currency,
        }
    }

    /// Computes all holdings including totals
    pub fn compute_holdings(&self, conn: &mut SqliteConnection) -> Result<Vec<Holding>> {
        // Load required data
        let (accounts, activities, assets) = self.load_required_data(conn)?;

        // Initialize FX service
        self.fx_service
            .initialize(conn)
            .map_err(|e| Error::Currency(CurrencyError::ConversionFailed(e.to_string())))?;

        // Process holdings
        let mut holdings = self.aggregate_holdings(&accounts, &activities, &assets)?;
        let quotes = self.fetch_quotes(conn, &holdings)?;

        // Calculate metrics
        self.calculate_holding_metrics(&mut holdings, &quotes)?;
        self.calculate_total_holdings(&mut holdings)?;

        // Filter and return
        Ok(self.filter_holdings(holdings))
    }

    /// Loads all required data for holdings computation
    fn load_required_data(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<(Vec<Account>, Vec<Activity>, Vec<Asset>)> {
        Ok((
            self.account_service.get_active_accounts(conn)?,
            self.activity_service.get_trading_activities(conn)?,
            self.asset_service.get_assets(conn)?,
        ))
    }
}

/// Holdings aggregation implementation
impl HoldingsService {
    fn aggregate_holdings(
        &self,
        accounts: &[Account],
        activities: &[Activity],
        assets: &[Asset],
    ) -> Result<HashMap<HoldingKey, Holding>> {
        let mut holdings = HashMap::new();
        let assets_map: HashMap<_, _> = assets.iter().map(|a| (&a.id, a)).collect();
        let accounts_map: HashMap<_, _> = accounts.iter().map(|a| (&a.id, a)).collect();

        for activity in activities {
            let asset = self.get_asset_for_activity(&assets_map, activity)?;
            let account = self.get_account_for_activity(&accounts_map, activity)?;

            let key = (activity.account_id.clone(), activity.asset_id.clone());
            let holding = holdings
                .entry(key.clone())
                .or_insert_with(|| self.create_holding(&key, activity, asset, account));

            self.update_holding(holding, activity)?;
        }

        Ok(holdings)
    }

    fn get_asset_for_activity<'a>(
        &self,
        assets_map: &'a HashMap<&String, &'a Asset>,
        activity: &Activity,
    ) -> Result<&'a Asset> {
        assets_map
            .get(&activity.asset_id)
            .copied()
            .ok_or_else(|| Error::Asset(AssetError::NotFound(activity.asset_id.clone())))
    }

    fn get_account_for_activity<'a>(
        &self,
        accounts_map: &'a HashMap<&String, &'a Account>,
        activity: &Activity,
    ) -> Result<&'a Account> {
        accounts_map
            .get(&activity.account_id)
            .copied()
            .ok_or_else(|| {
                Error::Validation(ValidationError::InvalidInput(
                    "Account not found".to_string(),
                ))
            })
    }
}

/// Quote handling implementation
impl HoldingsService {
    fn fetch_quotes(
        &self,
        conn: &mut SqliteConnection,
        holdings: &HashMap<HoldingKey, Holding>,
    ) -> Result<HashMap<String, Quote>> {
        let unique_symbols: HashSet<String> = holdings
            .values()
            .map(|h| h.symbol.clone())
            .filter(|symbol| !symbol.starts_with("$CASH-"))
            .collect();

        match self
            .asset_service
            .get_latest_quotes(conn, &unique_symbols.into_iter().collect::<Vec<_>>())
        {
            Ok(quotes) => Ok(quotes),
            Err(e) => {
                error!("Error fetching quotes: {}", e);
                Ok(HashMap::new()) // Return empty map to allow processing to continue
            }
        }
    }
}

/// Holding creation and updates implementation
impl HoldingsService {
    fn create_holding(
        &self,
        key: &HoldingKey,
        activity: &Activity,
        asset: &Asset,
        account: &Account,
    ) -> Holding {
        Holding {
            id: format!("{}-{}", key.0, key.1),
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
            performance: Performance::default(),
            account: Some(account.clone()),
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
            portfolio_percent: None,
        }
    }

    fn update_holding(&self, holding: &mut Holding, activity: &Activity) -> Result<()> {
        let quantity = BigDecimal::from_str(&activity.quantity.to_string())?;
        let unit_price = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;

        match activity.activity_type.as_str() {
            "BUY" | "TRANSFER_IN" => {
                self.process_buy_activity(holding, &quantity, &unit_price, &fee)
            }
            "SELL" | "TRANSFER_OUT" => self.process_sell_activity(holding, &quantity),
            "SPLIT" => self.process_split_activity(
                holding,
                unit_price.to_string().parse::<f64>().unwrap_or(0.0),
            )?,
            _ => warn!("Unhandled activity type: {}", activity.activity_type),
        }

        holding.quantity = holding.quantity.round(ROUNDING_SCALE);
        holding.book_value = holding.book_value.round(ROUNDING_SCALE);

        Ok(())
    }

    fn process_buy_activity(
        &self,
        holding: &mut Holding,
        quantity: &BigDecimal,
        unit_price: &BigDecimal,
        fee: &BigDecimal,
    ) {
        holding.quantity += quantity;
        holding.book_value += quantity * unit_price + fee;
    }

    fn process_sell_activity(&self, holding: &mut Holding, quantity: &BigDecimal) {
        let old_quantity = holding.quantity.clone();
        let old_book_value = holding.book_value.clone();

        holding.quantity -= quantity;
        if old_quantity != BigDecimal::from(0) {
            let sell_ratio = (quantity / &old_quantity).round(ROUNDING_SCALE);
            holding.book_value -= &sell_ratio * &old_book_value;
        }
    }

    fn process_split_activity(&self, holding: &mut Holding, split_ratio: f64) -> Result<()> {
        if split_ratio == 0.0 {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Invalid split ratio".to_string(),
            )));
        }

        let ratio = BigDecimal::from_str(&split_ratio.to_string())?;
        holding.quantity *= &ratio;
        if let Some(avg_cost) = holding.average_cost.as_mut() {
            *avg_cost = avg_cost.clone() / &ratio;
        }
        Ok(())
    }
}

/// Metrics calculation implementation
impl HoldingsService {
    fn calculate_holding_metrics(
        &self,
        holdings: &mut HashMap<HoldingKey, Holding>,
        quotes: &HashMap<String, Quote>,
    ) -> Result<()> {
        for holding in holdings.values_mut() {
            if let Some(quote) = quotes.get(&holding.symbol) {
                self.update_holding_with_quote(holding, quote)?;
            }

            self.calculate_average_cost(holding);
            self.convert_to_base_currency(holding)?;
            self.calculate_performance_metrics(holding);
        }

        Ok(())
    }

    fn update_holding_with_quote(&self, holding: &mut Holding, quote: &Quote) -> Result<()> {
        holding.market_price =
            Some(BigDecimal::from_str(&quote.close.to_string())?.round(ROUNDING_SCALE));
        holding.market_value = (&holding.quantity
            * holding
                .market_price
                .as_ref()
                .unwrap_or(&BigDecimal::from(0)))
        .round(ROUNDING_SCALE);

        self.calculate_day_gain(holding, quote)?;
        Ok(())
    }

    fn calculate_day_gain(&self, holding: &mut Holding, quote: &Quote) -> Result<()> {
        let opening_value = (&holding.quantity * BigDecimal::from_str(&quote.open.to_string())?)
            .round(ROUNDING_SCALE);
        let closing_value = (&holding.quantity * BigDecimal::from_str(&quote.close.to_string())?)
            .round(ROUNDING_SCALE);

        holding.performance.day_gain_amount =
            Some((&closing_value - &opening_value).round(ROUNDING_SCALE));
        holding.performance.day_gain_percent = Some(if opening_value != BigDecimal::from(0) {
            ((&closing_value - &opening_value) / &opening_value * BigDecimal::from(100))
                .round(ROUNDING_SCALE)
        } else {
            BigDecimal::from(0)
        });

        Ok(())
    }

    fn calculate_average_cost(&self, holding: &mut Holding) {
        holding.average_cost = if holding.quantity != BigDecimal::from(0) {
            Some((&holding.book_value / &holding.quantity).round(ROUNDING_SCALE))
        } else {
            None
        };
    }

    fn convert_to_base_currency(&self, holding: &mut Holding) -> Result<()> {
        let account_currency = holding
            .account
            .as_ref()
            .map(|a| &a.currency)
            .unwrap_or(&self.base_currency);

        let exchange_rate = self.get_exchange_rate(&holding.currency, account_currency)?;

        holding.market_value_converted =
            (&holding.market_value * &exchange_rate).round(ROUNDING_SCALE);
        holding.book_value_converted = (&holding.book_value * &exchange_rate).round(ROUNDING_SCALE);

        if let Some(day_gain_amount) = holding.performance.day_gain_amount.as_ref() {
            holding.performance.day_gain_amount_converted =
                Some((day_gain_amount * &exchange_rate).round(ROUNDING_SCALE));
        }

        Ok(())
    }

    fn get_exchange_rate(&self, from_currency: &str, to_currency: &str) -> Result<BigDecimal> {
        self.fx_service
            .get_latest_exchange_rate(from_currency, to_currency)
            .map_err(|e| Error::Currency(CurrencyError::ConversionFailed(e.to_string())))
            .and_then(|rate| {
                BigDecimal::from_str(&rate.to_string()).map_err(|_| {
                    Error::Validation(ValidationError::InvalidInput(
                        "Invalid exchange rate".to_string(),
                    ))
                })
            })
    }

    fn calculate_performance_metrics(&self, holding: &mut Holding) {
        holding.performance.total_gain_amount =
            (&holding.market_value - &holding.book_value).round(ROUNDING_SCALE);
        holding.performance.total_gain_amount_converted =
            (&holding.market_value_converted - &holding.book_value_converted).round(ROUNDING_SCALE);

        holding.performance.total_gain_percent = if holding.book_value != BigDecimal::from(0) {
            (&holding.performance.total_gain_amount / &holding.book_value * BigDecimal::from(100))
                .round(ROUNDING_SCALE)
        } else {
            BigDecimal::from(0)
        };
    }
}

/// Total holdings calculation implementation
impl HoldingsService {
    fn calculate_total_holdings(&self, holdings: &mut HashMap<HoldingKey, Holding>) -> Result<()> {
        let mut total_holdings = HashMap::new();

        // Aggregate totals
        for holding in holdings.values() {
            let total_key = (holding.symbol.clone(), "TOTAL".to_string());
            let total_holding = total_holdings
                .entry(total_key)
                .or_insert_with(|| self.create_total_holding(holding));

            self.aggregate_total_holding(total_holding, holding);
        }

        // Calculate metrics for totals
        self.calculate_total_holding_metrics(&mut total_holdings)?;

        // Merge totals into main holdings
        holdings.extend(total_holdings);

        Ok(())
    }

    fn create_total_holding(&self, holding: &Holding) -> Holding {
        Holding {
            id: format!("TOTAL-{}", holding.symbol),
            symbol: holding.symbol.clone(),
            symbol_name: holding.symbol_name.clone(),
            holding_type: holding.holding_type.clone(),
            quantity: BigDecimal::from(0),
            currency: holding.currency.clone(),
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
            asset_data_source: holding.asset_data_source.clone(),
            sectors: holding.sectors.clone(),
            countries: holding.countries.clone(),
            portfolio_percent: None,
        }
    }

    fn aggregate_total_holding(&self, total: &mut Holding, holding: &Holding) {
        total.quantity += &holding.quantity;
        total.market_value += &holding.market_value;
        total.market_value_converted += &holding.market_value_converted;
        total.book_value += &holding.book_value;
        total.book_value_converted += &holding.book_value_converted;

        self.aggregate_day_gains(total, holding);
    }

    fn aggregate_day_gains(&self, total: &mut Holding, holding: &Holding) {
        if let Some(day_gain_amount) = &holding.performance.day_gain_amount {
            total.performance.day_gain_amount =
                Some(total.performance.day_gain_amount.as_ref().map_or_else(
                    || day_gain_amount.clone(),
                    |total_gain| (total_gain + day_gain_amount).round(ROUNDING_SCALE),
                ));
        }

        if let Some(day_gain_amount_converted) = &holding.performance.day_gain_amount_converted {
            total.performance.day_gain_amount_converted = Some(
                total
                    .performance
                    .day_gain_amount_converted
                    .as_ref()
                    .map_or_else(
                        || day_gain_amount_converted.clone(),
                        |total_gain| (total_gain + day_gain_amount_converted).round(ROUNDING_SCALE),
                    ),
            );
        }
    }

    fn calculate_total_holding_metrics(
        &self,
        total_holdings: &mut HashMap<HoldingKey, Holding>,
    ) -> Result<()> {
        let total_portfolio_value: BigDecimal = total_holdings
            .values()
            .map(|h| &h.market_value_converted)
            .sum();

        for total_holding in total_holdings.values_mut() {
            self.calculate_total_holding_performance(total_holding)?;
            self.calculate_portfolio_percentage(total_holding, &total_portfolio_value);
        }

        Ok(())
    }

    fn calculate_total_holding_performance(&self, total: &mut Holding) -> Result<()> {
        total.market_price = Some(if total.quantity != BigDecimal::from(0) {
            (&total.market_value / &total.quantity).round(ROUNDING_SCALE)
        } else {
            BigDecimal::from(0)
        });

        total.average_cost = Some(if total.quantity != BigDecimal::from(0) {
            (&total.book_value / &total.quantity).round(ROUNDING_SCALE)
        } else {
            BigDecimal::from(0)
        });

        total.performance.total_gain_amount =
            (&total.market_value - &total.book_value).round(ROUNDING_SCALE);
        total.performance.total_gain_amount_converted =
            (&total.market_value_converted - &total.book_value_converted).round(ROUNDING_SCALE);

        total.performance.total_gain_percent = if total.book_value != BigDecimal::from(0) {
            (&total.performance.total_gain_amount / &total.book_value * BigDecimal::from(100))
                .round(ROUNDING_SCALE)
        } else {
            BigDecimal::from(0)
        };

        if let Some(day_gain_amount) = &total.performance.day_gain_amount {
            total.performance.day_gain_percent =
                Some(if total.market_value != BigDecimal::from(0) {
                    (day_gain_amount / (&total.market_value - day_gain_amount)
                        * BigDecimal::from(100))
                    .round(ROUNDING_SCALE)
                } else {
                    BigDecimal::from(0)
                });
        }

        Ok(())
    }

    fn calculate_portfolio_percentage(
        &self,
        total: &mut Holding,
        total_portfolio_value: &BigDecimal,
    ) {
        total.portfolio_percent = Some(if total_portfolio_value != &BigDecimal::from(0) {
            (&total.market_value_converted / total_portfolio_value * BigDecimal::from(100))
                .round(PORTFOLIO_PERCENT_SCALE)
        } else {
            BigDecimal::from(0)
        });
    }

    fn filter_holdings(&self, holdings: HashMap<HoldingKey, Holding>) -> Vec<Holding> {
        let threshold = BigDecimal::from_str(QUANTITY_THRESHOLD).unwrap();
        holdings
            .into_values()
            .filter(|holding| holding.quantity.abs() > threshold)
            .collect()
    }
}
