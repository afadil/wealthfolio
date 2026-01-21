use futures::future::join_all;
use log::{error, info, warn};
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Instant;
use tauri::{async_runtime::spawn, AppHandle, Emitter, Listener, Manager};
use wealthfolio_core::constants::PORTFOLIO_TOTAL_ACCOUNT_ID;
use wealthfolio_core::quotes::MarketSyncMode;

use crate::context::ServiceContext;
use crate::events::{
    emit_portfolio_trigger_recalculate, emit_portfolio_trigger_update, AssetsEnrichPayload,
    PortfolioRequestPayload, ResourceEventPayload, ASSETS_ENRICH_REQUESTED, MARKET_SYNC_COMPLETE,
    MARKET_SYNC_ERROR, MARKET_SYNC_START, PORTFOLIO_TRIGGER_RECALCULATE, PORTFOLIO_TRIGGER_UPDATE,
    PORTFOLIO_UPDATE_COMPLETE, PORTFOLIO_UPDATE_ERROR, PORTFOLIO_UPDATE_START, RESOURCE_CHANGED,
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

    let resource_handle = handle.clone();
    handle.listen(RESOURCE_CHANGED, move |event| {
        handle_resource_change(resource_handle.clone(), event.payload());
    });

    // Listener for asset enrichment requests (triggered after broker sync)
    let enrich_handle = handle.clone();
    handle.listen(ASSETS_ENRICH_REQUESTED, move |event| {
        handle_assets_enrichment(enrich_handle.clone(), event.payload());
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
            let handle_clone = handle.clone(); // Clone handle for async block

            // Spawn a task to handle the update/recalculate steps
            spawn(async move {
                let market_sync_mode = payload.market_sync_mode.clone();
                let accounts_to_recalc = payload.account_ids.clone();
                let context_result = handle_clone.try_state::<Arc<ServiceContext>>();

                if let Some(context) = context_result {
                    // Only perform market sync if the mode requires it
                    if market_sync_mode.requires_sync() {
                        let market_data_service = context.quote_service();

                        // Emit sync start event
                        if let Err(e) = handle_clone.emit(MARKET_SYNC_START, &()) {
                            error!("Failed to emit market:sync-start event: {}", e);
                        }

                        let sync_start = Instant::now();
                        let asset_ids = market_sync_mode.asset_ids().cloned();

                        // Convert MarketSyncMode to SyncMode for the quote service
                        let sync_result = match market_sync_mode.to_sync_mode() {
                            Some(sync_mode) => {
                                market_data_service.sync(sync_mode, asset_ids).await
                            }
                            None => {
                                // This shouldn't happen since we checked requires_sync()
                                warn!("MarketSyncMode requires sync but returned None for SyncMode");
                                Ok(wealthfolio_core::quotes::SyncResult::default())
                            }
                        };

                        let sync_duration = sync_start.elapsed();
                        info!("Market data sync completed in: {:?}", sync_duration);

                        match sync_result {
                            Ok(result) => {
                                // Convert SyncResult to legacy format for backwards compatibility
                                let failed_syncs = result.failures;
                                let result_payload = MarketSyncResult { failed_syncs };
                                if let Err(e) =
                                    handle_clone.emit(MARKET_SYNC_COMPLETE, &result_payload)
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
                                    handle_clone.clone(),
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
                        // MarketSyncMode::None - skip market sync, just recalculate
                        info!("Skipping market sync (MarketSyncMode::None)");
                        handle_portfolio_calculation(
                            handle_clone.clone(),
                            accounts_to_recalc,
                            force_recalc,
                        );
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
            // Trigger a default action if payload parsing fails - use MarketSyncMode::None
            let fallback_payload = PortfolioRequestPayload::builder()
                .account_ids(None)
                .market_sync_mode(MarketSyncMode::None)
                .build();
            if force_recalc {
                emit_portfolio_trigger_recalculate(&handle, fallback_payload);
            } else {
                emit_portfolio_trigger_update(&handle, fallback_payload);
            }
        }
    }
}

fn handle_resource_change(handle: AppHandle, payload_str: &str) {
    match serde_json::from_str::<ResourceEventPayload>(payload_str) {
        Ok(event) => {
            match event.resource_type.as_str() {
                "account" => handle_account_resource_change(handle.clone(), &event),
                "activity" => handle_activity_resource_change(handle.clone(), &event),
                "asset" => handle_asset_resource_change(handle.clone(), &event),
                _ => {
                    // Default to a lightweight portfolio update when resource type is unknown
                    // Use MarketSyncMode::None since we don't know what changed
                    emit_portfolio_trigger_update(
                        &handle,
                        PortfolioRequestPayload::builder()
                            .account_ids(None)
                            .market_sync_mode(MarketSyncMode::None)
                            .build(),
                    );
                }
            }
        }
        Err(err) => warn!("Failed to parse resource change payload: {}", err),
    }
}

/// Handles asset enrichment requests for newly synced assets.
/// Fetches additional profile data (sectors, countries, etc.) from market data providers.
/// Uses the shared enrich_assets method from AssetService for consistent behavior
/// between Tauri and web server.
fn handle_assets_enrichment(handle: AppHandle, payload_str: &str) {
    match serde_json::from_str::<AssetsEnrichPayload>(payload_str) {
        Ok(payload) => {
            if payload.asset_ids.is_empty() {
                return;
            }

            let context = match handle.try_state::<Arc<ServiceContext>>() {
                Some(ctx) => ctx.inner().clone(),
                None => {
                    warn!("ServiceContext not available for asset enrichment");
                    return;
                }
            };

            let asset_ids = payload.asset_ids;
            info!("Starting asset enrichment for {} assets", asset_ids.len());

            spawn(async move {
                let asset_service = context.asset_service();

                // Use shared enrich_assets method for consistent behavior
                match asset_service.enrich_assets(asset_ids).await {
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
        Err(e) => warn!("Failed to parse asset enrichment payload: {}", e),
    }
}

fn handle_asset_resource_change(handle: AppHandle, event: &ResourceEventPayload) {
    let context = match handle.try_state::<Arc<ServiceContext>>() {
        Some(ctx) => ctx,
        None => {
            warn!("ServiceContext not available for asset resource change");
            return;
        }
    };

    match event.action.as_str() {
        "deleted" => {
            // Handle asset deletion - remove sync state for this symbol
            let asset_id = event.payload.get("asset_id").and_then(|v| v.as_str());

            if let Some(asset_id) = asset_id {
                let asset_id_owned = asset_id.to_string();
                let market_data_service = context.quote_service();

                spawn(async move {
                    if let Err(e) = market_data_service.delete_sync_state(&asset_id_owned).await {
                        warn!(
                            "Failed to delete sync state for asset {}: {}",
                            asset_id_owned, e
                        );
                    }
                });
            }
        }
        _ => {}
    }
}

fn handle_account_resource_change(handle: AppHandle, event: &ResourceEventPayload) {
    let account_id = event
        .payload
        .get("account_id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let account_currency = event
        .payload
        .get("currency")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let context = handle.try_state::<Arc<ServiceContext>>();

    let mut payload_builder = PortfolioRequestPayload::builder();

    if event.action == "deleted" {
        payload_builder = payload_builder.account_ids(None);
    } else if let Some(ref id) = account_id {
        payload_builder = payload_builder.account_ids(Some(vec![id.clone()]));
    } else {
        payload_builder = payload_builder.account_ids(None);
    }

    // Determine asset_ids for FX sync if needed
    let mut asset_ids = None;
    if let (Some(currency), Some(ctx)) = (&account_currency, context.as_ref()) {
        match ctx.settings_service().get_base_currency() {
            Ok(Some(base_currency)) if !base_currency.is_empty() && base_currency != *currency => {
                // Use canonical FX asset ID format: FX:{base}:{quote}
                let fx_asset_id = format!("FX:{}:{}", currency, base_currency);
                asset_ids = Some(vec![fx_asset_id]);
            }
            Ok(_) => {}
            Err(err) => warn!("Failed to fetch base currency for account sync: {}", err),
        }
    }

    // Use Incremental sync for account changes with FX asset if needed
    payload_builder = payload_builder.market_sync_mode(MarketSyncMode::Incremental { asset_ids });

    let payload = payload_builder.build();

    emit_portfolio_trigger_recalculate(&handle, payload);
}

fn handle_activity_resource_change(handle: AppHandle, event: &ResourceEventPayload) {
    let context = match handle.try_state::<Arc<ServiceContext>>() {
        Some(ctx) => ctx,
        None => {
            warn!("ServiceContext not available for activity resource change");
            return;
        }
    };

    let mut account_ids: HashSet<String> = HashSet::new();
    let mut asset_ids: HashSet<String> = HashSet::new();

    if let Some(account_id) = event.payload.get("account_id").and_then(|v| v.as_str()) {
        account_ids.insert(account_id.to_string());
        collect_activity_asset_ids(
            &context,
            account_id,
            event.payload.get("currency").and_then(|v| v.as_str()),
            event.payload.get("asset_id").and_then(|v| v.as_str()),
            &mut asset_ids,
        );
    }

    if let Some(previous_account_id) = event
        .payload
        .get("previous_account_id")
        .and_then(|v| v.as_str())
    {
        account_ids.insert(previous_account_id.to_string());
        collect_activity_asset_ids(
            &context,
            previous_account_id,
            event
                .payload
                .get("previous_currency")
                .and_then(|v| v.as_str()),
            event
                .payload
                .get("previous_asset_id")
                .and_then(|v| v.as_str()),
            &mut asset_ids,
        );
    }

    if event.action == "imported" {
        if let Some(account_id) = event.payload.get("account_id").and_then(|v| v.as_str()) {
            account_ids.insert(account_id.to_string());
            if let Some(activity_list) = event.payload.get("activities").and_then(|v| v.as_array())
            {
                for item in activity_list {
                    let currency = item.get("currency").and_then(|v| v.as_str());
                    let asset_id = item.get("asset_id").and_then(|v| v.as_str());
                    collect_activity_asset_ids(
                        &context,
                        account_id,
                        currency,
                        asset_id,
                        &mut asset_ids,
                    );
                }
            }
        }
    }

    // NOTE: Sync state mutations (handle_activity_created/deleted) are intentionally
    // NOT called here. The sync planner computes activity bounds directly from the
    // activities table at plan time, eliminating race conditions where a spawned task
    // might not complete before the portfolio job runs.

    let mut builder = PortfolioRequestPayload::builder();

    if account_ids.is_empty() {
        builder = builder.account_ids(None);
    } else {
        builder = builder.account_ids(Some(account_ids.into_iter().collect()));
    }

    // Use Incremental sync for activity changes with the collected asset IDs
    // The sync planner will refresh activity dates from the activities table
    // at plan time, ensuring deterministic behavior regardless of listener timing
    builder = builder.market_sync_mode(MarketSyncMode::Incremental {
        asset_ids: if asset_ids.is_empty() {
            None
        } else {
            Some(asset_ids.into_iter().collect())
        },
    });

    emit_portfolio_trigger_recalculate(&handle, builder.build());
}

fn collect_activity_asset_ids(
    context: &Arc<ServiceContext>,
    account_id: &str,
    activity_currency: Option<&str>,
    asset_id: Option<&str>,
    asset_ids: &mut HashSet<String>,
) {
    if let Some(asset_id) = asset_id {
        if !asset_id.is_empty() {
            asset_ids.insert(asset_id.to_string());
        }
    }

    if let Some(currency) = activity_currency {
        match context.account_service().get_account(account_id) {
            Ok(account) => {
                if currency != account.currency {
                    // Use canonical FX asset ID format: FX:{base}:{quote}
                    asset_ids.insert(format!("FX:{}:{}", account.currency, currency));
                }
            }
            Err(err) => warn!(
                "Unable to resolve account {} for activity resource change: {}",
                account_id, err
            ),
        }
    }
}
// Removed unused routable checks; engine will handle connectivity fallbacks

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

        // --- Step 2.5: Update position status from TOTAL snapshot ---
        // This derives open/closed position transitions for quote sync planning
        if let Ok(Some(total_snapshot)) = snapshot_service.get_latest_holdings_snapshot(PORTFOLIO_TOTAL_ACCOUNT_ID) {
            let quote_service = context.quote_service();

            // Extract asset quantities from the TOTAL snapshot
            let current_holdings: std::collections::HashMap<String, rust_decimal::Decimal> = total_snapshot
                .positions
                .iter()
                .map(|(asset_id, position)| (asset_id.clone(), position.quantity))
                .collect();

            if let Err(e) = quote_service.update_position_status_from_holdings(&current_holdings).await {
                warn!(
                    "Failed to update position status from holdings: {}. Quote sync planning may be affected.",
                    e
                );
            }
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
