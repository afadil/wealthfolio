//! Event queue worker for processing domain events.
//!
//! Receives events from an mpsc channel, debounces them with a 500ms window,
//! then processes the batch to trigger portfolio recalculation, asset enrichment,
//! and broker sync.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use tokio::sync::mpsc;
use wealthfolio_connect::BrokerSyncServiceTrait;
use wealthfolio_core::{assets::AssetServiceTrait, events::DomainEvent, secrets::SecretStore};

use super::planner::{plan_asset_enrichment, plan_broker_sync, plan_portfolio_job};
use crate::events::EventBus;

/// Debounce window for collecting events before processing.
const DEBOUNCE_DURATION: Duration = Duration::from_millis(1000);

/// Dependencies needed by the queue worker for processing events.
pub struct QueueWorkerDeps {
    pub base_currency: Arc<RwLock<String>>,
    pub asset_service: Arc<dyn AssetServiceTrait + Send + Sync>,
    pub connect_sync_service: Arc<dyn BrokerSyncServiceTrait + Send + Sync>,
    pub event_bus: EventBus,
    pub health_service: Arc<dyn wealthfolio_core::health::HealthServiceTrait + Send + Sync>,
    // We need a way to enqueue portfolio jobs. Since AppState is not easily cloneable,
    // we pass what we need for enqueue_portfolio_job (which spawns its own async task).
    // The shared.rs enqueue_portfolio_job needs Arc<AppState>, so we'll need to pass
    // a callback or restructure slightly. For now, we'll store what we need.
    pub snapshot_service:
        Arc<dyn wealthfolio_core::portfolio::snapshot::SnapshotServiceTrait + Send + Sync>,
    pub quote_service: Arc<dyn wealthfolio_core::quotes::QuoteServiceTrait + Send + Sync>,
    pub valuation_service:
        Arc<dyn wealthfolio_core::portfolio::valuation::ValuationServiceTrait + Send + Sync>,
    pub account_service: Arc<wealthfolio_core::accounts::AccountService>,
    pub fx_service: Arc<dyn wealthfolio_core::fx::FxServiceTrait + Send + Sync>,
    /// Secret store for accessing credentials (e.g., refresh tokens for broker sync)
    pub secret_store: Arc<dyn SecretStore>,
}

/// Runs the event queue worker.
///
/// Receives events from the channel, debounces with a 500ms window,
/// and processes batches to trigger appropriate actions.
///
/// Uses an `is_processing` guard to prevent new batches from being processed
/// while a previous batch (e.g., broker sync or portfolio recalc) is still running.
pub async fn event_queue_worker(
    mut rx: mpsc::UnboundedReceiver<DomainEvent>,
    deps: Arc<QueueWorkerDeps>,
) {
    tracing::info!("Domain event queue worker started");

    let mut pending_events: Vec<DomainEvent> = Vec::new();
    let is_processing = Arc::new(AtomicBool::new(false));

    loop {
        // If we have pending events, wait for more events or timeout
        if !pending_events.is_empty() {
            tokio::select! {
                // Wait for more events
                event = rx.recv() => {
                    match event {
                        Some(e) => {
                            pending_events.push(e);
                            // Continue collecting more events
                        }
                        None => {
                            // Channel closed, process remaining and exit
                            // Wait for any in-progress processing to complete before final batch
                            while is_processing.load(Ordering::SeqCst) {
                                tokio::time::sleep(Duration::from_millis(50)).await;
                            }
                            if !pending_events.is_empty() {
                                is_processing.store(true, Ordering::SeqCst);
                                process_event_batch(&pending_events, deps.clone()).await;
                                is_processing.store(false, Ordering::SeqCst);
                            }
                            tracing::info!("Domain event queue worker shutting down");
                            return;
                        }
                    }
                }
                // Debounce timeout expired
                _ = tokio::time::sleep(DEBOUNCE_DURATION) => {
                    // Check if we're still processing a previous batch
                    if is_processing.load(Ordering::SeqCst) {
                        // Still processing, keep collecting events
                        tracing::debug!("Debounce expired but previous batch still processing, continuing to collect events");
                        continue;
                    }

                    if !pending_events.is_empty() {
                        let batch = std::mem::take(&mut pending_events);
                        is_processing.store(true, Ordering::SeqCst);
                        process_event_batch(&batch, deps.clone()).await;
                        is_processing.store(false, Ordering::SeqCst);
                    }
                }
            }
        } else {
            // No pending events, wait for the first event
            match rx.recv().await {
                Some(e) => {
                    pending_events.push(e);
                }
                None => {
                    // Channel closed
                    tracing::info!("Domain event queue worker shutting down");
                    return;
                }
            }
        }
    }
}

/// Processes a batch of domain events.
async fn process_event_batch(events: &[DomainEvent], deps: Arc<QueueWorkerDeps>) {
    tracing::info!("Processing batch of {} domain event(s)", events.len());

    let base_currency = deps.base_currency.read().unwrap().clone();

    // 1. Plan and trigger portfolio job
    if let Some(config) = plan_portfolio_job(events, &base_currency) {
        tracing::info!(
            "Triggering portfolio job for accounts: {:?}, market_sync: {:?}",
            config.account_ids,
            config.market_sync_mode
        );

        // Run the portfolio job directly (not spawned) so that is_processing
        // guard properly tracks completion and prevents concurrent jobs
        run_portfolio_job(deps.clone(), config).await;
    }

    // 2. Plan and trigger asset enrichment
    let enrichment_assets = plan_asset_enrichment(events);
    if !enrichment_assets.is_empty() {
        tracing::info!(
            "Triggering asset enrichment for {} asset(s)",
            enrichment_assets.len()
        );

        let asset_service = deps.asset_service.clone();
        tokio::spawn(async move {
            match asset_service.enrich_assets(enrichment_assets).await {
                Ok((enriched, skipped, failed)) => {
                    tracing::info!(
                        "Asset enrichment complete: {} enriched, {} skipped, {} failed",
                        enriched,
                        skipped,
                        failed
                    );
                }
                Err(e) => {
                    tracing::warn!("Asset enrichment failed: {}", e);
                }
            }
        });
    }

    // 3. Plan and trigger broker sync
    let sync_accounts = plan_broker_sync(events);
    if !sync_accounts.is_empty() {
        tracing::info!(
            "Broker sync needed for {} account(s): {:?}",
            sync_accounts.len(),
            sync_accounts
        );

        // Spawn broker sync as a background task
        let connect_sync_service = deps.connect_sync_service.clone();
        let event_bus = deps.event_bus.clone();
        let secret_store = deps.secret_store.clone();

        tokio::spawn(async move {
            match perform_broker_sync(connect_sync_service, event_bus, secret_store).await
            {
                Ok(result) => {
                    tracing::info!(
                        "Broker sync completed after tracking mode change: success={}, message={}",
                        result.success,
                        result.message
                    );
                }
                Err(e) => {
                    tracing::warn!("Broker sync failed after tracking mode change: {}", e);
                }
            }
        });
    }
}

/// Runs a portfolio job with the given configuration.
///
/// This is a local implementation that mirrors the behavior of
/// `enqueue_portfolio_job` from `api/shared.rs` but uses the
/// worker's dependencies instead of requiring full AppState.
///
/// Note: This runs the job directly (not spawned) so that the caller
/// can properly track completion via the `is_processing` guard.
async fn run_portfolio_job(
    deps: Arc<QueueWorkerDeps>,
    config: crate::api::shared::PortfolioJobConfig,
) {
    use crate::events::{
        ServerEvent, MARKET_SYNC_COMPLETE, MARKET_SYNC_ERROR, MARKET_SYNC_START,
        PORTFOLIO_UPDATE_COMPLETE, PORTFOLIO_UPDATE_ERROR, PORTFOLIO_UPDATE_START,
    };
    use serde_json::json;
    use wealthfolio_core::accounts::AccountServiceTrait;
    use wealthfolio_core::constants::PORTFOLIO_TOTAL_ACCOUNT_ID;

    let event_bus = deps.event_bus.clone();

    // Only perform market sync if the mode requires it
    if config.market_sync_mode.requires_sync() {
        event_bus.publish(ServerEvent::new(MARKET_SYNC_START));

        let sync_start = std::time::Instant::now();
        let asset_ids = config.market_sync_mode.asset_ids().cloned();

        let sync_result = match config.market_sync_mode.to_sync_mode() {
            Some(sync_mode) => deps.quote_service.sync(sync_mode, asset_ids).await,
            None => {
                tracing::warn!("MarketSyncMode requires sync but returned None for SyncMode");
                Ok(wealthfolio_core::quotes::SyncResult::default())
            }
        };

        match sync_result {
            Ok(result) => {
                event_bus.publish(ServerEvent::with_payload(
                    MARKET_SYNC_COMPLETE,
                    json!({ "failed_syncs": result.failed }),
                ));
                tracing::info!("Market data sync completed in {:?}", sync_start.elapsed());
                deps.health_service.clear_cache().await;
                if let Err(err) = deps.fx_service.initialize() {
                    tracing::warn!(
                        "Failed to initialize FxService after market data sync: {}",
                        err
                    );
                }
            }
            Err(err) => {
                let err_msg = err.to_string();
                tracing::error!("Market data sync failed: {}", err_msg);
                event_bus.publish(ServerEvent::with_payload(MARKET_SYNC_ERROR, json!(err_msg)));
                return;
            }
        }
    } else {
        tracing::debug!("Skipping market sync (MarketSyncMode::None)");
    }

    event_bus.publish(ServerEvent::new(PORTFOLIO_UPDATE_START));

    // For TOTAL portfolio calculation, use non-archived accounts (ignores is_active)
    let accounts_for_total = match deps.account_service.get_non_archived_accounts() {
        Ok(accounts) => accounts,
        Err(err) => {
            let err_msg = format!("Failed to list non-archived accounts: {}", err);
            tracing::error!("{}", err_msg);
            event_bus.publish(ServerEvent::with_payload(
                PORTFOLIO_UPDATE_ERROR,
                json!(err_msg),
            ));
            return;
        }
    };

    // Determine which accounts to calculate individual snapshots for:
    // - If specific account_ids provided: process those accounts (even if archived)
    // - Otherwise: process all non-archived accounts
    let mut account_ids: Vec<String> = if let Some(ref target_ids) = config.account_ids {
        // Process the specific requested accounts (even if archived, for their own snapshots)
        target_ids.clone()
    } else {
        // No specific accounts requested - use non-archived accounts
        accounts_for_total.iter().map(|a| a.id.clone()).collect()
    };

    if !account_ids.is_empty() {
        let ids_slice = account_ids.as_slice();
        let snapshot_result = if config.force_full_recalculation {
            deps.snapshot_service
                .force_recalculate_holdings_snapshots(Some(ids_slice))
                .await
        } else {
            deps.snapshot_service
                .calculate_holdings_snapshots(Some(ids_slice))
                .await
        };

        if let Err(err) = snapshot_result {
            let err_msg = format!(
                "Holdings snapshot calculation failed for targeted accounts: {}",
                err
            );
            tracing::warn!("{}", err_msg);
            event_bus.publish(ServerEvent::with_payload(
                PORTFOLIO_UPDATE_ERROR,
                json!(err_msg),
            ));
        }
    }

    if let Err(err) = deps
        .snapshot_service
        .calculate_total_portfolio_snapshots()
        .await
    {
        let err_msg = format!("Failed to calculate TOTAL portfolio snapshot: {}", err);
        tracing::error!("{}", err_msg);
        event_bus.publish(ServerEvent::with_payload(
            PORTFOLIO_UPDATE_ERROR,
            json!(err_msg),
        ));
        return;
    }

    // Update position status from TOTAL snapshot
    if let Ok(Some(total_snapshot)) = deps
        .snapshot_service
        .get_latest_holdings_snapshot(PORTFOLIO_TOTAL_ACCOUNT_ID)
    {
        let current_holdings: std::collections::HashMap<String, rust_decimal::Decimal> =
            total_snapshot
                .positions
                .iter()
                .map(|(asset_id, position)| (asset_id.clone(), position.quantity))
                .collect();

        if let Err(e) = deps
            .quote_service
            .update_position_status_from_holdings(&current_holdings)
            .await
        {
            tracing::warn!(
                "Failed to update position status from holdings: {}. Quote sync planning may be affected.",
                e
            );
        }
    }

    if !account_ids
        .iter()
        .any(|id| id == PORTFOLIO_TOTAL_ACCOUNT_ID)
    {
        account_ids.push(PORTFOLIO_TOTAL_ACCOUNT_ID.to_string());
    }

    for account_id in account_ids {
        if let Err(err) = deps
            .valuation_service
            .calculate_valuation_history(&account_id, config.force_full_recalculation)
            .await
        {
            let err_msg = format!(
                "Valuation history calculation failed for {}: {}",
                account_id, err
            );
            tracing::warn!("{}", err_msg);
            event_bus.publish(ServerEvent::with_payload(
                PORTFOLIO_UPDATE_ERROR,
                json!(err_msg),
            ));
        }
    }

    event_bus.publish(ServerEvent::new(PORTFOLIO_UPDATE_COMPLETE));
}

// ─────────────────────────────────────────────────────────────────────────────
// Broker Sync
// ─────────────────────────────────────────────────────────────────────────────

/// Default Supabase auth URL for token refresh
const DEFAULT_SUPABASE_AUTH_URL: &str = "https://vvalcadcvxqwligwzxaw.supabase.co";

/// Storage key for refresh token (without prefix - the SecretStore adds "wealthfolio_" prefix)
const CLOUD_REFRESH_TOKEN_KEY: &str = "sync_refresh_token";

fn cloud_api_base_url() -> String {
    std::env::var("CONNECT_API_URL")
        .ok()
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| wealthfolio_connect::DEFAULT_CLOUD_API_URL.to_string())
}

fn supabase_auth_url() -> String {
    std::env::var("CONNECT_AUTH_URL")
        .ok()
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_SUPABASE_AUTH_URL.to_string())
}

fn supabase_api_key() -> Option<String> {
    std::env::var("CONNECT_AUTH_PUBLISHABLE_KEY").ok()
}

/// Progress reporter that publishes events to the EventBus for SSE delivery.
struct EventBusProgressReporter {
    event_bus: EventBus,
}

impl EventBusProgressReporter {
    fn new(event_bus: EventBus) -> Self {
        Self { event_bus }
    }
}

impl wealthfolio_connect::SyncProgressReporter for EventBusProgressReporter {
    fn report_progress(&self, payload: wealthfolio_connect::SyncProgressPayload) {
        use crate::events::ServerEvent;
        self.event_bus.publish(ServerEvent::with_payload(
            "sync-progress",
            serde_json::to_value(&payload).unwrap_or_default(),
        ));
    }

    fn report_sync_start(&self) {
        use crate::events::{ServerEvent, BROKER_SYNC_START};
        self.event_bus.publish(ServerEvent::new(BROKER_SYNC_START));
    }

    fn report_sync_complete(&self, result: &wealthfolio_connect::SyncResult) {
        use crate::events::{ServerEvent, BROKER_SYNC_COMPLETE, BROKER_SYNC_ERROR};
        if result.success {
            self.event_bus.publish(ServerEvent::with_payload(
                BROKER_SYNC_COMPLETE,
                serde_json::to_value(result).unwrap_or_default(),
            ));
        } else {
            self.event_bus.publish(ServerEvent::with_payload(
                BROKER_SYNC_ERROR,
                serde_json::json!({ "error": result.message }),
            ));
        }
    }
}

/// Mint a fresh access token using the stored refresh token.
async fn mint_access_token(
    secret_store: &Arc<dyn SecretStore>,
) -> Result<String, String> {
    // Get the stored refresh token
    let refresh_token = secret_store
        .get_secret(CLOUD_REFRESH_TOKEN_KEY)
        .map_err(|e| format!("Failed to get refresh token: {}", e))?
        .ok_or_else(|| "No refresh token configured. Please sign in first.".to_string())?;

    // Get Supabase config
    let auth_url = supabase_auth_url();
    let api_key = supabase_api_key()
        .ok_or_else(|| "CONNECT_AUTH_PUBLISHABLE_KEY not configured".to_string())?;

    // Call Supabase token endpoint
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let token_url = format!("{}/auth/v1/token?grant_type=refresh_token", auth_url);
    tracing::debug!("Refreshing access token from: {}", token_url);

    let response = client
        .post(&token_url)
        .header("apikey", &api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    if !status.is_success() {
        #[derive(serde::Deserialize)]
        struct SupabaseErrorResponse {
            error: Option<String>,
            error_description: Option<String>,
        }

        if let Ok(err) = serde_json::from_str::<SupabaseErrorResponse>(&body) {
            let msg = err
                .error_description
                .or(err.error)
                .unwrap_or_else(|| "Unknown error".to_string());
            tracing::error!("Token refresh failed: {}", msg);
            return Err(format!("Session expired. Please sign in again. ({})", msg));
        }
        tracing::error!("Token refresh failed with status {}: {}", status, body);
        return Err("Session expired. Please sign in again.".to_string());
    }

    #[derive(serde::Deserialize)]
    struct SupabaseTokenResponse {
        access_token: String,
    }

    let token_response: SupabaseTokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    tracing::debug!("Access token refreshed successfully");
    Ok(token_response.access_token)
}

/// Core broker sync logic - syncs connections, accounts, and activities from cloud to local DB.
/// Uses the centralized SyncOrchestrator for full pagination support.
/// Asset enrichment is handled automatically via domain events (AssetsCreated).
async fn perform_broker_sync(
    connect_sync_service: Arc<dyn BrokerSyncServiceTrait + Send + Sync>,
    event_bus: EventBus,
    secret_store: Arc<dyn SecretStore>,
) -> Result<wealthfolio_connect::SyncResult, String> {
    use wealthfolio_connect::{ConnectApiClient, SyncConfig, SyncOrchestrator};

    // Create API client with fresh access token
    let token = mint_access_token(&secret_store).await?;
    let client =
        ConnectApiClient::new(&cloud_api_base_url(), &token).map_err(|e| e.to_string())?;

    // Create progress reporter and orchestrator
    let reporter = Arc::new(EventBusProgressReporter::new(event_bus));
    let orchestrator =
        SyncOrchestrator::new(connect_sync_service.clone(), reporter, SyncConfig::default());

    // Run the sync via the centralized orchestrator
    // Note: Asset enrichment is handled automatically via domain events (AssetsCreated)
    orchestrator.sync_all(&client).await
}
