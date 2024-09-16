use crate::models::{FinancialHistory, Holding, IncomeSummary};
use crate::portfolio::portfolio_service::PortfolioService;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn get_historical(state: State<'_, AppState>) -> Result<Vec<FinancialHistory>, String> {
    println!("Fetching portfolio historical...");

    let service = PortfolioService::new((*state.pool).clone())
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .calculate_historical_portfolio_values()
        .map_err(|e| format!("Failed to fetch activities: {}", e))
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
