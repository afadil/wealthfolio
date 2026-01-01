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
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use tracing::{debug, error, info};

use crate::error::{ApiError, ApiResult};
use crate::main_lib::AppState;
use wealthfolio_connect::broker::{
    AccountUniversalActivity, AccountUniversalActivityCurrency, AccountUniversalActivitySymbol,
    BrokerAccount, BrokerAccountBalance, BrokerBalanceAmount, BrokerConnection,
    BrokerConnectionBrokerage, ConnectPortalRequest, ConnectPortalResponse, PlansResponse,
    PlanPricing, PlanPricingPeriods, SubscriptionPlan, SyncAccountsResponse, SyncActivitiesResponse,
    SyncConnectionsResponse, UserInfo, UserTeam,
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

/// Simple REST client for Connect API
struct ConnectClient {
    client: reqwest::Client,
    base_url: String,
}

impl ConnectClient {
    fn new(base_url: &str, token: &str) -> Result<Self, ApiError> {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        let auth_value = HeaderValue::from_str(&format!("Bearer {}", token))
            .map_err(|e| ApiError::Internal(format!("Invalid token format: {}", e)))?;
        headers.insert(AUTHORIZATION, auth_value);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .default_headers(headers)
            .build()
            .map_err(|e| ApiError::Internal(format!("Failed to create HTTP client: {}", e)))?;

        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
        })
    }

    async fn get<T: serde::de::DeserializeOwned>(&self, path: &str) -> ApiResult<T> {
        let url = format!("{}{}", self.base_url, path);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;

        if !status.is_success() {
            return Err(ApiError::Internal(format!("API error {}: {}", status, body)));
        }

        serde_json::from_str(&body)
            .map_err(|e| ApiError::Internal(format!("Failed to parse response: {}", e)))
    }
}

/// Create a ConnectClient with a fresh access token
async fn create_connect_client(state: &AppState) -> ApiResult<ConnectClient> {
    let token = mint_access_token(state).await?;
    ConnectClient::new(&cloud_api_base_url(), &token)
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types (from REST API)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ApiConnectionsResponse {
    connections: Vec<ApiConnection>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiConnection {
    id: String,
    brokerage_name: Option<String>,
    brokerage_slug: Option<String>,
    disabled: Option<bool>,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiAccount {
    id: String,
    connection_id: Option<String>,
    account_number: Option<String>,
    name: Option<String>,
    account_type: Option<String>,
    currency: Option<String>,
    cash: Option<f64>,
    meta: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ApiActivitiesResponse {
    data: Vec<ApiActivity>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiActivity {
    id: Option<String>,
    account_id: Option<String>,
    raw_description: Option<String>,
    activity_type: Option<String>,
    trade_date: Option<String>,
    settle_date: Option<String>,
    quantity: Option<f64>,
    unit_price: Option<f64>,
    net_amount: Option<f64>,
    fee: Option<f64>,
    currency: Option<String>,
    symbol: Option<String>,
    asset_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiPlansResponse {
    plans: Vec<ApiPlan>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiPlan {
    id: String,
    name: String,
    description: String,
    features: Vec<String>,
    pricing: ApiPlanPricing,
}

#[derive(Debug, Deserialize)]
struct ApiPlanPricing {
    monthly: f64,
    yearly: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiUser {
    id: String,
    email: String,
    full_name: Option<String>,
    avatar_url: Option<String>,
    locale: Option<String>,
    week_starts_on_monday: Option<bool>,
    timezone: Option<String>,
    timezone_auto_sync: Option<bool>,
    time_format: Option<i32>,
    date_format: Option<String>,
    team_id: Option<String>,
    team_role: Option<String>,
    team: Option<ApiTeam>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiTeam {
    id: String,
    name: String,
    logo_url: String,
    plan: String,
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
            let msg = err
                .error_description
                .or(err.error)
                .unwrap_or_else(|| "Unknown error".to_string());
            error!("[Connect] Token refresh failed: {}", msg);
            return Err(ApiError::Unauthorized(format!(
                "Session expired. Please sign in again. ({})",
                msg
            )));
        }
        error!(
            "[Connect] Token refresh failed with status {}: {}",
            status, body
        );
        return Err(ApiError::Unauthorized(
            "Session expired. Please sign in again.".to_string(),
        ));
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
    let api_response: ApiConnectionsResponse =
        client.get("/api/v1/brokerage/connections").await?;

    // Convert API response to broker module types
    let connections: Vec<BrokerConnection> = api_response
        .connections
        .into_iter()
        .map(|c| BrokerConnection {
            id: c.id,
            brokerage: Some(BrokerConnectionBrokerage {
                id: None,
                slug: c.brokerage_slug,
                name: c.brokerage_name.clone(),
                display_name: c.brokerage_name,
                aws_s3_logo_url: None,
                aws_s3_square_logo_url: None,
            }),
            connection_type: None,
            disabled: c.disabled.unwrap_or(false),
            disabled_date: None,
            updated_at: c.updated_at,
        })
        .collect();

    info!(
        "[Connect] Fetched {} connections from cloud",
        connections.len()
    );

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
    let api_accounts: Vec<ApiAccount> = client.get("/api/v1/sync/brokers/accounts").await?;

    // Convert API response to broker module types
    let accounts: Vec<BrokerAccount> = api_accounts
        .into_iter()
        .map(|a| BrokerAccount {
            id: a.id,
            brokerage_authorization: a.connection_id.unwrap_or_default(),
            name: a.name,
            account_number: a.account_number.unwrap_or_default(),
            institution_name: String::new(), // Will be filled from connection
            created_date: None,
            sync_status: None,
            balance: Some(BrokerAccountBalance {
                total: Some(BrokerBalanceAmount {
                    amount: a.cash,
                    currency: a.currency,
                }),
            }),
            status: None,
            raw_type: a.account_type,
            is_paper: false,
            meta: a.meta,
        })
        .collect();

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

    // Get synced accounts (those with provider_account_id)
    let synced_accounts = state
        .connect_sync_service
        .get_synced_accounts()
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    let mut total_activities_upserted = 0;
    let mut total_assets_inserted = 0;
    let mut accounts_synced = 0;
    let mut accounts_failed = 0;

    for account in &synced_accounts {
        let provider_account_id = match &account.provider_account_id {
            Some(id) => id,
            None => continue,
        };

        info!(
            "[Connect] Syncing activities for account: {} ({})",
            account.name, provider_account_id
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
            .and_then(|s| s.last_successful_at)
            .map(|dt| dt.format("%Y-%m-%d").to_string());

        // Build URL with query params
        let mut url = format!(
            "/api/v1/sync/brokers/accounts/{}/activities",
            provider_account_id
        );
        if let Some(ref date) = start_date {
            url = format!("{}?startDate={}", url, date);
        }

        // Fetch activities from cloud
        match client.get::<ApiActivitiesResponse>(&url).await {
            Ok(api_response) => {
                // Convert API response to broker module types
                let activities: Vec<AccountUniversalActivity> = api_response
                    .data
                    .into_iter()
                    .map(|a| AccountUniversalActivity {
                        id: a.id.clone(),
                        symbol: a.symbol.map(|s| AccountUniversalActivitySymbol {
                            id: None,
                            symbol: Some(s),
                            raw_symbol: None,
                            description: a.asset_name.clone(),
                            symbol_type: None,
                        }),
                        option_symbol: None,
                        price: a.unit_price,
                        units: a.quantity,
                        amount: a.net_amount,
                        currency: a.currency.map(|c| AccountUniversalActivityCurrency {
                            id: None,
                            code: Some(c),
                            name: None,
                        }),
                        activity_type: a.activity_type,
                        option_type: None,
                        description: a.raw_description,
                        trade_date: a.trade_date,
                        settlement_date: a.settle_date,
                        fee: a.fee,
                        fx_rate: None,
                        institution: None,
                        external_reference_id: a.id,
                        provider_type: None,
                    })
                    .collect();
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
                    .finalize_activity_sync_failure(account.id.clone(), e.to_string())
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
    State(_state): State<Arc<AppState>>,
    Json(_request): Json<ConnectPortalRequest>,
) -> ApiResult<Json<ConnectPortalResponse>> {
    // This endpoint is not available in the new REST API
    // The portal URL should be constructed client-side or via a different mechanism
    Err(ApiError::Internal(
        "Connect portal endpoint not available in REST API".to_string(),
    ))
}

async fn get_subscription_plans(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<PlansResponse>> {
    info!("[Connect] Getting subscription plans...");

    let client = create_connect_client(&state).await?;

    let api_response: ApiPlansResponse = client.get("/api/v1/subscription/plans").await?;

    // Convert to PlansResponse
    let plans = api_response
        .plans
        .into_iter()
        .map(|p| SubscriptionPlan {
            id: p.id,
            name: p.name,
            description: p.description,
            features: p.features,
            pricing: PlanPricingPeriods {
                monthly: PlanPricing {
                    amount: p.pricing.monthly,
                    currency: "USD".to_string(),
                    price_id: None,
                },
                yearly: PlanPricing {
                    amount: p.pricing.yearly,
                    currency: "USD".to_string(),
                    price_id: None,
                },
            },
        })
        .collect();

    Ok(Json(PlansResponse { plans }))
}

async fn get_user_info(State(state): State<Arc<AppState>>) -> ApiResult<Json<UserInfo>> {
    info!("[Connect] Getting user info...");

    let client = create_connect_client(&state).await?;

    let api_user: Option<ApiUser> = client.get("/api/v1/user/me").await?;

    // Convert to UserInfo (handle nullable response)
    let user = api_user.ok_or_else(|| ApiError::Internal("No user info returned".to_string()))?;

    Ok(Json(UserInfo {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        locale: user.locale,
        week_starts_on_monday: user.week_starts_on_monday,
        timezone: user.timezone,
        timezone_auto_sync: user.timezone_auto_sync,
        time_format: user.time_format,
        date_format: user.date_format,
        team_id: user.team_id,
        team_role: user.team_role,
        team: user.team.map(|t| UserTeam {
            id: t.id,
            name: t.name,
            logo_url: Some(t.logo_url),
            plan: t.plan,
            subscription_status: None,
            subscription_current_period_end: None,
            subscription_cancel_at_period_end: None,
            trial_ends_at: None,
        }),
    }))
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
