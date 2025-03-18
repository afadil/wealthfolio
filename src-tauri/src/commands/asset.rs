use crate::AppState;
use tauri::State;
use wealthfolio_core::assets::{Asset, AssetData, AssetService, UpdateAssetProfile};

#[tauri::command]
pub async fn get_asset_data(
    asset_id: String,
    state: State<'_, AppState>,
) -> Result<AssetData, String> {
    let service = AssetService::new(state.pool.clone())
        .await
        .map_err(|e| e.to_string())?;
    service
        .get_asset_data(&asset_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset_profile(
    id: String,
    payload: UpdateAssetProfile,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let service = AssetService::new(state.pool.clone())
        .await
        .map_err(|e| e.to_string())?;
    service
        .update_asset_profile(&id, payload)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_asset_data_source(
    id: String,
    data_source: String,
    state: State<'_, AppState>,
) -> Result<Asset, String> {
    let service = AssetService::new(state.pool.clone())
        .await
        .map_err(|e| e.to_string())?;
    let asset = service
        .update_asset_data_source(&id, data_source)
        .map_err(|e| e.to_string())?;

    // After updating data source, refresh quotes for this asset but don't fail if it errors
    let assets_service = AssetService::new(state.pool.clone())
        .await
        .map_err(|e| e.to_string())?;
    if let Err(e) = assets_service.sync_asset_quotes_by_symbols(&vec![id.clone()], false).await {
        log::error!("Failed to refresh quotes after data source update: {}", e);
    }

    Ok(asset)
} 