use crate::models::{AccountSummary, HistorySummary, Holding, IncomeSummary, PortfolioHistory};
use crate::portfolio::portfolio_service::PortfolioService;
use crate::AppState;

use tauri::State;

#[tauri::command]
pub async fn calculate_historical_data(
    state: State<'_, AppState>,
    account_ids: Option<Vec<String>>,
) -> Result<Vec<HistorySummary>, String> {
    println!("Fetching portfolio historical...");

    let service = PortfolioService::new((*state.pool).clone())
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .calculate_historical_data(account_ids)
        .map_err(|e| format!("Failed to calculate historical data: {}", e))
}

#[tauri::command]
pub async fn compute_holdings(state: State<'_, AppState>) -> Result<Vec<Holding>, String> {
    println!("Compute holdings...");

    let service = PortfolioService::new((*state.pool).clone())
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .compute_holdings()
        .map_err(|e| format!("Failed to fetch activities: {}", e))
}

#[tauri::command]
pub async fn get_income_summary(state: State<'_, AppState>) -> Result<IncomeSummary, String> {
    println!("Fetching income summary...");
    let service = PortfolioService::new((*state.pool).clone())
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .get_income_summary()
        .map_err(|e| format!("Failed to fetch income summary: {}", e))
}

#[tauri::command]
pub async fn get_account_history(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<PortfolioHistory>, String> {
    println!("Fetching account history for account ID: {}", account_id);

    let service = PortfolioService::new((*state.pool).clone())
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .get_account_history(&account_id)
        .map_err(|e| format!("Failed to fetch account history: {}", e))
}

#[tauri::command]
pub async fn get_accounts_summary(
    state: State<'_, AppState>,
) -> Result<Vec<AccountSummary>, String> {
    println!("Fetching active accounts performance...");

    let service = PortfolioService::new((*state.pool).clone())
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .get_accounts_summary()
        .map_err(|e| format!("Failed to fetch active accounts performance: {}", e))
}

#[tauri::command]
pub async fn calculate_accounts_historical_data(
    state: State<'_, AppState>,
    account_ids: Vec<String>,
) -> Result<Vec<HistorySummary>, String> {
    println!("Calculating historical data for specific accounts...");

    let service = PortfolioService::new((*state.pool).clone())
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .calculate_accounts_historical_data(account_ids)
        .map_err(|e| {
            format!(
                "Failed to calculate historical data for specific accounts: {}",
                e
            )
        })
}
