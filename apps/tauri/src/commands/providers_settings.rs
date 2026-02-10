use tauri::State;
use wealthfolio_core::quotes::service::ProviderInfo;

use crate::context::ServiceContext;
use std::sync::Arc;

use super::error::CommandResult;

#[tauri::command]
pub async fn get_market_data_providers_settings(
    context: State<'_, Arc<ServiceContext>>,
) -> CommandResult<Vec<ProviderInfo>> {
    Ok(context.quote_service.get_providers_info().await?)
}

#[tauri::command]
pub async fn update_market_data_provider_settings(
    context: State<'_, Arc<ServiceContext>>,
    provider_id: String,
    priority: i32,
    enabled: bool,
) -> CommandResult<()> {
    context
        .quote_service
        .update_provider_settings(&provider_id, priority, enabled)
        .await?;
    Ok(())
}
