use tauri::State;
use wealthfolio_core::market_data::MarketDataProviderSetting;

use crate::context::ServiceContext; // To access the service
use std::sync::Arc;

use super::error::CommandResult;

#[tauri::command]
pub async fn get_market_data_providers_settings(
    context: State<'_, Arc<ServiceContext>>,
) -> CommandResult<Vec<MarketDataProviderSetting>> {
    Ok(context
        .market_data_service
        .get_market_data_providers_settings()
        .await?)
}

#[tauri::command]
pub async fn update_market_data_provider_settings(
    context: State<'_, Arc<ServiceContext>>,
    provider_id: String,
    priority: i32,
    enabled: bool,
) -> CommandResult<MarketDataProviderSetting> {
    Ok(context
        .market_data_service
        .update_market_data_provider_settings(provider_id, priority, enabled)
        .await?)
}