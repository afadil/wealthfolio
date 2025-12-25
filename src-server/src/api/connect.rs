//! Wealthfolio Connect API endpoints for broker synchronization.
//!
//! This module provides REST endpoints for syncing broker accounts and activities
//! from the Wealthfolio Connect cloud service.

use std::sync::Arc;
use std::time::Duration;

use axum::{
    extract::State,
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

use crate::error::{ApiError, ApiResult};
use crate::main_lib::AppState;
use wealthfolio_connect::{
    ConnectApiClient, ConnectPortalRequest, PlansResponse, SyncAccountsResponse,
    SyncActivitiesResponse, SyncConnectionsResponse, UserInfo,
};

// Storage key for refresh token (without prefix - the SecretStore adds "wealthfolio_" prefix)
const CLOUD_REFRESH_TOKEN_KEY: &str = "sync_refresh_token";

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

/// Create a ConnectApiClient with a fresh access token
async fn create_connect_client(state: &AppState) -> ApiResult<ConnectApiClient> {
    let token = mint_access_token(state).await?;
    ConnectApiClient::new(cloud_api_base_url(), &token).map_err(|e| ApiError::Internal(e))
}

// ─────────────────────────────────────────────────────────────────────────────
// Request/Response Types
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreSyncSessionRequest {
    #[allow(dead_code)]
    pub access_token: Option<String>,
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
struct SupabaseTokenResponse {
    access_token: String,
    #[allow(dead_code)]
    refresh_token: String,
    #[allow(dead_code)]
    expires_in: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct SupabaseErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSessionStatus {
    pub is_configured: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Management
// ─────────────────────────────────────────────────────────────────────────────

async fn store_sync_session(
    State(state): State<Arc<AppState>>,
    Json(body): Json<StoreSyncSessionRequest>,
) -> ApiResult<Json<()>> {
    info!("[Connect] Storing sync session refresh token");

    state
        .secret_store
        .set_secret(CLOUD_REFRESH_TOKEN_KEY, &body.refresh_token)
        .map_err(|e| ApiError::Internal(format!("Failed to store refresh token: {}", e)))?;

    info!("[Connect] Sync session stored successfully");
    Ok(Json(()))
}

async fn clear_sync_session(State(state): State<Arc<AppState>>) -> ApiResult<Json<()>> {
    info!("[Connect] Clearing sync session");

    let _ = state.secret_store.delete_secret(CLOUD_REFRESH_TOKEN_KEY);

    info!("[Connect] Sync session cleared");
    Ok(Json(()))
}

async fn get_sync_session_status(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<SyncSessionStatus>> {
    let is_configured = state
        .secret_store
        .get_secret(CLOUD_REFRESH_TOKEN_KEY)
        .map(|t| t.is_some())
        .unwrap_or(false);

    Ok(Json(SyncSessionStatus { is_configured }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Token Management
// ─────────────────────────────────────────────────────────────────────────────

/// Mint a fresh access token using the stored refresh token
async fn mint_access_token(state: &AppState) -> ApiResult<String> {
    // Get the stored refresh token
    let refresh_token = state
        .secret_store
        .get_secret(CLOUD_REFRESH_TOKEN_KEY)
        .map_err(|e| ApiError::Internal(format!("Failed to get refresh token: {}", e)))?
        .ok_or_else(|| {
            ApiError::Unauthorized("No refresh token configured. Please sign in first.".to_string())
        })?;

    // Get Supabase config
    let auth_url = supabase_auth_url();
    let api_key = supabase_api_key().ok_or_else(|| {
        ApiError::Internal("CONNECT_AUTH_PUBLISHABLE_KEY not configured".to_string())
    })?;

    // Call Supabase token endpoint
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| ApiError::Internal(format!("Failed to create HTTP client: {}", e)))?;

    let token_url = format!("{}/auth/v1/token?grant_type=refresh_token", auth_url);
    debug!("[Connect] Refreshing access token from: {}", token_url);

    let response = client
        .post(&token_url)
        .header("apikey", &api_key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "refresh_token": refresh_token }))
        .send()
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to refresh token: {}", e)))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| ApiError::Internal(format!("Failed to read response: {}", e)))?;

    if !status.is_success() {
        // Try to parse error response
        if let Ok(err) = serde_json::from_str::<SupabaseErrorResponse>(&body) {
            let msg = err.error_description.or(err.error).unwrap_or_else(|| "Unknown error".to_string());
            error!("[Connect] Token refresh failed: {}", msg);
            return Err(ApiError::Unauthorized(format!("Session expired. Please sign in again. ({})", msg)));
        }
        error!("[Connect] Token refresh failed with status {}: {}", status, body);
        return Err(ApiError::Unauthorized("Session expired. Please sign in again.".to_string()));
    }

    let token_response: SupabaseTokenResponse = serde_json::from_str(&body)
        .map_err(|e| ApiError::Internal(format!("Failed to parse token response: {}", e)))?;

    debug!("[Connect] Access token refreshed successfully");
    Ok(token_response.access_token)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Operations
// ─────────────────────────────────────────────────────────────────────────────

async fn sync_broker_connections(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<SyncConnectionsResponse>> {
    info!("[Connect] Syncing broker connections...");

    let client = create_connect_client(&state).await?;

    // Fetch connections from cloud
    let connections = client
        .list_connections()
        .await
        .map_err(|e| ApiError::Internal(e))?;

    info!("[Connect] Fetched {} connections from cloud", connections.len());

    // Sync to local database
    let result = state
        .connect_sync_service
        .sync_connections(connections)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    info!(
        "[Connect] Synced connections: {} platforms created, {} updated",
        result.platforms_created, result.platforms_updated
    );

    Ok(Json(result))
}

async fn sync_broker_accounts(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<SyncAccountsResponse>> {
    info!("[Connect] Syncing broker accounts...");

    let client = create_connect_client(&state).await?;

    // Fetch accounts from cloud
    let accounts = client
        .list_accounts()
        .await
        .map_err(|e| ApiError::Internal(e))?;

    info!("[Connect] Fetched {} accounts from cloud", accounts.len());

    // Sync to local database
    let result = state
        .connect_sync_service
        .sync_accounts(accounts)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    info!(
        "[Connect] Synced accounts: {} created, {} updated, {} skipped",
        result.created, result.updated, result.skipped
    );

    Ok(Json(result))
}

async fn sync_broker_activities(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<SyncActivitiesResponse>> {
    info!("[Connect] Syncing broker activities...");

    let client = create_connect_client(&state).await?;

    // Get synced accounts (those with external_id)
    let synced_accounts = state
        .connect_sync_service
        .get_synced_accounts()
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    let mut total_activities_upserted = 0;
    let mut total_assets_inserted = 0;
    let mut accounts_synced = 0;
    let mut accounts_failed = 0;

    for account in &synced_accounts {
        let external_id = match &account.external_id {
            Some(id) => id,
            None => continue,
        };

        info!(
            "[Connect] Syncing activities for account: {} ({})",
            account.name, external_id
        );

        // Mark sync attempt
        state
            .connect_sync_service
            .mark_activity_sync_attempt(account.id.clone())
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;

        // Get last sync date for incremental sync
        let start_date = state
            .connect_sync_service
            .get_activity_sync_state(&account.id)
            .map_err(|e| ApiError::Internal(e.to_string()))?
            .and_then(|s| s.last_synced_date);

        // Fetch activities from cloud
        match client
            .get_activities(external_id, start_date.as_deref())
            .await
        {
            Ok(paginated) => {
                let activities = paginated.data;
                let count = activities.len();

                if count > 0 {
                    match state
                        .connect_sync_service
                        .upsert_account_activities(account.id.clone(), activities)
                        .await
                    {
                        Ok((upserted, assets)) => {
                            total_activities_upserted += upserted;
                            total_assets_inserted += assets;

                            // Mark success with current date
                            let now = chrono::Utc::now().to_rfc3339();
                            let _ = state
                                .connect_sync_service
                                .finalize_activity_sync_success(account.id.clone(), now)
                                .await;

                            accounts_synced += 1;
                            info!(
                                "[Connect] Synced {} activities for account {}",
                                upserted, account.name
                            );
                        }
                        Err(e) => {
                            error!(
                                "[Connect] Failed to upsert activities for {}: {}",
                                account.name, e
                            );
                            let _ = state
                                .connect_sync_service
                                .finalize_activity_sync_failure(account.id.clone(), e.to_string())
                                .await;
                            accounts_failed += 1;
                        }
                    }
                } else {
                    accounts_synced += 1;
                    debug!("[Connect] No new activities for account {}", account.name);
                }
            }
            Err(e) => {
                error!(
                    "[Connect] Failed to fetch activities for {}: {}",
                    account.name, e
                );
                let _ = state
                    .connect_sync_service
                    .finalize_activity_sync_failure(account.id.clone(), e.clone())
                    .await;
                accounts_failed += 1;
            }
        }
    }

    info!(
        "[Connect] Activities sync complete: {} accounts synced, {} failed, {} activities upserted",
        accounts_synced, accounts_failed, total_activities_upserted
    );

    Ok(Json(SyncActivitiesResponse {
        accounts_synced,
        activities_upserted: total_activities_upserted,
        assets_inserted: total_assets_inserted,
        accounts_failed,
    }))
}

async fn get_connect_portal(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ConnectPortalRequest>,
) -> ApiResult<Json<wealthfolio_connect::ConnectPortalResponse>> {
    info!("[Connect] Getting connect portal URL...");

    let client = create_connect_client(&state).await?;

    let result = client
        .get_connect_portal(&request)
        .await
        .map_err(|e| ApiError::Internal(e))?;

    Ok(Json(result))
}

async fn get_subscription_plans(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<PlansResponse>> {
    info!("[Connect] Getting subscription plans...");

    let client = create_connect_client(&state).await?;

    let result = client
        .get_subscription_plans()
        .await
        .map_err(|e| ApiError::Internal(e))?;

    Ok(Json(result))
}

async fn get_user_info(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<UserInfo>> {
    info!("[Connect] Getting user info...");

    let client = create_connect_client(&state).await?;

    let result = client
        .get_user_info()
        .await
        .map_err(|e| ApiError::Internal(e))?;

    Ok(Json(result))
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        // Session management
        .route("/connect/session", post(store_sync_session))
        .route("/connect/session", delete(clear_sync_session))
        .route("/connect/session/status", get(get_sync_session_status))
        // Sync operations
        .route("/connect/sync/connections", post(sync_broker_connections))
        .route("/connect/sync/accounts", post(sync_broker_accounts))
        .route("/connect/sync/activities", post(sync_broker_activities))
        // Portal
        .route("/connect/portal", post(get_connect_portal))
        // User & Subscription
        .route("/connect/plans", get(get_subscription_plans))
        .route("/connect/user", get(get_user_info))
}
