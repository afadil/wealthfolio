use crate::asset::asset_service;
use crate::models::{AssetProfile, QuoteSummary};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn search_ticker(query: String) -> Result<Vec<QuoteSummary>, String> {
    println!("Searching for ticker symbol: {}", query);
    let service = asset_service::AssetService::new();

    service
        .search_ticker(&query)
        .await
        .map_err(|e| format!("Failed to search ticker: {}", e))
}

#[tauri::command]
pub fn get_asset_data(asset_id: String, state: State<AppState>) -> Result<AssetProfile, String> {
    let mut conn = state.conn.lock().unwrap();
    let service = asset_service::AssetService::new();
    service
        .get_asset_data(&mut conn, &asset_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn synch_quotes() -> Result<(), String> {
    println!("Synch Quotes historical data...");

    let service = asset_service::AssetService::new();

    service
        .initialize_and_sync_quotes()
        .await
        .map_err(|e| format!("Failed to Synch Quotes historical data: {}", e))
}
