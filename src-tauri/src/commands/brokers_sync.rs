//! Commands for syncing broker data from the cloud API.

use log::{debug, error, info};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::context::ServiceContext;
use crate::events::{BROKER_SYNC_COMPLETE, BROKER_SYNC_ERROR, BROKER_SYNC_START};
use wealthfolio_connect::{
    broker::BrokerApiClient, fetch_subscription_plans_public, BrokerAccount, BrokerConnection,
    PlansResponse, Platform, SyncConfig, SyncOrchestrator, SyncProgressPayload,
    SyncProgressReporter, SyncResult, UserInfo, DEFAULT_CLOUD_API_URL,
};

// ─────────────────────────────────────────────────────────────────────────────
// Tauri Progress Reporter
// ─────────────────────────────────────────────────────────────────────────────

/// Progress reporter that emits Tauri events.
struct TauriProgressReporter {
    app_handle: AppHandle,
}

impl TauriProgressReporter {
    fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
}

impl SyncProgressReporter for TauriProgressReporter {
    fn report_progress(&self, payload: SyncProgressPayload) {
        if let Err(e) = self.app_handle.emit("sync-progress", &payload) {
            debug!("Failed to emit sync-progress event: {}", e);
        }
    }

    fn report_sync_start(&self) {
        self.app_handle.emit(BROKER_SYNC_START, ()).unwrap_or_else(|e| {
            error!("Failed to emit broker:sync-start event: {}", e);
        });
    }

    fn report_sync_complete(&self, result: &SyncResult) {
        if result.success {
            self.app_handle
                .emit(BROKER_SYNC_COMPLETE, result)
                .unwrap_or_else(|e| {
                    error!("Failed to emit broker:sync-complete event: {}", e);
                });
        } else {
            self.app_handle
                .emit(
                    BROKER_SYNC_ERROR,
                    serde_json::json!({ "error": result.message }),
                )
                .unwrap_or_else(|e| {
                    error!("Failed to emit broker:sync-error event: {}", e);
                });
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Broker Sync Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Sync broker data from the cloud API (non-blocking with SSE events).
/// Returns immediately after triggering the sync. Results are delivered via events:
/// - `broker:sync-start` - emitted when sync begins
/// - `broker:sync-complete` - emitted with SyncResult payload on success
/// - `broker:sync-error` - emitted with error message on failure
#[tauri::command]
pub async fn sync_broker_data(
    app: AppHandle,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    info!("[Connect] Starting broker data sync (non-blocking)...");

    // Clone what we need for the spawned task
    let context = state.inner().clone();
    let app_handle = app.clone();

    // Spawn background task
    tauri::async_runtime::spawn(async move {
        match perform_broker_sync(&context, Some(&app_handle)).await {
            Ok(_result) => {
                info!("[Connect] Broker sync completed successfully");
                // Events are emitted by the orchestrator via TauriProgressReporter
            }
            Err(err) => {
                error!("[Connect] Broker sync failed: {}", err);
                // Error event also emitted by orchestrator
            }
        }
    });

    Ok(())
}

/// Core broker sync logic that can be called from Tauri command or scheduler.
///
/// This function is public so the scheduler can call it directly.
/// FX rate registration is handled automatically by AccountService during account creation.
///
/// # Arguments
///
/// * `context` - Service context
/// * `app` - Optional AppHandle for progress reporting. If None, progress events are not emitted.
pub async fn perform_broker_sync(
    context: &Arc<ServiceContext>,
    app: Option<&AppHandle>,
) -> Result<SyncResult, String> {
    info!("Starting broker data sync...");

    let client = context.connect_service().get_api_client()?;

    // Create progress reporter and orchestrator
    // Use TauriProgressReporter if we have an AppHandle, otherwise use NoOp
    if let Some(app_handle) = app {
        let reporter = Arc::new(TauriProgressReporter::new(app_handle.clone()));
        let orchestrator = SyncOrchestrator::new(
            context.sync_service(),
            reporter,
            SyncConfig::default(),
        );
        orchestrator.sync_all(&client).await
    } else {
        let reporter = Arc::new(wealthfolio_connect::NoOpProgressReporter);
        let orchestrator = SyncOrchestrator::new(
            context.sync_service(),
            reporter,
            SyncConfig::default(),
        );
        orchestrator.sync_all(&client).await
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Account and Platform Queries
// ─────────────────────────────────────────────────────────────────────────────

/// Get all synced accounts
#[tauri::command]
pub async fn get_synced_accounts(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<wealthfolio_core::accounts::Account>, String> {
    state
        .sync_service()
        .get_synced_accounts()
        .map_err(|e| format!("Failed to get synced accounts: {}", e))
}

/// Get all platforms
#[tauri::command]
pub async fn get_platforms(state: State<'_, Arc<ServiceContext>>) -> Result<Vec<Platform>, String> {
    state
        .sync_service()
        .get_platforms()
        .map_err(|e| format!("Failed to get platforms: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────
// Broker Connection Management Commands
// ─────────────────────────────────────────────────────────────────────────────

/// List broker connections from the cloud API
#[tauri::command]
pub async fn list_broker_connections(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<BrokerConnection>, String> {
    info!("Fetching broker connections from cloud API...");

    let client = state.connect_service().get_api_client()?;
    let connections = client.list_connections().await.map_err(|e| e.to_string())?;

    info!("Found {} broker connections", connections.len());
    Ok(connections)
}

/// List broker accounts from the cloud API
/// Returns the live account data including sync_enabled and owner info
#[tauri::command]
pub async fn list_broker_accounts(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<BrokerAccount>, String> {
    info!("Fetching broker accounts from cloud API...");

    let client = state.connect_service().get_api_client()?;
    let accounts = client.list_accounts(None).await.map_err(|e| e.to_string())?;

    info!("Found {} broker accounts", accounts.len());
    Ok(accounts)
}

// ─────────────────────────────────────────────────────────────────────────────
// User & Subscription Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Get subscription plans from the cloud API (requires authentication)
#[tauri::command]
pub async fn get_subscription_plans(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<PlansResponse, String> {
    info!("Fetching subscription plans from cloud API...");

    let client = state.connect_service().get_api_client()?;
    match client.get_subscription_plans().await {
        Ok(response) => {
            info!("Found {} subscription plans", response.plans.len());
            Ok(response)
        }
        Err(e) => {
            error!("Failed to get subscription plans: {}", e);
            Err(e.to_string())
        }
    }
}

/// Get subscription plans from the cloud API (public, no authentication required)
#[tauri::command]
pub async fn get_subscription_plans_public() -> Result<PlansResponse, String> {
    info!("Fetching subscription plans from cloud API (public)...");

    let base_url =
        std::env::var("CONNECT_API_URL").unwrap_or_else(|_| DEFAULT_CLOUD_API_URL.to_string());

    match fetch_subscription_plans_public(&base_url).await {
        Ok(response) => {
            info!("Found {} subscription plans (public)", response.plans.len());
            Ok(response)
        }
        Err(e) => {
            error!("Failed to get subscription plans (public): {}", e);
            Err(e.to_string())
        }
    }
}

/// Get current user info from the cloud API
#[tauri::command]
pub async fn get_user_info(state: State<'_, Arc<ServiceContext>>) -> Result<UserInfo, String> {
    info!("Fetching user info from cloud API...");

    let client = state.connect_service().get_api_client()?;
    match client.get_user_info().await {
        Ok(user_info) => {
            info!("User info retrieved for: {}", user_info.email.as_deref().unwrap_or("unknown"));
            Ok(user_info)
        }
        Err(e) => {
            error!("Failed to get user info: {}", e);
            Err(e.to_string())
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync State and Import Run Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Get all broker sync states
#[tauri::command]
pub async fn get_broker_sync_states(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<wealthfolio_core::sync::BrokerSyncState>, String> {
    debug!("Fetching all broker sync states...");
    state
        .sync_service()
        .get_all_sync_states()
        .map_err(|e| format!("Failed to get broker sync states: {}", e))
}

/// Get import runs with optional type filter and pagination
#[tauri::command]
pub async fn get_import_runs(
    run_type: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<wealthfolio_core::sync::ImportRun>, String> {
    let limit = limit.unwrap_or(50);
    let offset = offset.unwrap_or(0);
    debug!(
        "Fetching import runs (type={:?}, limit={}, offset={})...",
        run_type, limit, offset
    );
    state
        .sync_service()
        .get_import_runs(run_type.as_deref(), limit, offset)
        .map_err(|e| format!("Failed to get import runs: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────
// Foreground Sync Command
// ─────────────────────────────────────────────────────────────────────────────
