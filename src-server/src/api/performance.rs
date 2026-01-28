use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{extract::State, routing::post, Json, Router};
use wealthfolio_core::{
    accounts::{AccountServiceTrait, TrackingMode},
    portfolio::{
        income::IncomeSummary,
        performance::{PerformanceMetrics, SimplePerformanceMetrics},
    },
};

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
    #[serde(rename = "trackingMode")]
    tracking_mode: Option<String>,
}

fn parse_tracking_mode(mode: Option<String>) -> Option<TrackingMode> {
    mode.and_then(|m| match m.as_str() {
        "HOLDINGS" => Some(TrackingMode::Holdings),
        "TRANSACTIONS" => Some(TrackingMode::Transactions),
        _ => None,
    })
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
    let tracking_mode = parse_tracking_mode(body.tracking_mode);
    let metrics = state
        .performance_service
        .calculate_performance_history(&body.item_type, &body.item_id, start, end, tracking_mode)
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
    let tracking_mode = parse_tracking_mode(body.tracking_mode);
    let metrics = state
        .performance_service
        .calculate_performance_summary(&body.item_type, &body.item_id, start, end, tracking_mode)
        .await?;
    Ok(Json(metrics))
}

async fn get_income_summary(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<IncomeSummary>>> {
    let items = state.income_service.get_income_summary()?;
    Ok(Json(items))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route(
            "/performance/accounts/simple",
            post(calculate_accounts_simple_performance),
        )
        .route("/performance/history", post(calculate_performance_history))
        .route("/performance/summary", post(calculate_performance_summary))
        .route("/income/summary", axum::routing::get(get_income_summary))
}
