use crate::db;
use crate::models::{FinancialHistory, Holding, IncomeSummary};
use crate::portfolio::portfolio_service;

#[tauri::command]
pub async fn get_historical() -> Result<Vec<FinancialHistory>, String> {
    println!("Fetching portfolio historical...");

    let mut conn = db::establish_connection();

    let service = portfolio_service::PortfolioService::new(&mut conn)
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .calculate_historical_portfolio_values(&mut conn)
        .await
        .map_err(|e| format!("Failed to fetch activities: {}", e))
}

#[tauri::command]
pub async fn compute_holdings() -> Result<Vec<Holding>, String> {
    println!("Compute holdings...");

    let mut conn = db::establish_connection();

    let service = portfolio_service::PortfolioService::new(&mut conn)
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .compute_holdings(&mut conn)
        .await
        .map_err(|e| format!("Failed to fetch activities: {}", e))
}

#[tauri::command]
pub async fn get_income_summary() -> Result<IncomeSummary, String> {
    println!("Fetching income summary...");

    let mut conn = db::establish_connection();

    let service = portfolio_service::PortfolioService::new(&mut conn)
        .map_err(|e| format!("Failed to create PortfolioService: {}", e))?;

    service
        .get_income_summary(&mut conn)
        .map_err(|e| format!("Failed to fetch income summary: {}", e))
}
