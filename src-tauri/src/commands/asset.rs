use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_portfolio_trigger_recalculate, PortfolioRequestPayload},
};
use tauri::{AppHandle, State};
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
    handle: AppHandle,
) -> Result<Asset, String> {
    let asset = state
        .asset_service()
        .update_asset_data_source(&id, data_source)
        .map_err(|e| e.to_string())?;

    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        // Emit event to trigger market data sync using the builder
        let payload = PortfolioRequestPayload::builder()
            .account_ids(None)
            .refetch_all_market_data(true)
            .symbols(Some(vec![id]))
            .build();
        emit_portfolio_trigger_recalculate(&handle, payload);
    });

    Ok(asset)
}
