// Project imports
use crate::models::{AccountSummary, HistorySummary, Holding, IncomeSummary, HistoryRecord};
use crate::AppState;

// External imports
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use log::debug;
use wealthfolio_core::PerformanceResponse;
use std::sync::Arc;
use tauri::async_runtime::{block_on, spawn_blocking};
use tauri::State;

// Wealthfolio core imports
use wealthfolio_core::PortfolioService;
use wealthfolio_core::PerformanceService;

async fn create_portfolio_service(
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    base_currency: String,
) -> Result<PortfolioService, String> {
    PortfolioService::new(pool, base_currency)
        .await
        .map_err(|e| e.to_string())
}

async fn create_performance_service(
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
) -> Result<PerformanceService, String> {
    PerformanceService::new(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn spawn_blocking_with_service<T, F>(
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    base_currency: String,
    f: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PortfolioService) -> Result<T, String> + Send + 'static,
{
    let service = create_portfolio_service(pool, base_currency).await?;
    spawn_blocking(move || f(service))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn calculate_historical_data(
    state: State<'_, AppState>,
    account_ids: Option<Vec<String>>,
    force_full_calculation: bool,
) -> Result<Vec<HistorySummary>, String> {
    let base_currency = state.get_base_currency();
    let pool = state.pool.clone();

    spawn_blocking_with_service(pool, base_currency, move |service| {
        block_on(service.calculate_historical_data(account_ids, force_full_calculation))
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn compute_holdings(state: State<'_, AppState>) -> Result<Vec<Holding>, String> {
    let base_currency = state.get_base_currency();
    let pool = state.pool.clone();

    spawn_blocking_with_service(pool, base_currency, move |service| {
        block_on(service.compute_holdings()).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn get_portfolio_history(
    state: State<'_, AppState>,
    account_id: Option<String>,
) -> Result<Vec<HistoryRecord>, String> {
    let base_currency = state.get_base_currency();
    let pool = state.pool.clone();
    let account_id_ref = account_id.as_deref();

    let service = create_portfolio_service(pool, base_currency).await?;
    service
        .get_portfolio_history(account_id_ref)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_accounts_summary(
    state: State<'_, AppState>,
) -> Result<Vec<AccountSummary>, String> {
    debug!("Fetching active accounts performance...");
    let base_currency = state.get_base_currency();
    let pool = state.pool.clone();

    let service = create_portfolio_service(pool, base_currency).await?;
    service.get_accounts_summary().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recalculate_portfolio(
    state: State<'_, AppState>,
) -> Result<Vec<HistorySummary>, String> {
    debug!("Recalculating portfolio...");
    let base_currency = state.get_base_currency();
    let pool = state.pool.clone();

    spawn_blocking_with_service(pool, base_currency, move |service| {
        block_on(service.update_portfolio()).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn get_income_summary(state: State<'_, AppState>) -> Result<Vec<IncomeSummary>, String> {
    debug!("Fetching income summary...");
    let base_currency = state.get_base_currency();
    let pool = state.pool.clone();

    let service = create_portfolio_service(pool, base_currency).await?;
    service.get_income_summary().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calculate_performance(
    state: State<'_, AppState>,
    item_type: String,
    item_id: String,
    start_date: String,
    end_date: String,
) -> Result<PerformanceResponse, String> {
    debug!("Calculating cumulative returns...");
    let pool = state.pool.clone();

    let start = chrono::NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;
    let end = chrono::NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid end date: {}", e))?;

    let service = create_performance_service(pool).await?;
    let result = service.calculate_performance(&item_type, &item_id, start, end).await;
    result.map_err(|e| format!("Failed to calculate cumulative returns: {}", e.to_string()))
}
