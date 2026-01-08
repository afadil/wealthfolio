//! Commands for syncing broker data from the cloud API.

use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use wealthfolio_core::accounts::Account;

use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use wealthfolio_connect::{
    broker::BrokerApiClient, BrokerAccount, BrokerConnection, PlansResponse, Platform,
    SyncAccountsResponse, SyncActivitiesResponse, SyncConnectionsResponse, UserInfo,
};
use wealthfolio_core::secrets::SecretStore;

/// Secret key for storing the cloud API access token (same as frontend)
/// Note: SecretStore adds "wealthfolio_" prefix automatically
const CLOUD_ACCESS_TOKEN_KEY: &str = "sync_access_token";

/// Sync configuration status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    /// Whether access token is configured (masked for security)
    pub access_token: Option<String>,
}

/// Result from a sync operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
    pub connections_synced: Option<SyncConnectionsResponse>,
    pub accounts_synced: Option<SyncAccountsResponse>,
    pub activities_synced: Option<SyncActivitiesResponse>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Credential Management Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Set the cloud API credentials
#[tauri::command]
pub async fn set_sync_credentials(
    access_token: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Setting cloud sync credentials");

    // Validate token is not empty
    if access_token.trim().is_empty() {
        return Err("Access token cannot be empty".to_string());
    }

    // Store access token securely in keyring
    KeyringSecretStore
        .set_secret(CLOUD_ACCESS_TOKEN_KEY, &access_token)
        .map_err(|e| format!("Failed to store access token: {}", e))?;

    info!("Cloud sync credentials saved successfully");
    Ok(())
}

/// Get the current cloud API credentials (only returns whether they're set)
#[tauri::command]
pub async fn get_sync_credentials(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<SyncConfig, String> {
    let has_token = KeyringSecretStore
        .get_secret(CLOUD_ACCESS_TOKEN_KEY)
        .map_err(|e| e.to_string())?
        .is_some();

    Ok(SyncConfig {
        access_token: if has_token {
            Some("********".to_string())
        } else {
            None
        },
    })
}

/// Clear the cloud API credentials
#[tauri::command]
pub async fn clear_sync_credentials(_state: State<'_, Arc<ServiceContext>>) -> Result<(), String> {
    KeyringSecretStore
        .delete_secret(CLOUD_ACCESS_TOKEN_KEY)
        .map_err(|e| format!("Failed to delete access token: {}", e))?;

    info!("Cloud sync credentials cleared");
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Broker Sync Commands
// ─────────────────────────────────────────────────────────────────────────────

/// Sync broker data from the cloud API (Tauri command wrapper)
#[tauri::command]
pub async fn sync_broker_data(state: State<'_, Arc<ServiceContext>>) -> Result<SyncResult, String> {
    perform_broker_sync(&state).await
}

/// Core broker sync logic that can be called from Tauri command or scheduler.
///
/// This function is public so the scheduler can call it directly.
/// FX rate registration is handled automatically by AccountService during account creation.
pub async fn perform_broker_sync(context: &Arc<ServiceContext>) -> Result<SyncResult, String> {
    info!("Starting broker data sync...");

    let client = context.connect_service().get_api_client()?;

    // Step 1: Fetch and sync connections (platforms)
    info!("Fetching broker connections...");
    let connections = client.list_connections().await.map_err(|e| e.to_string())?;
    info!("Found {} broker connections", connections.len());

    let connections_result = context
        .sync_service()
        .sync_connections(connections.clone())
        .await
        .map_err(|e| format!("Failed to sync connections: {}", e))?;

    info!(
        "Connections synced: {} created, {} updated",
        connections_result.platforms_created, connections_result.platforms_updated
    );

    // Step 2: Fetch and sync accounts (FX rates are registered via AccountService)
    info!("Fetching broker accounts...");
    let authorization_ids: Vec<String> = connections.iter().map(|c| c.id.clone()).collect();
    let all_accounts = client
        .list_accounts(if authorization_ids.is_empty() {
            None
        } else {
            Some(authorization_ids)
        })
        .await
        .map_err(|e| e.to_string())?;

    // Log all accounts with their sync_enabled status for debugging
    info!(
        "Fetched {} total broker accounts from API",
        all_accounts.len()
    );
    for acc in &all_accounts {
        debug!(
            "  Account '{}' (id={:?}): sync_enabled={}, shared_with_household={}",
            acc.name.as_deref().unwrap_or("unnamed"),
            acc.id,
            acc.sync_enabled,
            acc.shared_with_household
        );
    }

    // Filter accounts to only sync those with sync_enabled = true
    let accounts: Vec<_> = all_accounts
        .into_iter()
        .filter(|a| a.sync_enabled)
        .collect();

    // Create a set of sync-enabled broker account IDs to filter activity sync (before moving accounts)
    let sync_enabled_broker_ids: std::collections::HashSet<String> = accounts
        .iter()
        .filter_map(|a| a.id.clone())
        .collect();

    let total_accounts = accounts.len();
    info!(
        "Filtered to {} broker accounts with sync_enabled=true",
        total_accounts
    );

    let accounts_result = context
        .sync_service()
        .sync_accounts(accounts)
        .await
        .map_err(|e| format!("Failed to sync accounts: {}", e))?;

    info!(
        "Accounts synced: {} created, {} updated, {} skipped",
        accounts_result.created, accounts_result.updated, accounts_result.skipped
    );

    // Step 3: Fetch and sync activities for all synced accounts (incremental per account)
    let end_date = chrono::Utc::now().date_naive();

    let synced_accounts = context
        .sync_service()
        .get_synced_accounts()
        .map_err(|e| format!("Failed to get synced accounts: {}", e))?;

    let mut activities_summary = SyncActivitiesResponse::default();
    let mut activity_errors: Vec<String> = Vec::new();

    for account in synced_accounts {
        let Some(broker_account_id) = account.provider_account_id.clone() else {
            continue;
        };

        // Skip accounts that are not sync-enabled
        if !sync_enabled_broker_ids.contains(&broker_account_id) {
            info!(
                "Skipping activity sync for account '{}' (sync disabled)",
                account.name
            );
            continue;
        }

        let account_id = account.id.clone();
        let account_name = account.name.clone();
        if let Err(err) = context
            .sync_service()
            .mark_activity_sync_attempt(account_id.clone())
            .await
            .map_err(|e| format!("Failed to mark activity sync attempt: {}", e))
        {
            activity_errors.push(format!("{}: {}", account_name, err));
            continue;
        }

        let (start_date, end_date_filter) =
            compute_activity_query_window(context, &account, end_date)
                .map_err(|e| format!("Failed to compute activity sync window: {}", e))?;

        let window_label = match (&start_date, &end_date_filter) {
            (Some(s), Some(e)) => format!("{} -> {}", s, e),
            _ => "ALL".to_string(),
        };
        info!(
            "Syncing activities for account '{}' ({}): {}",
            account_name, broker_account_id, window_label
        );

        let mut offset: i64 = 0;
        let limit: i64 = 1000;
        let mut pages_fetched: usize = 0;
        let mut last_page_first_id: Option<String> = None;
        let max_pages: usize = 10000;
        let mut account_failed = false;

        loop {
            if pages_fetched >= max_pages {
                let msg = format!("Pagination exceeded max pages ({}). Aborting.", max_pages);
                let _ = context
                    .sync_service()
                    .finalize_activity_sync_failure(account_id.clone(), msg.clone())
                    .await;
                activity_errors.push(format!("{}: {}", account_name, msg));
                account_failed = true;
                break;
            }

            let page = match client
                .get_account_activities(
                    &broker_account_id,
                    start_date.as_deref(),
                    end_date_filter.as_deref(),
                    Some(offset),
                    Some(limit),
                )
                .await
            {
                Ok(p) => p,
                Err(e) => {
                    let err_msg = e.to_string();
                    let _ = context
                        .sync_service()
                        .finalize_activity_sync_failure(account_id.clone(), err_msg.clone())
                        .await;
                    activity_errors.push(format!("{}: {}", account_name, err_msg));
                    account_failed = true;
                    break;
                }
            };

            let data = page.data.clone();
            pages_fetched += 1;

            let page_total = page.pagination.as_ref().and_then(|p| p.total);
            info!(
                "Fetched {} activities for '{}' (offset {}, total {:?})",
                data.len(),
                account_name,
                offset,
                page_total
            );

            if !data.is_empty() {
                if let Some(first_id) = data.first().and_then(|a| a.id.clone()) {
                    if offset > 0 {
                        if let Some(prev) = &last_page_first_id {
                            if prev == &first_id {
                                let msg = "Pagination appears stuck (same first activity id returned for multiple pages).".to_string();
                                let _ = context
                                    .sync_service()
                                    .finalize_activity_sync_failure(account_id.clone(), msg.clone())
                                    .await;
                                activity_errors.push(format!("{}: {}", account_name, msg));
                                account_failed = true;
                                break;
                            }
                        }
                    }
                    last_page_first_id = Some(first_id);
                }

                debug!(
                    "Upserting {} activities for account '{}'...",
                    data.len(),
                    account_name
                );

                match context
                    .sync_service()
                    .upsert_account_activities(account_id.clone(), data.clone())
                    .await
                {
                    Ok((activities_upserted, assets_inserted, new_asset_ids)) => {
                        info!(
                            "Upserted {} activities, {} assets for '{}'",
                            activities_upserted, assets_inserted, account_name
                        );
                        activities_summary.activities_upserted += activities_upserted;
                        activities_summary.assets_inserted += assets_inserted;
                        activities_summary.new_asset_ids.extend(new_asset_ids);
                    }
                    Err(e) => {
                        let e = format!("Failed to upsert activities: {}", e);
                        error!("{}: {}", account_name, e);
                        let _ = context
                            .sync_service()
                            .finalize_activity_sync_failure(account_id.clone(), e.clone())
                            .await;
                        activity_errors.push(format!("{}: {}", account_name, e));
                        account_failed = true;
                        break;
                    }
                }
            }

            // Use has_more flag for pagination
            let has_more = page
                .pagination
                .as_ref()
                .map(|p| p.has_more)
                .unwrap_or(false);

            // Advance offset by number of items received
            offset += data.len() as i64;

            // Stop if no more pages
            if !has_more {
                break;
            }
        }

        if !account_failed {
            let last_synced_date = end_date;
            if let Err(e) = context
                .sync_service()
                .finalize_activity_sync_success(
                    account_id.clone(),
                    last_synced_date.format("%Y-%m-%d").to_string(),
                )
                .await
                .map_err(|e| format!("Failed to persist sync state: {}", e))
            {
                activity_errors.push(format!("{}: {}", account_name, e));
                activities_summary.accounts_failed += 1;
                continue;
            }

            activities_summary.accounts_synced += 1;
        } else {
            activities_summary.accounts_failed += 1;
        }
    }

    Ok(SyncResult {
        success: activity_errors.is_empty(),
        message: format!(
            "Sync completed. {} accounts created, {} activities synced{}",
            accounts_result.created,
            activities_summary.activities_upserted,
            if activity_errors.is_empty() {
                ".".to_string()
            } else {
                format!(" ({} failed).", activity_errors.len())
            }
        ),
        connections_synced: Some(connections_result),
        accounts_synced: Some(accounts_result),
        activities_synced: Some(activities_summary),
    })
}

fn compute_activity_query_window(
    context: &Arc<ServiceContext>,
    account: &Account,
    end_date: chrono::NaiveDate,
) -> Result<(Option<String>, Option<String>), String> {
    let sync_state = context
        .sync_service()
        .get_activity_sync_state(&account.id)
        .map_err(|e| format!("Failed to read activity sync state: {}", e))?;

    let from_state = sync_state
        .and_then(|s| s.last_successful_at)
        .map(|dt| dt.date_naive())
        .map(|d| (d - chrono::Days::new(1)).min(end_date));

    if let Some(d) = from_state {
        return Ok((
            Some(d.format("%Y-%m-%d").to_string()),
            Some(end_date.format("%Y-%m-%d").to_string()),
        ));
    }

    Ok((None, None))
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

/// Get subscription plans from the cloud API
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

/// Get import runs with optional type filter
#[tauri::command]
pub async fn get_import_runs(
    run_type: Option<String>,
    limit: Option<i64>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<wealthfolio_core::sync::ImportRun>, String> {
    let limit = limit.unwrap_or(50);
    debug!(
        "Fetching import runs (type={:?}, limit={})...",
        run_type, limit
    );
    state
        .sync_service()
        .get_import_runs(run_type.as_deref(), limit)
        .map_err(|e| format!("Failed to get import runs: {}", e))
}

// ─────────────────────────────────────────────────────────────────────────────
// Foreground Sync Command
// ─────────────────────────────────────────────────────────────────────────────
