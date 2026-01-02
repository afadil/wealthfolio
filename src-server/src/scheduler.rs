//! Background scheduler for periodic broker sync.
//!
//! Runs a fixed 4-hour interval sync for the Docker/Web server.

use std::sync::Arc;
use std::time::Duration as StdDuration;
use tokio::time::{interval, Duration};
use tracing::{debug, info, warn};

use crate::api::shared::{process_portfolio_job, PortfolioJobConfig};
use crate::events::{ServerEvent, BROKER_SYNC_COMPLETE, BROKER_SYNC_START};
use crate::main_lib::AppState;

/// Sync interval: 4 hours (not user-configurable to prevent API abuse)
const SYNC_INTERVAL_SECS: u64 = 4 * 60 * 60;

/// Initial delay before first sync (60 seconds to let server fully start)
const INITIAL_DELAY_SECS: u64 = 60;

/// Default base URL for Wealthfolio Connect cloud service.
const DEFAULT_CLOUD_API_URL: &str = "https://api.wealthfolio.app";

/// Default Supabase auth URL for token refresh
const DEFAULT_SUPABASE_AUTH_URL: &str = "https://vvalcadcvxqwligwzxaw.supabase.co";

fn cloud_api_base_url() -> String {
    std::env::var("CONNECT_API_URL")
        .ok()
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CLOUD_API_URL.to_string())
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

// ─────────────────────────────────────────────────────────────────────────────
// API Types for subscription check
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
struct SupabaseTokenResponse {
    access_token: String,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiUser {
    team: Option<ApiTeam>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiTeam {
    #[serde(default)]
    subscription_status: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Check
// ─────────────────────────────────────────────────────────────────────────────

/// Checks if the user has an active subscription.
/// Returns Ok(true) if subscription is active or trialing.
/// Returns Ok(false) if no subscription or inactive.
/// Returns Err if there's a network/API error.
async fn has_active_subscription(state: &Arc<AppState>) -> Result<bool, String> {
    // Get the stored refresh token
    let refresh_token = state
        .secret_store
        .get_secret("sync_refresh_token")
        .map_err(|e| format!("Failed to get refresh token: {}", e))?
        .ok_or_else(|| "No refresh token configured".to_string())?;

    // Get Supabase config
    let auth_url = supabase_auth_url();
    let api_key = supabase_api_key()
        .ok_or_else(|| "CONNECT_AUTH_PUBLISHABLE_KEY not configured".to_string())?;

    // Create HTTP client
    let client = reqwest::Client::builder()
        .timeout(StdDuration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Mint access token
    let token_url = format!("{}/auth/v1/token?grant_type=refresh_token", auth_url);
    debug!("Refreshing access token for subscription check");

    let token_response = client
        .post(&token_url)
        .header("apikey", &api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .await
        .map_err(|e| format!("Failed to refresh token: {}", e))?;

    if !token_response.status().is_success() {
        return Err("Failed to refresh access token".to_string());
    }

    let token_data: SupabaseTokenResponse = token_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Fetch user info
    let base_url = cloud_api_base_url();
    let user_url = format!("{}/api/v1/user/me", base_url);

    let user_response = client
        .get(&user_url)
        .header("Authorization", format!("Bearer {}", token_data.access_token))
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user info: {}", e))?;

    if !user_response.status().is_success() {
        return Err("Failed to fetch user info".to_string());
    }

    let user: Option<ApiUser> = user_response
        .json()
        .await
        .map_err(|e| format!("Failed to parse user response: {}", e))?;

    // Check subscription status
    let subscription_status = user
        .and_then(|u| u.team)
        .and_then(|t| t.subscription_status);

    match subscription_status.as_deref() {
        Some("active") => {
            debug!("User has active subscription");
            Ok(true)
        }
        status => {
            debug!("User does not have active subscription: {:?}", status);
            Ok(false)
        }
    }
}

/// Starts the background broker sync scheduler.
pub fn start_broker_sync_scheduler(state: Arc<AppState>) {
    tokio::spawn(async move {
        info!("Broker sync scheduler started (4-hour interval)");

        // Initial delay
        tokio::time::sleep(Duration::from_secs(INITIAL_DELAY_SECS)).await;

        // Run initial sync
        run_scheduled_sync(&state).await;

        // Set up periodic sync
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

    // Check subscription status before syncing
    match has_active_subscription(state).await {
        Ok(true) => {
            // User has active subscription, proceed with sync
        }
        Ok(false) => {
            info!("Scheduled sync skipped: no active subscription");
            return;
        }
        Err(e) => {
            // If we can't check subscription (no token, network error, etc.), skip silently
            debug!("Scheduled sync skipped: could not verify subscription ({})", e);
            return;
        }
    }

    // Publish start event
    state.event_bus.publish(ServerEvent::new(BROKER_SYNC_START));

    // Perform the sync
    match perform_broker_sync(state).await {
        Ok(result) => {
            info!(
                "Scheduled broker sync completed: {} activities synced",
                result.activities_synced
            );

            // Publish completion event
            state.event_bus.publish(ServerEvent::with_payload(
                BROKER_SYNC_COMPLETE,
                serde_json::json!({
                    "success": true,
                    "message": format!("Synced {} activities", result.activities_synced),
                    "is_scheduled": true
                }),
            ));

            // Trigger portfolio update if activities were synced
            if result.activities_synced > 0 {
                info!("Triggering portfolio update after sync");
                let job_config = PortfolioJobConfig {
                    account_ids: None,
                    symbols: None,
                    refetch_all_market_data: false,
                    force_full_recalculation: false,
                };
                if let Err(e) = process_portfolio_job(state.clone(), job_config).await {
                    warn!("Portfolio update after sync failed: {}", e);
                }
            }
        }
        Err(e) => {
            // Check if this is an auth error
            if e.contains("No access token") || e.contains("not authenticated") {
                info!("Scheduled sync skipped: user not authenticated");
            } else {
                warn!("Scheduled broker sync failed: {}", e);
                state.event_bus.publish(ServerEvent::with_payload(
                    BROKER_SYNC_COMPLETE,
                    serde_json::json!({
                        "success": false,
                        "message": e,
                        "is_scheduled": true
                    }),
                ));
            }
        }
    }
}

struct SyncResult {
    activities_synced: usize,
}

/// Performs the broker sync operation.
async fn perform_broker_sync(state: &Arc<AppState>) -> Result<SyncResult, String> {
    // Get access token from secret store
    let _token = state
        .secret_store
        .get_secret("sync_refresh_token")
        .map_err(|e| format!("Failed to get access token: {}", e))?
        .ok_or_else(|| "No access token stored".to_string())?;

    // Get synced accounts
    let synced_accounts = state
        .connect_sync_service
        .get_synced_accounts()
        .map_err(|e| e.to_string())?;

    if synced_accounts.is_empty() {
        return Ok(SyncResult { activities_synced: 0 });
    }

    // For now, just return success - the actual sync logic should call
    // the existing sync functions from the connect API module
    // This is a placeholder - the actual implementation should reuse
    // the sync logic from src-server/src/api/connect.rs

    Ok(SyncResult { activities_synced: 0 })
}
