//! Background scheduler for periodic broker sync.
//!
//! Runs a fixed 4-hour interval sync for the Docker/Web server.

use std::sync::Arc;
use tokio::time::{interval, Duration};
use tracing::{debug, info, warn};

use crate::api::connect::perform_broker_sync;
use crate::main_lib::AppState;

/// Sync interval: 4 hours (not user-configurable to prevent API abuse)
const SYNC_INTERVAL_SECS: u64 = 4 * 60 * 60;

/// Initial delay before first sync (60 seconds to let server fully start)
const INITIAL_DELAY_SECS: u64 = 60;

/// Starts the background broker sync scheduler.
pub fn start_broker_sync_scheduler(state: Arc<AppState>) {
    tokio::spawn(async move {
        info!("Broker sync scheduler started (4-hour interval)");

        // Initial delay before first sync
        tokio::time::sleep(Duration::from_secs(INITIAL_DELAY_SECS)).await;

        // Set up periodic sync - first tick is immediate, subsequent ticks are 4h apart
        let mut sync_interval = interval(Duration::from_secs(SYNC_INTERVAL_SECS));

        loop {
            sync_interval.tick().await;
            run_scheduled_sync(&state).await;
        }
    });
}

/// Runs a single scheduled sync operation.
async fn run_scheduled_sync(state: &Arc<AppState>) {
    info!("Running scheduled broker sync...");

    // Check if user has a refresh token configured (indicates they've logged in)
    let has_token = state
        .secret_store
        .get_secret("sync_refresh_token")
        .map(|t| t.is_some())
        .unwrap_or(false);

    if !has_token {
        debug!("Scheduled sync skipped: no refresh token configured");
        return;
    }

    // Perform the sync using the shared perform_broker_sync from api::connect
    // This uses SyncOrchestrator which:
    // - Emits broker:sync-start, broker:sync-complete, broker:sync-error events via SSE
    // - Handles subscription validation internally
    // - Syncs connections, accounts, activities, and holdings
    match perform_broker_sync(state).await {
        Ok(result) => {
            let activities_count = result
                .activities_synced
                .as_ref()
                .map(|a| a.activities_upserted)
                .unwrap_or(0);
            info!(
                "Scheduled broker sync completed: {} activities synced",
                activities_count
            );
        }
        Err(e) => {
            // Check if this is an auth error (expected when user isn't logged in)
            if e.contains("No refresh token")
                || e.contains("not authenticated")
                || e.contains("Session expired")
            {
                debug!("Scheduled sync skipped: user not authenticated");
            } else {
                warn!("Scheduled broker sync failed: {}", e);
            }
        }
    }
}
