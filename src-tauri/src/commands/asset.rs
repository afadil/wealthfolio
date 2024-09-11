use crate::asset::asset_service;
use crate::db;
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
pub async fn synch_quotes(state: State<'_, AppState>) -> Result<(), String> {
    println!("Synching quotes history");
    let service = asset_service::AssetService::new();

    // Get the database path from the AppState
    let db_path = state.db_path.clone();

    println!("Sync B Path: {}", db_path);
    // Create a new connection
    let mut new_conn = db::establish_connection(&db_path);

    service.initialize_and_sync_quotes(&mut new_conn).await
}
