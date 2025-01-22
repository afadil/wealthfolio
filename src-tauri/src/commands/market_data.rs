use crate::asset::asset_service::AssetService;
use crate::market_data::market_data_service::MarketDataService;

use crate::models::{AssetProfile, QuoteSummary, UpdateAssetProfile};
use crate::AppState;
use log::debug;
use tauri::State;
use wealthfolio_core::models::{Asset, QuoteUpdate};

#[tauri::command]
pub async fn search_symbol(query: String) -> Result<Vec<QuoteSummary>, String> {
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
    debug!("Synching quotes history");
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

#[tauri::command]
pub async fn refresh_quotes_for_symbols(
    symbols: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    debug!("Refreshing quotes for symbols: {:?}", symbols);
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let service = MarketDataService::new().await;
    service
        .refresh_quotes_for_symbols(&mut conn, &symbols)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_quote(quote: QuoteUpdate, state: State<'_, AppState>) -> Result<(), String> {
    debug!("Updating quote: {:?}", quote);
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let service = MarketDataService::new().await;
    service
        .update_quote(&mut conn, quote)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_quote(id: String, state: State<'_, AppState>) -> Result<(), String> {
    debug!("Deleting quote: {}", id);
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let service = MarketDataService::new().await;
    service
        .delete_quote(&mut conn, &id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset_data_source(
    id: String,
    data_source: String,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let mut conn = state
        .pool
        .get()
        .map_err(|e| format!("Failed to get connection: {}", e))?;
    let service = AssetService::new().await;
    let asset = service
        .update_asset_data_source(&mut conn, &id, data_source)
        .map_err(|e| e.to_string())?;

    // After updating data source, refresh quotes for this asset but don't fail if it errors
    let service = MarketDataService::new().await;
    if let Err(e) = service
        .refresh_quotes_for_symbols(&mut conn, &vec![id.clone()])
        .await
    {
        log::error!("Failed to refresh quotes after data source update: {}", e);
    }

    Ok(asset)
}
