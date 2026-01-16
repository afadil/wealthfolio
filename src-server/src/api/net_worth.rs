use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::{NaiveDate, Utc};
use wealthfolio_core::portfolio::net_worth::{NetWorthHistoryPoint, NetWorthResponse};

#[derive(serde::Deserialize)]
struct NetWorthQuery {
    /// Optional date in ISO format (YYYY-MM-DD). Defaults to today.
    date: Option<String>,
}

async fn get_net_worth(
    State(state): State<Arc<AppState>>,
    Query(q): Query<NetWorthQuery>,
) -> ApiResult<Json<NetWorthResponse>> {
    let as_of_date = match q.date {
        Some(d) => NaiveDate::parse_from_str(&d, "%Y-%m-%d")
            .map_err(|e| anyhow::anyhow!("Invalid date: {}", e))?,
        None => Utc::now().date_naive(),
    };

    let response = state.net_worth_service.get_net_worth(as_of_date).await?;
    Ok(Json(response))
}

#[derive(serde::Deserialize)]
struct NetWorthHistoryQuery {
    /// Start date in ISO format (YYYY-MM-DD)
    #[serde(rename = "startDate")]
    start_date: String,
    /// End date in ISO format (YYYY-MM-DD)
    #[serde(rename = "endDate")]
    end_date: String,
}

async fn get_net_worth_history(
    State(state): State<Arc<AppState>>,
    Query(q): Query<NetWorthHistoryQuery>,
) -> ApiResult<Json<Vec<NetWorthHistoryPoint>>> {
    let start = NaiveDate::parse_from_str(&q.start_date, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid startDate: {}", e))?;
    let end = NaiveDate::parse_from_str(&q.end_date, "%Y-%m-%d")
        .map_err(|e| anyhow::anyhow!("Invalid endDate: {}", e))?;

    let history = state.net_worth_service.get_net_worth_history(start, end)?;
    Ok(Json(history))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/net-worth", get(get_net_worth))
        .route("/net-worth/history", get(get_net_worth_history))
}
