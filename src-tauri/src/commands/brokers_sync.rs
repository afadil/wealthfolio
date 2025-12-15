//! Commands for syncing broker data from the cloud API.

use log::{debug, info};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

use crate::context::ServiceContext;
use crate::secret_store::KeyringSecretStore;
use wealthfolio_core::secrets::SecretStore;
use wealthfolio_core::sync::{
    BrokerAccount, BrokerConnection, ConnectPortalRequest, ConnectPortalResponse, Platform,
    SyncAccountsResponse, SyncConnectionsResponse,
};

/// Secret key for storing the cloud API access token (same as frontend)
const CLOUD_ACCESS_TOKEN_KEY: &str = "wealthfolio_sync_access_token";

/// Default base URL for Wealthfolio Sync cloud service.
/// Override with `WEALTHFOLIO_SYNC_API_URL` (preferred) or `API_URL` (legacy/dev).
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
    std::env::var("WEALTHFOLIO_SYNC_API_URL")
        .ok()
        .or_else(|| std::env::var("API_URL").ok())
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

fn parse_trpc_body<T: DeserializeOwned>(status: reqwest::StatusCode, body: &str) -> Result<T, String> {
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
        TrpcEnvelope::Batch(items) => items
            .into_iter()
            .next()
            .ok_or_else(|| "Empty batched tRPC response".to_string())?
            .result
            .data,
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

        let body = serde_json::json!({ "authorizationId": authorization_id });

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
    ) -> Result<ConnectPortalResponse, String> {
        let url = format!("{}/trpc/brokerage.getConnectionPortalUrl", self.base_url);
        debug!("Getting connect portal URL");

        let body = ConnectPortalRequest {
            reconnect_authorization_id,
        };

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

    Ok(SyncResult {
        success: true,
        message: format!(
            "Sync completed. {} platforms, {} accounts created.",
            connections_result.platforms_created, accounts_result.created
        ),
        connections_synced: Some(connections_result),
        accounts_synced: Some(accounts_result),
    })
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

/// Helper function to create an API client from stored credentials
fn create_api_client() -> Result<CloudApiClient, String> {
    let access_token = KeyringSecretStore
        .get_secret(CLOUD_ACCESS_TOKEN_KEY)
        .map_err(|e| format!("Failed to get access token: {}", e))?
        .ok_or_else(|| "No access token configured. Please sign in first.".to_string())?;

    CloudApiClient::try_new(cloud_api_base_url(), access_token)
}

/// List broker connections from the cloud API
/// The access token is retrieved securely from the keyring - never exposed to frontend
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
/// The access token is retrieved securely from the keyring - never exposed to frontend
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
/// The access token is retrieved securely from the keyring - never exposed to frontend
#[tauri::command]
pub async fn get_connect_portal_url(
    reconnect_authorization_id: Option<String>,
    _state: State<'_, Arc<ServiceContext>>,
) -> Result<ConnectPortalResponse, String> {
    info!("Getting connect portal URL from cloud API...");

    let client = create_api_client()?;
    let response = client
        .get_connect_portal_url(reconnect_authorization_id)
        .await?;

    info!("Connect portal URL retrieved successfully");
    Ok(response)
}
