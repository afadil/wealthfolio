use crate::models::{AccountSummary, HistorySummary, Holding, IncomeSummary, PortfolioHistory};
use crate::portfolio::portfolio_service::PortfolioService;
use crate::AppState;

use tauri::State;

async fn create_portfolio_service(state: &State<'_, AppState>) -> Result<PortfolioService, String> {
    let base_currency = state.base_currency.read().unwrap().clone();
    PortfolioService::new(base_currency)
        .await
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))
}

#[tauri::command]
pub async fn calculate_historical_data(
    state: State<'_, AppState>,
    account_ids: Option<Vec<String>>,
    force_full_calculation: bool,
) -> Result<Vec<HistorySummary>, String> {
    println!("Calculate portfolio historical...");
    let service = create_portfolio_service(&state).await?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    service
        .calculate_historical_data(&mut conn, account_ids, force_full_calculation)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn compute_holdings(state: State<'_, AppState>) -> Result<Vec<Holding>, String> {
    let service = create_portfolio_service(&state).await?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    let result = service
        .compute_holdings(&mut conn)
        .await
        .map_err(|e| e.to_string())
        .map(|vec| Ok(vec))?;

    result
}

#[tauri::command]
pub async fn get_accounts_history(
    state: State<'_, AppState>,
) -> Result<Vec<PortfolioHistory>, String> {
    let service = create_portfolio_service(&state).await?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    service
        .get_all_accounts_history(&mut conn)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_account_history(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Vec<PortfolioHistory>, String> {
    println!("Fetching account history for account ID: {}", account_id);
    let service = create_portfolio_service(&state).await?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    service
        .get_account_history(&mut conn, &account_id)
        .map_err(|e| format!("Failed to fetch account history: {}", e))
}

#[tauri::command]
pub async fn get_accounts_summary(
    state: State<'_, AppState>,
) -> Result<Vec<AccountSummary>, String> {
    println!("Fetching active accounts performance...");
    let service = create_portfolio_service(&state).await?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    service
        .get_accounts_summary(&mut conn)
        .map_err(|e| format!("Failed to fetch active accounts performance: {}", e))
}

#[tauri::command]
pub async fn recalculate_portfolio(
    state: State<'_, AppState>,
) -> Result<Vec<HistorySummary>, String> {
    println!("Recalculating portfolio...");
    let service = create_portfolio_service(&state).await?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    service
        .update_portfolio(&mut conn)
        .await
        .map_err(|e| format!("Failed to recalculate portfolio: {}", e))
}

#[tauri::command]
pub async fn get_income_summary(state: State<'_, AppState>) -> Result<Vec<IncomeSummary>, String> {
    println!("Fetching income summary...");
    let service = create_portfolio_service(&state).await?;
    let mut conn = state.pool.get().map_err(|e| e.to_string())?;

    service
        .get_income_summary(&mut conn)
        .map_err(|e| format!("Failed to fetch income summary: {}", e))
}
