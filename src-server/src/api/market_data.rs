use std::sync::Arc;

use crate::{
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use wealthfolio_core::market_data::{MarketDataProviderInfo, MarketDataProviderSetting, Quote};

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
) -> ApiResult<StatusCode> {
    // Ensure symbol matches body
    quote.symbol = symbol;
    state.market_data_service.update_quote(quote).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_quote(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    state.market_data_service.delete_quote(&id).await?;
    Ok(StatusCode::NO_CONTENT)
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
) -> ApiResult<StatusCode> {
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
    Ok(StatusCode::NO_CONTENT)
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
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
}
