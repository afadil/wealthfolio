//! Service for interacting with Wealthfolio Connect cloud API.
//!
//! This service wraps the ConnectApiClient with keyring token retrieval,
//! providing a simple interface for cloud API operations.

use log::{debug, error};

use crate::secret_store::KeyringSecretStore;
use wealthfolio_connect::ConnectApiClient;
use wealthfolio_connect::DEFAULT_CLOUD_API_URL;
use wealthfolio_core::secrets::SecretStore;

/// Secret key for storing the cloud API access token.
/// Note: SecretStore adds "wealthfolio_" prefix automatically.
const CLOUD_ACCESS_TOKEN_KEY: &str = "sync_access_token";

/// Returns true when broker/connect sync was compiled in.
pub fn is_connect_sync_enabled() -> bool {
    cfg!(feature = "connect-sync")
}

/// Returns true when device sync was compiled in.
pub fn is_device_sync_enabled() -> bool {
    cfg!(feature = "device-sync")
}

/// Returns true when any cloud sync feature is compiled in.
pub fn is_cloud_sync_enabled() -> bool {
    is_connect_sync_enabled() || is_device_sync_enabled()
}

/// Returns the cloud API base URL when a sync feature is enabled.
pub fn cloud_api_base_url() -> Option<String> {
    if !is_cloud_sync_enabled() {
        return None;
    }

    option_env!("CONNECT_API_URL")
        .map(|v| v.trim().trim_end_matches('/').to_string())
        .filter(|v| !v.is_empty())
        .or_else(|| Some(DEFAULT_CLOUD_API_URL.to_string()))
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
        if !is_connect_sync_enabled() {
            return Err("Connect sync feature is disabled in this build.".to_string());
        }

        let cloud_api_base_url = cloud_api_base_url().ok_or_else(|| {
            "Cloud API base URL is unavailable. Connect API operations are disabled.".to_string()
        })?;

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

        ConnectApiClient::new(&cloud_api_base_url, &access_token).map_err(|e| e.to_string())
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
