use std::sync::Arc;

use crate::{
    api::shared::{enqueue_portfolio_job, PortfolioJobConfig},
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    routing::{delete, get, post, put},
    Json, Router,
};
use wealthfolio_core::quotes::{ProviderInfo, Quote, QuoteImport, QuoteSummary};

async fn get_market_data_providers(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<ProviderInfo>>> {
    let infos = state.quote_service.get_providers_info().await?;
    Ok(Json(infos))
}

async fn get_market_data_provider_settings(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<ProviderInfo>>> {
    let infos = state.quote_service.get_providers_info().await?;
    Ok(Json(infos))
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
) -> ApiResult<StatusCode> {
    state
        .quote_service
        .update_provider_settings(&body.provider_id, body.priority, body.enabled)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct SearchQuery {
    query: String,
}

async fn search_symbol(
    State(state): State<Arc<AppState>>,
    Query(q): Query<SearchQuery>,
) -> ApiResult<Json<Vec<QuoteSummary>>> {
    let res = state.quote_service.search_symbol(&q.query).await?;
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
    let res = state.quote_service.get_historical_quotes(&q.symbol)?;
    Ok(Json(res))
}

async fn update_quote(
    Path(symbol): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(mut quote): Json<Quote>,
) -> ApiResult<StatusCode> {
    // Ensure asset_id matches path parameter
    quote.asset_id = symbol;
    let target_asset_id = quote.asset_id.clone();
    state.quote_service.update_quote(quote).await?;
    enqueue_portfolio_job(
        state.clone(),
        PortfolioJobConfig {
            account_ids: None,
            symbols: Some(vec![target_asset_id]),
            refetch_all_market_data: true,
            force_full_recalculation: false,
        },
    );
    Ok(StatusCode::NO_CONTENT)
}

async fn delete_quote(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    state.quote_service.delete_quote(&id).await?;
    enqueue_portfolio_job(
        state,
        PortfolioJobConfig {
            account_ids: None,
            symbols: None,
            refetch_all_market_data: false,
            force_full_recalculation: false,
        },
    );
    Ok(StatusCode::NO_CONTENT)
}

async fn sync_history_quotes(State(state): State<Arc<AppState>>) -> ApiResult<StatusCode> {
    let result = state.quote_service.resync(None).await?;
    if result.failed > 0 {
        tracing::warn!("resync reported {} failures", result.failed);
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct ImportQuotesBody {
    quotes: Vec<QuoteImport>,
    #[serde(rename = "overwriteExisting")]
    overwrite_existing: bool,
}

async fn import_quotes_csv(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ImportQuotesBody>,
) -> ApiResult<Json<Vec<QuoteImport>>> {
    let result = state
        .quote_service
        .import_quotes(body.quotes, body.overwrite_existing)
        .await?;

    enqueue_portfolio_job(
        state,
        PortfolioJobConfig {
            account_ids: None,
            symbols: None,
            refetch_all_market_data: false,
            force_full_recalculation: false,
        },
    );

    Ok(Json(result))
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
    enqueue_portfolio_job(
        state,
        PortfolioJobConfig {
            account_ids: None,
            symbols: body.symbols,
            refetch_all_market_data: body.refetch_all,
            force_full_recalculation: false,
        },
    );
    Ok(StatusCode::NO_CONTENT)
}

#[derive(serde::Deserialize)]
struct LatestQuotesBody {
    symbols: Vec<String>,
}

async fn get_latest_quotes(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LatestQuotesBody>,
) -> ApiResult<Json<std::collections::HashMap<String, Quote>>> {
    let quotes = state.quote_service.get_latest_quotes(&body.symbols)?;
    Ok(Json(quotes))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/providers", get(get_market_data_providers))
        .route(
            "/providers/settings",
            get(get_market_data_provider_settings).put(update_market_data_provider_settings),
        )
        .route("/market-data/search", get(search_symbol))
        .route("/market-data/quotes/history", get(get_quote_history))
        .route("/market-data/quotes/latest", post(get_latest_quotes))
        .route("/market-data/quotes/{symbol}", put(update_quote))
        .route("/market-data/quotes/id/{id}", delete(delete_quote))
        .route("/market-data/quotes/import", post(import_quotes_csv))
        .route("/market-data/sync/history", post(sync_history_quotes))
        .route("/market-data/sync", post(sync_market_data))
}
