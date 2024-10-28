use crate::asset::asset_service::AssetService;
use crate::market_data::market_data_service::MarketDataService;

use crate::models::{AssetProfile, QuoteSummary, UpdateAssetProfile};
use crate::AppState;
use tauri::State;
use wealthfolio_core::models::Asset;

#[tauri::command]
pub async fn search_symbol(query: String) -> Result<Vec<QuoteSummary>, String> {
    println!("Searching for ticker symbol: {}", query);
    let service = MarketDataService::new().await;

    service
        .search_symbol(&query)
        .await
        .map_err(|e| format!("Failed to search ticker: {}", e))
}

#[tauri::command]
pub async fn get_asset_data(
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<AssetProfile, String> {
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let service = AssetService::new().await;
    service
        .get_asset_data(&mut conn, &asset_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset_profile(
    id: String,
    payload: UpdateAssetProfile,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let service = AssetService::new().await;
    service
        .update_asset_profile(&mut conn, &id, payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn synch_quotes(state: State<'_, AppState>) -> Result<(), String> {
    println!("Synching quotes history");
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let service = MarketDataService::new().await;
    service
        .initialize_and_sync_quotes(&mut conn)
        .await
        .map_err(|e| e.to_string())
}
