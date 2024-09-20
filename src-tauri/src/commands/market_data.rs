use crate::asset::asset_service::AssetService;
use crate::market_data::market_data_service::MarketDataService;

use crate::models::{AssetProfile, QuoteSummary};
use crate::AppState;
use tauri::State;

#[tauri::command]
pub async fn search_symbol(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<QuoteSummary>, String> {
    println!("Searching for ticker symbol: {}", query);
    let service = MarketDataService::new((*state.pool).clone());

    service
        .search_symbol(&query)
        .await
        .map_err(|e| format!("Failed to search ticker: {}", e))
}

#[tauri::command]
pub fn get_asset_data(asset_id: String, state: State<AppState>) -> Result<AssetProfile, String> {
    let service = AssetService::new((*state.pool).clone());
    service.get_asset_data(&asset_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn synch_quotes(state: State<'_, AppState>) -> Result<(), String> {
    println!("Synching quotes history");
    let service = MarketDataService::new((*state.pool).clone());
    service.initialize_and_sync_quotes().await
}
