use chrono::NaiveDate;
use futures::future::join_all;
use log::{error, info, warn};
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Instant;
use tauri::{async_runtime::spawn, AppHandle, Emitter, Listener, Manager};
use wealthfolio_core::constants::PORTFOLIO_TOTAL_ACCOUNT_ID;

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
                let symbols_to_sync = payload.symbols.clone(); // None means sync all relevant symbols
                let accounts_to_recalc = payload.account_ids.clone();
                let refetch_all = payload.refetch_all_market_data;
                let context_result = handle_clone.try_state::<Arc<ServiceContext>>();

                if let Some(context) = context_result {
                    let market_data_service = context.quote_service();

                    // Emit sync start event
                    if let Err(e) = handle_clone.emit(MARKET_SYNC_START, &()) {
                        error!("Failed to emit market:sync-start event: {}", e);
                    }

                    let sync_start = Instant::now();

                    // Use optimized sync - QuoteService handles the sync state internally
                    let sync_result = if refetch_all {
                        market_data_service.resync(symbols_to_sync).await
                    } else {
                        market_data_service.sync().await
                    };

                    let sync_duration = sync_start.elapsed();
                    info!("Market data sync completed in: {:?}", sync_duration);

                    match sync_result {
                        Ok(result) => {
                            // Convert SyncResult to legacy format for backwards compatibility
                            let failed_syncs = result.failures;
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

fn handle_resource_change(handle: AppHandle, payload_str: &str) {
    match serde_json::from_str::<ResourceEventPayload>(payload_str) {
        Ok(event) => {
            match event.resource_type.as_str() {
                "account" => handle_account_resource_change(handle.clone(), &event),
                "activity" => handle_activity_resource_change(handle.clone(), &event),
                "asset" => handle_asset_resource_change(handle.clone(), &event),
                _ => {
                    // Default to a lightweight portfolio update when resource type is unknown
                    emit_portfolio_trigger_update(
                        &handle,
                        PortfolioRequestPayload::builder()
                            .account_ids(None)
                            .symbols(None)
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

            // Deduplicate asset IDs
            let unique_ids: Vec<String> = payload
                .asset_ids
                .into_iter()
                .collect::<std::collections::HashSet<_>>()
                .into_iter()
                .collect();

            spawn(async move {
                let asset_service = context.asset_service();

                for asset_id in unique_ids {
                    // Enrichment failures are expected for some assets, ignore silently
                    let _ = asset_service.enrich_asset_profile(&asset_id).await;
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

    if let (Some(currency), Some(ctx)) = (&account_currency, context.as_ref()) {
        match ctx.settings_service().get_base_currency() {
            Ok(Some(base_currency)) if !base_currency.is_empty() && base_currency != *currency => {
                // Use canonical FX ID format: EUR/USD
                let symbol = format!("{}/{}", currency, base_currency);
                payload_builder = payload_builder.symbols(Some(vec![symbol]));
            }
            Ok(_) => {}
            Err(err) => warn!("Failed to fetch base currency for account sync: {}", err),
        }
    }

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
    let mut symbols: HashSet<String> = HashSet::new();

    if let Some(account_id) = event.payload.get("account_id").and_then(|v| v.as_str()) {
        account_ids.insert(account_id.to_string());
        collect_activity_symbols(
            &context,
            account_id,
            event.payload.get("currency").and_then(|v| v.as_str()),
            event.payload.get("asset_id").and_then(|v| v.as_str()),
            &mut symbols,
        );
    }

    if let Some(previous_account_id) = event
        .payload
        .get("previous_account_id")
        .and_then(|v| v.as_str())
    {
        account_ids.insert(previous_account_id.to_string());
        collect_activity_symbols(
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
            &mut symbols,
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
                    collect_activity_symbols(
                        &context,
                        account_id,
                        currency,
                        asset_id,
                        &mut symbols,
                    );
                }
            }
        }
    }

    // Handle quote sync state updates based on activity action
    let market_data_service = context.quote_service();

    match event.action.as_str() {
        "created" => {
            // Handle new activity - update sync state with the activity date
            let asset_id = event.payload.get("asset_id").and_then(|v| v.as_str());
            let activity_date_str = event.payload.get("activity_date").and_then(|v| v.as_str());

            if let (Some(asset_id), Some(date_str)) = (asset_id, activity_date_str) {
                if let Ok(activity_date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
                    let asset_id_owned = asset_id.to_string();
                    let service = market_data_service.clone();

                    spawn(async move {
                        if let Err(e) = service
                            .handle_activity_created(&asset_id_owned, activity_date)
                            .await
                        {
                            warn!(
                                "Failed to handle new activity for {}: {}",
                                asset_id_owned, e
                            );
                        }
                    });
                }
            }
        }
        "updated" => {
            // Handle activity date changes for quote backfill detection
            let date_changed = event
                .payload
                .get("date_changed")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            if date_changed {
                let asset_id = event.payload.get("asset_id").and_then(|v| v.as_str());
                let new_date_str = event.payload.get("activity_date").and_then(|v| v.as_str());

                if let (Some(asset_id), Some(new_date_str)) = (asset_id, new_date_str) {
                    let new_date = NaiveDate::parse_from_str(new_date_str, "%Y-%m-%d").ok();

                    if let Some(new_date) = new_date {
                        let asset_id_owned = asset_id.to_string();
                        let service = market_data_service.clone();

                        // Use handle_activity_created to update sync state with new date
                        spawn(async move {
                            if let Err(e) = service
                                .handle_activity_created(&asset_id_owned, new_date)
                                .await
                            {
                                warn!(
                                    "Failed to handle activity date change for {}: {}",
                                    asset_id_owned, e
                                );
                            }
                        });
                    }
                }
            }

            // Also check if asset_id changed (activity moved to different asset)
            let previous_asset_id = event
                .payload
                .get("previous_asset_id")
                .and_then(|v| v.as_str());
            let current_asset_id = event.payload.get("asset_id").and_then(|v| v.as_str());

            if let (Some(prev), Some(curr)) = (previous_asset_id, current_asset_id) {
                if prev != curr {
                    // Recalculate dates for both old and new asset
                    let prev_owned = prev.to_string();
                    let curr_owned = curr.to_string();
                    let service = market_data_service.clone();
                    // Convert to owned String before the async block
                    let activity_date_owned = event
                        .payload
                        .get("activity_date")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    spawn(async move {
                        // Handle deletion from old asset
                        if let Err(e) = service.handle_activity_deleted(&prev_owned).await {
                            warn!(
                                "Failed to handle activity removal from {}: {}",
                                prev_owned, e
                            );
                        }

                        // Handle addition to new asset
                        if let Some(date_str) = activity_date_owned {
                            if let Ok(activity_date) =
                                NaiveDate::parse_from_str(&date_str, "%Y-%m-%d")
                            {
                                if let Err(e) = service
                                    .handle_activity_created(&curr_owned, activity_date)
                                    .await
                                {
                                    warn!(
                                        "Failed to handle activity addition to {}: {}",
                                        curr_owned, e
                                    );
                                }
                            }
                        }
                    });
                }
            }
        }
        "deleted" => {
            // Handle activity deletion - recalculate dates for the asset
            let asset_id = event.payload.get("asset_id").and_then(|v| v.as_str());

            if let Some(asset_id) = asset_id {
                let asset_id_owned = asset_id.to_string();
                let service = market_data_service.clone();

                spawn(async move {
                    if let Err(e) = service.handle_activity_deleted(&asset_id_owned).await {
                        warn!(
                            "Failed to handle activity deletion for {}: {}",
                            asset_id_owned, e
                        );
                    }
                });
            }
        }
        "imported" => {
            // Handle imported activities - trigger full refresh since there may be many
            let service = market_data_service.clone();

            spawn(async move {
                if let Err(e) = service.refresh_sync_state().await {
                    warn!("Failed to refresh sync state after import: {}", e);
                }
            });
        }
        "bulk-mutated" => {
            // Handle bulk mutations - trigger full refresh since multiple activities changed
            let service = market_data_service.clone();

            spawn(async move {
                if let Err(e) = service.refresh_sync_state().await {
                    warn!("Failed to refresh sync state after bulk mutation: {}", e);
                }
            });
        }
        _ => {}
    }

    let mut builder = PortfolioRequestPayload::builder();

    if account_ids.is_empty() {
        builder = builder.account_ids(None);
    } else {
        builder = builder.account_ids(Some(account_ids.into_iter().collect()));
    }

    if !symbols.is_empty() {
        builder = builder.symbols(Some(symbols.into_iter().collect()));
    }

    // Use optimized sync - the quote sync state service has already been updated
    // with the activity changes above, so the sync plan will know exactly what to fetch
    builder = builder.refetch_all_market_data(false);

    emit_portfolio_trigger_recalculate(&handle, builder.build());
}

fn collect_activity_symbols(
    context: &Arc<ServiceContext>,
    account_id: &str,
    activity_currency: Option<&str>,
    asset_id: Option<&str>,
    symbols: &mut HashSet<String>,
) {
    if let Some(asset_id) = asset_id {
        if !asset_id.is_empty() {
            symbols.insert(asset_id.to_string());
        }
    }

    if let Some(currency) = activity_currency {
        match context.account_service().get_account(account_id) {
            Ok(account) => {
                if currency != account.currency {
                    // Use canonical FX ID format: EUR/USD
                    symbols.insert(format!("{}/{}", account.currency, currency));
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
