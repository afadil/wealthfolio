use std::{collections::HashSet, sync::Arc};

use crate::{
    error::ApiResult,
    events::{
        ServerEvent, MARKET_SYNC_COMPLETE, MARKET_SYNC_ERROR, MARKET_SYNC_START,
        PORTFOLIO_UPDATE_COMPLETE, PORTFOLIO_UPDATE_ERROR, PORTFOLIO_UPDATE_START,
    },
    main_lib::AppState,
};
use anyhow::anyhow;
use serde_json::json;
use wealthfolio_core::{
    accounts::AccountServiceTrait, activities::Activity, constants::PORTFOLIO_TOTAL_ACCOUNT_ID,
};

/// Normalize file paths by stripping file:// prefix
pub fn normalize_file_path(path: &str) -> String {
    path.strip_prefix("file://").unwrap_or(path).to_string()
}

#[derive(Debug, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioRequestBody {
    pub account_ids: Option<Vec<String>>,
    pub symbols: Option<Vec<String>>,
    #[serde(default)]
    pub refetch_all_market_data: bool,
}

impl PortfolioRequestBody {
    pub fn into_config(self, force_full_recalculation: bool) -> PortfolioJobConfig {
        PortfolioJobConfig {
            account_ids: self.account_ids,
            symbols: self.symbols,
            refetch_all_market_data: force_full_recalculation || self.refetch_all_market_data,
            force_full_recalculation,
        }
    }
}

pub struct PortfolioJobConfig {
    pub account_ids: Option<Vec<String>>,
    pub symbols: Option<Vec<String>>,
    pub refetch_all_market_data: bool,
    pub force_full_recalculation: bool,
}

/// Enqueue a background portfolio job that will publish SSE events as it runs.
pub fn enqueue_portfolio_job(state: Arc<AppState>, config: PortfolioJobConfig) {
    tokio::spawn(async move {
        if let Err(err) = process_portfolio_job(state, config).await {
            tracing::error!("Portfolio job failed: {}", err);
        }
    });
}

#[derive(Clone)]
pub enum AccountPortfolioImpact {
    CreatedOrUpdated {
        account_id: String,
        currency: String,
    },
    Deleted,
}

/// Mirror the Tauri account resource change logic to keep web mode in sync.
pub fn trigger_account_portfolio_job(state: Arc<AppState>, impact: AccountPortfolioImpact) {
    let base_currency = state.base_currency.read().unwrap().clone();

    let (account_ids, account_currency) = match impact {
        AccountPortfolioImpact::CreatedOrUpdated {
            account_id,
            currency,
        } => (Some(vec![account_id]), Some(currency)),
        AccountPortfolioImpact::Deleted => (None, None),
    };

    let mut symbols = None;
    if let Some(currency) = account_currency {
        if !base_currency.is_empty() && base_currency != currency {
            let symbol = format!("{}{}=X", currency, base_currency);
            symbols = Some(vec![symbol]);
        }
    }

    enqueue_portfolio_job(
        state,
        PortfolioJobConfig {
            account_ids,
            symbols,
            refetch_all_market_data: false,
            force_full_recalculation: true,
        },
    );
}

/// Trigger a lightweight portfolio update (no full recalculation) similar to Tauri defaults.
pub fn trigger_lightweight_portfolio_update(state: Arc<AppState>) {
    enqueue_portfolio_job(
        state,
        PortfolioJobConfig {
            account_ids: None,
            symbols: None,
            refetch_all_market_data: false,
            force_full_recalculation: false,
        },
    );
}

/// Trigger a full portfolio recalculation impacting every account.
pub fn trigger_full_portfolio_recalc(state: Arc<AppState>) {
    enqueue_portfolio_job(
        state,
        PortfolioJobConfig {
            account_ids: None,
            symbols: None,
            refetch_all_market_data: false,
            force_full_recalculation: true,
        },
    );
}

#[derive(Clone)]
pub struct ActivityImpact {
    pub account_id: String,
    pub currency: Option<String>,
    pub asset_id: Option<String>,
}

impl ActivityImpact {
    pub fn from_activity(activity: &Activity) -> Self {
        Self {
            account_id: activity.account_id.clone(),
            currency: Some(activity.currency.clone()),
            asset_id: Some(activity.asset_id.clone()),
        }
    }

    pub fn from_parts(
        account_id: String,
        currency: Option<String>,
        asset_id: Option<String>,
    ) -> Self {
        Self {
            account_id,
            currency,
            asset_id,
        }
    }
}

pub async fn process_portfolio_job(
    state: Arc<AppState>,
    config: PortfolioJobConfig,
) -> ApiResult<()> {
    let event_bus = state.event_bus.clone();
    event_bus.publish(ServerEvent::new(MARKET_SYNC_START));

    let sync_start = std::time::Instant::now();
    let sync_result = if config.refetch_all_market_data {
        state
            .market_data_service
            .resync_market_data(config.symbols.clone())
            .await
    } else {
        state.market_data_service.sync_market_data().await
    };

    match sync_result {
        Ok((_, failed_syncs)) => {
            event_bus.publish(ServerEvent::with_payload(
                MARKET_SYNC_COMPLETE,
                json!({ "failed_syncs": failed_syncs }),
            ));
            tracing::info!("Market data sync completed in {:?}", sync_start.elapsed());
            if let Err(err) = state.fx_service.initialize() {
                tracing::warn!(
                    "Failed to initialize FxService after market data sync: {}",
                    err
                );
            }
        }
        Err(err) => {
            let err_msg = err.to_string();
            tracing::error!("Market data sync failed: {}", err_msg);
            event_bus.publish(ServerEvent::with_payload(MARKET_SYNC_ERROR, json!(err_msg)));
            return Err(crate::error::ApiError::Anyhow(anyhow!(err_msg)));
        }
    }

    event_bus.publish(ServerEvent::new(PORTFOLIO_UPDATE_START));

    let active_accounts = state
        .account_service
        .list_accounts(Some(true), config.account_ids.as_deref())
        .map_err(|err| {
            let err_msg = format!("Failed to list active accounts: {}", err);
            event_bus.publish(ServerEvent::with_payload(
                PORTFOLIO_UPDATE_ERROR,
                json!(err_msg),
            ));
            crate::error::ApiError::Anyhow(anyhow!(err_msg))
        })?;

    let mut account_ids: Vec<String> = active_accounts.into_iter().map(|a| a.id).collect();

    if !account_ids.is_empty() {
        let ids_slice = account_ids.as_slice();
        let snapshot_result = if config.force_full_recalculation {
            state
                .snapshot_service
                .force_recalculate_holdings_snapshots(Some(ids_slice))
                .await
        } else {
            state
                .snapshot_service
                .calculate_holdings_snapshots(Some(ids_slice))
                .await
        };

        if let Err(err) = snapshot_result {
            let err_msg = format!(
                "Holdings snapshot calculation failed for targeted accounts: {}",
                err
            );
            tracing::warn!("{}", err_msg);
            event_bus.publish(ServerEvent::with_payload(
                PORTFOLIO_UPDATE_ERROR,
                json!(err_msg),
            ));
        }
    }

    if let Err(err) = state
        .snapshot_service
        .calculate_total_portfolio_snapshots()
        .await
    {
        let err_msg = format!("Failed to calculate TOTAL portfolio snapshot: {}", err);
        tracing::error!("{}", err_msg);
        event_bus.publish(ServerEvent::with_payload(
            PORTFOLIO_UPDATE_ERROR,
            json!(err_msg),
        ));
        return Err(crate::error::ApiError::Anyhow(anyhow!(err_msg)));
    }

    if !account_ids
        .iter()
        .any(|id| id == PORTFOLIO_TOTAL_ACCOUNT_ID)
    {
        account_ids.push(PORTFOLIO_TOTAL_ACCOUNT_ID.to_string());
    }

    for account_id in account_ids {
        if let Err(err) = state
            .valuation_service
            .calculate_valuation_history(&account_id, config.force_full_recalculation)
            .await
        {
            let err_msg = format!(
                "Valuation history calculation failed for {}: {}",
                account_id, err
            );
            tracing::warn!("{}", err_msg);
            event_bus.publish(ServerEvent::with_payload(
                PORTFOLIO_UPDATE_ERROR,
                json!(err_msg),
            ));
        }
    }

    event_bus.publish(ServerEvent::new(PORTFOLIO_UPDATE_COMPLETE));
    Ok(())
}

pub fn trigger_activity_portfolio_job(state: Arc<AppState>, impacts: Vec<ActivityImpact>) {
    if impacts.is_empty() {
        return;
    }

    let mut account_ids: HashSet<String> = HashSet::new();
    let mut symbols: HashSet<String> = HashSet::new();

    for impact in impacts {
        if impact.account_id.is_empty() {
            continue;
        }
        account_ids.insert(impact.account_id.clone());

        if let Some(asset_id) = impact.asset_id.as_deref() {
            if !asset_id.is_empty() {
                symbols.insert(asset_id.to_string());
            }
        }

        if let Some(currency) = impact.currency.as_deref() {
            match state.account_service.get_account(&impact.account_id) {
                Ok(account) => {
                    if currency != account.currency {
                        symbols.insert(format!("{}{}=X", account.currency, currency));
                    }
                }
                Err(err) => tracing::warn!(
                    "Unable to resolve account {} for activity-triggered recalculation: {}",
                    impact.account_id,
                    err
                ),
            }
        }
    }

    let config = PortfolioJobConfig {
        account_ids: if account_ids.is_empty() {
            None
        } else {
            Some(account_ids.into_iter().collect())
        },
        symbols: if symbols.is_empty() {
            None
        } else {
            Some(symbols.into_iter().collect())
        },
        refetch_all_market_data: true,
        force_full_recalculation: true,
    };

    enqueue_portfolio_job(state, config);
}
