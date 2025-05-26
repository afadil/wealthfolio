use tauri::{AppHandle, command, State, Runtime};
use wealthfolio_core::{
    market_data::{MarketDataServiceTrait, MarketDataProviderSetting},
    errors::Result as CoreResult, // Alias to avoid conflict with tauri::Result
};
use crate::context::ServiceContext; // To access the service
use std::sync::Arc;

#[command]
pub async fn get_market_data_providers_settings<R: Runtime>(
    // Removed app_handle: AppHandle<R>,
    context: State<'_, Arc<ServiceContext>>,
) -> CoreResult<Vec<MarketDataProviderSetting>> {
    context.market_data_service.get_market_data_providers_settings().await
}

#[command]
pub async fn update_market_data_provider_settings<R: Runtime>(
    // Removed app_handle: AppHandle<R>,
    context: State<'_, Arc<ServiceContext>>,
    provider_id: String,
    api_key: Option<String>,
    priority: i32,
    enabled: bool,
) -> CoreResult<MarketDataProviderSetting> {
    // The AppHandle is now obtained within the service via ApiKeyResolver if needed,
    // or more precisely, the ApiKeyResolver (which has AppHandle) is used by the service.
    context.market_data_service.update_market_data_provider_settings(
        // Removed &app_handle,
        provider_id,
        api_key,
        priority,
        enabled,
    ).await
}
