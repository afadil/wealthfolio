use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
use crate::error::{PortfolioError, Result};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{Account, Activity, Asset, Holding, Performance, Quote};
use crate::providers::market_data_provider::MarketDataProviderType;
use bigdecimal::BigDecimal;
use diesel::SqliteConnection;
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

impl From<bigdecimal::ParseBigDecimalError> for PortfolioError {
    fn from(error: bigdecimal::ParseBigDecimalError) -> Self {
        PortfolioError::InvalidDataError(error.to_string())
    }
}

pub struct HoldingsService {
    account_service: AccountService,
    activity_service: ActivityService,
    asset_service: AssetService,
    fx_service: CurrencyExchangeService,
    base_currency: String,
}

impl HoldingsService {
    pub async fn new(base_currency: String) -> Self {
        Self {
            account_service: AccountService::new(base_currency.clone()),
            activity_service: ActivityService::new(base_currency.clone()),
            asset_service: AssetService::new(
                MarketDataProviderType::Yahoo,
                MarketDataProviderType::Private).await,
            fx_service: CurrencyExchangeService::new(),
            base_currency,
        }
    }

    pub fn compute_holdings(&self, conn: &mut SqliteConnection) -> Result<Vec<Holding>> {
        let accounts = self.account_service.get_active_accounts(conn)?;
        let activities = self.activity_service.get_trading_activities(conn)?;
        let assets = self.asset_service.get_assets(conn)?;
        self.fx_service
            .initialize(conn)
            .map_err(|e| PortfolioError::CurrencyConversionError(e.to_string()))?;

        let mut holdings = self.aggregate_holdings(&accounts, &activities, &assets)?;
        let quotes = self.fetch_quotes(conn, &holdings)?;

        self.calculate_holding_metrics(&mut holdings, &quotes)?;
        self.calculate_total_holdings(&mut holdings)?;

        Ok(self.filter_holdings(holdings))
    }

    fn aggregate_holdings(
        &self,
        accounts: &[Account],
        activities: &[Activity],
        assets: &[Asset],
    ) -> Result<HashMap<String, Holding>> {
        let mut holdings = HashMap::new();

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
            let holding = holdings
                .entry(key.clone())
                .or_insert_with(|| self.create_holding(key, activity, asset, account));

            self.update_holding(holding, activity)?;
        }

        Ok(holdings)
    }

    fn create_holding(
        &self,
        key: String,
        activity: &Activity,
        asset: &Asset,
        account: &Account,
    ) -> Holding {
        Holding {
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

        let old_quantity = holding.quantity.clone();
        let old_book_value = holding.book_value.clone();

        match activity.activity_type.as_str() {
            "BUY" | "TRANSFER_IN" => {
                holding.quantity += &quantity;
                holding.book_value += &quantity * &unit_price + &fee;
            }
            "SELL" | "TRANSFER_OUT" => {
                holding.quantity -= &quantity;
                if old_quantity != BigDecimal::from(0) {
                    let sell_ratio = (&quantity / &old_quantity).round(6);
                    holding.book_value -= &sell_ratio * &old_book_value;
                }
            }
            "SPLIT" => {
                let split_ratio = unit_price;
                if split_ratio != BigDecimal::from(0) {
                    holding.quantity *= &split_ratio;
                    if let Some(avg_cost) = holding.average_cost.as_mut() {
                        *avg_cost = avg_cost.clone() / &split_ratio;
                    }
                } else {
                    return Err(PortfolioError::InvalidDataError(
                        "Invalid split ratio".to_string(),
                    ));
                }
            }
            _ => println!("Unhandled activity type: {}", activity.activity_type),
        }

        holding.quantity = holding.quantity.round(6);
        holding.book_value = holding.book_value.round(6);

        Ok(())
    }

    fn fetch_quotes(
        &self,
        conn: &mut SqliteConnection,
        holdings: &HashMap<String, Holding>,
    ) -> Result<HashMap<String, Quote>> {

        let unique_symbols: HashSet<String> = holdings.values().map(|h| h.symbol.clone()).collect();
        let mut quotes = HashMap::new();

        for symbol in unique_symbols {
            match self.asset_service.get_latest_quote(conn, &symbol) {
                Ok(quote) => {
                    quotes.insert(symbol.clone(), quote);
                }
                Err(e) => eprintln!("Error fetching quote for symbol {}: {}", symbol, e),
            }
        }

        Ok(quotes)
    }

    fn calculate_holding_metrics(
        &self,
        holdings: &mut HashMap<String, Holding>,
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
        holding.market_price = Some(
            BigDecimal::from_str(&quote.close.to_string())
                .map_err(|_| PortfolioError::InvalidDataError("Invalid market price".to_string()))?
                .round(6),
        );
        holding.market_value = (&holding.quantity
            * holding
                .market_price
                .clone()
                .unwrap_or_else(|| BigDecimal::from(0)))
        .round(6);

        let opening_value = (&holding.quantity
            * BigDecimal::from_str(&quote.open.to_string()).map_err(|_| {
                PortfolioError::InvalidDataError("Invalid opening price".to_string())
            })?)
        .round(6);
        let closing_value = (&holding.quantity
            * BigDecimal::from_str(&quote.close.to_string()).map_err(|_| {
                PortfolioError::InvalidDataError("Invalid closing price".to_string())
            })?)
        .round(6);
        holding.performance.day_gain_amount = Some((&closing_value - &opening_value).round(6));
        holding.performance.day_gain_percent = Some(if opening_value != BigDecimal::from(0) {
            ((&closing_value - &opening_value) / &opening_value * BigDecimal::from(100)).round(6)
        } else {
            BigDecimal::from(0)
        });

        Ok(())
    }

    fn calculate_average_cost(&self, holding: &mut Holding) {
        holding.average_cost = if holding.quantity != BigDecimal::from(0) {
            Some((&holding.book_value / &holding.quantity).round(6))
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
        let exchange_rate = self
            .fx_service
            .get_latest_exchange_rate(&holding.currency, account_currency)
            .map(|rate| {
                BigDecimal::from_str(&rate.to_string()).map_err(|_| {
                    PortfolioError::InvalidDataError("Invalid exchange rate".to_string())
                })
            })
            .unwrap_or_else(|_| Ok(BigDecimal::from(1)))?;

        holding.market_value_converted = (&holding.market_value * &exchange_rate).round(6);
        holding.book_value_converted = (&holding.book_value * &exchange_rate).round(6);

        if let Some(day_gain_amount) = holding.performance.day_gain_amount.as_ref() {
            holding.performance.day_gain_amount_converted =
                Some((day_gain_amount * &exchange_rate).round(6));
        }

        Ok(())
    }

    fn calculate_performance_metrics(&self, holding: &mut Holding) {
        holding.performance.total_gain_amount =
            (&holding.market_value - &holding.book_value).round(6);
        holding.performance.total_gain_percent = if holding.book_value != BigDecimal::from(0) {
            (&holding.performance.total_gain_amount / &holding.book_value * BigDecimal::from(100))
                .round(6)
        } else {
            BigDecimal::from(0)
        };
        holding.performance.total_gain_amount_converted =
            (&holding.market_value_converted - &holding.book_value_converted).round(6);
    }

    fn calculate_total_holdings(&self, holdings: &mut HashMap<String, Holding>) -> Result<()> {
        let mut total_holdings = HashMap::new();

        for holding in holdings.values() {
            let total_key = holding.symbol.clone();
            let total_holding = total_holdings
                .entry(total_key)
                .or_insert_with(|| self.create_total_holding(holding));

            self.aggregate_total_holding(total_holding, holding);
        }

        self.calculate_total_holding_metrics(&mut total_holdings)?;
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

    fn aggregate_total_holding(&self, total_holding: &mut Holding, holding: &Holding) {
        total_holding.quantity += &holding.quantity;
        total_holding.market_value += &holding.market_value;
        total_holding.market_value_converted += &holding.market_value_converted;
        total_holding.book_value += &holding.book_value;
        total_holding.book_value_converted += &holding.book_value_converted;
    }

    fn calculate_total_holding_metrics(
        &self,
        total_holdings: &mut HashMap<String, Holding>,
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

    fn calculate_total_holding_performance(&self, total_holding: &mut Holding) -> Result<()> {
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
            (&total_holding.market_value_converted - &total_holding.book_value_converted).round(6);

        total_holding.performance.total_gain_percent =
            if total_holding.book_value != BigDecimal::from(0) {
                (&total_holding.performance.total_gain_amount / &total_holding.book_value
                    * BigDecimal::from(100))
                .round(6)
            } else {
                BigDecimal::from(0)
            };

        Ok(())
    }

    fn calculate_portfolio_percentage(
        &self,
        total_holding: &mut Holding,
        total_portfolio_value: &BigDecimal,
    ) {
        if total_portfolio_value != &BigDecimal::from(0) {
            total_holding.portfolio_percent = Some(
                (&total_holding.market_value_converted / total_portfolio_value
                    * BigDecimal::from(100))
                .round(2),
            );
        } else {
            total_holding.portfolio_percent = Some(BigDecimal::from(0));
        }
    }

    fn filter_holdings(&self, holdings: HashMap<String, Holding>) -> Vec<Holding> {
        let threshold = BigDecimal::from_str("0.000001").unwrap();
        holdings
            .into_values()
            .filter(|holding| holding.quantity.abs() > threshold)
            .collect()
    }
}
