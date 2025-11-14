use std::sync::Arc;

use crate::{
    error::ApiResult,
    main_lib::AppState,
};
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use wealthfolio_core::portfolio::{
    holdings::holdings_model::Holding,
    valuation::valuation_model::DailyAccountValuation,
};

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

async fn get_latest_valuations(
    State(state): State<Arc<AppState>>,
    raw: axum::extract::RawQuery,
) -> ApiResult<Json<Vec<DailyAccountValuation>>> {
    use wealthfolio_core::accounts::AccountServiceTrait;

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

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/holdings", get(get_holdings))
        .route("/holdings/item", get(get_holding))
        .route("/valuations/history", get(get_historical_valuations))
        .route("/valuations/latest", get(get_latest_valuations))
}
