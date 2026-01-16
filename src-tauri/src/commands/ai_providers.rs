use std::sync::Arc;

use tauri::State;
use wealthfolio_core::ai::{
    AiProvidersResponse, SetDefaultProviderRequest, UpdateProviderSettingsRequest,
};

use crate::context::ServiceContext;

use super::error::CommandResult;

#[tauri::command]
pub async fn get_ai_providers(
    context: State<'_, Arc<ServiceContext>>,
) -> CommandResult<AiProvidersResponse> {
    Ok(context.ai_provider_service().get_ai_providers()?)
}

#[tauri::command]
pub async fn update_ai_provider_settings(
    context: State<'_, Arc<ServiceContext>>,
    request: UpdateProviderSettingsRequest,
) -> CommandResult<()> {
    context
        .ai_provider_service()
        .update_provider_settings(request)
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn set_default_ai_provider(
    context: State<'_, Arc<ServiceContext>>,
    request: SetDefaultProviderRequest,
) -> CommandResult<()> {
    context
        .ai_provider_service()
        .set_default_provider(request)
        .await?;
    Ok(())
}
