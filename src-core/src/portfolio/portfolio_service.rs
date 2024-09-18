use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::asset::asset_service::AssetService;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{
    Account, AccountSummary, Activity, HistorySummary, Holding, IncomeData, IncomeSummary,
    PortfolioHistory,
};
use crate::settings::SettingsService;

use diesel::r2d2::{ConnectionManager, Pool};
use diesel::SqliteConnection;

use crate::portfolio::history_service::HistoryService;
use crate::portfolio::holdings_service::HoldingsService;
use crate::portfolio::income_service::IncomeService;

pub struct PortfolioService {
    account_service: AccountService,
    activity_service: ActivityService,
    asset_service: AssetService,
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
        let mut conn = pool.get()?;
        let settings_service = SettingsService::new();
        let settings = settings_service.get_settings(&mut conn)?;
        let base_currency = settings.base_currency;

        Ok(PortfolioService {
            account_service: AccountService::new(pool.clone()),
            activity_service: ActivityService::new(pool.clone()),
            asset_service: AssetService::new(pool.clone()),
            income_service: IncomeService::new(
                pool.clone(),
                CurrencyExchangeService::new(pool.clone()),
                base_currency.clone(),
            ),
            holdings_service: HoldingsService::new(pool.clone(), base_currency.clone()),
            history_service: HistoryService::new(pool.clone(), base_currency),
        })
    }

    pub fn compute_holdings(&self) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
        self.holdings_service
            .compute_holdings()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
    }

    fn fetch_data(
        &self,
        account_ids: Option<Vec<String>>,
    ) -> Result<(Vec<Account>, Vec<Activity>), Box<dyn std::error::Error>> {
        let accounts = match &account_ids {
            Some(ids) => self.account_service.get_accounts_by_ids(ids)?,
            None => self.account_service.get_accounts()?,
        };

        let activities = match &account_ids {
            Some(ids) => self.activity_service.get_activities_by_account_ids(ids)?,
            None => self.activity_service.get_activities()?,
        };

        Ok((accounts, activities))
    }

    pub fn calculate_historical_data(
        &self,
        account_ids: Option<Vec<String>>,
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>, Box<dyn std::error::Error>> {
        println!("Starting calculate_historical_data with account_ids: {:?}, force_full_calculation: {:?}", account_ids, force_full_calculation);
        let strt_time = std::time::Instant::now();

        let (accounts, activities) = self.fetch_data(account_ids)?;

        let results = self.history_service.calculate_historical_data(
            &accounts,
            &activities,
            force_full_calculation,
        )?;

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

    pub async fn update_portfolio(
        &self,
    ) -> Result<Vec<HistorySummary>, Box<dyn std::error::Error>> {
        // First, sync quotes
        self.asset_service.initialize_and_sync_quotes().await?;

        // Then, calculate historical data
        self.calculate_historical_data(None, false)
    }

    pub fn get_account_history(
        &self,
        account_id: &str,
    ) -> Result<Vec<PortfolioHistory>, Box<dyn std::error::Error>> {
        self.history_service
            .get_account_history(account_id)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>) // Convert PortfolioError to Box<dyn std::error::Error>
    }

    pub fn get_accounts_summary(&self) -> Result<Vec<AccountSummary>, Box<dyn std::error::Error>> {
        let accounts = self.account_service.get_accounts()?;
        let mut account_summaries = Vec::new();

        // First, get the total portfolio value
        let total_portfolio_value =
            if let Ok(total_history) = self.history_service.get_latest_account_history("TOTAL") {
                total_history.market_value
            } else {
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "Total portfolio history not found",
                )));
            };

        // Then, calculate the allocation percentage for each account
        for account in accounts {
            if let Ok(history) = self.history_service.get_latest_account_history(&account.id) {
                let allocation_percentage = if total_portfolio_value > 0.0 {
                    (history.market_value / total_portfolio_value) * 100.0
                } else {
                    0.0
                };

                account_summaries.push(AccountSummary {
                    account,
                    performance: PortfolioHistory {
                        allocation_percentage,
                        ..history
                    },
                });
            }
        }

        Ok(account_summaries)
    }
}
