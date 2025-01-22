use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
use crate::errors::{AssetError, CurrencyError, Error, Result, ValidationError};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{Account, Activity, ActivityType, Asset, Holding, Performance, Quote};
use bigdecimal::BigDecimal;
use diesel::SqliteConnection;
use log::error;
use std::collections::{HashMap, HashSet};
use std::str::FromStr;

const ROUNDING_SCALE: i64 = 6;
const PORTFOLIO_PERCENT_SCALE: i64 = 2;
const QUANTITY_THRESHOLD: &str = "0.000001";
const PORTFOLIO_ACCOUNT_ID: &str = "PORTFOLIO";

impl Holding {
    pub fn add_position(&mut self, quantity: BigDecimal, price: BigDecimal) {
        let position_value = &quantity * &price;
        let old_value = &self.quantity * self.average_cost.clone().unwrap_or_default();
        let new_value = &old_value + &position_value;

        self.quantity = &self.quantity + &quantity;

        // Update values without rounding
        if self.quantity != BigDecimal::from(0) {
            self.average_cost = Some(&new_value / &self.quantity);
        }
        self.book_value = &self.book_value + &position_value;
        self.book_value_converted = self.book_value.clone();
    }

    pub fn reduce_position(&mut self, quantity: BigDecimal) -> Result<()> {
        // Only validate if current quantity is zero to prevent division by zero
        if self.quantity == BigDecimal::from(0) {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Cannot reduce position with zero quantity".to_string(),
            )));
        }

        // Calculate and update values without rounding
        let sell_ratio = &quantity / &self.quantity;
        let book_value_reduction = &self.book_value * &sell_ratio;

        self.quantity = &self.quantity - &quantity;
        self.book_value = &self.book_value - &book_value_reduction;
        self.book_value_converted = self.book_value.clone();

        // Handle zero quantity case
        if self.quantity == BigDecimal::from(0) {
            self.average_cost = None;
            self.book_value = BigDecimal::from(0);
            self.book_value_converted = BigDecimal::from(0);
        }

        Ok(())
    }

    // Add a new method to round all values
    pub fn round_values(&mut self) {
        self.quantity = self.quantity.round(ROUNDING_SCALE);
        if let Some(avg_cost) = self.average_cost.as_mut() {
            *avg_cost = avg_cost.round(ROUNDING_SCALE);
        }
        if let Some(market_price) = self.market_price.as_mut() {
            *market_price = market_price.round(ROUNDING_SCALE);
        }
        self.market_value = self.market_value.round(ROUNDING_SCALE);
        self.book_value = self.book_value.round(ROUNDING_SCALE);
        self.market_value_converted = self.market_value_converted.round(ROUNDING_SCALE);
        self.book_value_converted = self.book_value_converted.round(ROUNDING_SCALE);

        // Round non-optional performance values
        self.performance.total_gain_percent =
            self.performance.total_gain_percent.round(ROUNDING_SCALE);
        self.performance.total_gain_amount =
            self.performance.total_gain_amount.round(ROUNDING_SCALE);
        self.performance.total_gain_amount_converted = self
            .performance
            .total_gain_amount_converted
            .round(ROUNDING_SCALE);

        // Round optional performance values
        if let Some(day_gain) = self.performance.day_gain_amount.as_mut() {
            *day_gain = day_gain.round(ROUNDING_SCALE);
        }
        if let Some(day_gain_converted) = self.performance.day_gain_amount_converted.as_mut() {
            *day_gain_converted = day_gain_converted.round(ROUNDING_SCALE);
        }
        if let Some(day_gain_percent) = self.performance.day_gain_percent.as_mut() {
            *day_gain_percent = day_gain_percent.round(ROUNDING_SCALE);
        }

        // Round portfolio percentage if present
        if let Some(portfolio_pct) = self.portfolio_percent.as_mut() {
            *portfolio_pct = portfolio_pct.round(PORTFOLIO_PERCENT_SCALE);
        }
    }
}

#[derive(Debug)]
pub struct Portfolio {
    holdings: HashMap<String, HashMap<String, Holding>>, // account_id -> asset_id -> Holding
    cash_positions: HashMap<String, HashMap<String, BigDecimal>>, // account_id -> currency -> amount
    base_currency: String,
}

pub struct HoldingsService {
    account_service: AccountService,
    activity_service: ActivityService,
    asset_service: AssetService,
    fx_service: CurrencyExchangeService,
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

    fn is_quantity_significant(quantity: &BigDecimal) -> bool {
        quantity.abs() >= BigDecimal::from_str(QUANTITY_THRESHOLD).unwrap_or_default()
    }

    fn remove_holding(&mut self, account_id: &str, asset_id: &str) {
        if let Some(holdings) = self.holdings.get_mut(account_id) {
            holdings.remove(asset_id);
            // Remove empty account holdings map
            if holdings.is_empty() {
                self.holdings.remove(account_id);
            }
        }
    }

    fn adjust_cash(&mut self, account_id: &str, currency: &str, amount: BigDecimal) {
        let account_cash = self
            .cash_positions
            .entry(account_id.to_string())
            .or_default();
        let balance = account_cash
            .entry(currency.to_string())
            .or_insert(BigDecimal::from(0));

        // Update without rounding
        *balance = balance.clone() + amount;
    }

    pub fn process_activity(
        &mut self,
        activity: &Activity,
        asset: &Asset,
        account: &Account,
    ) -> Result<()> {
        let quantity = BigDecimal::from_str(&activity.quantity.to_string())?;

        // Skip processing for insignificant quantities except for cash-related activities
        let activity_type = match ActivityType::from_str(&activity.activity_type) {
            Ok(t) => t,
            Err(e) => return Err(Error::Validation(ValidationError::InvalidInput(e))),
        };

        if !matches!(
            activity_type,
            ActivityType::Deposit
                | ActivityType::Withdrawal
                | ActivityType::Interest
                | ActivityType::Dividend
                | ActivityType::ConversionIn
                | ActivityType::ConversionOut
                | ActivityType::Fee
                | ActivityType::Tax
        ) && !Self::is_quantity_significant(&quantity)
        {
            return Ok(());
        }

        let unit_price = BigDecimal::from_str(&activity.unit_price.to_string())?;
        let fee = BigDecimal::from_str(&activity.fee.to_string())?;
        let activity_amount = &quantity * &unit_price;

        match activity_type {
            ActivityType::Buy => self.process_buy(
                activity,
                asset,
                account,
                quantity,
                unit_price,
                fee,
                activity_amount,
            ),
            ActivityType::Sell => self.process_sell(
                activity,
                asset,
                account,
                quantity,
                unit_price,
                fee,
                activity_amount,
            ),
            ActivityType::TransferIn => self.process_transfer_in(
                activity,
                asset,
                account,
                quantity,
                unit_price,
                fee,
                activity_amount,
            ),
            ActivityType::TransferOut => {
                self.process_transfer_out(activity, asset, account, quantity, fee, activity_amount)
            }
            ActivityType::Deposit => self.process_deposit(activity, account, activity_amount, fee),
            ActivityType::Withdrawal => {
                self.process_withdrawal(activity, account, activity_amount, fee)
            }
            ActivityType::Interest | ActivityType::Dividend => {
                self.process_income(activity, account, activity_amount, fee)
            }
            ActivityType::ConversionIn => {
                self.process_conversion_in(activity, account, activity_amount, fee)
            }
            ActivityType::ConversionOut => {
                self.process_conversion_out(activity, account, activity_amount, fee)
            }
            ActivityType::Fee | ActivityType::Tax => self.process_expense(activity, account, fee),
            ActivityType::Split => self.process_split(activity, account, unit_price),
        }
    }

    fn process_buy(
        &mut self,
        activity: &Activity,
        asset: &Asset,
        account: &Account,
        quantity: BigDecimal,
        unit_price: BigDecimal,
        fee: BigDecimal,
        activity_amount: BigDecimal,
    ) -> Result<()> {
        let buy_cost = &activity_amount + &fee;
        self.adjust_cash(&account.id, &activity.currency, -buy_cost);

        let holding =
            self.get_or_create_holding(&account.id, &activity.asset_id, activity, asset, account);
        holding.add_position(quantity, unit_price);

        Ok(())
    }

    fn process_sell(
        &mut self,
        activity: &Activity,
        _asset: &Asset,
        account: &Account,
        quantity: BigDecimal,
        _unit_price: BigDecimal,
        fee: BigDecimal,
        activity_amount: BigDecimal,
    ) -> Result<()> {
        let sell_profit = &activity_amount - &fee;

        self.adjust_cash(&account.id, &activity.currency, sell_profit);

        if let Some(holding) = self.get_holding_mut(&account.id, &activity.asset_id) {
            holding.reduce_position(quantity)?;

            if holding.quantity == BigDecimal::from(0) {
                self.remove_holding(&account.id, &activity.asset_id);
            }
        }

        Ok(())
    }

    fn process_transfer_in(
        &mut self,
        activity: &Activity,
        asset: &Asset,
        account: &Account,
        quantity: BigDecimal,
        unit_price: BigDecimal,
        fee: BigDecimal,
        activity_amount: BigDecimal,
    ) -> Result<()> {
        let net_amount = &activity_amount - &fee;

        if activity.asset_id.starts_with("$CASH") {
            self.adjust_cash(&account.id, &activity.currency, net_amount);
        } else {
            let holding = self.get_or_create_holding(
                &account.id,
                &activity.asset_id,
                activity,
                asset,
                account,
            );
            holding.add_position(quantity, unit_price);
        }
        Ok(())
    }

    fn process_transfer_out(
        &mut self,
        activity: &Activity,
        _asset: &Asset,
        account: &Account,
        quantity: BigDecimal,
        fee: BigDecimal,
        activity_amount: BigDecimal,
    ) -> Result<()> {
        let total_amount = &activity_amount + &fee;

        if activity.asset_id.starts_with("$CASH") {
            self.adjust_cash(&account.id, &activity.currency, -total_amount);
        } else if let Some(holding) = self.get_holding_mut(&account.id, &activity.asset_id) {
            holding.reduce_position(quantity)?;

            if holding.quantity == BigDecimal::from(0) {
                self.remove_holding(&account.id, &activity.asset_id);
            }
        }
        Ok(())
    }

    fn process_deposit(
        &mut self,
        activity: &Activity,
        account: &Account,
        activity_amount: BigDecimal,
        fee: BigDecimal,
    ) -> Result<()> {
        let net_amount = &activity_amount - &fee;
        self.adjust_cash(&account.id, &activity.currency, net_amount);
        Ok(())
    }

    fn process_withdrawal(
        &mut self,
        activity: &Activity,
        account: &Account,
        activity_amount: BigDecimal,
        fee: BigDecimal,
    ) -> Result<()> {
        let total_amount = &activity_amount + &fee;
        self.adjust_cash(&account.id, &activity.currency, -total_amount);
        Ok(())
    }

    fn process_income(
        &mut self,
        activity: &Activity,
        account: &Account,
        activity_amount: BigDecimal,
        fee: BigDecimal,
    ) -> Result<()> {
        let net_amount = &activity_amount - &fee;
        self.adjust_cash(&account.id, &activity.currency, net_amount);
        Ok(())
    }

    fn process_conversion_in(
        &mut self,
        activity: &Activity,
        account: &Account,
        activity_amount: BigDecimal,
        fee: BigDecimal,
    ) -> Result<()> {
        let net_amount = &activity_amount - &fee;
        self.adjust_cash(&account.id, &activity.currency, net_amount);
        Ok(())
    }

    fn process_conversion_out(
        &mut self,
        activity: &Activity,
        account: &Account,
        activity_amount: BigDecimal,
        fee: BigDecimal,
    ) -> Result<()> {
        let total_amount = &activity_amount + &fee;
        self.adjust_cash(&account.id, &activity.currency, -total_amount);
        Ok(())
    }

    fn process_expense(
        &mut self,
        activity: &Activity,
        account: &Account,
        fee: BigDecimal,
    ) -> Result<()> {
        self.adjust_cash(&account.id, &activity.currency, -fee);
        Ok(())
    }

    fn process_split(
        &mut self,
        activity: &Activity,
        account: &Account,
        split_ratio: BigDecimal,
    ) -> Result<()> {
        if let Some(holding) = self.get_holding_mut(&account.id, &activity.asset_id) {
            holding.quantity *= &split_ratio;
            if let Some(avg_cost) = holding.average_cost.as_mut() {
                *avg_cost = avg_cost.clone() / &split_ratio;
            }
        }
        Ok(())
    }

    fn get_or_create_holding(
        &mut self,
        account_id: &str,
        asset_id: &str,
        activity: &Activity,
        asset: &Asset,
        account: &Account,
    ) -> &mut Holding {
        let account_holdings = self.holdings.entry(account_id.to_string()).or_default();

        account_holdings
            .entry(asset_id.to_string())
            .or_insert_with(|| Holding {
                id: format!("{}-{}", account_id, asset_id),
                symbol: asset_id.to_string(),
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
            })
    }

    fn get_holding_mut(&mut self, account_id: &str, asset_id: &str) -> Option<&mut Holding> {
        self.holdings
            .get_mut(account_id)
            .and_then(|holdings| holdings.get_mut(asset_id))
    }

    pub fn update_market_prices(
        &mut self,
        quotes: &HashMap<String, Quote>,
        fx_service: &CurrencyExchangeService,
    ) -> Result<()> {
        // Update FX rates for cash positions first
        for (_, account_holdings) in self.holdings.iter_mut() {
            for (_, holding) in account_holdings.iter_mut() {
                // Update FX rates and converted values
                let exchange_rate = BigDecimal::from_str(
                    &fx_service
                        .get_latest_exchange_rate(&holding.currency, &self.base_currency)
                        .unwrap_or(1.0)
                        .to_string(),
                )?;

                if holding.holding_type == "CASH" {
                    holding.market_value = holding.quantity.clone();
                    holding.book_value = holding.quantity.clone();
                    holding.market_value_converted = &holding.market_value * &exchange_rate;
                    holding.book_value_converted = &holding.book_value * &exchange_rate;
                    continue;
                }

                if let Some(quote) = quotes.get(&holding.symbol) {
                    let market_price = BigDecimal::from_str(&quote.close.to_string())?;
                    holding.market_price = Some(market_price.clone());
                    holding.market_value =
                        (&holding.quantity * &market_price).round(ROUNDING_SCALE);
                    holding.market_value_converted =
                        (&holding.market_value * &exchange_rate).round(ROUNDING_SCALE);
                    holding.book_value_converted =
                        (&holding.book_value * &exchange_rate).round(ROUNDING_SCALE);

                    let opening_value = (&holding.quantity
                        * BigDecimal::from_str(&quote.open.to_string())?)
                    .round(ROUNDING_SCALE);
                    let closing_value = &holding.market_value;
                    holding.performance.day_gain_amount =
                        Some((closing_value - &opening_value).round(ROUNDING_SCALE));
                    holding.performance.day_gain_amount_converted = Some(
                        (&holding.performance.day_gain_amount.clone().unwrap() * &exchange_rate)
                            .round(ROUNDING_SCALE),
                    );

                    if opening_value != BigDecimal::from(0) {
                        holding.performance.day_gain_percent = Some(
                            ((closing_value - &opening_value) / &opening_value
                                * BigDecimal::from(100))
                            .round(ROUNDING_SCALE),
                        );
                    }

                    if holding.book_value != BigDecimal::from(0) {
                        holding.performance.total_gain_amount =
                            (&holding.market_value - &holding.book_value).round(ROUNDING_SCALE);
                        holding.performance.total_gain_amount_converted =
                            (&holding.market_value_converted - &holding.book_value_converted)
                                .round(ROUNDING_SCALE);
                        holding.performance.total_gain_percent =
                            ((&holding.market_value / &holding.book_value - BigDecimal::from(1))
                                * BigDecimal::from(100))
                            .round(ROUNDING_SCALE);
                    }
                }
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
    pub fn get_cash_positions(&self) -> &HashMap<String, HashMap<String, BigDecimal>> {
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
                        quantity: BigDecimal::from(0),
                        currency: holding.currency.clone(),
                        base_currency: self.base_currency.clone(),
                        market_price: holding.market_price.clone(),
                        average_cost: None,
                        market_value: BigDecimal::from(0),
                        book_value: BigDecimal::from(0),
                        market_value_converted: BigDecimal::from(0),
                        book_value_converted: BigDecimal::from(0),
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
                        asset_class: holding.asset_class.clone(),
                        asset_sub_class: holding.asset_sub_class.clone(),
                        asset_data_source: holding.asset_data_source.clone(),
                        sectors: holding.sectors.clone(),
                        countries: holding.countries.clone(),
                        portfolio_percent: None,
                    });

                total.quantity = (&total.quantity + &holding.quantity).round(ROUNDING_SCALE);
                total.market_value =
                    (&total.market_value + &holding.market_value).round(ROUNDING_SCALE);
                total.book_value = (&total.book_value + &holding.book_value).round(ROUNDING_SCALE);
                total.market_value_converted = (&total.market_value_converted
                    + &holding.market_value_converted)
                    .round(ROUNDING_SCALE);
                total.book_value_converted = (&total.book_value_converted
                    + &holding.book_value_converted)
                    .round(ROUNDING_SCALE);

                if let Some(day_gain) = &holding.performance.day_gain_amount {
                    total.performance.day_gain_amount = Some(
                        (&total
                            .performance
                            .day_gain_amount
                            .clone()
                            .unwrap_or_default()
                            + day_gain)
                            .round(ROUNDING_SCALE),
                    );
                }
                if let Some(day_gain_converted) = &holding.performance.day_gain_amount_converted {
                    total.performance.day_gain_amount_converted = Some(
                        (&total
                            .performance
                            .day_gain_amount_converted
                            .clone()
                            .unwrap_or_default()
                            + day_gain_converted)
                            .round(ROUNDING_SCALE),
                    );
                }
            }
        }

        // Aggregate cash positions by currency
        let mut total_cash: HashMap<String, BigDecimal> = HashMap::new();
        for currencies in self.cash_positions.values() {
            for (currency, amount) in currencies {
                *total_cash.entry(currency.clone()).or_default() += amount;
            }
        }

        // Add total cash positions as holdings
        for (currency, amount) in total_cash {
            if amount != BigDecimal::from(0) {
                total_by_symbol.insert(
                    format!("$CASH-{}", currency),
                    Holding {
                        id: format!("{}-$CASH-{}", PORTFOLIO_ACCOUNT_ID, currency),
                        symbol: format!("$CASH-{}", currency),
                        symbol_name: Some(format!("Cash {}", currency)),
                        holding_type: "CASH".to_string(),
                        quantity: amount.clone(),
                        currency: currency.clone(),
                        base_currency: self.base_currency.clone(),
                        market_price: Some(BigDecimal::from(1)),
                        average_cost: Some(BigDecimal::from(1)),
                        market_value: amount.clone(),
                        book_value: amount.clone(),
                        market_value_converted: amount.clone(), // Will be updated with FX rates
                        book_value_converted: amount.clone(),   // Will be updated with FX rates
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
        }

        // Calculate performance metrics for each total holding
        let mut total_holdings: Vec<Holding> = total_by_symbol.into_values().collect();
        let total_portfolio_value: BigDecimal = total_holdings
            .iter()
            .map(|h| &h.market_value_converted)
            .sum();

        for total in &mut total_holdings {
            // Calculate portfolio percentage
            if total_portfolio_value != BigDecimal::from(0) {
                total.portfolio_percent = Some(
                    (&total.market_value_converted / &total_portfolio_value
                        * BigDecimal::from(100))
                    .round(PORTFOLIO_PERCENT_SCALE),
                );
            }

            // Calculate average cost
            if total.quantity != BigDecimal::from(0) {
                total.average_cost = Some(&total.book_value / &total.quantity);
            }

            // Calculate performance metrics
            if total.book_value != BigDecimal::from(0) {
                total.performance.total_gain_amount = &total.market_value - &total.book_value;
                total.performance.total_gain_amount_converted =
                    &total.market_value_converted - &total.book_value_converted;
                total.performance.total_gain_percent = ((&total.market_value / &total.book_value
                    - BigDecimal::from(1))
                    * BigDecimal::from(100))
                .round(ROUNDING_SCALE);
            }

            if let Some(day_gain) = &total.performance.day_gain_amount {
                if total.market_value != BigDecimal::from(0) {
                    total.performance.day_gain_percent =
                        Some((day_gain / (&total.market_value - day_gain)) * BigDecimal::from(100));
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
                if amount != BigDecimal::from(0) {
                    let holding = Holding {
                        id: format!("{}-$CASH-{}", account_id, currency),
                        symbol: format!("$CASH-{}", currency),
                        symbol_name: Some(format!("Cash {}", currency)),
                        holding_type: "CASH".to_string(),
                        quantity: amount.clone(),
                        currency: currency.clone(),
                        base_currency: self.base_currency.clone(),
                        market_price: Some(BigDecimal::from(1)),
                        average_cost: Some(BigDecimal::from(1)),
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
        }

        cash_holdings
    }
}

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
        // Load and validate required data
        let (accounts, activities, assets) = self.load_required_data(conn)?;

        // Create lookup maps for better performance
        let assets_map: HashMap<_, _> = assets.iter().map(|a| (&a.id, a)).collect();
        let accounts_map: HashMap<_, _> = accounts.iter().map(|a| (&a.id, a)).collect();

        // Initialize FX service
        self.fx_service
            .initialize(conn)
            .map_err(|e| Error::Currency(CurrencyError::ConversionFailed(e.to_string())))?;

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

                let account = match self.get_account_for_activity(&accounts_map, activity) {
                    Ok(account) => account,
                    Err(e) => {
                        error!("Error getting account for activity: {}", e);
                        continue;
                    }
                };

                if let Err(e) = portfolio.process_activity(activity, asset, account) {
                    error!("Error processing activity: {}", e);
                }
            }
        }

        // Get holdings before updating prices to optimize quote fetching
        let holdings = portfolio.get_holdings();

        // Skip price update if no holdings
        if !holdings.is_empty() {
            // Update market prices
            let quotes = self.load_quotes(conn, &holdings)?;
            portfolio.update_market_prices(&quotes, &self.fx_service)?;
        }

        // Get final holdings including totals
        let mut final_holdings = portfolio.get_holdings();
        final_holdings.extend(portfolio.get_total_portfolio());

        // Round all values before returning
        for holding in &mut final_holdings {
            holding.round_values();
        }

        Ok(final_holdings)
    }

    fn load_required_data(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<(Vec<Account>, Vec<Activity>, Vec<Asset>)> {
        // Load data in parallel using rayon
        let accounts = self.account_service.get_active_accounts(conn)?;
        let activities = self.activity_service.get_activities(conn)?;
        let assets = self.asset_service.get_assets(conn)?;

        // Pre-validate data
        if accounts.is_empty() {
            return Err(Error::Validation(ValidationError::MissingField(
                "No active accounts found".to_string(),
            )));
        }

        Ok((accounts, activities, assets))
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
            .ok_or_else(|| Error::Asset(AssetError::NotFound(activity.account_id.clone())))
    }

    fn load_quotes(
        &self,
        conn: &mut SqliteConnection,
        holdings: &[Holding],
    ) -> Result<HashMap<String, Quote>> {
        // Collect unique symbols and filter out cash positions
        let asset_ids: HashSet<String> = holdings
            .iter()
            .filter(|h| h.holding_type != "CASH")
            .map(|h| h.symbol.clone())
            .collect();

        if asset_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let quotes = self
            .asset_service
            .get_latest_quotes(conn, &asset_ids.into_iter().collect::<Vec<_>>())?;
        Ok(quotes)
    }
}
