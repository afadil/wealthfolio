use std::sync::Arc;

use crate::{
    api::shared::{enqueue_portfolio_job, PortfolioJobConfig},
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Path, Query, State},
    routing::{get, put},
    Json, Router,
};
use wealthfolio_core::assets::{Asset as CoreAsset, UpdateAssetProfile};

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
    enqueue_portfolio_job(
        state.clone(),
        PortfolioJobConfig {
            account_ids: None,
            symbols: Some(vec![id]),
            refetch_all_market_data: true,
            force_full_recalculation: true,
        },
    );
    Ok(Json(asset))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/assets/profile", get(get_asset_profile))
        .route("/assets/profile/{id}", put(update_asset_profile))
        .route("/assets/data-source/{id}", put(update_asset_data_source))
}
