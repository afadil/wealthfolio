use crate::accounts::AccountService;
use crate::activities::ActivityService;
use crate::assets::AssetService;
use crate::fx::fx_service::FxService;
use crate::market_data::market_data_model::{DataSource, QuoteRequest};
use crate::market_data::market_data_service::MarketDataService;
use crate::models::{
    AccountSummary, HistorySummary, Holding, IncomeSummary, PortfolioHistory,
    PORTFOLIO_PERCENT_SCALE
};
use crate::errors::{Error, Result, ValidationError};

use diesel::r2d2::{Pool, ConnectionManager};
use diesel::sqlite::SqliteConnection;
use log::info;

use std::sync::Arc;

use crate::portfolio::history_service::HistoryService;
use crate::portfolio::holdings_service::HoldingsService;
use crate::portfolio::income_service::IncomeService;


use bigdecimal::BigDecimal;
use std::str::FromStr;
use num_traits::Zero;


#[derive(Debug, Clone, Copy)]
pub enum ReturnMethod {
    TimeWeighted,
    MoneyWeighted,
}

impl Default for ReturnMethod {
    fn default() -> Self {
        ReturnMethod::TimeWeighted
    }
}

pub struct PortfolioService {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    account_service: Arc<AccountService>,
    activity_service: Arc<ActivityService>,
    assets_service: Arc<AssetService>,
    market_data_service: Arc<MarketDataService>,
    income_service: Arc<IncomeService>,
    holdings_service: Arc<HoldingsService>,
    history_service: Arc<HistoryService>,
}

impl PortfolioService {
    pub async fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, base_currency: String) -> Result<Self> {
        let base_currency = base_currency.clone();
        // Initialize services that require async initialization first
        let market_data_service = Arc::new(MarketDataService::new(pool.clone()).await?);
        let activity_service = Arc::new(ActivityService::new(pool.clone(), base_currency.clone()).await?);
        let holdings_service = Arc::new(HoldingsService::new(pool.clone(), base_currency.clone()).await?);

        // Initialize synchronous services
        let account_service = Arc::new(AccountService::new(pool.clone(), base_currency.clone()));
        let fx_service = FxService::new(pool.clone());
        let income_service = Arc::new(IncomeService::new(
            Arc::new(fx_service),
            base_currency.clone(),
        ));
        let history_service = Arc::new(HistoryService::new(
            pool.clone(),
            base_currency.clone(),
            FxService::new(pool.clone()),
            market_data_service.clone(),
        ));
        let assets_service = Arc::new(AssetService::new(pool.clone()).await?);

        Ok(Self {
            pool,
            account_service,
            activity_service,
            assets_service,
            market_data_service,
            income_service,
            holdings_service,
            history_service,
        })
    }

    pub async fn compute_holdings(&self) -> Result<Vec<Holding>> {
        self.holdings_service.compute_holdings().await
    }

    pub async fn calculate_historical_data(
        &self,
        account_ids: Option<Vec<String>>,
        force_full_calculation: bool,
    ) -> Result<Vec<HistorySummary>> {

        let assets = self.assets_service.get_assets()?;
        // First, sync quotes
        let quote_requests: Vec<_> = assets.iter()
            .map(|asset| QuoteRequest {
                symbol: asset.symbol.clone(),
                data_source: DataSource::from(asset.data_source.as_str()),
                currency: asset.currency.clone(),
            })
            .collect();
        self.market_data_service
            .sync_quotes(&quote_requests, false)
            .await?;

        let accounts = match &account_ids {
            Some(ids) => self.account_service.get_accounts_by_ids(ids)?,
            None => self.account_service.get_active_accounts()?,
        };

        let activities = match &account_ids {
            Some(ids) => self.activity_service.get_activities_by_account_ids(ids)?,
            None => self.activity_service.get_activities()?,
        };

        self.history_service
            .calculate_historical_data(&accounts, &activities, force_full_calculation)
            .await
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))
    }

    pub fn get_income_summary(&self) -> Result<Vec<IncomeSummary>> {
        let mut conn = self.pool.get()?;
        self.income_service.get_income_summary(&mut conn).map_err(Error::from)
    }

    pub async fn update_portfolio(&self) -> Result<Vec<HistorySummary>> {
        use std::time::Instant;
        let start = Instant::now();

        // Calculate historical data with specified performance mode
        let result = self.calculate_historical_data(None, false).await;

        let duration = start.elapsed();
        info!(
            "update_portfolio completed in: {:?} seconds",
            duration.as_secs_f64()
        );

        result
    }

    pub fn get_all_accounts_history(&self) -> Result<Vec<PortfolioHistory>> {
        self.history_service
            .get_all_accounts_history()
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))
    }

    pub fn get_portfolio_history(&self, account_id: Option<&str>) -> Result<Vec<PortfolioHistory>> {
        self.history_service
            .get_portfolio_history(account_id)
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))
    }

    pub fn get_accounts_summary(&self) -> Result<Vec<AccountSummary>> {
        let accounts = self.account_service.get_active_accounts()?;
        let mut account_summaries = Vec::new();

        // First, get the total portfolio value
        let total_portfolio_value = self
            .history_service
            .get_latest_account_history("TOTAL")
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))?
            .market_value;

        // Then, calculate the allocation percentage for each account
        for account in accounts {
            if let Ok(history) = self
                .history_service
                .get_latest_account_history(&account.id)
            {
                let allocation_percentage = if total_portfolio_value > BigDecimal::zero() {
                    let hundred = BigDecimal::from_str("100").unwrap();
                    ((&history.market_value / &total_portfolio_value) * hundred)
                        .with_scale(PORTFOLIO_PERCENT_SCALE)
                } else {
                    BigDecimal::zero().with_scale(PORTFOLIO_PERCENT_SCALE)
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
