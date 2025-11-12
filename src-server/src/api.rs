use std::{
    collections::HashSet, convert::Infallible, path::Path as StdPath, sync::Arc, time::Duration,
};

use crate::{
    config::Config,
    error::{ApiError, ApiResult},
    events::{
        ServerEvent, MARKET_SYNC_COMPLETE, MARKET_SYNC_ERROR, MARKET_SYNC_START,
        PORTFOLIO_UPDATE_COMPLETE, PORTFOLIO_UPDATE_ERROR, PORTFOLIO_UPDATE_START,
    },
    main_lib::AppState,
    models::{Account, AccountUpdate, NewAccount},
};
use anyhow::{anyhow, Context};
use axum::http::StatusCode;
use axum::{
    extract::{Path, Query, RawQuery, State},
    response::sse::{Event as SseEvent, KeepAlive, Sse},
    routing::{delete, get, post, put},
    Json, Router,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use futures_core::stream::Stream;
use serde::Deserialize;
use serde_json::json;
use tokio::{fs, task};
use tokio_stream::wrappers::{errors::BroadcastStreamRecvError, BroadcastStream};
use tower_http::{
    cors::{Any, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer},
    timeout::TimeoutLayer,
    trace::TraceLayer,
};
use utoipa::OpenApi;
use wealthfolio_core::{
    accounts::AccountServiceTrait,
    activities::{
        Activity, ActivityBulkMutationRequest, ActivityBulkMutationResult, ActivityImport,
        ActivitySearchResponse, ActivityUpdate, ImportMappingData, NewActivity,
    },
    addons::{
        self, AddonManifest, AddonUpdateCheckResult, AddonUpdateInfo, ExtractedAddon,
        InstalledAddon,
    },
    assets::{Asset as CoreAsset, UpdateAssetProfile},
    constants::PORTFOLIO_TOTAL_ACCOUNT_ID,
    db,
    fx::fx_model::{ExchangeRate, NewExchangeRate},
    goals::goals_model::{Goal, GoalsAllocation, NewGoal},
    limits::{ContributionLimit, DepositsCalculation, NewContributionLimit},
    market_data::{MarketDataProviderInfo, MarketDataProviderSetting, Quote},
    portfolio::{
        holdings::holdings_model::Holding,
        income::IncomeSummary,
        performance::{PerformanceMetrics, SimplePerformanceMetrics},
        valuation::valuation_model::DailyAccountValuation,
    },
    settings::{Settings, SettingsServiceTrait, SettingsUpdate},
};

#[utoipa::path(get, path = "/api/v1/healthz", responses((status = 200, description = "Health")))]
pub async fn healthz() -> &'static str {
    "ok"
}

#[utoipa::path(get, path = "/api/v1/readyz", responses((status = 200, description = "Ready")))]
pub async fn readyz() -> &'static str {
    "ok"
}

#[utoipa::path(get, path="/api/v1/accounts", responses((status=200, body = [Account])))]
async fn list_accounts(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Account>>> {
    let accounts = state.account_service.get_all_accounts()?;
    Ok(Json(accounts.into_iter().map(Account::from).collect()))
}

#[utoipa::path(post, path="/api/v1/accounts", request_body = NewAccount, responses((status=200, body = Account)))]
async fn create_account(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<NewAccount>,
) -> ApiResult<Json<Account>> {
    let core_new = payload.into();
    let created = state.account_service.create_account(core_new).await?;
    Ok(Json(Account::from(created)))
}

#[utoipa::path(put, path="/api/v1/accounts/{id}", request_body = AccountUpdate, responses((status=200, body=Account)))]
async fn update_account(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(mut payload): Json<AccountUpdate>,
) -> ApiResult<Json<Account>> {
    payload.id = Some(id);
    let updated = state.account_service.update_account(payload.into()).await?;
    Ok(Json(Account::from(updated)))
}

#[utoipa::path(delete, path="/api/v1/accounts/{id}", responses((status=204)))]
async fn delete_account(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<()> {
    state.account_service.delete_account(&id).await?;
    Ok(())
}

// Settings endpoints (web adapter relies on these)
async fn get_settings(State(state): State<Arc<AppState>>) -> ApiResult<Json<Settings>> {
    let s = state.settings_service.get_settings()?;
    Ok(Json(s))
}

async fn update_settings(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SettingsUpdate>,
) -> ApiResult<Json<Settings>> {
    state.settings_service.update_settings(&payload).await?;
    let s = state.settings_service.get_settings()?;
    Ok(Json(s))
}

async fn is_auto_update_check_enabled(State(state): State<Arc<AppState>>) -> ApiResult<Json<bool>> {
    let enabled = state
        .settings_service
        .is_auto_update_check_enabled()
        .unwrap_or(true);
    Ok(Json(enabled))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupDatabaseResponse {
    filename: String,
    data_b64: String,
}

async fn backup_database_route(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<BackupDatabaseResponse>> {
    let data_root = state.data_root.clone();
    let backup_path = task::spawn_blocking(move || db::backup_database(&data_root))
        .await
        .map_err(|e| anyhow::anyhow!("Failed to execute backup task: {}", e))??;

    let filename = StdPath::new(&backup_path)
        .file_name()
        .and_then(|f| f.to_str())
        .ok_or_else(|| anyhow::anyhow!("Invalid backup filename"))?
        .to_string();

    let bytes = fs::read(&backup_path)
        .await
        .with_context(|| format!("Failed to read backup file {}", backup_path))?;

    let data_b64 = BASE64.encode(&bytes);
    Ok(Json(BackupDatabaseResponse { filename, data_b64 }))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupToPathBody {
    #[serde(rename = "backupDir")]
    backup_dir: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupToPathResponse {
    path: String,
}

async fn backup_database_to_path_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<BackupToPathBody>,
) -> ApiResult<Json<BackupToPathResponse>> {
    let data_root = state.data_root.clone();
    let target_dir = body.backup_dir.clone();

    let backup_path = task::spawn_blocking(move || -> anyhow::Result<String> {
        let db_path = db::get_db_path(&data_root);
        let normalized_backup_dir = normalize_file_path(&target_dir);

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        let backup_filename = format!("wealthfolio_backup_{}.db", timestamp);
        let backup_path = StdPath::new(&normalized_backup_dir).join(&backup_filename);

        if let Some(parent) = backup_path.parent() {
            std::fs::create_dir_all(parent).with_context(|| {
                format!("Failed to create backup directory {}", parent.display())
            })?;
        }

        let backup_path_str = backup_path
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid backup path"))?
            .to_string();

        std::fs::copy(&db_path, &backup_path_str).with_context(|| {
            format!(
                "Failed to copy database from {} to {}",
                db_path, backup_path_str
            )
        })?;

        let wal_source = format!("{}-wal", db_path);
        let wal_target = format!("{}-wal", backup_path_str);
        if StdPath::new(&wal_source).exists() {
            std::fs::copy(&wal_source, &wal_target).with_context(|| {
                format!(
                    "Failed to copy WAL file from {} to {}",
                    wal_source, wal_target
                )
            })?;
        }

        let shm_source = format!("{}-shm", db_path);
        let shm_target = format!("{}-shm", backup_path_str);
        if StdPath::new(&shm_source).exists() {
            std::fs::copy(&shm_source, &shm_target).with_context(|| {
                format!(
                    "Failed to copy SHM file from {} to {}",
                    shm_source, shm_target
                )
            })?;
        }

        Ok(backup_path_str)
    })
    .await
    .map_err(|e| anyhow::anyhow!("Failed to execute backup-to-path task: {}", e))??;

    Ok(Json(BackupToPathResponse { path: backup_path }))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreBody {
    #[serde(rename = "backupFilePath")]
    backup_file_path: String,
}

async fn restore_database_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RestoreBody>,
) -> ApiResult<StatusCode> {
    let data_root = state.data_root.clone();
    task::spawn_blocking(move || {
        let normalized_path = normalize_file_path(&body.backup_file_path);
        db::restore_database_safe(&data_root, &normalized_path)
            .with_context(|| format!("Failed to restore database from {}", normalized_path))
    })
    .await
    .map_err(|e| anyhow::anyhow!("Failed to execute restore task: {}", e))??;

    Ok(StatusCode::NO_CONTENT)
}

fn normalize_file_path(path: &str) -> String {
    path.strip_prefix("file://").unwrap_or(path).to_string()
}

fn read_manifest_if_exists(addon_dir: &StdPath) -> anyhow::Result<Option<AddonManifest>> {
    let manifest_path = addon_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&manifest_path)
        .with_context(|| format!("Failed to read manifest {}", manifest_path.display()))?;
    let manifest = serde_json::from_str::<AddonManifest>(&content)
        .with_context(|| format!("Failed to parse manifest {}", manifest_path.display()))?;
    Ok(Some(manifest))
}

fn read_manifest_or_error(addon_dir: &StdPath) -> anyhow::Result<AddonManifest> {
    read_manifest_if_exists(addon_dir)?.ok_or_else(|| {
        anyhow::anyhow!(format!(
            "Addon manifest not found in {}",
            addon_dir.display()
        ))
    })
}

// Holdings endpoint
#[derive(serde::Deserialize)]
struct HoldingsQuery {
    #[serde(rename = "accountId")]
    account_id: String,
}

async fn get_holdings(
    State(state): State<Arc<AppState>>,
    Query(q): Query<HoldingsQuery>,
) -> ApiResult<Json<Vec<Holding>>> {
    let base = state.base_currency.read().unwrap().clone();
    let holdings = state
        .holdings_service
        .get_holdings(&q.account_id, &base)
        .await?;
    Ok(Json(holdings))
}

#[derive(serde::Deserialize)]
struct HoldingItemQuery {
    #[serde(rename = "accountId")]
    account_id: String,
    #[serde(rename = "assetId")]
    asset_id: String,
}

async fn get_holding(
    State(state): State<Arc<AppState>>,
    Query(q): Query<HoldingItemQuery>,
) -> ApiResult<Json<Option<Holding>>> {
    let base = state.base_currency.read().unwrap().clone();
    let holding = state
        .holdings_service
        .get_holding(&q.account_id, &q.asset_id, &base)
        .await?;
    Ok(Json(holding))
}

// Historical valuations endpoint
#[derive(serde::Deserialize)]
struct HistoryQuery {
    #[serde(rename = "accountId")]
    account_id: String,
    #[serde(rename = "startDate")]
    start_date: Option<String>,
    #[serde(rename = "endDate")]
    end_date: Option<String>,
}

async fn get_historical_valuations(
    State(state): State<Arc<AppState>>,
    Query(q): Query<HistoryQuery>,
) -> ApiResult<Json<Vec<DailyAccountValuation>>> {
    let start = match q.start_date {
        Some(s) => Some(
            chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))?,
        ),
        None => None,
    };
    let end = match q.end_date {
        Some(s) => Some(
            chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))?,
        ),
        None => None,
    };
    let vals = state
        .valuation_service
        .get_historical_valuations(&q.account_id, start, end)?;
    Ok(Json(vals))
}

// Latest valuations endpoint
async fn get_latest_valuations(
    State(state): State<Arc<AppState>>,
    raw: RawQuery,
) -> ApiResult<Json<Vec<DailyAccountValuation>>> {
    // Parse query manually for robustness (supports accountIds and accountIds[])
    let mut ids: Vec<String> = Vec::new();
    if let Some(qs) = raw.0 {
        // Collect all values for both keys
        if let Ok(pairs) = serde_urlencoded::from_str::<Vec<(String, String)>>(&qs) {
            for (k, v) in pairs {
                if k == "accountIds" || k == "accountIds[]" {
                    ids.push(v);
                }
            }
        }
    }
    if ids.is_empty() {
        ids = state
            .account_service
            .get_active_accounts()?
            .into_iter()
            .map(|a| a.id)
            .collect();
    }
    if ids.is_empty() {
        return Ok(Json(vec![]));
    }
    let vals = state.valuation_service.get_latest_valuations(&ids)?;
    Ok(Json(vals))
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortfolioRequestBody {
    account_ids: Option<Vec<String>>,
    symbols: Option<Vec<String>>,
    #[serde(default)]
    refetch_all_market_data: bool,
}

impl PortfolioRequestBody {
    fn into_config(self, force_full_recalculation: bool) -> PortfolioJobConfig {
        PortfolioJobConfig {
            account_ids: self.account_ids,
            symbols: self.symbols,
            refetch_all_market_data: force_full_recalculation || self.refetch_all_market_data,
            force_full_recalculation,
        }
    }
}

struct PortfolioJobConfig {
    account_ids: Option<Vec<String>>,
    symbols: Option<Vec<String>>,
    refetch_all_market_data: bool,
    force_full_recalculation: bool,
}

#[derive(Clone)]
struct ActivityImpact {
    account_id: String,
    currency: Option<String>,
    asset_id: Option<String>,
}

impl ActivityImpact {
    fn from_activity(activity: &Activity) -> Self {
        Self {
            account_id: activity.account_id.clone(),
            currency: Some(activity.currency.clone()),
            asset_id: Some(activity.asset_id.clone()),
        }
    }

    fn from_parts(account_id: String, currency: Option<String>, asset_id: Option<String>) -> Self {
        Self {
            account_id,
            currency,
            asset_id,
        }
    }
}

// Portfolio update endpoints for web
async fn update_portfolio(
    State(state): State<Arc<AppState>>,
    body: Option<Json<PortfolioRequestBody>>,
) -> ApiResult<StatusCode> {
    let cfg = body
        .map(|Json(inner)| inner)
        .unwrap_or_default()
        .into_config(false);
    process_portfolio_job(state, cfg).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn recalculate_portfolio(
    State(state): State<Arc<AppState>>,
    body: Option<Json<PortfolioRequestBody>>,
) -> ApiResult<StatusCode> {
    let cfg = body
        .map(|Json(inner)| inner)
        .unwrap_or_default()
        .into_config(true);
    process_portfolio_job(state, cfg).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn process_portfolio_job(state: Arc<AppState>, config: PortfolioJobConfig) -> ApiResult<()> {
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
            return Err(ApiError::Anyhow(anyhow!(err_msg)));
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
            ApiError::Anyhow(anyhow!(err_msg))
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
        return Err(ApiError::Anyhow(anyhow!(err_msg)));
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

fn trigger_activity_portfolio_job(state: Arc<AppState>, impacts: Vec<ActivityImpact>) {
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

    tokio::spawn(async move {
        if let Err(err) = process_portfolio_job(state, config).await {
            tracing::error!("Activity-triggered portfolio update failed: {}", err);
        }
    });
}

async fn stream_events(
    State(state): State<Arc<AppState>>,
) -> Sse<impl Stream<Item = Result<SseEvent, Infallible>>> {
    let receiver = BroadcastStream::new(state.event_bus.subscribe());
    let stream = tokio_stream::StreamExt::filter_map(receiver, |event| match event {
        Ok(evt) => {
            let sse_event = SseEvent::default().event(evt.name);
            let sse_event = if let Some(payload) = evt.payload {
                match sse_event.json_data(payload) {
                    Ok(ev) => ev,
                    Err(err) => {
                        tracing::error!(
                            "Failed to serialize SSE payload for {}: {}",
                            evt.name,
                            err
                        );
                        return None;
                    }
                }
            } else {
                sse_event.data("null")
            };
            Some(Ok(sse_event))
        }
        Err(BroadcastStreamRecvError::Lagged(_)) => None,
    });

    Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(15))
            .text("keep-alive"),
    )
}

// Performance endpoints
#[derive(serde::Deserialize)]
struct AccountsSimplePerfBody {
    #[serde(rename = "accountIds")]
    account_ids: Option<Vec<String>>,
}

async fn calculate_accounts_simple_performance(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AccountsSimplePerfBody>,
) -> ApiResult<Json<Vec<SimplePerformanceMetrics>>> {
    let ids = if let Some(ids) = body.account_ids {
        ids
    } else {
        state
            .account_service
            .get_active_accounts()?
            .into_iter()
            .map(|a| a.id)
            .collect()
    };
    if ids.is_empty() {
        return Ok(Json(Vec::new()));
    }
    let metrics = state
        .performance_service
        .calculate_accounts_simple_performance(&ids)?;
    Ok(Json(metrics))
}

#[derive(serde::Deserialize)]
struct PerfBody {
    #[serde(rename = "itemType")]
    item_type: String,
    #[serde(rename = "itemId")]
    item_id: String,
    #[serde(rename = "startDate")]
    start_date: Option<String>,
    #[serde(rename = "endDate")]
    end_date: Option<String>,
}

async fn calculate_performance_history(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PerfBody>,
) -> ApiResult<Json<PerformanceMetrics>> {
    let start = match &body.start_date {
        Some(s) => Some(
            chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))?,
        ),
        None => None,
    };
    let end = match &body.end_date {
        Some(s) => Some(
            chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))?,
        ),
        None => None,
    };
    let metrics = state
        .performance_service
        .calculate_performance_history(&body.item_type, &body.item_id, start, end)
        .await?;
    Ok(Json(metrics))
}

async fn calculate_performance_summary(
    State(state): State<Arc<AppState>>,
    Json(body): Json<PerfBody>,
) -> ApiResult<Json<PerformanceMetrics>> {
    let start = match &body.start_date {
        Some(s) => Some(
            chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))?,
        ),
        None => None,
    };
    let end = match &body.end_date {
        Some(s) => Some(
            chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
                .map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))?,
        ),
        None => None,
    };
    let metrics = state
        .performance_service
        .calculate_performance_summary(&body.item_type, &body.item_id, start, end)
        .await?;
    Ok(Json(metrics))
}

// Income
async fn get_income_summary(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<IncomeSummary>>> {
    let items = state.income_service.get_income_summary()?;
    Ok(Json(items))
}

// Goals endpoints
async fn get_goals(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Goal>>> {
    let goals = state.goal_service.get_goals()?;
    Ok(Json(goals))
}

async fn create_goal(
    State(state): State<Arc<AppState>>,
    Json(goal): Json<NewGoal>,
) -> ApiResult<Json<Goal>> {
    let g = state.goal_service.create_goal(goal).await?;
    Ok(Json(g))
}

async fn update_goal(
    State(state): State<Arc<AppState>>,
    Json(goal): Json<Goal>,
) -> ApiResult<Json<Goal>> {
    let g = state.goal_service.update_goal(goal).await?;
    Ok(Json(g))
}

async fn delete_goal(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<()> {
    let _ = state.goal_service.delete_goal(id).await?;
    Ok(())
}

async fn load_goals_allocations(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<GoalsAllocation>>> {
    let allocs = state.goal_service.load_goals_allocations()?;
    Ok(Json(allocs))
}

async fn update_goal_allocations(
    State(state): State<Arc<AppState>>,
    Json(allocs): Json<Vec<GoalsAllocation>>,
) -> ApiResult<()> {
    let _ = state.goal_service.upsert_goal_allocations(allocs).await?;
    Ok(())
}

// Exchange rates endpoints
async fn get_latest_exchange_rates(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<ExchangeRate>>> {
    let rates = state.fx_service.get_latest_exchange_rates()?;
    Ok(Json(rates))
}

async fn update_exchange_rate(
    State(state): State<Arc<AppState>>,
    Json(rate): Json<ExchangeRate>,
) -> ApiResult<Json<ExchangeRate>> {
    let updated = state
        .fx_service
        .update_exchange_rate(&rate.from_currency, &rate.to_currency, rate.rate)
        .await?;
    Ok(Json(updated))
}

async fn add_exchange_rate(
    State(state): State<Arc<AppState>>,
    Json(new_rate): Json<NewExchangeRate>,
) -> ApiResult<Json<ExchangeRate>> {
    let added = state.fx_service.add_exchange_rate(new_rate).await?;
    Ok(Json(added))
}

async fn delete_exchange_rate(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<()> {
    state.fx_service.delete_exchange_rate(&id).await?;
    Ok(())
}

// Activities endpoints
#[derive(serde::Deserialize)]
#[serde(untagged)]
enum SortWrapper {
    One(wealthfolio_core::activities::Sort),
    Many(Vec<wealthfolio_core::activities::Sort>),
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
enum StringOrVec {
    One(String),
    Many(Vec<String>),
}

#[derive(serde::Deserialize)]
struct ActivitySearchBody {
    page: i64,
    #[serde(rename = "pageSize")]
    page_size: i64,
    #[serde(rename = "accountIdFilter")]
    account_id_filter: Option<StringOrVec>,
    #[serde(rename = "activityTypeFilter")]
    activity_type_filter: Option<StringOrVec>,
    #[serde(rename = "assetIdKeyword")]
    asset_id_keyword: Option<String>,
    // Allow addons to pass either a single sort or an array (we pick the first)
    sort: Option<SortWrapper>,
}

async fn search_activities(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ActivitySearchBody>,
) -> ApiResult<Json<ActivitySearchResponse>> {
    // Normalize sort to a single value if provided
    let sort_normalized: Option<wealthfolio_core::activities::Sort> = match body.sort {
        Some(SortWrapper::One(s)) => Some(s),
        Some(SortWrapper::Many(v)) => v.into_iter().next(),
        None => None,
    };
    let account_ids: Option<Vec<String>> = match body.account_id_filter {
        Some(StringOrVec::One(s)) => Some(vec![s]),
        Some(StringOrVec::Many(v)) => Some(v),
        None => None,
    };
    let types: Option<Vec<String>> = match body.activity_type_filter {
        Some(StringOrVec::One(s)) => Some(vec![s]),
        Some(StringOrVec::Many(v)) => Some(v),
        None => None,
    };
    let resp = state.activity_service.search_activities(
        body.page,
        body.page_size,
        account_ids,
        types,
        body.asset_id_keyword,
        sort_normalized,
    )?;
    Ok(Json(resp))
}

async fn create_activity(
    State(state): State<Arc<AppState>>,
    Json(activity): Json<NewActivity>,
) -> ApiResult<Json<wealthfolio_core::activities::Activity>> {
    let created = state.activity_service.create_activity(activity).await?;
    trigger_activity_portfolio_job(state, vec![ActivityImpact::from_activity(&created)]);
    Ok(Json(created))
}

async fn update_activity(
    State(state): State<Arc<AppState>>,
    Json(activity): Json<ActivityUpdate>,
) -> ApiResult<Json<wealthfolio_core::activities::Activity>> {
    let previous = state.activity_service.get_activity(&activity.id)?;
    let updated = state.activity_service.update_activity(activity).await?;
    trigger_activity_portfolio_job(
        state,
        vec![
            ActivityImpact::from_activity(&updated),
            ActivityImpact::from_activity(&previous),
        ],
    );
    Ok(Json(updated))
}

async fn save_activities(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ActivityBulkMutationRequest>,
) -> ApiResult<Json<ActivityBulkMutationResult>> {
    let result = state
        .activity_service
        .bulk_mutate_activities(request)
        .await?;
    let mut impacts: Vec<ActivityImpact> = Vec::new();
    impacts.extend(result.created.iter().map(ActivityImpact::from_activity));
    impacts.extend(result.updated.iter().map(ActivityImpact::from_activity));
    impacts.extend(result.deleted.iter().map(ActivityImpact::from_activity));
    trigger_activity_portfolio_job(state, impacts);
    Ok(Json(result))
}

async fn delete_activity(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<wealthfolio_core::activities::Activity>> {
    let deleted = state.activity_service.delete_activity(id).await?;
    trigger_activity_portfolio_job(state, vec![ActivityImpact::from_activity(&deleted)]);
    Ok(Json(deleted))
}

// Activity import endpoints
#[derive(serde::Deserialize)]
struct ImportCheckBody {
    #[serde(rename = "accountId")]
    account_id: String,
    activities: Vec<ActivityImport>,
}

async fn check_activities_import(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ImportCheckBody>,
) -> ApiResult<Json<Vec<ActivityImport>>> {
    let res = state
        .activity_service
        .check_activities_import(body.account_id, body.activities)
        .await?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct ImportBody {
    #[serde(rename = "accountId")]
    account_id: String,
    activities: Vec<ActivityImport>,
}

async fn import_activities(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ImportBody>,
) -> ApiResult<Json<Vec<ActivityImport>>> {
    let res = state
        .activity_service
        .import_activities(body.account_id, body.activities)
        .await?;
    trigger_activity_portfolio_job(
        state,
        res.iter()
            .map(|item| {
                ActivityImpact::from_parts(
                    item.account_id.clone().unwrap_or_default(),
                    Some(item.currency.clone()),
                    Some(item.symbol.clone()),
                )
            })
            .collect(),
    );
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct MappingQuery {
    #[serde(rename = "accountId")]
    account_id: String,
}

async fn get_account_import_mapping(
    State(state): State<Arc<AppState>>,
    Query(q): Query<MappingQuery>,
) -> ApiResult<Json<ImportMappingData>> {
    let res = state.activity_service.get_import_mapping(q.account_id)?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct SaveMappingBody {
    mapping: ImportMappingData,
}

async fn save_account_import_mapping(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SaveMappingBody>,
) -> ApiResult<Json<ImportMappingData>> {
    let res = state
        .activity_service
        .save_import_mapping(body.mapping)
        .await?;
    Ok(Json(res))
}

// Market data providers
async fn get_market_data_providers(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<MarketDataProviderInfo>>> {
    let infos = state
        .market_data_service
        .get_market_data_providers_info()
        .await?;
    Ok(Json(infos))
}

async fn get_market_data_providers_settings(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<MarketDataProviderSetting>>> {
    let settings = state
        .market_data_service
        .get_market_data_providers_settings()
        .await?;
    Ok(Json(settings))
}

#[derive(serde::Deserialize)]
struct ProviderUpdateBody {
    #[serde(rename = "providerId")]
    provider_id: String,
    priority: i32,
    enabled: bool,
}

async fn update_market_data_provider_settings(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ProviderUpdateBody>,
) -> ApiResult<Json<MarketDataProviderSetting>> {
    let updated = state
        .market_data_service
        .update_market_data_provider_settings(body.provider_id, body.priority, body.enabled)
        .await?;
    Ok(Json(updated))
}

// Contribution limits
async fn get_contribution_limits(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<ContributionLimit>>> {
    let limits = state.limits_service.get_contribution_limits()?;
    Ok(Json(limits))
}

async fn create_contribution_limit(
    State(state): State<Arc<AppState>>,
    Json(new_limit): Json<NewContributionLimit>,
) -> ApiResult<Json<ContributionLimit>> {
    let created = state
        .limits_service
        .create_contribution_limit(new_limit)
        .await?;
    Ok(Json(created))
}

async fn update_contribution_limit(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(updated): Json<NewContributionLimit>,
) -> ApiResult<Json<ContributionLimit>> {
    let updated = state
        .limits_service
        .update_contribution_limit(&id, updated)
        .await?;
    Ok(Json(updated))
}

async fn delete_contribution_limit(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<()> {
    state.limits_service.delete_contribution_limit(&id).await?;
    Ok(())
}

async fn calculate_deposits_for_contribution_limit(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<DepositsCalculation>> {
    let base = state.base_currency.read().unwrap().clone();
    let calc = state
        .limits_service
        .calculate_deposits_for_contribution_limit(&id, &base)?;
    Ok(Json(calc))
}

// Asset profile endpoints
#[derive(serde::Deserialize)]
struct AssetQuery {
    #[serde(rename = "assetId")]
    asset_id: String,
}

async fn get_asset_profile(
    State(state): State<Arc<AppState>>,
    Query(q): Query<AssetQuery>,
) -> ApiResult<Json<CoreAsset>> {
    let asset = state.asset_service.get_asset_by_id(&q.asset_id)?;
    Ok(Json(asset))
}

async fn update_asset_profile(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(payload): Json<UpdateAssetProfile>,
) -> ApiResult<Json<CoreAsset>> {
    let asset = state
        .asset_service
        .update_asset_profile(&id, payload)
        .await?;
    Ok(Json(asset))
}

#[derive(serde::Deserialize)]
struct DataSourceBody {
    #[serde(rename = "dataSource")]
    data_source: String,
}

async fn update_asset_data_source(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(body): Json<DataSourceBody>,
) -> ApiResult<Json<CoreAsset>> {
    let asset = state
        .asset_service
        .update_asset_data_source(&id, body.data_source)
        .await?;
    Ok(Json(asset))
}

// Market data quotes/search
#[derive(serde::Deserialize)]
struct SearchQuery {
    query: String,
}

async fn search_symbol(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SearchQuery>,
) -> ApiResult<Json<Vec<wealthfolio_core::market_data::QuoteSummary>>> {
    let res = state.market_data_service.search_symbol(&q.query).await?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct QuoteHistoryQuery {
    symbol: String,
}

async fn get_quote_history(
    State(state): State<Arc<AppState>>,
    Query(q): Query<QuoteHistoryQuery>,
) -> ApiResult<Json<Vec<Quote>>> {
    let res = state
        .market_data_service
        .get_historical_quotes_for_symbol(&q.symbol)?;
    Ok(Json(res))
}

async fn update_quote(
    Path(symbol): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(mut quote): Json<Quote>,
) -> ApiResult<()> {
    // Ensure symbol matches body
    quote.symbol = symbol;
    state.market_data_service.update_quote(quote).await?;
    Ok(())
}

async fn delete_quote(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<()> {
    state.market_data_service.delete_quote(&id).await?;
    Ok(())
}

async fn sync_history_quotes(State(state): State<Arc<AppState>>) -> ApiResult<StatusCode> {
    let (_ok, failures) = state.market_data_service.resync_market_data(None).await?;
    if !failures.is_empty() {
        tracing::warn!("resync_market_data reported {} failures", failures.len());
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct SyncBody {
    symbols: Option<Vec<String>>,
    #[serde(rename = "refetchAll")]
    refetch_all: bool,
}

async fn sync_market_data(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SyncBody>,
) -> ApiResult<()> {
    // Prefer targeted resync when symbols provided; otherwise do global sync/resync based on refetch_all
    if let Some(symbols) = body.symbols.clone() {
        let _ = state
            .market_data_service
            .resync_market_data(Some(symbols))
            .await?;
    } else if body.refetch_all {
        let _ = state.market_data_service.resync_market_data(None).await?;
    } else {
        let _ = state.market_data_service.sync_market_data().await?;
    }
    Ok(())
}

// Secrets endpoints
#[derive(serde::Deserialize)]
struct SecretSetBody {
    #[serde(rename = "providerId")]
    provider_id: String,
    secret: String,
}

async fn set_secret(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SecretSetBody>,
) -> ApiResult<()> {
    state
        .secret_store
        .set_secret(&body.provider_id, &body.secret)?;
    Ok(())
}

#[derive(serde::Deserialize)]
struct SecretQuery {
    #[serde(rename = "providerId")]
    provider_id: String,
}

async fn get_secret(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SecretQuery>,
) -> ApiResult<Json<Option<String>>> {
    let val = state.secret_store.get_secret(&q.provider_id)?;
    Ok(Json(val))
}

async fn delete_secret(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SecretQuery>,
) -> ApiResult<()> {
    state.secret_store.delete_secret(&q.provider_id)?;
    Ok(())
}

#[derive(OpenApi)]
#[openapi(
    paths(healthz, readyz, list_accounts, create_account, update_account, delete_account),
    components(schemas(Account, NewAccount, AccountUpdate)),
    tags((name="wealthfolio"))
)]
pub struct ApiDoc;

pub fn app_router(state: Arc<AppState>, config: &Config) -> Router {
    let cors = if config.cors_allow.iter().any(|o| o == "*") {
        CorsLayer::new().allow_origin(Any)
    } else {
        let origins = config
            .cors_allow
            .iter()
            .map(|o| o.parse().unwrap())
            .collect::<Vec<_>>();
        CorsLayer::new().allow_origin(origins)
    };

    let openapi = ApiDoc::openapi();

    let api = Router::new()
        .route("/healthz", get(healthz))
        .route("/readyz", get(readyz))
        .route("/accounts", get(list_accounts).post(create_account))
        .route("/accounts/:id", put(update_account).delete(delete_account))
        .route("/settings", get(get_settings).put(update_settings))
        .route(
            "/settings/auto-update-enabled",
            get(is_auto_update_check_enabled),
        )
        .route("/utilities/database/backup", post(backup_database_route))
        .route(
            "/utilities/database/backup-to-path",
            post(backup_database_to_path_route),
        )
        .route("/utilities/database/restore", post(restore_database_route))
        .route("/holdings", get(get_holdings))
        .route("/holdings/item", get(get_holding))
        .route("/valuations/history", get(get_historical_valuations))
        .route("/valuations/latest", get(get_latest_valuations))
        .route("/portfolio/update", post(update_portfolio))
        .route("/portfolio/recalculate", post(recalculate_portfolio))
        .route("/events/stream", get(stream_events))
        .route(
            "/performance/accounts/simple",
            post(calculate_accounts_simple_performance),
        )
        .route("/performance/history", post(calculate_performance_history))
        .route("/performance/summary", post(calculate_performance_summary))
        .route("/income/summary", get(get_income_summary))
        .route("/exchange-rates/latest", get(get_latest_exchange_rates))
        .route(
            "/exchange-rates",
            put(update_exchange_rate).post(add_exchange_rate),
        )
        .route("/exchange-rates/:id", delete(delete_exchange_rate))
        .route("/activities/search", post(search_activities))
        .route("/activities", post(create_activity).put(update_activity))
        .route("/activities/bulk", post(save_activities))
        .route("/activities/:id", delete(delete_activity))
        .route("/activities/import/check", post(check_activities_import))
        .route("/activities/import", post(import_activities))
        .route(
            "/activities/import/mapping",
            get(get_account_import_mapping).post(save_account_import_mapping),
        )
        .route("/providers", get(get_market_data_providers))
        .route(
            "/providers/settings",
            get(get_market_data_providers_settings).put(update_market_data_provider_settings),
        )
        .route("/market-data/search", get(search_symbol))
        .route("/market-data/quotes/history", get(get_quote_history))
        .route("/market-data/quotes/:symbol", put(update_quote))
        .route("/market-data/quotes/id/:id", delete(delete_quote))
        .route("/market-data/sync/history", post(sync_history_quotes))
        .route("/market-data/sync", post(sync_market_data))
        .route(
            "/limits",
            get(get_contribution_limits).post(create_contribution_limit),
        )
        .route(
            "/limits/:id",
            put(update_contribution_limit).delete(delete_contribution_limit),
        )
        .route(
            "/limits/:id/deposits",
            get(calculate_deposits_for_contribution_limit),
        )
        .route("/assets/profile", get(get_asset_profile))
        .route("/assets/profile/:id", put(update_asset_profile))
        .route("/assets/data-source/:id", put(update_asset_data_source))
        .route(
            "/secrets",
            post(set_secret).get(get_secret).delete(delete_secret),
        )
        .route(
            "/goals/allocations",
            get(load_goals_allocations).post(update_goal_allocations),
        )
        .route("/goals", get(get_goals).post(create_goal).put(update_goal))
        .route("/goals/:id", delete(delete_goal))
        // Addons (web mode)
        .route("/addons/installed", get(list_installed_addons_web))
        .route("/addons/install-zip", post(install_addon_zip_web))
        .route("/addons/toggle", post(toggle_addon_web))
        .route("/addons/:id", delete(uninstall_addon_web))
        .route("/addons/runtime/:id", get(load_addon_for_runtime_web))
        .route(
            "/addons/enabled-on-startup",
            get(get_enabled_addons_on_startup_web),
        )
        .route("/addons/extract", post(extract_addon_zip_web));
    // Store + staging
    let api = api
        .route(
            "/addons/store/listings",
            get(fetch_addon_store_listings_web),
        )
        .route(
            "/addons/store/ratings",
            post(submit_addon_rating_web).get(get_addon_ratings_web),
        )
        .route("/addons/store/check-update", post(check_addon_update_web))
        .route("/addons/store/check-all", post(check_all_addon_updates_web))
        .route(
            "/addons/store/update",
            post(update_addon_from_store_by_id_web),
        )
        .route(
            "/addons/store/staging/download",
            post(download_addon_to_staging_web),
        )
        .route(
            "/addons/store/install-from-staging",
            post(install_addon_from_staging_web),
        )
        .route("/addons/store/staging", delete(clear_addon_staging_web))
        .route("/sync/status", get(get_sync_status_web))
        .route(
            "/sync/generate-pairing-payload",
            post(generate_pairing_payload_web),
        )
        .route("/sync/pair-and-sync", post(pair_and_sync_web))
        .route("/sync/force-full", post(force_full_sync_with_peer_web))
        .route("/sync/sync-now", post(sync_now_web))
        .route(
            "/sync/initialize-existing",
            post(initialize_sync_for_existing_data_web),
        )
        .route("/sync/probe", post(probe_local_network_access_web));

    Router::new()
        .nest("/api/v1", api)
        .route("/openapi.json", get(|| async { Json(openapi) }))
        .with_state(state)
        .layer(cors)
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(TimeoutLayer::new(config.request_timeout))
        .layer(TraceLayer::new_for_http())
}

// ===================== Addons (Web) =====================

#[derive(serde::Deserialize)]
struct InstallZipBody {
    #[serde(rename = "zipData")]
    zip_data: Option<Vec<u8>>,
    #[serde(rename = "zipDataB64")]
    zip_data_b64: Option<String>,
    #[serde(rename = "enableAfterInstall")]
    enable_after_install: Option<bool>,
}

#[derive(serde::Deserialize)]
struct AddonIdBody {
    #[serde(rename = "addonId")]
    addon_id: String,
}

async fn install_addon_zip_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<InstallZipBody>,
) -> ApiResult<Json<AddonManifest>> {
    let addons_root = StdPath::new(&state.addons_root);
    let zip_bytes: Vec<u8> = if let Some(b64) = body.zip_data_b64 {
        BASE64
            .decode(b64)
            .map_err(|e| anyhow::anyhow!("Invalid base64 zipDataB64: {}", e))?
    } else if let Some(bytes) = body.zip_data {
        bytes
    } else {
        return Err(anyhow::anyhow!("Missing zip data").into());
    };
    let extracted =
        addons::extract_addon_zip_internal(zip_bytes).map_err(|e| anyhow::anyhow!(e))?;
    let addon_id = extracted.metadata.id.clone();
    let addon_dir =
        addons::get_addon_path(addons_root, &addon_id).map_err(|e| anyhow::anyhow!(e))?;
    if addon_dir.exists() {
        std::fs::remove_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    std::fs::create_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    for file in &extracted.files {
        let file_path = addon_dir.join(&file.name);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| anyhow::anyhow!("{}", e))?;
        }
        std::fs::write(&file_path, &file.content).map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    let metadata = extracted
        .metadata
        .to_installed(body.enable_after_install.unwrap_or(true))
        .map_err(|e| anyhow::anyhow!(e))?;
    let manifest_path = addon_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&metadata).map_err(|e| anyhow::anyhow!(e))?;
    std::fs::write(&manifest_path, manifest_json).map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(metadata))
}

async fn list_installed_addons_web(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<InstalledAddon>>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addons_dir =
        addons::ensure_addons_directory(addons_root).map_err(|e| anyhow::anyhow!(e))?;
    let mut installed = Vec::new();
    if addons_dir.exists() {
        for entry in std::fs::read_dir(&addons_dir).map_err(|e| anyhow::anyhow!("{}", e))? {
            let entry = entry.map_err(|e| anyhow::anyhow!("{}", e))?;
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let manifest_path = dir.join("manifest.json");
            if !manifest_path.exists() {
                continue;
            }
            let content =
                std::fs::read_to_string(&manifest_path).map_err(|e| anyhow::anyhow!("{}", e))?;
            let metadata: AddonManifest =
                serde_json::from_str(&content).map_err(|e| anyhow::anyhow!("{}", e))?;
            let files_count = std::fs::read_dir(&dir)
                .map_err(|e| anyhow::anyhow!("{}", e))?
                .count();
            let is_zip_addon = files_count > 2;
            installed.push(InstalledAddon {
                metadata,
                file_path: dir.to_string_lossy().to_string(),
                is_zip_addon,
            });
        }
    }
    Ok(Json(installed))
}

async fn check_addon_update_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AddonIdBody>,
) -> ApiResult<Json<AddonUpdateCheckResult>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir =
        addons::get_addon_path(addons_root, &body.addon_id).map_err(|e| anyhow::anyhow!(e))?;
    let manifest = read_manifest_or_error(&addon_dir)?;
    let result = addons::check_addon_update_from_api(
        &body.addon_id,
        &manifest.version,
        Some(state.instance_id.as_str()),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(result))
}

async fn check_all_addon_updates_web(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<AddonUpdateCheckResult>>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addons_dir =
        addons::ensure_addons_directory(addons_root).map_err(|e| anyhow::anyhow!(e))?;
    let mut results = Vec::new();
    if addons_dir.exists() {
        for entry in std::fs::read_dir(&addons_dir).map_err(|e| anyhow::anyhow!("{}", e))? {
            let entry = entry.map_err(|e| anyhow::anyhow!("{}", e))?;
            let dir = entry.path();
            if !dir.is_dir() {
                continue;
            }
            let manifest = match read_manifest_if_exists(&dir)? {
                Some(m) => m,
                None => continue,
            };
            let addon_id = manifest.id.clone();
            match addons::check_addon_update_from_api(
                &addon_id,
                &manifest.version,
                Some(state.instance_id.as_str()),
            )
            .await
            {
                Ok(result) => results.push(result),
                Err(err) => {
                    tracing::error!("Failed to check update for addon {}: {}", addon_id, err);
                    results.push(AddonUpdateCheckResult {
                        addon_id,
                        update_info: AddonUpdateInfo {
                            current_version: manifest.version,
                            latest_version: "unknown".to_string(),
                            update_available: false,
                            download_url: None,
                            release_notes: None,
                            release_date: None,
                            changelog_url: None,
                            is_critical: None,
                            has_breaking_changes: None,
                            min_wealthfolio_version: None,
                        },
                        error: Some(err),
                    });
                }
            }
        }
    }
    Ok(Json(results))
}

#[derive(serde::Deserialize)]
struct ToggleBody {
    #[serde(rename = "addonId")]
    addon_id: String,
    enabled: bool,
}

async fn toggle_addon_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ToggleBody>,
) -> ApiResult<StatusCode> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir =
        addons::get_addon_path(addons_root, &body.addon_id).map_err(|e| anyhow::anyhow!(e))?;
    let manifest_path = addon_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(anyhow::anyhow!("Addon not found").into());
    }
    let content = std::fs::read_to_string(&manifest_path).map_err(|e| anyhow::anyhow!("{}", e))?;
    let mut metadata: AddonManifest =
        serde_json::from_str(&content).map_err(|e| anyhow::anyhow!("{}", e))?;
    metadata.enabled = Some(body.enabled);
    let manifest_json =
        serde_json::to_string_pretty(&metadata).map_err(|e| anyhow::anyhow!("{}", e))?;
    std::fs::write(&manifest_path, manifest_json).map_err(|e| anyhow::anyhow!("{}", e))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn uninstall_addon_web(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir = addons::get_addon_path(addons_root, &id).map_err(|e| anyhow::anyhow!(e))?;
    if !addon_dir.exists() {
        return Err(anyhow::anyhow!("Addon not found").into());
    }
    std::fs::remove_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    Ok(StatusCode::NO_CONTENT)
}

async fn load_addon_for_runtime_web(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<ExtractedAddon>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir = addons::get_addon_path(addons_root, &id).map_err(|e| anyhow::anyhow!(e))?;
    let manifest_path = addon_dir.join("manifest.json");
    if !manifest_path.exists() {
        return Err(anyhow::anyhow!("Addon not found").into());
    }
    let manifest_content =
        std::fs::read_to_string(&manifest_path).map_err(|e| anyhow::anyhow!("{}", e))?;
    let metadata: AddonManifest =
        serde_json::from_str(&manifest_content).map_err(|e| anyhow::anyhow!("{}", e))?;
    if !metadata.is_enabled() {
        return Err(anyhow::anyhow!("Addon is disabled").into());
    }
    let mut files = Vec::new();
    addons::read_addon_files_recursive(&addon_dir, &addon_dir, &mut files)
        .map_err(|e| anyhow::anyhow!("{}", e))?;
    let main_file = metadata.get_main().map_err(|e| anyhow::anyhow!(e))?;
    for f in &mut files {
        let normalized_name = f.name.replace('\\', "/");
        let normalized_main = main_file.replace('\\', "/");
        f.is_main = normalized_name == normalized_main
            || normalized_name.ends_with(&normalized_main)
            || (normalized_main.contains('/') && normalized_name == normalized_main);
    }
    if !files.iter().any(|f| f.is_main) {
        return Err(anyhow::anyhow!("Main addon file not found").into());
    }
    Ok(Json(ExtractedAddon { metadata, files }))
}

async fn get_enabled_addons_on_startup_web(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<ExtractedAddon>>> {
    let installed = list_installed_addons_web(State(state.clone())).await?.0;
    let mut enabled = Vec::new();
    for item in installed {
        if item.metadata.is_enabled() {
            if let Ok(Json(extracted)) =
                load_addon_for_runtime_web(Path(item.metadata.id.clone()), State(state.clone()))
                    .await
            {
                enabled.push(extracted);
            }
        }
    }
    Ok(Json(enabled))
}

#[derive(serde::Deserialize)]
struct ExtractBody {
    #[serde(rename = "zipData")]
    zip_data: Option<Vec<u8>>,
    #[serde(rename = "zipDataB64")]
    zip_data_b64: Option<String>,
}

async fn extract_addon_zip_web(Json(body): Json<ExtractBody>) -> ApiResult<Json<ExtractedAddon>> {
    let zip_bytes: Vec<u8> = if let Some(b64) = body.zip_data_b64 {
        BASE64
            .decode(b64)
            .map_err(|e| anyhow::anyhow!("Invalid base64 zipDataB64: {}", e))?
    } else if let Some(bytes) = body.zip_data {
        bytes
    } else {
        return Err(anyhow::anyhow!("Missing zip data").into());
    };
    let extracted =
        addons::extract_addon_zip_internal(zip_bytes).map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(extracted))
}

// ====== Store + staging ======

async fn fetch_addon_store_listings_web(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<serde_json::Value>>> {
    let listings = addons::fetch_addon_store_listings(Some(state.instance_id.as_str()))
        .await
        .map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(listings))
}

#[derive(serde::Deserialize)]
struct SubmitRatingBody {
    #[serde(rename = "addonId")]
    addon_id: String,
    rating: u8,
    review: Option<String>,
}

async fn submit_addon_rating_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SubmitRatingBody>,
) -> ApiResult<Json<serde_json::Value>> {
    let resp = addons::submit_addon_rating(
        &body.addon_id,
        body.rating,
        body.review,
        state.instance_id.as_str(),
    )
    .await
    .map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(resp))
}

#[derive(serde::Deserialize)]
struct RatingsQuery {
    #[serde(rename = "addonId")]
    addon_id: String,
}

async fn get_addon_ratings_web(_q: Query<RatingsQuery>) -> ApiResult<Json<Vec<serde_json::Value>>> {
    // Store ratings retrieval API not implemented yet; return empty list to avoid UI errors
    Ok(Json(Vec::new()))
}

#[derive(serde::Deserialize)]
struct StagingDownloadBody {
    #[serde(rename = "addonId")]
    addon_id: String,
}

async fn download_addon_to_staging_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<StagingDownloadBody>,
) -> ApiResult<Json<ExtractedAddon>> {
    let addons_root = StdPath::new(&state.addons_root);
    let zip = addons::download_addon_from_store(&body.addon_id, state.instance_id.as_str())
        .await
        .map_err(|e| {
            tracing::error!(addon_id = %body.addon_id, "download from store failed: {}", e);
            anyhow::anyhow!(format!(
                "Download from store failed for '{}': {}",
                body.addon_id, e
            ))
        })?;
    let _staged_path = addons::save_addon_to_staging(&body.addon_id, addons_root, &zip)
        .map_err(|e: String| anyhow::anyhow!(e))?;
    let extracted = addons::extract_addon_zip_internal(zip).map_err(|e| anyhow::anyhow!(e))?;
    Ok(Json(extracted))
}

#[derive(serde::Deserialize)]
struct InstallFromStagingBody {
    #[serde(rename = "addonId")]
    addon_id: String,
    #[serde(rename = "enableAfterInstall")]
    enable_after_install: Option<bool>,
}

async fn update_addon_from_store_by_id_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<AddonIdBody>,
) -> ApiResult<Json<AddonManifest>> {
    let addons_root = StdPath::new(&state.addons_root);
    let addon_dir =
        addons::get_addon_path(addons_root, &body.addon_id).map_err(|e| anyhow::anyhow!(e))?;
    let was_enabled = read_manifest_if_exists(&addon_dir)?
        .and_then(|m| m.enabled)
        .unwrap_or(false);

    let zip_data = addons::download_addon_from_store(&body.addon_id, state.instance_id.as_str())
        .await
        .map_err(|e| anyhow::anyhow!(e))?;
    let extracted = addons::extract_addon_zip_internal(zip_data).map_err(|e| anyhow::anyhow!(e))?;

    if addon_dir.exists() {
        std::fs::remove_dir_all(&addon_dir)
            .map_err(|e| anyhow::anyhow!("Failed to remove addon directory: {}", e))?;
    }
    std::fs::create_dir_all(&addon_dir)
        .map_err(|e| anyhow::anyhow!("Failed to create addon directory: {}", e))?;

    for file in &extracted.files {
        let file_path = addon_dir.join(&file.name);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| anyhow::anyhow!("Failed to create addon file directory: {}", e))?;
        }
        std::fs::write(&file_path, &file.content)
            .map_err(|e| anyhow::anyhow!("Failed to write addon file: {}", e))?;
    }

    let metadata = extracted
        .metadata
        .to_installed(was_enabled)
        .map_err(|e| anyhow::anyhow!(e))?;

    let manifest_path = addon_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&metadata).map_err(|e| anyhow::anyhow!(e))?;
    std::fs::write(&manifest_path, manifest_json)
        .map_err(|e| anyhow::anyhow!("Failed to write manifest: {}", e))?;

    Ok(Json(metadata))
}

async fn install_addon_from_staging_web(
    State(state): State<Arc<AppState>>,
    Json(body): Json<InstallFromStagingBody>,
) -> ApiResult<Json<AddonManifest>> {
    let addons_root = StdPath::new(&state.addons_root);
    let zip = addons::load_addon_from_staging(&body.addon_id, addons_root)
        .map_err(|e: String| anyhow::anyhow!(e))?;
    let extracted = addons::extract_addon_zip_internal(zip).map_err(|e| anyhow::anyhow!(e))?;
    let addon_id = extracted.metadata.id.clone();
    let addon_dir =
        addons::get_addon_path(addons_root, &addon_id).map_err(|e| anyhow::anyhow!(e))?;
    if addon_dir.exists() {
        std::fs::remove_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    std::fs::create_dir_all(&addon_dir).map_err(|e| anyhow::anyhow!("{}", e))?;
    for file in &extracted.files {
        let file_path = addon_dir.join(&file.name);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| anyhow::anyhow!("{}", e))?;
        }
        std::fs::write(&file_path, &file.content).map_err(|e| anyhow::anyhow!("{}", e))?;
    }
    let metadata = extracted
        .metadata
        .to_installed(body.enable_after_install.unwrap_or(true))
        .map_err(|e| anyhow::anyhow!(e))?;
    let manifest_path = addon_dir.join("manifest.json");
    let manifest_json = serde_json::to_string_pretty(&metadata).map_err(|e| anyhow::anyhow!(e))?;
    std::fs::write(&manifest_path, manifest_json).map_err(|e| anyhow::anyhow!(e))?;
    // Clean staging file
    let _ = addons::remove_addon_from_staging(&body.addon_id, addons_root);
    Ok(Json(metadata))
}

async fn clear_addon_staging_web(
    State(state): State<Arc<AppState>>,
    q: Option<Query<RatingsQuery>>,
) -> ApiResult<StatusCode> {
    let addons_root = StdPath::new(&state.addons_root);
    if let Some(Query(rq)) = q {
        addons::remove_addon_from_staging(&rq.addon_id, addons_root)
            .map_err(|e| anyhow::anyhow!(e))?;
    } else {
        addons::clear_staging_directory(addons_root).map_err(|e| anyhow::anyhow!(e))?;
    }
    Ok(StatusCode::NO_CONTENT)
}

fn sync_not_supported<T>() -> ApiResult<T> {
    Err(ApiError::NotImplemented(
        "Wealthfolio Sync is not available in web mode.".into(),
    ))
}

async fn get_sync_status_web() -> ApiResult<Json<serde_json::Value>> {
    sync_not_supported()
}

async fn generate_pairing_payload_web() -> ApiResult<Json<String>> {
    sync_not_supported()
}

#[derive(serde::Deserialize)]
struct SyncPayloadBody {
    #[allow(dead_code)]
    payload: String,
}

async fn pair_and_sync_web(Json(_body): Json<SyncPayloadBody>) -> ApiResult<Json<String>> {
    sync_not_supported()
}

async fn force_full_sync_with_peer_web(
    Json(_body): Json<SyncPayloadBody>,
) -> ApiResult<Json<String>> {
    sync_not_supported()
}

#[derive(serde::Deserialize)]
struct SyncNowBody {
    #[allow(dead_code)]
    payload: SyncNowArgsBody,
}

#[derive(serde::Deserialize)]
struct SyncNowArgsBody {
    #[serde(rename = "peerId")]
    #[allow(dead_code)]
    peer_id: String,
}

async fn sync_now_web(Json(_body): Json<SyncNowBody>) -> ApiResult<StatusCode> {
    sync_not_supported()
}

async fn initialize_sync_for_existing_data_web() -> ApiResult<Json<String>> {
    sync_not_supported()
}

#[derive(serde::Deserialize)]
struct ProbeBody {
    #[allow(dead_code)]
    host: String,
    #[allow(dead_code)]
    port: u16,
}

async fn probe_local_network_access_web(Json(_body): Json<ProbeBody>) -> ApiResult<StatusCode> {
    sync_not_supported()
}
