use crate::db;
use crate::models::{FinancialHistory, Holding};
use crate::portfolio::portfolio_service;

#[tauri::command]
pub async fn get_historical() -> Result<Vec<FinancialHistory>, String> {
    println!("Fetching portfolio historical...");

    let mut conn = db::establish_connection();

    let mut service = portfolio_service::PortfolioService::new();
    service
        .initialize(&mut conn)
        .await
        .map_err(|e| format!("Failed to initialize portfolio: {}", e))?;

    service
        .calculate_historical_portfolio_values(&mut conn)
        .await
        .map_err(|e| format!("Failed to fetch activities: {}", e))
}

#[tauri::command]
pub async fn compute_holdings() -> Result<Vec<Holding>, String> {
    println!("Compute holdings...");

    let mut conn = db::establish_connection();

    let mut service = portfolio_service::PortfolioService::new();
    service
        .initialize(&mut conn)
        .await
        .map_err(|e| format!("Failed to initialize portfolio: {}", e))?;

    service
        .compute_holdings(&mut conn)
        .await
        .map_err(|e| format!("Failed to fetch activities: {}", e))
}
