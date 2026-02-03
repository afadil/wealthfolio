//! Service for interacting with Wealthfolio Connect cloud API.
//!
//! This service wraps the ConnectApiClient with keyring token retrieval,
//! providing a simple interface for cloud API operations.

use log::{debug, error};

use crate::secret_store::KeyringSecretStore;
use wealthfolio_connect::{ConnectApiClient, DEFAULT_CLOUD_API_URL};
use wealthfolio_core::secrets::SecretStore;

/// Secret key for storing the cloud API access token.
/// Note: SecretStore adds "wealthfolio_" prefix automatically.
const CLOUD_ACCESS_TOKEN_KEY: &str = "sync_access_token";

/// Returns the cloud API base URL from environment or default.
fn cloud_api_base_url() -> String {
    std::env::var("CONNECT_API_URL")
        .ok()
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_CLOUD_API_URL.to_string())
}

/// Service for interacting with Wealthfolio Connect cloud API.
///
/// This service handles keyring token retrieval and provides
/// convenient methods for common cloud API operations.
#[derive(Debug, Default)]
pub struct ConnectService;

impl ConnectService {
    /// Create a new ConnectService instance.
    pub fn new() -> Self {
        Self
    }

    /// Get an authenticated API client using the stored access token.
    ///
    /// # Returns
    ///
    /// Returns `Ok(ConnectApiClient)` if a valid token is found and the client
    /// can be created, or `Err(String)` if no token is configured or an error occurs.
    pub fn get_api_client(&self) -> Result<ConnectApiClient, String> {
        let access_token = match KeyringSecretStore.get_secret(CLOUD_ACCESS_TOKEN_KEY) {
            Ok(Some(token)) => token,
            Ok(None) => {
                debug!("ConnectService: no access token found in keyring");
                return Err("No access token configured. Please sign in first.".to_string());
            }
            Err(e) => {
                error!("ConnectService: error reading from keyring: {}", e);
                return Err(format!("Failed to get access token: {}", e));
            }
        };

        ConnectApiClient::new(&cloud_api_base_url(), &access_token).map_err(|e| e.to_string())
    }

    /// Check if the current user has an active subscription.
    ///
    /// # Returns
    ///
    /// - `Ok(true)` if the user has an active subscription
    /// - `Ok(false)` if the user does not have an active subscription
    /// - `Err(String)` if there's an authentication or API error
    pub async fn has_active_subscription(&self) -> Result<bool, String> {
        let client = self.get_api_client()?;
        client
            .has_active_subscription()
            .await
            .map_err(|e| e.to_string())
    }
}
