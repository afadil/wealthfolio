use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{
    Account, Activity, FinancialHistory, FinancialSnapshot, Holding, IncomeData, IncomeSummary,
    Performance, Quote,
};
use crate::settings::SettingsService;
use chrono::NaiveDateTime;
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};

use chrono::Datelike;
use chrono::{Duration, NaiveDate, Utc};
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;

use crate::portfolio::history_service::HistoryService;
use crate::portfolio::holdings_service::HoldingsService;
use crate::portfolio::income_service::IncomeService;

pub struct PortfolioService {
    account_service: AccountService,
    activity_service: ActivityService,
    asset_service: AssetService,
    fx_service: CurrencyExchangeService,
    base_currency: String,
    pool: Pool<ConnectionManager<SqliteConnection>>,
    income_service: IncomeService,
    holdings_service: HoldingsService,
    history_service: HistoryService,
}

/// This module contains the implementation of the `PortfolioService` struct.
/// The `PortfolioService` struct provides methods for fetching and aggregating holdings,
/// computing holdings, calculating historical portfolio values, and aggregating account history.
/// It also includes helper methods for converting currency, fetching exchange rates,
/// and getting dates between two given dates.

impl PortfolioService {
    pub fn new(
        pool: Pool<ConnectionManager<SqliteConnection>>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let mut service = PortfolioService {
            account_service: AccountService::new(pool.clone()),
            activity_service: ActivityService::new(pool.clone()),
            asset_service: AssetService::new(pool.clone()),
            fx_service: CurrencyExchangeService::new(pool.clone()),
            base_currency: String::new(),
            pool: pool.clone(),
            income_service: IncomeService::new(
                pool.clone(),
                CurrencyExchangeService::new(pool.clone()),
                String::new(),
            ),
            holdings_service: HoldingsService::new(pool.clone(), String::new()),
            history_service: HistoryService::new(
                CurrencyExchangeService::new(pool.clone()),
                String::new(),
            ),
        };
        service.initialize()?;
        Ok(service)
    }

    fn initialize(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.pool.get()?;
        let settings_service = SettingsService::new();
        let settings = settings_service.get_settings(&mut conn)?;
        self.base_currency.clone_from(&settings.base_currency);
        self.income_service = IncomeService::new(
            self.pool.clone(),
            CurrencyExchangeService::new(self.pool.clone()),
            self.base_currency.clone(),
        );
        self.holdings_service = HoldingsService::new(self.pool.clone(), self.base_currency.clone());
        self.history_service = HistoryService::new(
            CurrencyExchangeService::new(self.pool.clone()),
            self.base_currency.clone(),
        );
        Ok(())
    }

    pub fn compute_holdings(&self) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
        self.holdings_service
            .compute_holdings()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
    }

    fn fetch_data(
        &self,
    ) -> Result<(Vec<Account>, Vec<Activity>, Vec<Quote>), Box<dyn std::error::Error>> {
        let accounts = self.account_service.get_accounts()?;
        let activities = self.activity_service.get_activities()?;
        let market_data = self.asset_service.get_history_quotes()?;

        Ok((accounts, activities, market_data))
    }

    pub fn calculate_historical_portfolio_values(
        &self,
    ) -> Result<Vec<FinancialHistory>, Box<dyn std::error::Error>> {
        let strt_time = std::time::Instant::now();

        let (accounts, activities, market_data) = self.fetch_data()?;

        let results = self.history_service.calculate_historical_portfolio_values(
            &accounts,
            &activities,
            &market_data,
        );

        println!(
            "Calculating historical portfolio values took: {:?}",
            std::time::Instant::now() - strt_time
        );

        Ok(results)
    }

    pub fn get_income_data(&self) -> Result<Vec<IncomeData>, diesel::result::Error> {
        self.income_service.get_income_data()
    }

    pub fn get_income_summary(&self) -> Result<IncomeSummary, diesel::result::Error> {
        self.income_service.get_income_summary()
    }
}
