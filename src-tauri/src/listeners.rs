use futures::future::join_all;
use log::{debug, error, info};
use serde::Serialize;
use std::sync::Arc;
use std::time::Instant;
use tauri::{async_runtime::spawn, AppHandle, Emitter, Listener, Manager};
use wealthfolio_core::constants::PORTFOLIO_TOTAL_ACCOUNT_ID;

use crate::context::ServiceContext;
use crate::events::{
    emit_portfolio_trigger_recalculate, emit_portfolio_trigger_update, PortfolioRequestPayload,
    MARKET_SYNC_COMPLETE, MARKET_SYNC_ERROR, MARKET_SYNC_START, PORTFOLIO_TRIGGER_RECALCULATE,
    PORTFOLIO_TRIGGER_UPDATE, PORTFOLIO_UPDATE_COMPLETE, PORTFOLIO_UPDATE_ERROR,
    PORTFOLIO_UPDATE_START,
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
    debug!(
        "Received portfolio request: {:?}, force_recalc: {}",
        payload_str, force_recalc
    );
    let event_name = if force_recalc {
        PORTFOLIO_TRIGGER_RECALCULATE
    } else {
        PORTFOLIO_TRIGGER_UPDATE
    };

    match serde_json::from_str::<PortfolioRequestPayload>(payload_str) {
        Ok(payload) => {
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
                    if let Err(e) = handle_clone.emit(MARKET_SYNC_START, &()) {
                        error!("Failed to emit market:sync-start event: {}", e);
                    }

                    let sync_start = Instant::now();
                    let sync_result = if refetch_all {
                        market_data_service
                            .resync_market_data(symbols_to_sync)
                            .await
                    } else {
                        market_data_service.sync_market_data().await
                    };
                    let sync_duration = sync_start.elapsed();
                    info!("Market data sync completed in: {:?}", sync_duration);

                    match sync_result {
                        Ok((_, failed_syncs)) => {
                            let result_payload = MarketSyncResult { failed_syncs };
                            if let Err(e) = handle_clone.emit(MARKET_SYNC_COMPLETE, &result_payload)
                            {
                                error!("Failed to emit market:sync-complete event: {}", e);
                            }
                            // Initialize the FxService after successful sync
                            let fx_service = context.fx_service();
                            if let Err(e) = fx_service.initialize() {
                                error!(
                                    "Failed to initialize FxService after market data sync: {}",
                                    e
                                );
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
                                handle_clone.emit(MARKET_SYNC_ERROR, &e.to_string())
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
    account_ids_input: Option<Vec<String>>,
    force_full_recalculation: bool,
) {
    if let Err(e) = app_handle.emit(PORTFOLIO_UPDATE_START, ()) {
        error!("Failed to emit {} event: {}", PORTFOLIO_UPDATE_START, e);
    }

    spawn(async move {
        let context = match app_handle.try_state::<Arc<ServiceContext>>() {
            Some(ctx) => ctx,
            None => {
                let err_msg =
                    "ServiceContext not found in state when triggering portfolio calculation.";
                error!("{}", err_msg);
                if let Err(e_emit) = app_handle.emit(PORTFOLIO_UPDATE_ERROR, err_msg) {
                    error!(
                        "Failed to emit {} event: {}",
                        PORTFOLIO_UPDATE_ERROR, e_emit
                    );
                }
                return;
            }
        };

        let account_service = context.account_service();
        let snapshot_service = context.snapshot_service();
        let valuation_service = context.valuation_service();

        // Step 0: Resolve initially targeted active accounts for individual calculations.
        // This list might be empty if account_ids_input is None and no accounts are active,
        // or if account_ids_input specified accounts that are now all inactive.
        let initially_targeted_active_accounts: Vec<String> =
            match account_service.list_accounts(Some(true), account_ids_input.as_deref()) {
                Ok(accounts) => accounts.iter().map(|a| a.id.clone()).collect(),
                Err(e) => {
                    let err_msg = format!("Failed to list active accounts: {}", e);
                    error!("{}", err_msg);
                    if let Err(e_emit) = app_handle.emit(PORTFOLIO_UPDATE_ERROR, &err_msg) {
                        error!(
                            "Failed to emit {} event: {}",
                            PORTFOLIO_UPDATE_ERROR, e_emit
                        );
                    }
                    return;
                }
            };

        // --- Step 1: Calculate Account-Specific Snapshots (only if there are specific active accounts to process) ---
        if !initially_targeted_active_accounts.is_empty() {
            let account_snapshot_result = if force_full_recalculation {
                snapshot_service
                    .force_recalculate_holdings_snapshots(Some(
                        initially_targeted_active_accounts.as_slice(),
                    ))
                    .await
            } else {
                snapshot_service
                    .calculate_holdings_snapshots(Some(
                        initially_targeted_active_accounts.as_slice(),
                    ))
                    .await
            };

            if let Err(e) = account_snapshot_result {
                let err_msg = format!(
                    "calculate_holdings_snapshots for targeted accounts failed: {}",
                    e
                );
                error!("{}", err_msg);
                if let Err(e_emit) = app_handle.emit(PORTFOLIO_UPDATE_ERROR, &err_msg) {
                    error!(
                        "Failed to emit {} event: {}",
                        PORTFOLIO_UPDATE_ERROR, e_emit
                    );
                }
            }
        }

        // --- Step 2: Calculate TOTAL portfolio snapshot ---
        if let Err(e) = snapshot_service.calculate_total_portfolio_snapshots().await {
            let err_msg = format!("Failed to calculate TOTAL portfolio snapshot: {}", e);
            error!("{}", err_msg);
            if let Err(e_emit) = app_handle.emit(PORTFOLIO_UPDATE_ERROR, &err_msg) {
                error!(
                    "Failed to emit {} event: {}",
                    PORTFOLIO_UPDATE_ERROR, e_emit
                );
            }
            return;
        }

        // --- Step 3: Calculate Valuation History ---
        let mut accounts_for_valuation = initially_targeted_active_accounts;
        if !accounts_for_valuation.contains(&PORTFOLIO_TOTAL_ACCOUNT_ID.to_string()) {
            accounts_for_valuation.push(PORTFOLIO_TOTAL_ACCOUNT_ID.to_string());
        }

        if !accounts_for_valuation.is_empty() {
            let history_futures = accounts_for_valuation.iter().map(|account_id| {
                let valuation_service_clone = valuation_service.clone();
                let account_id_clone = account_id.clone();
                async move {
                    let result = valuation_service_clone
                        .calculate_valuation_history(&account_id_clone, force_full_recalculation)
                        .await;
                    (account_id_clone, result)
                }
            });

            let history_results = join_all(history_futures).await;

            let mut history_errors: Vec<String> = Vec::new();
            for (account_id, result) in history_results {
                if let Err(e) = result {
                    let err_detail = format!("Account '{}': {}", account_id, e);
                    error!("Failed to calculate valuation history: {}", err_detail);
                    history_errors.push(err_detail);
                }
            }

            if !history_errors.is_empty() {
                error!(
                    "Valuation history calculation completed with errors: {}",
                    history_errors.join("; ")
                );
            }
        } 

        if let Err(e) = app_handle.emit(PORTFOLIO_UPDATE_COMPLETE, ()) {
            error!("Failed to emit {} event: {}", PORTFOLIO_UPDATE_COMPLETE, e);
        }
    });
}

#[derive(Serialize)]
struct MarketSyncResult {
    failed_syncs: Vec<(String, String)>,
}
