//! Device Enroll Service Commands
//!
//! Tauri command wrappers for the DeviceEnrollService.
//! These commands delegate to the shared service in the context.

use std::sync::Arc;
use tauri::State;

use crate::commands::device_sync::{
    ensure_background_engine_started, ensure_background_engine_stopped,
};
use crate::context::ServiceContext;

// Re-export types for use in other modules
pub use wealthfolio_device_sync::{EnableSyncResult, SyncState, SyncStateResult};

/// Get the current device sync state.
/// Returns the state machine status: FRESH, REGISTERED, READY, STALE, or RECOVERY.
#[tauri::command]
pub async fn get_device_sync_state(
    context: State<'_, Arc<ServiceContext>>,
) -> Result<SyncStateResult, String> {
    context
        .device_enroll_service()
        .get_sync_state()
        .await
        .map_err(|e| e.message)
}

/// Enable device sync - enrolls the device and initializes E2EE if first device.
/// Call this when user clicks "Enable Sync" button.
#[tauri::command]
pub async fn enable_device_sync(
    context: State<'_, Arc<ServiceContext>>,
) -> Result<EnableSyncResult, String> {
    let result = context
        .device_enroll_service()
        .enable_sync()
        .await
        .map_err(|e| e.message)?;

    if result.state == SyncState::Ready {
        let engine_context = Arc::clone(context.inner());
        tauri::async_runtime::spawn(async move {
            if let Err(err) = ensure_background_engine_started(engine_context).await {
                log::warn!(
                    "[DeviceSync] Post-enable background engine start failed: {}",
                    err
                );
            }
        });
    }

    Ok(result)
}

/// Clear all device sync data and return to FRESH state.
/// Use for troubleshooting or when user wants to reset sync.
#[tauri::command]
pub async fn clear_device_sync_data(context: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    ensure_background_engine_stopped(Arc::clone(context.inner())).await?;
    context
        .device_enroll_service()
        .clear_sync_data()
        .map_err(|e| e.message)
}

/// Reinitialize device sync - resets server data and enables sync in one operation.
/// Used when sync is in orphaned state (keys exist but no devices).
#[tauri::command]
pub async fn reinitialize_device_sync(
    context: State<'_, Arc<ServiceContext>>,
) -> Result<EnableSyncResult, String> {
    let result = context
        .device_enroll_service()
        .reinitialize_sync()
        .await
        .map_err(|e| e.message)?;

    if result.state == SyncState::Ready {
        let engine_context = Arc::clone(context.inner());
        tauri::async_runtime::spawn(async move {
            if let Err(err) = ensure_background_engine_started(engine_context).await {
                log::warn!(
                    "[DeviceSync] Post-reinitialize background engine start failed: {}",
                    err
                );
            }
        });
    }

    Ok(result)
}
