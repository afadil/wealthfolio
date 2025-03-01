use crate::market_data::MarketDataService;

use crate::AppState;
use log::debug;
use tauri::State;
use wealthfolio_core::assets::{Asset, AssetProfile, AssetService, UpdateAssetProfile};
use wealthfolio_core::market_data::{QuoteSummary, QuoteUpdate};


#[tauri::command]
pub async fn search_symbol(query: String, state: State<'_, AppState>) -> Result<Vec<QuoteSummary>, String> {
    let service = MarketDataService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;

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
    let service = AssetService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;
    service
        .get_asset_data(&asset_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset_profile(
    id: String,
    payload: UpdateAssetProfile,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let service = AssetService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;
    service
        .update_asset_profile( &id, payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn synch_quotes(state: State<'_, AppState>) -> Result<(), String> {
    debug!("Synching quotes history");
    let service = MarketDataService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;
    
   service
        .sync_all_quotes()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn refresh_quotes_for_symbols(
    symbols: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    debug!("Refreshing quotes for symbols: {:?}", symbols);
    let service = MarketDataService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;
    service
        .refresh_quotes_for_symbols(&symbols)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_quote(quote: QuoteUpdate, state: State<'_, AppState>) -> Result<(), String> {
    debug!("Updating quote: {:?}", quote);
    let service = MarketDataService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;
    service
        .update_quote(quote)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_quote(id: String, state: State<'_, AppState>) -> Result<(), String> {
    debug!("Deleting quote: {}", id);
    let service = MarketDataService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;
    service
        .delete_quote(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset_data_source(
    id: String,
    data_source: String,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let service = AssetService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;
    let asset = service
        .update_asset_data_source(&id, data_source)
        .map_err(|e| e.to_string())?;

    // After updating data source, refresh quotes for this asset but don't fail if it errors
    let service = MarketDataService::new(state.pool.clone()).await.map_err(|e| e.to_string())?;
    if let Err(e) = service
        .refresh_quotes_for_symbols(&vec![id.clone()])
        .await
    {
        log::error!("Failed to refresh quotes after data source update: {}", e);
    }

    Ok(asset)
}
