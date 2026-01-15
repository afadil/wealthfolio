//! Startup sync for broker data.
//!
//! Syncs broker data once on app startup. After that, user manually triggers sync.

use std::sync::Arc;

use log::{debug, info, warn};
use tauri::AppHandle;

use crate::commands::brokers_sync::perform_broker_sync;
use crate::context::ServiceContext;
use crate::events::{
    emit_assets_enrich_requested, emit_broker_sync_complete, emit_broker_sync_start,
    AssetsEnrichPayload, BrokerSyncEventPayload,
};

/// Runs broker sync once on startup (async, non-blocking).
///
/// This function:
/// - Checks if user has an active subscription
/// - Performs the sync silently (no toast - user didn't request it)
/// - Triggers portfolio update if activities were synced
pub async fn run_startup_sync(handle: &AppHandle, context: &Arc<ServiceContext>) {
    info!("Running startup broker sync...");

    // Check subscription status first using ConnectService
    match context.connect_service().has_active_subscription().await {
        Ok(true) => {
            // User has active subscription, proceed
        }
        Ok(false) => {
            debug!("Startup sync skipped: no active subscription");
            return;
        }
        Err(e) => {
            // If we can't check subscription (no token, network error, etc.), skip silently
            debug!("Startup sync skipped: could not verify subscription ({})", e);
            return;
        }
    }

    // Emit start event
    emit_broker_sync_start(handle);

    // Perform sync
    match perform_broker_sync(context, Some(handle)).await {
        Ok(result) => {
            info!(
                "Startup sync completed: success={}, message={}",
                result.success, result.message
            );

            // Emit completion event (is_scheduled=false, no toast for startup sync)
            let payload = BrokerSyncEventPayload::new(result.success, &result.message, false);
            emit_broker_sync_complete(handle, payload);

            // Trigger portfolio update if sync was successful and activities were synced
            if result.success {
                if let Some(ref activities) = result.activities_synced {
                    if activities.activities_upserted > 0 {
                        info!(
                            "Triggering portfolio update after startup sync ({} activities synced)",
                            activities.activities_upserted
                        );
                        crate::events::emit_portfolio_trigger_recalculate(
                            handle,
                            crate::events::PortfolioRequestPayload::builder()
                                .refetch_all_market_data(false)
                                .build(),
                        );
                    }

                    // Trigger asset enrichment for new assets
                    if !activities.new_asset_ids.is_empty() {
                        info!(
                            "Triggering asset enrichment for {} new assets",
                            activities.new_asset_ids.len()
                        );
                        emit_assets_enrich_requested(
                            handle,
                            AssetsEnrichPayload {
                                asset_ids: activities.new_asset_ids.clone(),
                            },
                        );
                    }
                }
            }
        }
        Err(e) => {
            // Check if this is an auth error (user not logged in)
            if e.contains("No access token") || e.contains("not authenticated") {
                debug!("Startup sync skipped: user not authenticated");
            } else {
                warn!("Startup sync failed: {}", e);
                // Emit error event (is_scheduled=false, no toast)
                let payload = BrokerSyncEventPayload::new(false, &e, false);
                emit_broker_sync_complete(handle, payload);
            }
        }
    }
}
