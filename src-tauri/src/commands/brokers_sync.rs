//! Commands for syncing broker data from the cloud API.

use log::{debug, info};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
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
        let url = format!("{}/trpc/brokerage.listConnections", self.base_url);
        debug!("Fetching connections from: {}", url);

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

        let trpc_response: TrpcResponse<Vec<BrokerConnection>> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse connections response: {}", e))?;

        Ok(trpc_response.result.data)
    }

    /// Fetch broker accounts via tRPC
    async fn list_accounts(
        &self,
        authorization_ids: Option<Vec<String>>,
    ) -> Result<Vec<BrokerAccount>, String> {
        let mut url = format!("{}/trpc/brokerage.listAccounts", self.base_url);

        // Add query params if authorization_ids provided
        if let Some(ids) = authorization_ids {
            let input = serde_json::json!({ "authorizationIds": ids });
            let input_str = input.to_string();
            let encoded = urlencoding::encode(&input_str);
            url = format!("{}?input={}", url, encoded);
        }

        debug!("Fetching accounts from: {}", url);

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

        let trpc_response: TrpcResponse<Vec<BrokerAccount>> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse accounts response: {}", e))?;

        Ok(trpc_response.result.data)
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

        let trpc_response: TrpcResponse<ConnectPortalResponse> = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse connect portal response: {}", e))?;

        Ok(trpc_response.result.data)
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
    let accounts = client.list_accounts(None).await?;
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
