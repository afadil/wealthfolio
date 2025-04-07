use std::sync::Arc;

use crate::context::ServiceContext;
use tauri::State;
use wealthfolio_core::assets::{Asset, AssetData, UpdateAssetProfile};

#[tauri::command]
pub async fn get_asset_data(
    asset_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<AssetData, String> {
    state
        .asset_service()
        .get_asset_data(&asset_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset_profile(
    id: String,
    payload: UpdateAssetProfile,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Asset, String> {
    state
        .asset_service()
        .update_asset_profile(&id, payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset_data_source(
    id: String,
    data_source: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Asset, String> {
    let asset = state
        .asset_service()
        .update_asset_data_source(&id, data_source)
        .map_err(|e| e.to_string())?;

    // After updating data source, refresh quotes for this asset but don't fail if it errors
    if let Err(e) = state
        .asset_service()
        .sync_asset_quotes_by_symbols(&vec![id.clone()], false)
        .await
    {
        log::error!("Failed to refresh quotes after data source update: {}", e);
    }

    Ok(asset)
} 