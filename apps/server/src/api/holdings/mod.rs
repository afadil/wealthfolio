mod dto;
mod handlers;
mod mappers;

use std::sync::Arc;

use axum::{
    routing::{get, post},
    Router,
};

use crate::main_lib::AppState;

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/holdings", get(handlers::get_holdings))
        .route("/holdings/item", get(handlers::get_holding))
        .route(
            "/valuations/history",
            get(handlers::get_historical_valuations),
        )
        .route("/valuations/latest", get(handlers::get_latest_valuations))
        .route("/allocations", get(handlers::get_portfolio_allocations))
        .route(
            "/allocations/holdings",
            get(handlers::get_holdings_by_allocation),
        )
        .route(
            "/snapshots",
            get(handlers::get_snapshots)
                .post(handlers::save_manual_holdings_handler)
                .delete(handlers::delete_snapshot_handler),
        )
        .route("/snapshots/holdings", get(handlers::get_snapshot_by_date))
        .route(
            "/snapshots/import",
            post(handlers::import_holdings_csv_handler),
        )
}
