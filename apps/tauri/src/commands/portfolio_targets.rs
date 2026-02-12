use std::sync::Arc;

use tauri::State;
use wealthfolio_core::portfolio::targets::{
    DeviationReport, NewPortfolioTarget, NewTargetAllocation, PortfolioTarget, TargetAllocation,
};

use crate::context::ServiceContext;

#[tauri::command]
pub async fn get_portfolio_targets(
    account_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<PortfolioTarget>, String> {
    state
        .portfolio_target_service()
        .get_targets_by_account(&account_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_portfolio_target(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<PortfolioTarget>, String> {
    state
        .portfolio_target_service()
        .get_target(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_portfolio_target(
    target: NewPortfolioTarget,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<PortfolioTarget, String> {
    state
        .portfolio_target_service()
        .create_target(target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_portfolio_target(
    target: PortfolioTarget,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<PortfolioTarget, String> {
    state
        .portfolio_target_service()
        .update_target(target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_portfolio_target(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    state
        .portfolio_target_service()
        .delete_target(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_target_allocations(
    target_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<TargetAllocation>, String> {
    state
        .portfolio_target_service()
        .get_allocations_by_target(&target_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_target_allocation(
    allocation: NewTargetAllocation,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<TargetAllocation, String> {
    state
        .portfolio_target_service()
        .upsert_allocation(allocation)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_target_allocation(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    state
        .portfolio_target_service()
        .delete_allocation(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_allocation_deviations(
    target_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<DeviationReport, String> {
    let base_currency = state.get_base_currency();
    state
        .portfolio_target_service()
        .get_deviation_report(&target_id, &base_currency)
        .await
        .map_err(|e| e.to_string())
}
