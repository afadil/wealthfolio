use std::sync::Arc;
use tauri::State;
use wealthfolio_core::rebalancing::*;

use crate::context::ServiceContext;

// Strategy management

#[tauri::command]
pub async fn get_rebalancing_strategies(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<RebalancingStrategy>, String> {
    state
        .rebalancing_service
        .get_strategies()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_rebalancing_strategy(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<RebalancingStrategy>, String> {
    state
        .rebalancing_service
        .get_strategy(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_rebalancing_strategy(
    strategy: NewRebalancingStrategy,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<RebalancingStrategy, String> {
    state
        .rebalancing_service
        .save_strategy(strategy)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_rebalancing_strategy(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    state
        .rebalancing_service
        .delete_strategy(&id)
        .await
        .map_err(|e| e.to_string())
}

// Asset class targets

/// Get asset class targets for a specific account's active strategy
#[tauri::command]
pub async fn get_asset_class_targets_for_account(
    account_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AssetClassTarget>, String> {
    state
        .rebalancing_service
        .get_asset_class_targets_for_account(&account_id)
        .await
        .map_err(|e| e.to_string())
}

/// Get the active rebalancing strategy for a specific account
#[tauri::command]
pub async fn get_active_strategy_for_account(
    account_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<RebalancingStrategy>, String> {
    state
        .rebalancing_service
        .get_active_strategy_for_account(&account_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_asset_class_targets(
    strategy_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<AssetClassTarget>, String> {
    state
        .rebalancing_service
        .get_asset_class_targets(&strategy_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_asset_class_target(
    target: NewAssetClassTarget,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<AssetClassTarget, String> {
    state
        .rebalancing_service
        .save_asset_class_target(target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_asset_class_target(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    state
        .rebalancing_service
        .delete_asset_class_target(&id)
        .await
        .map_err(|e| e.to_string())
}

// Holding targets

#[tauri::command]
pub async fn get_holding_targets(
    asset_class_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<HoldingTarget>, String> {
    state
        .rebalancing_service
        .get_holding_targets(&asset_class_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_holding_target(
    target: NewHoldingTarget,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HoldingTarget, String> {
    state
        .rebalancing_service
        .save_holding_target(target)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_holding_target(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    state
        .rebalancing_service
        .delete_holding_target(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_holding_target_lock(
    id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HoldingTarget, String> {
    state
        .rebalancing_service
        .toggle_holding_target_lock(&id)
        .await
        .map_err(|e| e.to_string())
}

// Virtual portfolio cleanup

#[tauri::command]
pub async fn get_unused_virtual_strategies_count(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    state
        .rebalancing_service
        .get_unused_virtual_strategies_count()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cleanup_unused_virtual_strategies(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<usize, String> {
    state
        .rebalancing_service
        .cleanup_unused_virtual_strategies()
        .await
        .map_err(|e| e.to_string())
}
