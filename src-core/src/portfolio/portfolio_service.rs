use crate::accounts::AccountServiceTrait;
use crate::activities::ActivityServiceTrait;
use crate::assets::AssetServiceTrait;
use crate::errors::{Error, Result as ServiceResult, ValidationError};
use crate::market_data::market_data_model::{DataSource, QuoteRequest};
use crate::market_data::MarketDataServiceTrait;
use crate::models::{
    AccountSummary, HistoryRecord, HistorySummary, Holding, PORTFOLIO_PERCENT_SCALE,
};
use crate::portfolio::history_traits::HistoryServiceTrait;
use crate::holdings::HoldingsServiceTrait;

use async_trait::async_trait;
use log::info;

use rust_decimal::Decimal;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Instant;

// Define the trait for PortfolioService
#[async_trait]
pub trait PortfolioServiceTrait: Send + Sync {
    async fn compute_holdings(&self) -> ServiceResult<Vec<Holding>>;
    async fn calculate_historical_data(
        &self,
        account_ids: Option<Vec<String>>,
        force_full_calculation: bool,
    ) -> ServiceResult<Vec<HistorySummary>>;
    async fn update_portfolio(&self) -> ServiceResult<Vec<HistorySummary>>;
    fn get_all_accounts_history(&self) -> ServiceResult<Vec<HistoryRecord>>;
    fn get_portfolio_history(&self, account_id: Option<&str>) -> ServiceResult<Vec<HistoryRecord>>;
    fn get_accounts_summary(&self) -> ServiceResult<Vec<AccountSummary>>;
}

pub struct PortfolioService {
    account_service: Arc<dyn AccountServiceTrait>,
    activity_service: Arc<dyn ActivityServiceTrait>,
    asset_service: Arc<dyn AssetServiceTrait>,
    market_data_service: Arc<dyn MarketDataServiceTrait>,
    history_service: Arc<dyn HistoryServiceTrait>,
    holdings_service: Arc<dyn HoldingsServiceTrait>,
}

impl PortfolioService {
    pub fn new(
        account_service: Arc<dyn AccountServiceTrait>,
        activity_service: Arc<dyn ActivityServiceTrait>,
        asset_service: Arc<dyn AssetServiceTrait>,
        market_data_service: Arc<dyn MarketDataServiceTrait>,
        history_service: Arc<dyn HistoryServiceTrait>,
        holdings_service: Arc<dyn HoldingsServiceTrait>,
    ) -> Self {
        Self {
            account_service,
            activity_service,
            asset_service,
            market_data_service,
            history_service,
            holdings_service,
        }
    }
}

// Implement the trait for PortfolioService
#[async_trait]
impl PortfolioServiceTrait for PortfolioService {
    async fn compute_holdings(&self) -> ServiceResult<Vec<Holding>> {
        // Placeholder - Implement actual logic using injected services if needed
        Ok(vec![])
    }

    async fn calculate_historical_data(
        &self,
        account_ids: Option<Vec<String>>,
        force_full_calculation: bool,
    ) -> ServiceResult<Vec<HistorySummary>> {
        // Use injected services via trait methods
        let assets = self.asset_service.get_assets()?;
        let quote_requests: Vec<_> = assets
            .iter()
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

    async fn update_portfolio(&self) -> ServiceResult<Vec<HistorySummary>> {
        let start = Instant::now();

        // Fetch active accounts to recalculate holdings for them
        let active_accounts = self.account_service.get_active_accounts()?;
        let account_ids: Vec<String> = active_accounts.iter().map(|a| a.id.clone()).collect();

        // Ensure holdings are up-to-date before calculating history
        if !account_ids.is_empty() {
            self.holdings_service.recalculate_all_accounts(&account_ids)?;
        }

        // Calculate historical data with specified performance mode
        let result = self.calculate_historical_data(None, false).await;

        let duration = start.elapsed();
        info!(
            "update_portfolio completed in: {:?} seconds",
            duration.as_secs_f64()
        );

        result
    }

    fn get_all_accounts_history(&self) -> ServiceResult<Vec<HistoryRecord>> {
        self.history_service
            .get_all_accounts_history()
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string()))) // Consider mapping to a more specific error
    }

    fn get_portfolio_history(
        &self,
        account_id: Option<&str>,
    ) -> ServiceResult<Vec<HistoryRecord>> {
        self.history_service
            .get_portfolio_history(account_id)
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string()))) // Consider mapping to a more specific error
    }

    fn get_accounts_summary(&self) -> ServiceResult<Vec<AccountSummary>> {
        let accounts = self.account_service.get_active_accounts()?;
        let mut account_summaries = Vec::new();

        let total_portfolio_value = self
            .history_service
            .get_latest_account_history("TOTAL")
            .map_err(|e| Error::Validation(ValidationError::InvalidInput(e.to_string())))? // Consider mapping to a more specific error
            .market_value;

        for account in accounts {
            if let Ok(history) = self.history_service.get_latest_account_history(&account.id) {
                let allocation_percentage = if total_portfolio_value > Decimal::ZERO {
                    let hundred = Decimal::from_str("100").unwrap();
                    ((&history.market_value / &total_portfolio_value) * hundred)
                        .round_dp(PORTFOLIO_PERCENT_SCALE)
                } else {
                    Decimal::ZERO
                };

                account_summaries.push(AccountSummary {
                    account,
                    performance: HistoryRecord {
                        allocation_percentage,
                        ..history
                    },
                });
            }
        }

        Ok(account_summaries)
    }
}
