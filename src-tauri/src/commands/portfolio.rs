use crate::models::{AccountSummary, HistorySummary, Holding, IncomeSummary, PortfolioHistory};
use crate::AppState;

use log::debug;
use tauri::async_runtime::{block_on, spawn_blocking};
use tauri::State;
use wealthfolio_core::models::CumulativeReturns;
use wealthfolio_core::portfolio::portfolio_service::{PortfolioService, ReturnMethod};

use std::sync::Arc;
use diesel::SqliteConnection;
use diesel::r2d2::{ConnectionManager, Pool};

async fn create_portfolio_service(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, base_currency: String) -> Result<PortfolioService, String> {
    PortfolioService::new(pool, base_currency)
        .await
        .map_err(|e| e.to_string())
}

async fn spawn_blocking_with_service<T, F>(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, base_currency: String, f: F) -> Result<T, String>
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
        block_on(service.calculate_historical_data(
            account_ids,
            force_full_calculation
        ))
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
) -> Result<Vec<PortfolioHistory>, String> {
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
    service
        .get_accounts_summary()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recalculate_portfolio(
    state: State<'_, AppState>,
) -> Result<Vec<HistorySummary>, String> {
    debug!("Recalculating portfolio...");
    let base_currency = state.get_base_currency();
    let pool = state.pool.clone();

    spawn_blocking_with_service(pool, base_currency, move |service| {
        block_on(service.update_portfolio())
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn get_income_summary(state: State<'_, AppState>) -> Result<Vec<IncomeSummary>, String> {
    debug!("Fetching income summary...");
    let base_currency = state.get_base_currency();
    let pool = state.pool.clone();

    let service = create_portfolio_service(pool, base_currency).await?;
    service
        .get_income_summary()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calculate_account_cumulative_returns(
    state: State<'_, AppState>,
    account_id: String,
    start_date: String,
    end_date: String,
    method: Option<String>,
) -> Result<CumulativeReturns, String> {

     Ok(CumulativeReturns {
        id: "".to_string(),
        cumulative_returns: vec![],
        total_return: None,
        annualized_return: None,
     })

    // let base_currency = state.get_base_currency();
    // let pool = state.pool.clone();

    // let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
    //     .map_err(|e| format!("Invalid start date: {}", e))?;
    // let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
    //     .map_err(|e| format!("Invalid end date: {}", e))?;

    // let return_method = match method.as_deref() {
    //     Some("MWR") => ReturnMethod::MoneyWeighted,
    //     _ => ReturnMethod::TimeWeighted,
    // };

    
    // spawn_blocking_with_service(pool, base_currency, move |service| {
    //     service
    //         .calculate_account_cumulative_returns(&account_id, start, end, return_method)
    //         .map_err(|e| e.to_string())
    // })
    // .await
}

#[tauri::command]
pub async fn calculate_symbol_cumulative_returns(
    state: State<'_, AppState>,
    symbol: String,
    start_date: String,
    end_date: String,
) -> Result<CumulativeReturns, String> {

    Ok(CumulativeReturns {
        id: "".to_string(),
        cumulative_returns: vec![],
        total_return: None,
        annualized_return: None,
     })

    // let base_currency = state.get_base_currency();
    // let pool = state.pool.clone();

    // let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
    //     .map_err(|e| format!("Invalid start date: {}", e))?;
    // let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
    //     .map_err(|e| format!("Invalid end date: {}", e))?;

    // let service = create_portfolio_service(pool, base_currency).await?;
    // service
    //     .calculate_symbol_cumulative_returns(&symbol, start, end)
    //     .await
    //     .map_err(|e| e.to_string())
}
