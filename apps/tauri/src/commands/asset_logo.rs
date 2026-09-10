use std::sync::Arc;

use crate::context::ServiceContext;
use tauri::State;
use wealthfolio_core::assets::{AssetLogo, AssetLogoSummary, UpsertAssetLogo};

#[tauri::command]
pub async fn get_asset_logo(
    asset_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<AssetLogo>, String> {
    state
        .asset_logo_service()
        .get_asset_logo(&asset_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_asset_logos(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AssetLogoSummary>, String> {
    state
        .asset_logo_service()
        .list_asset_logos()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_asset_logo(
    asset_id: String,
    payload: UpsertAssetLogo,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<AssetLogo, String> {
    state
        .asset_logo_service()
        .upsert_asset_logo(&asset_id, payload)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_asset_logo(
    asset_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    state
        .asset_logo_service()
        .delete_asset_logo(&asset_id)
        .await
        .map_err(|e| e.to_string())
}
