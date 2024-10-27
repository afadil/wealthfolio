use crate::account::account_service::AccountService;
use crate::activity::activity_service::ActivityService;
use crate::fx::fx_service::CurrencyExchangeService;
use crate::market_data::market_data_service::MarketDataService;
use crate::models::{AccountSummary, HistorySummary, Holding, IncomeSummary, PortfolioHistory};
use crate::providers::market_data_provider::MarketDataProviderType;

use diesel::prelude::*;

use std::sync::Arc;

use crate::portfolio::history_service::HistoryService;
use crate::portfolio::holdings_service::HoldingsService;
use crate::portfolio::income_service::IncomeService;

pub struct PortfolioService {
    account_service: AccountService,
    activity_service: ActivityService,
    market_data_service: Arc<MarketDataService>,
    income_service: IncomeService,
    holdings_service: HoldingsService,
    history_service: HistoryService,
}

impl PortfolioService {
    pub async fn new(base_currency: String) -> Result<Self, Box<dyn std::error::Error>> {
        let market_data_service = Arc::new(MarketDataService::new(MarketDataProviderType::Yahoo).await);

        Ok(PortfolioService {
            account_service: AccountService::new(base_currency.clone()),
            activity_service: ActivityService::new(base_currency.clone()),
            market_data_service: market_data_service.clone(),
            income_service: IncomeService::new(
                CurrencyExchangeService::new(),
                base_currency.clone(),
            ),
            holdings_service: HoldingsService::new(base_currency.clone()).await,
            history_service: HistoryService::new(base_currency.clone(), market_data_service),
        })
    }

    pub async fn compute_holdings(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Holding>, Box<dyn std::error::Error>> {
        self.holdings_service
            .compute_holdings(conn)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
    }

    pub async fn calculate_historical_data(
        &self,
        conn: &mut SqliteConnection,
        account_ids: Option<Vec<String>>,
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>, Box<dyn std::error::Error>> {
        // First, sync quotes
        self.market_data_service.sync_exchange_rates(conn).await?;

        let accounts = match &account_ids {
            Some(ids) => self.account_service.get_accounts_by_ids(conn, ids)?,
            None => self.account_service.get_active_accounts(conn)?,
        };

        let activities = match &account_ids {
            Some(ids) => self
                .activity_service
                .get_activities_by_account_ids(conn, ids)?,
            None => self.activity_service.get_activities(conn)?,
        };

        let results = conn.transaction(|conn| {
            self.history_service.calculate_historical_data(
                conn,
                &accounts,
                &activities,
                force_full_calculation,
            )
        })?;

        Ok(results)
    }

    pub fn get_income_summary(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<IncomeSummary>, diesel::result::Error> {
        self.income_service.get_income_summary(conn)
    }

    pub async fn update_portfolio(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<HistorySummary>, Box<dyn std::error::Error>> {
        use std::time::Instant;
        let start = Instant::now();

        // First, sync quotes
        self.market_data_service
            .initialize_and_sync_quotes(conn)
            .await?;

        // Then, calculate historical data
        let result = self.calculate_historical_data(conn, None, false).await;

        let duration = start.elapsed();
        println!(
            "update_portfolio completed in: {:?} seconds",
            duration.as_secs_f64()
        );

        result
    }

    pub fn get_all_accounts_history(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<PortfolioHistory>, Box<dyn std::error::Error>> {
        self.history_service
            .get_all_accounts_history(conn)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
    }

    pub fn get_portfolio_history(
        &self,
        conn: &mut SqliteConnection,
        account_id: Option<&str>,
    ) -> Result<Vec<PortfolioHistory>, Box<dyn std::error::Error>> {
        self.history_service
            .get_portfolio_history(conn, account_id)
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error>) // Convert PortfolioError to Box<dyn std::error::Error>
    }

    pub fn get_accounts_summary(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<AccountSummary>, Box<dyn std::error::Error>> {
        let accounts = self.account_service.get_active_accounts(conn)?;
        let mut account_summaries = Vec::new();

        // First, get the total portfolio value
        let total_portfolio_value = if let Ok(total_history) = self
            .history_service
            .get_latest_account_history(conn, "TOTAL")
        {
            total_history.market_value
        } else {
            return Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "Total portfolio history not found",
            )));
        };

        // Then, calculate the allocation percentage for each account
        for account in accounts {
            if let Ok(history) = self
                .history_service
                .get_latest_account_history(conn, &account.id)
            {
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
