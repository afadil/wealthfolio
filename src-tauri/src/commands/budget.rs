use std::sync::Arc;

use crate::{
    context::ServiceContext,
    events::{emit_resource_changed, ResourceEventPayload},
};
use log::debug;
use serde_json::json;
use tauri::{AppHandle, State};
use wealthfolio_core::budget::{
    BudgetAllocation, BudgetAllocationWithCategory, BudgetConfig, BudgetSummary, BudgetVsActual,
    NewBudgetConfig,
};

#[tauri::command]
pub async fn get_budget_config(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<BudgetConfig>, String> {
    debug!("Fetching budget config...");
    state
        .budget_service()
        .get_budget_config()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_budget_config(
    config: NewBudgetConfig,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<BudgetConfig, String> {
    debug!("Upserting budget config...");
    let result = state
        .budget_service()
        .upsert_budget_config(config)
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new("budget", "updated", json!({ "config_id": result.id })),
    );

    Ok(result)
}

#[tauri::command]
pub async fn get_budget_summary(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<BudgetSummary, String> {
    debug!("Fetching budget summary...");
    state
        .budget_service()
        .get_budget_summary()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_budget_allocations(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<BudgetAllocationWithCategory>, String> {
    debug!("Fetching budget allocations...");
    state
        .budget_service()
        .get_allocations()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_budget_allocation(
    category_id: String,
    amount: f64,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<BudgetAllocation, String> {
    debug!("Setting budget allocation...");
    let result = state
        .budget_service()
        .set_allocation(category_id.clone(), amount)
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "budget_allocation",
            "updated",
            json!({ "category_id": category_id }),
        ),
    );

    Ok(result)
}

#[tauri::command]
pub async fn delete_budget_allocation(
    category_id: String,
    state: State<'_, Arc<ServiceContext>>,
    handle: AppHandle,
) -> Result<usize, String> {
    debug!("Deleting budget allocation...");
    let result = state
        .budget_service()
        .delete_allocation(&category_id)
        .await
        .map_err(|e| e.to_string())?;

    emit_resource_changed(
        &handle,
        ResourceEventPayload::new(
            "budget_allocation",
            "deleted",
            json!({ "category_id": category_id }),
        ),
    );

    Ok(result)
}

#[tauri::command]
pub async fn get_budget_vs_actual(
    month: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<BudgetVsActual, String> {
    debug!("Fetching budget vs actual for month: {}", month);
    state
        .budget_service()
        .get_budget_vs_actual(&month)
        .map_err(|e| e.to_string())
}
