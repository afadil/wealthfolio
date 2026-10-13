use crate::profiles::ProfileAccess;
use wealthfolio_core::quotes::service::ProviderInfo;

use super::error::CommandResult;

#[tauri::command]
pub async fn get_market_data_providers_settings(
    context: ProfileAccess,
) -> CommandResult<Vec<ProviderInfo>> {
    let context = context.context()?;
    Ok(context.quote_service.get_providers_info().await?)
}

#[tauri::command]
pub async fn update_market_data_provider_settings(
    context: ProfileAccess,
    provider_id: String,
    priority: i32,
    enabled: bool,
) -> CommandResult<()> {
    let context = context.context()?;
    context
        .quote_service
        .update_provider_settings(&provider_id, priority, enabled)
        .await?;
    Ok(())
}
