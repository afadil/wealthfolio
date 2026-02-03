use std::sync::Arc;

use tauri::State;
use wealthfolio_ai::{
    AiProvidersResponse, ListModelsResponse, ProviderApiError, SetDefaultProviderRequest,
    UpdateProviderSettingsRequest,
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

/// List available models from a provider.
/// Fetches models from the provider's API using backend-stored secrets.
/// Frontend never needs to send API keys - they are retrieved internally.
#[tauri::command]
pub async fn list_ai_models(
    context: State<'_, Arc<ServiceContext>>,
    provider_id: String,
) -> Result<ListModelsResponse, ProviderApiError> {
    context
        .ai_provider_service()
        .list_models(&provider_id)
        .await
}
