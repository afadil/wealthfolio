//! Commands for syncing broker data from the cloud API.

use log::{debug, error, info};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use wealthfolio_connect::{
    BrokerAccount, BrokerConnection, ConnectPortalResponse, PaginatedUniversalActivity, Platform,
    SyncAccountsResponse, SyncActivitiesResponse, SyncConnectionsResponse,
};
use wealthfolio_core::secrets::SecretStore;

/// Secret key for storing the cloud API access token (same as frontend)
/// Note: SecretStore adds "wealthfolio_" prefix automatically
const CLOUD_ACCESS_TOKEN_KEY: &str = "sync_access_token";

/// Default base URL for Wealthfolio Connect cloud service.
/// Override with `CONNECT_API_URL` environment variable.
const DEFAULT_CLOUD_API_URL: &str = "https://api.wealthfolio.app";

fn normalize_cloud_api_base_url(raw: &str) -> String {
    let mut url = raw.trim().trim_end_matches('/').to_string();

    // Support legacy env values that include `/trpc`, since we append `/trpc/<procedure>`.
    if let Some(stripped) = url.strip_suffix("/trpc") {
        url = stripped.trim_end_matches('/').to_string();
    }

    url
}

fn cloud_api_base_url() -> String {
    std::env::var("CONNECT_API_URL")
        .ok()
        .map(|v| normalize_cloud_api_base_url(&v))
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CLOUD_API_URL.to_string())
}

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

/// Response wrapper for tRPC calls
#[derive(Debug, Deserialize)]
struct TrpcResponse<T> {
    result: TrpcResult<T>,
}

#[derive(Debug, Deserialize)]
struct TrpcResult<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TrpcEnvelope<T> {
    Single(TrpcResponse<T>),
    Batch(Vec<TrpcResponse<T>>),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TrpcData<T> {
    Json { json: T },
    Raw(T),
}

impl<T> TrpcData<T> {
    fn into_inner(self) -> T {
        match self {
            Self::Raw(v) => v,
            Self::Json { json } => json,
        }
    }
}

async fn parse_trpc_response<T: DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    parse_trpc_body(status, &body)
}

fn parse_trpc_body<T: DeserializeOwned>(
    status: reqwest::StatusCode,
    body: &str,
) -> Result<T, String> {
    let envelope: TrpcEnvelope<TrpcData<T>> = serde_json::from_str(body).map_err(|e| {
        // tRPC can return errors with HTTP 200 (especially for query procedures).
        // Try to surface a clean error message without logging the full response body.
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
            let message = v
                .pointer("/error/message")
                .and_then(|m| m.as_str())
                .or_else(|| v.pointer("/0/error/message").and_then(|m| m.as_str()));
            if let Some(message) = message {
                return format!("tRPC error (status {}): {}", status, message);
            }
        }

        format!("Failed to parse tRPC response (status {}): {}", status, e)
    })?;

    let data = match envelope {
        TrpcEnvelope::Single(r) => r.result.data,
        TrpcEnvelope::Batch(items) => {
            items
                .into_iter()
                .next()
                .ok_or_else(|| "Empty batched tRPC response".to_string())?
                .result
                .data
        }
    };

    Ok(data.into_inner())
}

/// HTTP client for the cloud broker API
struct CloudApiClient {
    client: reqwest::Client,
    base_url: String,
    auth_header: HeaderValue,
}

impl CloudApiClient {
    fn try_new(base_url: String, access_token: String) -> Result<Self, String> {
        let auth_header = HeaderValue::from_str(&format!("Bearer {}", access_token))
            .map_err(|e| format!("Invalid access token: {}", e))?;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

        Ok(Self {
            client,
            base_url,
            auth_header,
        })
    }

    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(AUTHORIZATION, self.auth_header.clone());
        headers
    }

    /// Fetch broker connections via tRPC
    async fn list_connections(&self) -> Result<Vec<BrokerConnection>, String> {
        let safe_url = format!("{}/trpc/brokerage.listConnections", self.base_url);
        debug!("Fetching connections from: {}", safe_url);

        // Use SuperJSON-style envelope (`{ json: ... }`) for compatibility.
        let input = serde_json::json!({ "json": serde_json::json!({}) });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let url = format!("{}?input={}", safe_url, encoded);

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch connections: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error fetching connections: {} - {}",
                status, body
            ));
        }

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ListConnectionsPayload {
            #[serde(default)]
            #[serde(
                alias = "brokerageAuthorizations",
                alias = "brokerage_authorizations",
                alias = "authorizations"
            )]
            connections: Vec<BrokerConnection>,
        }

        #[derive(Debug, Deserialize)]
        #[serde(untagged)]
        enum ListConnectionsResult {
            Connections(Vec<BrokerConnection>),
            Payload(ListConnectionsPayload),
        }

        let raw_connections_count = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| {
                let candidates = [
                    "/result/data/json/connections",
                    "/result/data/json/brokerageAuthorizations",
                    "/result/data/json/authorizations",
                    "/result/data/json",
                    "/result/data/connections",
                    "/result/data/brokerageAuthorizations",
                    "/result/data/authorizations",
                    "/result/data",
                    "/0/result/data/json/connections",
                    "/0/result/data/json/brokerageAuthorizations",
                    "/0/result/data/json/authorizations",
                    "/0/result/data/json",
                    "/0/result/data/connections",
                    "/0/result/data/brokerageAuthorizations",
                    "/0/result/data/authorizations",
                    "/0/result/data",
                ];

                for pointer in candidates {
                    let node = v.pointer(pointer)?;
                    if let Some(arr) = node.as_array() {
                        return Some((pointer, arr.len()));
                    }
                }

                None
            });

        let result = parse_trpc_body::<ListConnectionsResult>(status, &body)?;
        let mut connections = match result {
            ListConnectionsResult::Connections(connections) => connections,
            ListConnectionsResult::Payload(payload) => payload.connections,
        };

        if connections.is_empty() {
            if let Some((pointer, count)) = raw_connections_count {
                if count > 0 {
                    debug!(
                        "Parsed 0 connections, but response contains {} at pointer {}",
                        count, pointer
                    );

                    // Fallback: extract and deserialize the connections array directly from the body.
                    // This avoids silently returning an empty list if our wrapper structs drift from API shape.
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
                        if let Some(node) = v.pointer(pointer) {
                            match serde_json::from_value::<Vec<BrokerConnection>>(node.clone()) {
                                Ok(recovered) if !recovered.is_empty() => {
                                    connections = recovered;
                                }
                                Ok(_) => {}
                                Err(e) => {
                                    return Err(format!(
                                        "Failed to parse connections at {}: {}",
                                        pointer, e
                                    ));
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(connections)
    }

    /// Fetch broker accounts via tRPC
    async fn list_accounts(
        &self,
        authorization_ids: Option<Vec<String>>,
    ) -> Result<Vec<BrokerAccount>, String> {
        let safe_url = format!("{}/trpc/brokerage.listAccounts", self.base_url);

        // Hono/tRPC endpoint requires `input` even if all fields are optional.
        // Use SuperJSON-style envelope (`{ json: ... }`) for compatibility.
        let json_input = match authorization_ids {
            Some(ids) if !ids.is_empty() => serde_json::json!({ "authorizationIds": ids }),
            _ => serde_json::json!({}),
        };
        let input = serde_json::json!({ "json": json_input });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let url = format!("{}?input={}", safe_url, encoded);

        debug!("Fetching accounts from: {}", safe_url);

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch accounts: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error fetching accounts: {} - {}",
                status, body
            ));
        }

        #[derive(Debug, Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct ListAccountsPayload {
            accounts: Option<Vec<BrokerAccount>>,
            #[serde(alias = "brokerAccounts", alias = "broker_accounts")]
            broker_accounts: Option<Vec<BrokerAccount>>,
        }

        #[derive(Debug, Deserialize)]
        #[serde(untagged)]
        enum ListAccountsResult {
            Accounts(Vec<BrokerAccount>),
            Payload(ListAccountsPayload),
        }

        let result = parse_trpc_response::<ListAccountsResult>(response).await?;
        Ok(match result {
            ListAccountsResult::Accounts(accounts) => accounts,
            ListAccountsResult::Payload(payload) => payload
                .accounts
                .or(payload.broker_accounts)
                .unwrap_or_default(),
        })
    }

    /// Remove a broker connection via tRPC
    async fn remove_connection(&self, authorization_id: &str) -> Result<(), String> {
        let url = format!("{}/trpc/brokerage.removeConnection", self.base_url);
        debug!("Removing connection: {}", authorization_id);

        // Wrap in SuperJSON envelope for tRPC compatibility
        let inner = serde_json::json!({ "authorizationId": authorization_id });
        let body = serde_json::json!({ "json": inner });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to remove connection: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error removing connection: {} - {}",
                status, body
            ));
        }

        info!("Connection {} removed successfully", authorization_id);
        Ok(())
    }

    /// Get connect portal URL via tRPC
    async fn get_connect_portal_url(
        &self,
        reconnect_authorization_id: Option<String>,
        redirect_url: Option<String>,
    ) -> Result<ConnectPortalResponse, String> {
        let url = format!("{}/trpc/brokerage.getConnectionPortalUrl", self.base_url);
        debug!("Getting connect portal URL");

        // Build inner JSON with optional fields
        let mut inner = serde_json::Map::new();
        if let Some(id) = reconnect_authorization_id {
            inner.insert(
                "reconnectAuthorizationId".to_string(),
                serde_json::json!(id),
            );
        }
        if let Some(url) = redirect_url {
            inner.insert("redirectUrl".to_string(), serde_json::json!(url));
        }
        let body = serde_json::json!({ "json": serde_json::Value::Object(inner) });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to get connect portal URL: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error getting connect portal URL: {} - {}",
                status, body
            ));
        }

        parse_trpc_response::<ConnectPortalResponse>(response).await
    }

    /// Fetch broker account activities via tRPC (paginated).
    async fn get_account_activities(
        &self,
        account_id: &str,
        start_date: Option<String>,
        end_date: Option<String>,
        offset: Option<i64>,
        limit: Option<i64>,
    ) -> Result<PaginatedUniversalActivity, String> {
        let safe_url = format!("{}/trpc/brokerage.getAccountActivities", self.base_url);

        let mut inner = serde_json::Map::new();
        inner.insert("accountId".to_string(), serde_json::json!(account_id));
        if let Some(v) = start_date {
            inner.insert("startDate".to_string(), serde_json::json!(v));
        }
        if let Some(v) = end_date {
            inner.insert("endDate".to_string(), serde_json::json!(v));
        }
        if let Some(v) = offset {
            inner.insert("offset".to_string(), serde_json::json!(v));
        }
        if let Some(v) = limit {
            inner.insert("limit".to_string(), serde_json::json!(v));
        }

        let input = serde_json::json!({ "json": serde_json::Value::Object(inner) });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let url = format!("{}?input={}", safe_url, encoded);

        debug!("Fetching activities from: {}", safe_url);

        let mut attempt: usize = 0;
        let max_attempts: usize = 3;
        loop {
            attempt += 1;
            let response = self
                .client
                .get(&url)
                .headers(self.headers())
                .send()
                .await
                .map_err(|e| format!("Failed to fetch activities: {}", e))?;

            if response.status().is_success() {
                return parse_trpc_response::<PaginatedUniversalActivity>(response).await;
            }

            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            let is_retryable = status.as_u16() == 429 || status.is_server_error();

            if attempt >= max_attempts || !is_retryable {
                return Err(format!(
                    "API error fetching activities: {} - {}",
                    status, body
                ));
            }

            let backoff_ms = 500_u64.saturating_mul(2_u64.saturating_pow((attempt - 1) as u32));
            info!(
                "Retrying getAccountActivities (attempt {}/{}), status {}",
                attempt + 1,
                max_attempts,
                status
            );
            tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
        }
    }
}

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

/// Sync broker data from the cloud API
#[tauri::command]
pub async fn sync_broker_data(state: State<'_, Arc<ServiceContext>>) -> Result<SyncResult, String> {
    info!("Starting broker data sync...");

    let client = create_api_client()?;

    // Step 1: Fetch and sync connections (platforms)
    info!("Fetching broker connections...");
    let connections = client.list_connections().await?;
    info!("Found {} broker connections", connections.len());

    let connections_result = state
        .sync_service()
        .sync_connections(connections.clone())
        .await
        .map_err(|e| format!("Failed to sync connections: {}", e))?;

    info!(
        "Connections synced: {} created, {} updated",
        connections_result.platforms_created, connections_result.platforms_updated
    );

    // Step 2: Fetch and sync accounts
    info!("Fetching broker accounts...");
    let authorization_ids: Vec<String> = connections.iter().map(|c| c.id.clone()).collect();
    let accounts = client
        .list_accounts(if authorization_ids.is_empty() {
            None
        } else {
            Some(authorization_ids)
        })
        .await?;
    info!("Found {} broker accounts", accounts.len());

    let accounts_result = state
        .sync_service()
        .sync_accounts(accounts)
        .await
        .map_err(|e| format!("Failed to sync accounts: {}", e))?;

    info!(
        "Accounts synced: {} created, {} updated, {} skipped",
        accounts_result.created, accounts_result.updated, accounts_result.skipped
    );

    // Step 3: Fetch and sync activities for all synced accounts (incremental per account)
    // If there is no stored sync state for an account, we omit start/end dates to fetch all
    // available activities from the provider.
    let end_date = chrono::Utc::now().date_naive();

    let synced_accounts = state
        .sync_service()
        .get_synced_accounts()
        .map_err(|e| format!("Failed to get synced accounts: {}", e))?;

    let mut activities_summary = SyncActivitiesResponse::default();
    let mut activity_errors: Vec<String> = Vec::new();

    for account in synced_accounts {
        let Some(broker_account_id) = account.external_id.clone() else {
            continue;
        };

        let account_id = account.id.clone();
        let account_name = account.name.clone();
        if let Err(err) = state
            .sync_service()
            .mark_activity_sync_attempt(account_id.clone())
            .await
            .map_err(|e| format!("Failed to mark activity sync attempt: {}", e))
        {
            activity_errors.push(format!("{}: {}", account_name, err));
            continue;
        }

        let (start_date, end_date_filter) =
            compute_activity_query_window(&state, &account, end_date)
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
                let _ = state
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
                    start_date.clone(),
                    end_date_filter.clone(),
                    Some(offset),
                    Some(limit),
                )
                .await
            {
                Ok(p) => p,
                Err(e) => {
                    let _ = state
                        .sync_service()
                        .finalize_activity_sync_failure(account_id.clone(), e.clone())
                        .await;
                    activity_errors.push(format!("{}: {}", account_name, e));
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
                                let _ = state
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

                match state
                    .sync_service()
                    .upsert_account_activities(account_id.clone(), data.clone())
                    .await
                {
                    Ok((activities_upserted, assets_inserted)) => {
                        activities_summary.activities_upserted += activities_upserted;
                        activities_summary.assets_inserted += assets_inserted;
                    }
                    Err(e) => {
                        let e = format!("Failed to upsert activities: {}", e);
                        let _ = state
                            .sync_service()
                            .finalize_activity_sync_failure(account_id.clone(), e.clone())
                            .await;
                        activity_errors.push(format!("{}: {}", account_name, e));
                        account_failed = true;
                        break;
                    }
                }
            }

            let (page_total, page_limit) = page
                .pagination
                .as_ref()
                .map(|p| (p.total.unwrap_or(0), p.limit.unwrap_or(limit)))
                .unwrap_or((0, limit));

            offset += page_limit;

            if page_total > 0 {
                if offset >= page_total {
                    break;
                }
            } else if data.len() < limit as usize {
                break;
            }
        }

        if !account_failed {
            let last_synced_date = end_date;
            if let Err(e) = state
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

fn parse_naive_date(input: &str) -> Option<chrono::NaiveDate> {
    if let Ok(d) = chrono::NaiveDate::parse_from_str(input, "%Y-%m-%d") {
        return Some(d);
    }
    chrono::DateTime::parse_from_rfc3339(input)
        .ok()
        .map(|dt| dt.date_naive())
}

fn compute_activity_query_window(
    state: &State<'_, Arc<ServiceContext>>,
    account: &wealthfolio_core::accounts::Account,
    end_date: chrono::NaiveDate,
) -> Result<(Option<String>, Option<String>), String> {
    let sync_state = state
        .sync_service()
        .get_activity_sync_state(&account.id)
        .map_err(|e| format!("Failed to read activity sync state: {}", e))?;

    let from_state = sync_state
        .and_then(|s| s.last_synced_date)
        .and_then(|d| parse_naive_date(&d))
        .map(|d| (d - chrono::Days::new(1)).min(end_date));

    if let Some(d) = from_state {
        return Ok((
            Some(d.format("%Y-%m-%d").to_string()),
            Some(end_date.format("%Y-%m-%d").to_string()),
        ));
    }

    Ok((None, None))
}

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
// Broker Connection Management Commands (secure backend-only API calls)
// ─────────────────────────────────────────────────────────────────────────────

fn create_api_client() -> Result<CloudApiClient, String> {
    info!("create_api_client: attempting to get access token from keyring...");
    let access_token = match KeyringSecretStore.get_secret(CLOUD_ACCESS_TOKEN_KEY) {
        Ok(Some(token)) => {
            info!("create_api_client: found access token (length={})", token.len());
            token
        }
        Ok(None) => {
            error!("create_api_client: no access token found in keyring");
            return Err("No access token configured. Please sign in first.".to_string());
        }
        Err(e) => {
            error!("create_api_client: error reading from keyring: {}", e);
            return Err(format!("Failed to get access token: {}", e));
        }
    };

    CloudApiClient::try_new(cloud_api_base_url(), access_token)
}

/// List broker connections from the cloud API
#[tauri::command]
pub async fn list_broker_connections(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<BrokerConnection>, String> {
    info!("Fetching broker connections from cloud API...");

    let client = create_api_client()?;
    let connections = client.list_connections().await?;

    info!("Found {} broker connections", connections.len());
    Ok(connections)
}

/// Remove a broker connection via the cloud API
#[tauri::command]
pub async fn remove_broker_connection(
    authorization_id: String,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    info!("Removing broker connection: {}", authorization_id);

    // Validate input
    if authorization_id.trim().is_empty() {
        return Err("Authorization ID cannot be empty".to_string());
    }

    let client = create_api_client()?;
    client.remove_connection(&authorization_id).await?;

    info!(
        "Broker connection {} removed successfully",
        authorization_id
    );
    Ok(())
}

/// Get the connect portal URL from the cloud API
#[tauri::command]
pub async fn get_connect_portal_url(
    reconnect_authorization_id: Option<String>,
    redirect_url: Option<String>,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<ConnectPortalResponse, String> {
    info!("Getting connect portal URL from cloud API...");

    let client = create_api_client()?;
    let response = client
        .get_connect_portal_url(reconnect_authorization_id, redirect_url)
        .await?;

    info!("Connect portal URL retrieved successfully");
    Ok(response)
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Plans Commands
// ─────────────────────────────────────────────────────────────────────────────

/// A subscription plan as returned by the API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiSubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: String,
    pub features: Vec<String>,
    pub pricing: ApiPlanPricing,
    #[serde(default)]
    pub is_available: Option<bool>,
    #[serde(default)]
    pub yearly_discount_percent: Option<i32>,
}

/// Pricing as returned by the API (just numbers)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiPlanPricing {
    pub monthly: f64,
    pub yearly: f64,
    #[serde(default)]
    pub yearly_per_month: Option<f64>,
}

/// Plans object from API (keyed by plan id)
#[derive(Debug, Clone, Deserialize)]
pub struct ApiPlansMap {
    pub essentials: Option<ApiSubscriptionPlan>,
    pub duo: Option<ApiSubscriptionPlan>,
    pub plus: Option<ApiSubscriptionPlan>,
}

/// Raw response from subscription.plans endpoint
#[derive(Debug, Clone, Deserialize)]
pub struct ApiPlansResponse {
    pub plans: ApiPlansMap,
}

/// Pricing information for a subscription plan (frontend format)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanPricing {
    pub amount: f64,
    pub currency: String,
    pub price_id: Option<String>,
}

/// A subscription plan (frontend format)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: String,
    pub features: Vec<String>,
    pub pricing: SubscriptionPlanPricing,
}

/// Pricing options for a subscription plan (frontend format)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionPlanPricing {
    pub monthly: PlanPricing,
    pub yearly: PlanPricing,
}

/// Response from subscription.plans endpoint (frontend format)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlansResponse {
    pub plans: Vec<SubscriptionPlan>,
}

impl From<ApiSubscriptionPlan> for SubscriptionPlan {
    fn from(api: ApiSubscriptionPlan) -> Self {
        Self {
            id: api.id,
            name: api.name,
            description: api.description,
            features: api.features,
            pricing: SubscriptionPlanPricing {
                monthly: PlanPricing {
                    amount: api.pricing.monthly,
                    currency: "USD".to_string(),
                    price_id: None,
                },
                yearly: PlanPricing {
                    amount: api.pricing.yearly,
                    currency: "USD".to_string(),
                    price_id: None,
                },
            },
        }
    }
}

/// Team info as returned by the user.me tRPC endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserTeam {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub logo_url: Option<String>,
    pub plan: String,
    #[serde(default)]
    pub subscription_status: Option<String>,
    #[serde(default)]
    pub subscription_current_period_end: Option<String>,
    #[serde(default)]
    pub subscription_cancel_at_period_end: Option<bool>,
    #[serde(default)]
    pub trial_ends_at: Option<String>,
    // Allow additional fields without failing deserialization
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

/// User info as returned by the user.me tRPC endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: String,
    #[serde(default)]
    pub full_name: Option<String>,
    pub email: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub locale: Option<String>,
    #[serde(default)]
    pub week_starts_on_monday: Option<bool>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub timezone_auto_sync: Option<bool>,
    #[serde(default)]
    pub time_format: Option<i32>,
    #[serde(default)]
    pub date_format: Option<String>,
    #[serde(default)]
    pub team_id: Option<String>,
    #[serde(default)]
    pub team_role: Option<String>,
    #[serde(default)]
    pub team: Option<UserTeam>,
}

impl CloudApiClient {
    /// Fetch current user info via tRPC
    async fn get_user_info(&self) -> Result<UserInfo, String> {
        let safe_url = format!("{}/trpc/user.me", self.base_url);
        debug!("Fetching user info from: {}", safe_url);

        // Use SuperJSON-style envelope (`{ json: ... }`) for compatibility.
        let input = serde_json::json!({ "json": serde_json::json!({}) });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let url = format!("{}?input={}", safe_url, encoded);

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch user info: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error fetching user info: {} - {}",
                status, body
            ));
        }

        // Parse response manually to handle the tRPC SuperJSON response format
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        let json: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // Extract user data from the nested structure
        // Format: {"result":{"data":{"json":{...user data...}}}}
        let user_data = json
            .pointer("/result/data/json")
            .or_else(|| json.pointer("/result/data"))
            .ok_or_else(|| format!("Missing result.data in response: {}", body))?;

        serde_json::from_value(user_data.clone())
            .map_err(|e| format!("Failed to parse user info: {} - data: {}", e, user_data))
    }

    /// Fetch subscription plans via tRPC
    async fn get_subscription_plans(&self) -> Result<PlansResponse, String> {
        let safe_url = format!("{}/trpc/subscription.plans", self.base_url);
        debug!("Fetching subscription plans from: {}", safe_url);

        // Use SuperJSON-style envelope (`{ json: ... }`) for compatibility.
        let input = serde_json::json!({ "json": serde_json::json!({}) });
        let input_str = input.to_string();
        let encoded = urlencoding::encode(&input_str);
        let url = format!("{}?input={}", safe_url, encoded);

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch subscription plans: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error fetching subscription plans: {} - {}",
                status, body
            ));
        }

        // Parse the API response (plans as object) and convert to frontend format (plans as array)
        let api_response = parse_trpc_response::<ApiPlansResponse>(response).await?;

        let mut plans = Vec::new();
        if let Some(essentials) = api_response.plans.essentials {
            plans.push(SubscriptionPlan::from(essentials));
        }
        if let Some(duo) = api_response.plans.duo {
            plans.push(SubscriptionPlan::from(duo));
        }
        if let Some(plus) = api_response.plans.plus {
            plans.push(SubscriptionPlan::from(plus));
        }

        Ok(PlansResponse { plans })
    }
}

/// Get subscription plans from the cloud API
#[tauri::command]
pub async fn get_subscription_plans(
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<PlansResponse, String> {
    info!("Fetching subscription plans from cloud API...");

    let client = create_api_client()?;
    match client.get_subscription_plans().await {
        Ok(response) => {
            info!("Found {} subscription plans", response.plans.len());
            Ok(response)
        }
        Err(e) => {
            error!("Failed to get subscription plans: {}", e);
            Err(e)
        }
    }
}

/// Get current user info from the cloud API
#[tauri::command]
pub async fn get_user_info(_state: State<'_, Arc<ServiceContext>>) -> Result<UserInfo, String> {
    info!("Fetching user info from cloud API...");

    let client = create_api_client()?;
    match client.get_user_info().await {
        Ok(user_info) => {
            info!("User info retrieved for: {}", user_info.email);
            Ok(user_info)
        }
        Err(e) => {
            error!("Failed to get user info: {}", e);
            Err(e)
        }
    }
}
