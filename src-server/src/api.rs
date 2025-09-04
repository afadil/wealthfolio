use std::sync::Arc;

use axum::{extract::{Path, State, Query, RawQuery}, routing::{get, post, put, delete}, Json, Router};
use tower_http::{cors::{Any, CorsLayer}, trace::TraceLayer, timeout::TimeoutLayer, request_id::{MakeRequestUuid, PropagateRequestIdLayer, SetRequestIdLayer}};
use utoipa::OpenApi;
use crate::{error::ApiResult, models::{Account, NewAccount, AccountUpdate}, config::Config, main_lib::AppState};
use axum::http::StatusCode;
use wealthfolio_core::{
    accounts::AccountServiceTrait,
    settings::{Settings, SettingsUpdate, SettingsServiceTrait},
    portfolio::{holdings::holdings_model::Holding, valuation::valuation_model::DailyAccountValuation, performance::PerformanceMetrics, income::IncomeSummary},
    goals::goals_model::{Goal, NewGoal, GoalsAllocation},
    activities::{NewActivity, ActivityUpdate, ActivitySearchResponse},
    activities::{ActivityImport, ImportMappingData},
    fx::fx_model::{ExchangeRate, NewExchangeRate},
    limits::{ContributionLimit, NewContributionLimit, DepositsCalculation},
    market_data::{MarketDataProviderSetting, MarketDataProviderInfo, Quote},
    assets::{Asset as CoreAsset, UpdateAssetProfile},
    secrets::SecretManager,
};

#[utoipa::path(get, path = "/api/v1/healthz", responses((status = 200, description = "Health")))]
pub async fn healthz() -> &'static str { "ok" }

#[utoipa::path(get, path = "/api/v1/readyz", responses((status = 200, description = "Ready")))]
pub async fn readyz() -> &'static str { "ok" }

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
async fn delete_account(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<()> {
    state.account_service.delete_account(&id).await?;
    Ok(())
}

// Settings endpoints (web adapter relies on these)
async fn get_settings(State(state): State<Arc<AppState>>) -> ApiResult<Json<Settings>> {
    let s = state.settings_service.get_settings()?;
    Ok(Json(s))
}

async fn update_settings(State(state): State<Arc<AppState>>, Json(payload): Json<SettingsUpdate>) -> ApiResult<Json<Settings>> {
    state.settings_service.update_settings(&payload).await?;
    let s = state.settings_service.get_settings()?;
    Ok(Json(s))
}

// Holdings endpoint
#[derive(serde::Deserialize)]
struct HoldingsQuery { #[serde(rename = "accountId")] account_id: String }

async fn get_holdings(State(state): State<Arc<AppState>>, Query(q): Query<HoldingsQuery>) -> ApiResult<Json<Vec<Holding>>> {
    let base = state.base_currency.read().unwrap().clone();
    let holdings = state.holdings_service.get_holdings(&q.account_id, &base).await?;
    Ok(Json(holdings))
}

// Historical valuations endpoint
#[derive(serde::Deserialize)]
struct HistoryQuery { #[serde(rename = "accountId")] account_id: String, #[serde(rename = "startDate")] start_date: Option<String>, #[serde(rename = "endDate")] end_date: Option<String> }

async fn get_historical_valuations(State(state): State<Arc<AppState>>, Query(q): Query<HistoryQuery>) -> ApiResult<Json<Vec<DailyAccountValuation>>> {
    let start = match q.start_date {
        Some(s) => Some(chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))?),
        None => None,
    };
    let end = match q.end_date {
        Some(s) => Some(chrono::NaiveDate::parse_from_str(&s, "%Y-%m-%d").map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))?),
        None => None,
    };
    let vals = state.valuation_service.get_historical_valuations(&q.account_id, start, end)?;
    Ok(Json(vals))
}

// Latest valuations endpoint
async fn get_latest_valuations(State(state): State<Arc<AppState>>, raw: RawQuery) -> ApiResult<Json<Vec<DailyAccountValuation>>> {
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
    if ids.is_empty() { return Ok(Json(vec![])); }
    let vals = state.valuation_service.get_latest_valuations(&ids)?;
    Ok(Json(vals))
}

// Portfolio update endpoints for web
async fn update_portfolio(State(state): State<Arc<AppState>>) -> ApiResult<StatusCode> {
    // Incremental update: calculate holdings snapshots and append valuations for active accounts and TOTAL
    let active = state.account_service.get_active_accounts()?;
    let ids: Vec<String> = active.into_iter().map(|a| a.id).collect();
    if let Err(e) = state.snapshot_service.calculate_holdings_snapshots(Some(&ids)).await {
        tracing::warn!("calculate_holdings_snapshots failed: {}", e);
    }
    // Also refresh TOTAL
    if let Err(e) = state.snapshot_service.calculate_total_portfolio_snapshots().await {
        tracing::warn!("calculate_total_portfolio_snapshots failed: {}", e);
    }
    // Update valuations (incremental)
    for id in ids.iter().chain(std::iter::once(&"TOTAL".to_string())) {
        if let Err(e) = state.valuation_service.calculate_valuation_history(id, false).await {
            tracing::warn!("calculate_valuation_history (incremental) failed for {}: {}", id, e);
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

async fn recalculate_portfolio(State(state): State<Arc<AppState>>) -> ApiResult<StatusCode> {
    // Full recalculation of holdings snapshots for all accounts and TOTAL, then full valuation recompute
    if let Err(e) = state.snapshot_service.force_recalculate_holdings_snapshots(None).await {
        tracing::warn!("force_recalculate_holdings_snapshots failed: {}", e);
    }
    if let Err(e) = state.snapshot_service.calculate_total_portfolio_snapshots().await {
        tracing::warn!("calculate_total_portfolio_snapshots failed: {}", e);
    }
    // Recompute valuations for all accounts (including TOTAL)
    let active = state.account_service.get_active_accounts()?;
    let mut ids: Vec<String> = active.into_iter().map(|a| a.id).collect();
    ids.push("TOTAL".to_string());
    for id in ids {
        if let Err(e) = state.valuation_service.calculate_valuation_history(&id, true).await {
            tracing::warn!("calculate_valuation_history (full) failed for {}: {}", id, e);
        }
    }
    Ok(StatusCode::NO_CONTENT)
}

// Performance endpoints
#[derive(serde::Deserialize)]
struct PerfBody {
    #[serde(rename = "itemType")] item_type: String,
    #[serde(rename = "itemId")] item_id: String,
    #[serde(rename = "startDate")] start_date: Option<String>,
    #[serde(rename = "endDate")] end_date: Option<String>,
}

async fn calculate_performance_history(State(state): State<Arc<AppState>>, Json(body): Json<PerfBody>) -> ApiResult<Json<PerformanceMetrics>> {
    let start = match &body.start_date { Some(s) => Some(chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))?), None => None };
    let end = match &body.end_date { Some(s) => Some(chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))?), None => None };
    let metrics = state.performance_service.calculate_performance_history(&body.item_type, &body.item_id, start, end).await?;
    Ok(Json(metrics))
}

async fn calculate_performance_summary(State(state): State<Arc<AppState>>, Json(body): Json<PerfBody>) -> ApiResult<Json<PerformanceMetrics>> {
    let start = match &body.start_date { Some(s) => Some(chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))?), None => None };
    let end = match &body.end_date { Some(s) => Some(chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))?), None => None };
    let metrics = state.performance_service.calculate_performance_summary(&body.item_type, &body.item_id, start, end).await?;
    Ok(Json(metrics))
}

// Income
async fn get_income_summary(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<IncomeSummary>>> {
    let items = state.income_service.get_income_summary()?;
    Ok(Json(items))
}

// Goals endpoints
async fn get_goals(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Goal>>> {
    let goals = state.goal_service.get_goals()?;
    Ok(Json(goals))
}

async fn create_goal(State(state): State<Arc<AppState>>, Json(goal): Json<NewGoal>) -> ApiResult<Json<Goal>> {
    let g = state.goal_service.create_goal(goal).await?;
    Ok(Json(g))
}

async fn update_goal(State(state): State<Arc<AppState>>, Json(goal): Json<Goal>) -> ApiResult<Json<Goal>> {
    let g = state.goal_service.update_goal(goal).await?;
    Ok(Json(g))
}

async fn delete_goal(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<()> {
    let _ = state.goal_service.delete_goal(id).await?;
    Ok(())
}

async fn load_goals_allocations(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<GoalsAllocation>>> {
    let allocs = state.goal_service.load_goals_allocations()?;
    Ok(Json(allocs))
}

async fn update_goal_allocations(State(state): State<Arc<AppState>>, Json(allocs): Json<Vec<GoalsAllocation>>) -> ApiResult<()> {
    let _ = state.goal_service.upsert_goal_allocations(allocs).await?;
    Ok(())
}

// Exchange rates endpoints
async fn get_latest_exchange_rates(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<ExchangeRate>>> {
    let rates = state.fx_service.get_latest_exchange_rates()?;
    Ok(Json(rates))
}

async fn update_exchange_rate(State(state): State<Arc<AppState>>, Json(rate): Json<ExchangeRate>) -> ApiResult<Json<ExchangeRate>> {
    let updated = state.fx_service.update_exchange_rate(&rate.from_currency, &rate.to_currency, rate.rate).await?;
    Ok(Json(updated))
}

async fn add_exchange_rate(State(state): State<Arc<AppState>>, Json(new_rate): Json<NewExchangeRate>) -> ApiResult<Json<ExchangeRate>> {
    let added = state.fx_service.add_exchange_rate(new_rate).await?;
    Ok(Json(added))
}

async fn delete_exchange_rate(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<()> {
    state.fx_service.delete_exchange_rate(&id).await?;
    Ok(())
}

// Activities endpoints
#[derive(serde::Deserialize)]
struct ActivitySearchBody {
    page: i64,
    #[serde(rename = "pageSize")] page_size: i64,
    #[serde(rename = "accountIdFilter")] account_id_filter: Option<String>,
    #[serde(rename = "activityTypeFilter")] activity_type_filter: Option<String>,
    #[serde(rename = "assetIdKeyword")] asset_id_keyword: Option<String>,
    sort: Option<wealthfolio_core::activities::Sort>,
}

async fn search_activities(State(state): State<Arc<AppState>>, Json(body): Json<ActivitySearchBody>) -> ApiResult<Json<ActivitySearchResponse>> {
    let account_ids = body.account_id_filter.map(|s| vec![s]);
    let types = body.activity_type_filter.map(|s| vec![s]);
    let resp = state.activity_service.search_activities(
        body.page,
        body.page_size,
        account_ids,
        types,
        body.asset_id_keyword,
        body.sort,
    )?;
    Ok(Json(resp))
}

async fn create_activity(State(state): State<Arc<AppState>>, Json(activity): Json<NewActivity>) -> ApiResult<Json<wealthfolio_core::activities::Activity>> {
    let created = state.activity_service.create_activity(activity).await?;
    Ok(Json(created))
}

async fn update_activity(State(state): State<Arc<AppState>>, Json(activity): Json<ActivityUpdate>) -> ApiResult<Json<wealthfolio_core::activities::Activity>> {
    let updated = state.activity_service.update_activity(activity).await?;
    Ok(Json(updated))
}

async fn delete_activity(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<Json<wealthfolio_core::activities::Activity>> {
    let deleted = state.activity_service.delete_activity(id).await?;
    Ok(Json(deleted))
}

// Activity import endpoints
#[derive(serde::Deserialize)]
struct ImportCheckBody { #[serde(rename = "accountId")] account_id: String, activities: Vec<ActivityImport> }

async fn check_activities_import(State(state): State<Arc<AppState>>, Json(body): Json<ImportCheckBody>) -> ApiResult<Json<Vec<ActivityImport>>> {
    let res = state.activity_service.check_activities_import(body.account_id, body.activities).await?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct ImportBody { #[serde(rename = "accountId")] account_id: String, activities: Vec<ActivityImport> }

async fn import_activities(State(state): State<Arc<AppState>>, Json(body): Json<ImportBody>) -> ApiResult<Json<Vec<ActivityImport>>> {
    let res = state.activity_service.import_activities(body.account_id, body.activities).await?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct MappingQuery { #[serde(rename = "accountId")] account_id: String }

async fn get_account_import_mapping(State(state): State<Arc<AppState>>, Query(q): Query<MappingQuery>) -> ApiResult<Json<ImportMappingData>> {
    let res = state.activity_service.get_import_mapping(q.account_id)?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct SaveMappingBody { mapping: ImportMappingData }

async fn save_account_import_mapping(State(state): State<Arc<AppState>>, Json(body): Json<SaveMappingBody>) -> ApiResult<Json<ImportMappingData>> {
    let res = state.activity_service.save_import_mapping(body.mapping).await?;
    Ok(Json(res))
}

// Market data providers
async fn get_market_data_providers(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<MarketDataProviderInfo>>> {
    let infos = state.market_data_service.get_market_data_providers_info().await?;
    Ok(Json(infos))
}

async fn get_market_data_providers_settings(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<MarketDataProviderSetting>>> {
    let settings = state.market_data_service.get_market_data_providers_settings().await?;
    Ok(Json(settings))
}

#[derive(serde::Deserialize)]
struct ProviderUpdateBody { #[serde(rename = "providerId")] provider_id: String, priority: i32, enabled: bool }

async fn update_market_data_provider_settings(State(state): State<Arc<AppState>>, Json(body): Json<ProviderUpdateBody>) -> ApiResult<Json<MarketDataProviderSetting>> {
    let updated = state.market_data_service.update_market_data_provider_settings(body.provider_id, body.priority, body.enabled).await?;
    Ok(Json(updated))
}

// Contribution limits
async fn get_contribution_limits(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<ContributionLimit>>> {
    let limits = state.limits_service.get_contribution_limits()?;
    Ok(Json(limits))
}

async fn create_contribution_limit(State(state): State<Arc<AppState>>, Json(new_limit): Json<NewContributionLimit>) -> ApiResult<Json<ContributionLimit>> {
    let created = state.limits_service.create_contribution_limit(new_limit).await?;
    Ok(Json(created))
}

async fn update_contribution_limit(Path(id): Path<String>, State(state): State<Arc<AppState>>, Json(updated): Json<NewContributionLimit>) -> ApiResult<Json<ContributionLimit>> {
    let updated = state.limits_service.update_contribution_limit(&id, updated).await?;
    Ok(Json(updated))
}

async fn delete_contribution_limit(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<()> {
    state.limits_service.delete_contribution_limit(&id).await?;
    Ok(())
}

async fn calculate_deposits_for_contribution_limit(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<Json<DepositsCalculation>> {
    let base = state.base_currency.read().unwrap().clone();
    let calc = state.limits_service.calculate_deposits_for_contribution_limit(&id, &base)?;
    Ok(Json(calc))
}

// Asset profile endpoints
#[derive(serde::Deserialize)]
struct AssetQuery { #[serde(rename = "assetId")] asset_id: String }

async fn get_asset_profile(State(state): State<Arc<AppState>>, Query(q): Query<AssetQuery>) -> ApiResult<Json<CoreAsset>> {
    let asset = state.asset_service.get_asset_by_id(&q.asset_id)?;
    Ok(Json(asset))
}

async fn update_asset_profile(Path(id): Path<String>, State(state): State<Arc<AppState>>, Json(payload): Json<UpdateAssetProfile>) -> ApiResult<Json<CoreAsset>> {
    let asset = state.asset_service.update_asset_profile(&id, payload).await?;
    Ok(Json(asset))
}

#[derive(serde::Deserialize)]
struct DataSourceBody { #[serde(rename = "dataSource")] data_source: String }

async fn update_asset_data_source(Path(id): Path<String>, State(state): State<Arc<AppState>>, Json(body): Json<DataSourceBody>) -> ApiResult<Json<CoreAsset>> {
    let asset = state.asset_service.update_asset_data_source(&id, body.data_source).await?;
    Ok(Json(asset))
}

// Market data quotes/search
#[derive(serde::Deserialize)]
struct SearchQuery { query: String }

async fn search_symbol(State(state): State<Arc<AppState>>, Query(q): Query<SearchQuery>) -> ApiResult<Json<Vec<wealthfolio_core::market_data::QuoteSummary>>> {
    let res = state.market_data_service.search_symbol(&q.query).await?;
    Ok(Json(res))
}

#[derive(serde::Deserialize)]
struct QuoteHistoryQuery { symbol: String }

async fn get_quote_history(State(state): State<Arc<AppState>>, Query(q): Query<QuoteHistoryQuery>) -> ApiResult<Json<Vec<Quote>>> {
    let res = state.market_data_service.get_historical_quotes_for_symbol(&q.symbol)?;
    Ok(Json(res))
}

async fn update_quote(Path(symbol): Path<String>, State(state): State<Arc<AppState>>, Json(mut quote): Json<Quote>) -> ApiResult<()> {
    // Ensure symbol matches body
    quote.symbol = symbol;
    state.market_data_service.update_quote(quote).await?;
    Ok(())
}

async fn delete_quote(Path(id): Path<String>, State(state): State<Arc<AppState>>) -> ApiResult<()> {
    state.market_data_service.delete_quote(&id).await?;
    Ok(())
}

#[derive(serde::Deserialize)]
struct SyncBody { symbols: Option<Vec<String>>, #[serde(rename = "refetchAll")] refetch_all: bool }

async fn sync_market_data(State(state): State<Arc<AppState>>, Json(body): Json<SyncBody>) -> ApiResult<()> {
    // Prefer targeted resync when symbols provided; otherwise do global sync/resync based on refetch_all
    if let Some(symbols) = body.symbols.clone() {
        let _ = state.market_data_service.resync_market_data(Some(symbols)).await?;
    } else if body.refetch_all {
        let _ = state.market_data_service.resync_market_data(None).await?;
    } else {
        let _ = state.market_data_service.sync_market_data().await?;
    }
    Ok(())
}

// Secrets endpoints
#[derive(serde::Deserialize)]
struct SecretSetBody { #[serde(rename = "providerId")] provider_id: String, secret: String }

async fn set_secret(Json(body): Json<SecretSetBody>) -> ApiResult<()> {
    SecretManager::set_secret(&body.provider_id, &body.secret)?;
    Ok(())
}

#[derive(serde::Deserialize)]
struct SecretQuery { #[serde(rename = "providerId")] provider_id: String }

async fn get_secret(Query(q): Query<SecretQuery>) -> ApiResult<Json<Option<String>>> {
    let val = SecretManager::get_secret(&q.provider_id)?;
    Ok(Json(val))
}

async fn delete_secret(Query(q): Query<SecretQuery>) -> ApiResult<()> {
    SecretManager::delete_secret(&q.provider_id)?;
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
        .route("/holdings", get(get_holdings))
        .route("/valuations/history", get(get_historical_valuations))
        .route("/valuations/latest", get(get_latest_valuations))
        .route("/portfolio/update", post(update_portfolio))
        .route("/portfolio/recalculate", post(recalculate_portfolio))
        .route("/performance/history", post(calculate_performance_history))
        .route("/performance/summary", post(calculate_performance_summary))
        .route("/income/summary", get(get_income_summary))
        .route("/exchange-rates/latest", get(get_latest_exchange_rates))
        .route("/exchange-rates", put(update_exchange_rate).post(add_exchange_rate))
        .route("/exchange-rates/:id", delete(delete_exchange_rate))
        .route("/activities/search", post(search_activities))
        .route("/activities", post(create_activity).put(update_activity))
        .route("/activities/:id", delete(delete_activity))
        .route("/activities/import/check", post(check_activities_import))
        .route("/activities/import", post(import_activities))
        .route("/activities/import/mapping", get(get_account_import_mapping).post(save_account_import_mapping))
        .route("/providers", get(get_market_data_providers))
        .route("/providers/settings", get(get_market_data_providers_settings).put(update_market_data_provider_settings))
        .route("/market-data/search", get(search_symbol))
        .route("/market-data/quotes/history", get(get_quote_history))
        .route("/market-data/quotes/:symbol", put(update_quote))
        .route("/market-data/quotes/id/:id", delete(delete_quote))
        .route("/market-data/sync", post(sync_market_data))
        .route("/limits", get(get_contribution_limits).post(create_contribution_limit))
        .route("/limits/:id", put(update_contribution_limit).delete(delete_contribution_limit))
        .route("/limits/:id/deposits", get(calculate_deposits_for_contribution_limit))
        .route("/assets/profile", get(get_asset_profile))
        .route("/assets/profile/:id", put(update_asset_profile))
        .route("/assets/data-source/:id", put(update_asset_data_source))
        .route("/secrets", post(set_secret).get(get_secret).delete(delete_secret))
        .route("/goals/allocations", get(load_goals_allocations).post(update_goal_allocations))
        .route("/goals", get(get_goals).post(create_goal).put(update_goal))
        .route("/goals/:id", delete(delete_goal));

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
