use std::sync::Arc;

// Project imports
use crate::context::ServiceContext;
use crate::models::{AccountSummary, HistoryRecord, HistorySummary, Holding, IncomeSummary};

// External imports
use log::debug;
use tauri::State;
use wealthfolio_core::{HoldingView, PerformanceResponse, AccountGroupView, TotalReturn};

#[tauri::command]
pub async fn calculate_historical_data(
    state: State<'_, Arc<ServiceContext>>,
    account_ids: Option<Vec<String>>,
    force_full_calculation: bool,
) -> Result<Vec<HistorySummary>, String> {
    debug!("Calculating historical data...");
    state
        .portfolio_service()
        .calculate_historical_data(account_ids, force_full_calculation)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn compute_holdings(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Holding>, String> {
    debug!("Get holdings...");
    state
        .portfolio_service()
        .compute_holdings()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_holdings(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
) -> Result<Vec<HoldingView>, String> {
    debug!("Get holdings...");
    let base_currency = state.get_base_currency();
    state
        .holding_view_service()
        .get_holdings(&account_id, &base_currency)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_portfolio_history(
    state: State<'_, Arc<ServiceContext>>,
    account_id: Option<String>,
) -> Result<Vec<HistoryRecord>, String> {
    debug!("Fetching portfolio history...");
    let account_id_ref = account_id.as_deref();
    state
        .portfolio_service()
        .get_portfolio_history(account_id_ref)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_accounts_summary(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AccountSummary>, String> {
    debug!("Fetching active accounts performance...");
    state
        .portfolio_service()
        .get_accounts_summary()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn recalculate_portfolio(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<HistorySummary>, String> {
    debug!("Recalculating portfolio...");
    state
        .portfolio_service()
        .update_portfolio()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_income_summary(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<IncomeSummary>, String> {
    debug!("Fetching income summary...");
    state
        .income_service()
        .get_income_summary()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calculate_performance(
    state: State<'_, Arc<ServiceContext>>,
    item_type: String,
    item_id: String,
    start_date: String,
    end_date: String,
) -> Result<PerformanceResponse, String> {
    debug!("Calculating cumulative returns...");
    let start = chrono::NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;
    let end = chrono::NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid end date: {}", e))?;

    state
        .performance_service()
        .calculate_performance(&item_type, &item_id, start, end)
        .await
        .map_err(|e| format!("Failed to calculate cumulative returns: {}", e.to_string()))
}

#[tauri::command]
pub fn get_portfolio_summary(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AccountGroupView>, String> {
    debug!("Fetching portfolio summary...");
    let base_currency = state.get_base_currency();
    state
        .holding_view_service()
        .get_portfolio_summary(&base_currency)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn calculate_total_return(
    state: State<'_, Arc<ServiceContext>>,
    account_id: String,
    start_date: String,
    end_date: String,
) -> Result<TotalReturn, String> {
    debug!("Calculating total return for account {}...", account_id);
    let start = chrono::NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;
    let end = chrono::NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid end date: {}", e))?;

    state
        .performance_service()
        .calculate_total_return(&account_id, start, end)
        .await
        .map_err(|e| format!("Failed to calculate total return: {}", e.to_string()))
}
