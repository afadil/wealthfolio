use tauri::State;
use wealthfolio_core::custom_provider::{
    CustomProviderWithSources, NewCustomProvider, TestSourceRequest, TestSourceResult,
    UpdateCustomProvider,
};

use crate::context::ServiceContext;
use std::sync::Arc;

use super::error::CommandResult;

#[tauri::command]
pub async fn get_custom_providers(
    context: State<'_, Arc<ServiceContext>>,
) -> CommandResult<Vec<CustomProviderWithSources>> {
    Ok(context.custom_provider_service.get_all()?)
}

#[tauri::command]
pub async fn create_custom_provider(
    context: State<'_, Arc<ServiceContext>>,
    payload: NewCustomProvider,
) -> CommandResult<CustomProviderWithSources> {
    Ok(context.custom_provider_service.create(payload).await?)
}

#[tauri::command]
pub async fn update_custom_provider(
    context: State<'_, Arc<ServiceContext>>,
    provider_id: String,
    payload: UpdateCustomProvider,
) -> CommandResult<CustomProviderWithSources> {
    Ok(context
        .custom_provider_service
        .update(&provider_id, payload)
        .await?)
}

#[tauri::command]
pub async fn delete_custom_provider(
    context: State<'_, Arc<ServiceContext>>,
    provider_id: String,
) -> CommandResult<()> {
    Ok(context.custom_provider_service.delete(&provider_id).await?)
}

#[tauri::command]
pub async fn test_custom_provider_source(
    context: State<'_, Arc<ServiceContext>>,
    payload: TestSourceRequest,
) -> CommandResult<TestSourceResult> {
    Ok(context.custom_provider_service.test_source(payload).await?)
}
