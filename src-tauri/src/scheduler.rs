//! Startup sync for broker data.
//!
//! Syncs broker data once on app startup. After that, user manually triggers sync.

use std::sync::Arc;

use log::{debug, info, warn};
use tauri::AppHandle;

use wealthfolio_core::quotes::MarketSyncMode;

use crate::commands::brokers_sync::perform_broker_sync;
use crate::context::ServiceContext;

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
            debug!(
                "Startup sync skipped: could not verify subscription ({})",
                e
            );
            return;
        }
    }

    // Perform sync (orchestrator emits broker:sync-start and broker:sync-complete events)
    match perform_broker_sync(context, Some(handle)).await {
        Ok(result) => {
            info!(
                "Startup sync completed: success={}, message={}",
                result.success, result.message
            );

            // Note: broker:sync-complete event is emitted by the orchestrator via TauriProgressReporter

            // Trigger portfolio update if sync was successful and activities were synced
            if result.success {
                if let Some(ref activities) = result.activities_synced {
                    if activities.activities_upserted > 0 {
                        info!(
                            "Triggering portfolio update after startup sync ({} activities synced)",
                            activities.activities_upserted
                        );
                        // Startup broker sync uses incremental sync for all assets
                        crate::events::emit_portfolio_trigger_recalculate(
                            handle,
                            crate::events::PortfolioRequestPayload::builder()
                                .market_sync_mode(MarketSyncMode::Incremental { asset_ids: None })
                                .build(),
                        );
                    }

                    // Trigger asset enrichment for new assets from activities
                    if !activities.new_asset_ids.is_empty() {
                        info!(
                            "Triggering asset enrichment for {} new assets from activities",
                            activities.new_asset_ids.len()
                        );
                        let asset_service = context.asset_service();
                        let asset_ids = activities.new_asset_ids.clone();
                        tokio::spawn(async move {
                            if let Err(e) = asset_service.enrich_assets(asset_ids).await {
                                warn!("Asset enrichment failed: {}", e);
                            }
                        });
                    }
                }

                // Also trigger enrichment for new assets from holdings sync
                if let Some(ref holdings) = result.holdings_synced {
                    if !holdings.new_asset_ids.is_empty() {
                        info!(
                            "Triggering asset enrichment for {} new assets from holdings",
                            holdings.new_asset_ids.len()
                        );
                        let asset_service = context.asset_service();
                        let asset_ids = holdings.new_asset_ids.clone();
                        tokio::spawn(async move {
                            if let Err(e) = asset_service.enrich_assets(asset_ids).await {
                                warn!("Asset enrichment failed: {}", e);
                            }
                        });
                    }

                    // Also trigger portfolio update if holdings were synced
                    if holdings.positions_upserted > 0 {
                        info!(
                            "Triggering portfolio update after holdings sync ({} positions synced)",
                            holdings.positions_upserted
                        );
                        crate::events::emit_portfolio_trigger_recalculate(
                            handle,
                            crate::events::PortfolioRequestPayload::builder()
                                .market_sync_mode(MarketSyncMode::Incremental { asset_ids: None })
                                .build(),
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
                // Note: broker:sync-error event is emitted by the orchestrator via TauriProgressReporter
            }
        }
    }
}
