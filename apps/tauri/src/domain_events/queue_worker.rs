//! Event queue worker that processes domain events with debouncing.
//!
//! Receives events via an mpsc channel, debounces them within a 500ms window,
//! and then processes the batch to trigger platform-specific actions.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use log::{debug, error, info, warn};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use wealthfolio_core::constants::PORTFOLIO_TOTAL_ACCOUNT_ID;
use wealthfolio_core::events::DomainEvent;
use wealthfolio_core::health::HealthServiceTrait;

use super::planner::{plan_asset_enrichment, plan_broker_sync, plan_portfolio_job};
use crate::commands::brokers_sync::perform_broker_sync;
use crate::context::ServiceContext;
use crate::events::{
    MarketSyncResult, PortfolioRequestPayload, MARKET_SYNC_COMPLETE, MARKET_SYNC_ERROR,
    MARKET_SYNC_START, PORTFOLIO_UPDATE_COMPLETE, PORTFOLIO_UPDATE_ERROR, PORTFOLIO_UPDATE_START,
};

/// Debounce window duration in milliseconds.
const DEBOUNCE_MS: u64 = 1000;

/// Runs the event queue worker that processes domain events with debouncing.
///
/// This function:
/// 1. Receives events from the mpsc channel
/// 2. Collects events until a 500ms debounce window expires
/// 3. Processes the batch of events by calling planner functions
/// 4. Triggers appropriate actions (portfolio recalc, enrichment, broker sync)
///
/// Uses an `is_processing` guard to prevent new batches from being processed
/// while a previous batch (e.g., broker sync or portfolio recalc) is still running.
pub async fn event_queue_worker(
    mut receiver: mpsc::UnboundedReceiver<DomainEvent>,
    app_handle: AppHandle,
    context: Arc<ServiceContext>,
) {
    let debounce_duration = Duration::from_millis(DEBOUNCE_MS);
    let mut event_buffer: Vec<DomainEvent> = Vec::new();
    let is_processing = Arc::new(AtomicBool::new(false));

    loop {
        // If buffer is empty, wait indefinitely for the first event
        // If buffer has events, wait with a timeout for more events
        let maybe_event = if event_buffer.is_empty() {
            // Wait indefinitely for the first event
            receiver.recv().await
        } else {
            // Wait for more events or timeout
            tokio::select! {
                event = receiver.recv() => event,
                _ = tokio::time::sleep(debounce_duration) => None,
            }
        };

        match maybe_event {
            Some(event) => {
                // Add event to buffer and continue collecting
                event_buffer.push(event);
            }
            None if !event_buffer.is_empty() => {
                // Timeout expired or channel closed with events in buffer
                // Check if we're still processing a previous batch
                if is_processing.load(Ordering::SeqCst) {
                    // Still processing, keep collecting events
                    debug!("Debounce expired but previous batch still processing, continuing to collect events");
                    continue;
                }

                // Process the batch
                let events = std::mem::take(&mut event_buffer);
                is_processing.store(true, Ordering::SeqCst);
                process_event_batch(&events, &app_handle, &context).await;
                is_processing.store(false, Ordering::SeqCst);
            }
            None => {
                // Channel closed and buffer is empty - exit the worker
                // Wait for any in-progress processing to complete
                while is_processing.load(Ordering::SeqCst) {
                    tokio::time::sleep(Duration::from_millis(50)).await;
                }
                info!("Domain event queue worker shutting down");
                break;
            }
        }
    }
}

/// Processes a batch of domain events by planning and triggering actions.
async fn process_event_batch(
    events: &[DomainEvent],
    app_handle: &AppHandle,
    context: &Arc<ServiceContext>,
) {
    if events.is_empty() {
        return;
    }

    info!("Processing batch of {} domain events", events.len());

    // Plan and run portfolio job directly (not via event emission)
    // This ensures the is_processing guard properly tracks completion
    if let Some(payload) = plan_portfolio_job(events) {
        info!(
            "Running portfolio job (accounts: {:?})",
            payload.account_ids
        );
        run_portfolio_job(app_handle, context, payload).await;
    }

    // Plan and run asset enrichment (spawned as background task)
    let enrichment_asset_ids = plan_asset_enrichment(events);
    if !enrichment_asset_ids.is_empty() {
        info!(
            "Triggering asset enrichment for {} assets",
            enrichment_asset_ids.len()
        );
        let asset_service = context.asset_service();
        tokio::spawn(async move {
            match asset_service.enrich_assets(enrichment_asset_ids).await {
                Ok((enriched, skipped, failed)) => {
                    info!(
                        "Asset enrichment complete: {} enriched, {} skipped, {} failed",
                        enriched, skipped, failed
                    );
                }
                Err(e) => {
                    warn!("Asset enrichment failed: {}", e);
                }
            }
        });
    }

    // Plan and trigger broker sync for eligible tracking mode changes
    let sync_account_ids = plan_broker_sync(events);
    if !sync_account_ids.is_empty() {
        info!(
            "Triggering broker sync for {} accounts (tracking mode changed)",
            sync_account_ids.len()
        );

        // Spawn broker sync as a background task
        let context_clone = context.clone();
        let app_handle_clone = app_handle.clone();

        tokio::spawn(async move {
            match perform_broker_sync(&context_clone, Some(&app_handle_clone)).await {
                Ok(result) => {
                    info!(
                        "Broker sync completed after tracking mode change: success={}, message={}",
                        result.success, result.message
                    );
                }
                Err(e) => {
                    warn!("Broker sync failed after tracking mode change: {}", e);
                }
            }
        });
    }
}

/// Runs a portfolio job directly (not via event emission).
///
/// This ensures the is_processing guard properly tracks completion and prevents
/// concurrent portfolio jobs. The logic mirrors handle_portfolio_request in listeners.rs.
async fn run_portfolio_job(
    app_handle: &AppHandle,
    context: &Arc<ServiceContext>,
    payload: PortfolioRequestPayload,
) {
    let market_sync_mode = payload.market_sync_mode.clone();
    let accounts_to_recalc = payload.account_ids.clone();
    // Domain events always trigger force full recalculation
    let force_recalc = true;

    // Only perform market sync if the mode requires it
    if market_sync_mode.requires_sync() {
        let market_data_service = context.quote_service();

        // Emit sync start event
        if let Err(e) = app_handle.emit(MARKET_SYNC_START, &()) {
            error!("Failed to emit market:sync-start event: {}", e);
        }

        let sync_start = std::time::Instant::now();
        let asset_ids = market_sync_mode.asset_ids().cloned();

        // Convert MarketSyncMode to SyncMode for the quote service
        let sync_result = match market_sync_mode.to_sync_mode() {
            Some(sync_mode) => market_data_service.sync(sync_mode, asset_ids).await,
            None => {
                warn!("MarketSyncMode requires sync but returned None for SyncMode");
                Ok(wealthfolio_core::quotes::SyncResult::default())
            }
        };

        info!("Market data sync completed in: {:?}", sync_start.elapsed());

        match sync_result {
            Ok(result) => {
                let failed_syncs = result.failures;

                let health_service = context.health_service();
                health_service.clear_cache().await;

                let result_payload = MarketSyncResult { failed_syncs };
                if let Err(e) = app_handle.emit(MARKET_SYNC_COMPLETE, &result_payload) {
                    error!("Failed to emit market:sync-complete event: {}", e);
                }

                // Initialize the FxService after successful sync
                let fx_service = context.fx_service();
                if let Err(e) = fx_service.initialize() {
                    error!("Failed to initialize FxService after market data sync: {}", e);
                }

                // Continue to portfolio calculation
                run_portfolio_calculation(app_handle, context, accounts_to_recalc, force_recalc)
                    .await;
            }
            Err(e) => {
                if let Err(e_emit) = app_handle.emit(MARKET_SYNC_ERROR, &e.to_string()) {
                    error!("Failed to emit market:sync-error event: {}", e_emit);
                }
                error!(
                    "Market data sync failed: {}. Skipping portfolio calculation.",
                    e
                );
            }
        }
    } else {
        // MarketSyncMode::None - skip market sync, just recalculate
        debug!("Skipping market sync (MarketSyncMode::None)");
        run_portfolio_calculation(app_handle, context, accounts_to_recalc, force_recalc).await;
    }
}

/// Runs the portfolio calculation (snapshots and valuations).
async fn run_portfolio_calculation(
    app_handle: &AppHandle,
    context: &Arc<ServiceContext>,
    account_ids: Option<Vec<String>>,
    force_full_recalculation: bool,
) {
    // Emit start event
    if let Err(e) = app_handle.emit(PORTFOLIO_UPDATE_START, &()) {
        error!("Failed to emit portfolio:update-start event: {}", e);
    }

    // For TOTAL portfolio calculation, use non-archived accounts (ignores is_active)
    let accounts_for_total = match context.account_service().get_non_archived_accounts() {
        Ok(accounts) => accounts,
        Err(err) => {
            let err_msg = format!("Failed to list non-archived accounts: {}", err);
            error!("{}", err_msg);
            let _ = app_handle.emit(PORTFOLIO_UPDATE_ERROR, &err_msg);
            return;
        }
    };

    // Determine which accounts to calculate individual snapshots for:
    // - If specific account_ids provided: process those accounts (even if archived)
    // - Otherwise: process all non-archived accounts
    let mut account_ids_vec: Vec<String> = if let Some(ref target_ids) = account_ids {
        // Process the specific requested accounts (even if archived, for their own snapshots)
        target_ids.clone()
    } else {
        // No specific accounts requested - use non-archived accounts
        accounts_for_total.iter().map(|a| a.id.clone()).collect()
    };

    // Calculate holdings snapshots
    if !account_ids_vec.is_empty() {
        let ids_slice = account_ids_vec.as_slice();
        let snapshot_service = context.snapshot_service();

        let snapshot_result = if force_full_recalculation {
            snapshot_service
                .force_recalculate_holdings_snapshots(Some(ids_slice))
                .await
        } else {
            snapshot_service
                .calculate_holdings_snapshots(Some(ids_slice))
                .await
        };

        if let Err(err) = snapshot_result {
            let err_msg = format!(
                "Holdings snapshot calculation failed for targeted accounts: {}",
                err
            );
            warn!("{}", err_msg);
            let _ = app_handle.emit(PORTFOLIO_UPDATE_ERROR, &err_msg);
        }
    }

    // Calculate total portfolio snapshots
    let snapshot_service = context.snapshot_service();
    let total_result = if force_full_recalculation {
        snapshot_service
            .force_recalculate_total_portfolio_snapshots()
            .await
    } else {
        snapshot_service.calculate_total_portfolio_snapshots().await
    };
    if let Err(err) = total_result {
        let err_msg = format!("Failed to calculate TOTAL portfolio snapshot: {}", err);
        error!("{}", err_msg);
        let _ = app_handle.emit(PORTFOLIO_UPDATE_ERROR, &err_msg);
        return;
    }

    // Update position status from TOTAL snapshot
    if let Ok(Some(total_snapshot)) = snapshot_service
        .get_latest_holdings_snapshot(PORTFOLIO_TOTAL_ACCOUNT_ID)
    {
        let current_holdings: std::collections::HashMap<String, rust_decimal::Decimal> =
            total_snapshot
                .positions
                .iter()
                .map(|(asset_id, position)| (asset_id.clone(), position.quantity))
                .collect();

        let quote_service = context.quote_service();
        if let Err(e) = quote_service
            .update_position_status_from_holdings(&current_holdings)
            .await
        {
            warn!(
                "Failed to update position status from holdings: {}. Quote sync planning may be affected.",
                e
            );
        }
    }

    // Ensure TOTAL is included in valuation calculation
    if !account_ids_vec
        .iter()
        .any(|id| id == PORTFOLIO_TOTAL_ACCOUNT_ID)
    {
        account_ids_vec.push(PORTFOLIO_TOTAL_ACCOUNT_ID.to_string());
    }

    // Calculate valuation history for each account
    let valuation_service = context.valuation_service();
    for account_id in account_ids_vec {
        if let Err(err) = valuation_service
            .calculate_valuation_history(&account_id, force_full_recalculation)
            .await
        {
            let err_msg = format!(
                "Valuation history calculation failed for {}: {}",
                account_id, err
            );
            warn!("{}", err_msg);
            let _ = app_handle.emit(PORTFOLIO_UPDATE_ERROR, &err_msg);
        }
    }

    // Emit completion event
    if let Err(e) = app_handle.emit(PORTFOLIO_UPDATE_COMPLETE, &()) {
        error!("Failed to emit portfolio:update-complete event: {}", e);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_debounce_constant() {
        // Ensure debounce is set to 1000ms (1 second)
        assert_eq!(DEBOUNCE_MS, 1000);
    }
}
