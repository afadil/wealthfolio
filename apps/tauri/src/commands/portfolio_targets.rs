use std::sync::Arc;

use rust_decimal::Decimal;
use tauri::State;
use wealthfolio_core::portfolio::rebalancing::{RebalancingInput, RebalancingPlan};
use wealthfolio_core::portfolio::targets::{
    DeviationReport, HoldingTarget, NewHoldingTarget, NewPortfolioTarget, NewTargetAllocation,
    PortfolioTarget, TargetAllocation,
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

// --- Holding Targets ---

#[tauri::command]
pub async fn get_holding_targets(
    allocation_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<HoldingTarget>, String> {
    state
        .portfolio_target_service()
        .get_holding_targets_by_allocation(&allocation_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_holding_target(
    target: NewHoldingTarget,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HoldingTarget, String> {
    state
        .portfolio_target_service()
        .upsert_holding_target(target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_save_holding_targets(
    targets: Vec<NewHoldingTarget>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<HoldingTarget>, String> {
    state
        .portfolio_target_service()
        .batch_save_holding_targets(targets)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_holding_target(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    state
        .portfolio_target_service()
        .delete_holding_target(&id)
        .await
        .map_err(|e| e.to_string())
}

// --- Rebalancing ---

#[tauri::command]
pub async fn calculate_rebalancing_plan(
    target_id: String,
    available_cash: f64,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<RebalancingPlan, String> {
    let base_currency = state.get_base_currency();

    let input = RebalancingInput {
        target_id,
        available_cash: Decimal::from_f64_retain(available_cash)
            .ok_or_else(|| "Invalid cash amount".to_string())?,
        base_currency,
    };

    state
        .rebalancing_service()
        .calculate_rebalancing_plan(input)
        .await
        .map_err(|e| e.to_string())
}
