use tauri::{AppHandle, command, State, Runtime};
use wealthfolio_core::{
    market_data::{MarketDataServiceTrait, MarketDataProviderSetting},
    errors::Result as CoreResult, // Alias to avoid conflict with tauri::Result
};
use crate::context::ServiceContext; // To access the service
use std::sync::Arc;

#[command]
pub async fn get_market_data_providers_settings<R: Runtime>(
    app_handle: AppHandle<R>, // Not strictly needed by the service method, but good for consistency
    context: State<'_, Arc<ServiceContext>>,
) -> CoreResult<Vec<MarketDataProviderSetting>> {
    context.market_data_service.get_market_data_providers_settings().await
}

#[command]
pub async fn update_market_data_provider_settings<R: Runtime>(
    app_handle: AppHandle<R>, // Needed for Stronghold access via the service
    context: State<'_, Arc<ServiceContext>>,
    provider_id: String,
    api_key: Option<String>,
    priority: i32,
    enabled: bool,
) -> CoreResult<MarketDataProviderSetting> {
    context.market_data_service.update_market_data_provider_settings(
        &app_handle, // Pass the app_handle to the service method
        provider_id,
        api_key,
        priority,
        enabled,
    ).await
}
