use futures::future::join_all;
use log::{debug, error, info};
use std::sync::Arc;
use tauri::{async_runtime::spawn, AppHandle, Emitter, Listener, Manager};
use serde::Serialize;

use crate::context::ServiceContext;
use crate::events::{
    emit_portfolio_trigger_recalculate, emit_portfolio_trigger_update, PortfolioRequestPayload,
    PORTFOLIO_TRIGGER_RECALCULATE, PORTFOLIO_TOTAL_ACCOUNT_ID, PORTFOLIO_UPDATE_COMPLETE,
    PORTFOLIO_UPDATE_ERROR, PORTFOLIO_TRIGGER_UPDATE, PORTFOLIO_UPDATE_START,
};

/// Sets up the global event listeners for the application.
pub fn setup_event_listeners(handle: AppHandle) {
    // Listener for consolidated portfolio update requests
    let update_handle = handle.clone();
    handle.listen(PORTFOLIO_TRIGGER_UPDATE, move |event| {
        handle_portfolio_request(update_handle.clone(), event.payload(), false);
    });

    // Listener for full portfolio recalculation requests
    let recalc_handle = handle.clone();
    handle.listen(PORTFOLIO_TRIGGER_RECALCULATE, move |event| {
        handle_portfolio_request(recalc_handle.clone(), event.payload(), true); // force_recalc = true
    });
}

/// Handles the common logic for both portfolio update and recalculation requests.
fn handle_portfolio_request(handle: AppHandle, payload_str: &str, force_recalc: bool) {
    let event_name = if force_recalc {
        PORTFOLIO_TRIGGER_RECALCULATE
    } else {
        PORTFOLIO_TRIGGER_UPDATE
    };

    match serde_json::from_str::<PortfolioRequestPayload>(payload_str) {
        Ok(payload) => {
            debug!(
                "Received {} event: {:?}, force_recalc: {}",
                event_name, payload, force_recalc
            );
            let handle_clone = handle.clone(); // Clone handle for async block

            // Spawn a task to handle the update/recalculate steps
            spawn(async move {
                let symbols_to_sync = payload.symbols.clone(); // None means sync all relevant symbols
                let accounts_to_recalc = payload.account_ids.clone();
                let refetch_all = payload.refetch_all_market_data;
                let context_result = handle_clone.try_state::<Arc<ServiceContext>>();

                if let Some(context) = context_result {
                    let market_data_service = context.market_data_service();

                    // Emit sync start event
                    if let Err(e) = handle_clone.emit(PORTFOLIO_UPDATE_START, ()) {
                        error!("Failed to emit {} event: {}", PORTFOLIO_UPDATE_START, e);
                    }

                    if let Err(e) = handle_clone.emit("market:sync-start", &()) {
                        error!("Failed to emit market:sync-start event: {}", e);
                    }
                    let sync_result = if refetch_all {
                        market_data_service
                            .resync_market_data(symbols_to_sync)
                            .await
                    } else {
                        market_data_service.sync_market_data().await
                    };

                    match sync_result {
                        Ok((_, failed_syncs)) => {
                            info!("Market data sync complete: {:?}", failed_syncs);
                            let result_payload = MarketSyncResult { failed_syncs };
                            if let Err(e) = handle_clone.emit("market:sync-complete", &result_payload) {
                                error!("Failed to emit market:sync-complete event: {}", e);
                            }
                            // Initialize the FxService after successful sync
                            let fx_service = context.fx_service();
                            if let Err(e) = fx_service.initialize() {
                                error!(
                                    "Failed to initialize FxService after market data sync: {}",
                                    e
                                );
                                // Optionally emit an error event or decide how to proceed
                                // For now, we'll log the error and continue with calculation
                            }

                            // Trigger calculation after successful sync
                            handle_portfolio_calculation(
                                handle_clone.clone(), // Clone again for this call
                                accounts_to_recalc,
                                force_recalc,
                            );
                        }
                        Err(e) => {
                            if let Err(e_emit) =
                                handle_clone.emit("market:sync-error", &e.to_string())
                            {
                                error!("Failed to emit market:sync-error event: {}", e_emit);
                            }
                            error!("Market data sync failed: {}. Skipping portfolio calculation for this request.", e);
                        }
                    }
                } else {
                    error!(
                        "ServiceContext not found in state during market data sync for {} request.",
                        event_name
                    );
                }
            });
        }
        Err(e) => {
            error!(
                "Failed to parse payload for {}: {}. Triggering default action.",
                event_name, e
            );
            // Trigger a default action if payload parsing fails
            let fallback_payload = PortfolioRequestPayload::builder()
                .account_ids(None)
                .symbols(None)
                .refetch_all_market_data(false)
                .build();
            if force_recalc {
                emit_portfolio_trigger_recalculate(&handle, fallback_payload);
            } else {
                emit_portfolio_trigger_update(&handle, fallback_payload);
            }
        }
    }
}

// This function handles the portfolio snapshot and history calculation logic
fn handle_portfolio_calculation(
    app_handle: AppHandle,
    account_ids: Option<Vec<String>>,
    force_full_recalculation: bool,
) {
    // Emit start event

    spawn(async move {
        // Retrieve the state (ServiceContext) from the app_handle
        let state_result = app_handle.try_state::<Arc<ServiceContext>>();
        match state_result {
            Some(state) => {
                // Get the portfolio service from the managed state
                let snapshot_service = state.snapshot_service();
                let valuation_service = state.valuation_service();
                let account_service = state.account_service();

                // filter active accounts or all active accounts if no specific accounts are given
                let active_accounts_result =
                    account_service.list_accounts(Some(true), account_ids.as_deref());
                let final_account_ids: Vec<String> = match active_accounts_result {
                    Ok(accounts) => {
                        // Start with the active accounts found
                        let mut ids: Vec<String> = accounts.iter().map(|a| a.id.clone()).collect();
                        // Always add "TOTAL"
                        ids.push(PORTFOLIO_TOTAL_ACCOUNT_ID.to_string());
                        ids
                    }
                    Err(e) => {
                        error!("Failed to list active accounts: {}", e);
                        // Emit error and potentially return if account list is critical
                        if let Err(e_emit) = app_handle.emit(
                            PORTFOLIO_UPDATE_ERROR,
                            &format!("Failed to list accounts: {}", e),
                        ) {
                            error!(
                                "Failed to emit {} event: {}",
                                PORTFOLIO_UPDATE_ERROR, e_emit
                            );
                        }
                        return; // Stop processing if accounts cannot be fetched
                    }
                };

                // --- Step 1: Calculate Snapshots ---
                let snapshot_result = if force_full_recalculation {
                    snapshot_service
                        .force_recalculate_holdings_snapshots(Some(final_account_ids.as_slice())) // Use final_account_ids
                        .await
                } else {
                    snapshot_service
                        .calculate_holdings_snapshots(Some(final_account_ids.as_slice())) // Use final_account_ids
                        .await
                };

                // Handle the snapshot result
                match snapshot_result {
                    Ok(_) => {
                        // --- Step 2: Calculate History (after successful snapshot calculation) ---
                        let history_futures = final_account_ids.iter().map(|account_id| {
                            // Assuming valuation_service is cloneable (likely Arc<ValuationService>)
                            let valuation_service = valuation_service.clone();
                            let account_id_clone = account_id.clone(); // Clone account_id for the async block
                            async move {
                                let result = valuation_service
                                    .calculate_valuation_history(
                                        &account_id_clone,
                                        force_full_recalculation,
                                    )
                                    .await;
                                (account_id_clone, result) // Return account_id along with the result
                            }
                        });

                        let history_results = join_all(history_futures).await;

                        // Process results after all futures have completed
                        for (account_id, result) in history_results {
                            match result {
                                Ok(_) => debug!(
                                    "Successfully calculated history for account '{}'",
                                    account_id
                                ),
                                Err(e) => error!(
                                    "Failed to calculate history for account '{}': {}",
                                    account_id, e
                                ),
                            }
                        }
                        // Emit completion event after both steps (if snapshot was successful)
                        if let Err(e) = app_handle.emit(PORTFOLIO_UPDATE_COMPLETE, ()) {
                            error!("Failed to emit {} event: {}", PORTFOLIO_UPDATE_COMPLETE, e);
                        }
                    }
                    Err(e) => {
                        // Emit error event only if snapshot calculation failed
                        error!("Portfolio snapshot calculation failed: {}", e);
                        if let Err(e_emit) = app_handle.emit(PORTFOLIO_UPDATE_ERROR, &e.to_string())
                        {
                            error!(
                                "Failed to emit {} event: {}",
                                PORTFOLIO_UPDATE_ERROR, e_emit
                            );
                        }
                    }
                }
            }
            None => {
                error!("ServiceContext not found in state when triggering portfolio calculation.");
                // Emit error if context is missing
                if let Err(e_emit) =
                    app_handle.emit(PORTFOLIO_UPDATE_ERROR, "Service context not found")
                {
                    error!(
                        "Failed to emit {} event: {}",
                        PORTFOLIO_UPDATE_ERROR, e_emit
                    );
                }
            }
        }
    });
}

#[derive(Serialize)]
struct MarketSyncResult {
    failed_syncs: Vec<(String, String)>,
}
