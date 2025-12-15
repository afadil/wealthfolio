//! Models representing broker data from the cloud API.
//! These models mirror the SnapTrade API response structures.

use serde::{Deserialize, Serialize};

/// Broker account balance information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerAccountBalance {
    pub total: Option<BrokerBalanceAmount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerBalanceAmount {
    pub amount: Option<f64>,
    pub currency: Option<String>,
}

/// Sync status for a broker account
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerAccountSyncStatus {
    pub transactions: Option<BrokerSyncStatusDetail>,
    pub holdings: Option<BrokerSyncStatusDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerSyncStatusDetail {
    pub initial_sync_completed: Option<bool>,
    pub last_successful_sync: Option<String>,
}

/// A broker account from the cloud API (mirrors SnapTrade Account)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerAccount {
    /// Unique identifier for the connected brokerage account (UUID)
    pub id: String,

    /// Unique identifier for the connection (brokerage authorization UUID)
    pub brokerage_authorization: String,

    /// Display name for the account
    pub name: Option<String>,

    /// Account number from the broker (may be masked)
    #[serde(rename = "number")]
    pub account_number: String,

    /// Name of the brokerage institution
    pub institution_name: String,

    /// When the account was created in the broker system
    pub created_date: Option<String>,

    /// Sync status information
    pub sync_status: Option<BrokerAccountSyncStatus>,

    /// Account balance information
    pub balance: Option<BrokerAccountBalance>,

    /// Account status: "open", "closed", "archived", "unavailable"
    pub status: Option<String>,

    /// The account type as provided by the brokerage
    pub raw_type: Option<String>,

    /// Whether this is a paper (simulated) trading account
    #[serde(default)]
    pub is_paper: bool,

    /// Additional metadata
    pub meta: Option<serde_json::Value>,
}

/// A brokerage/institution from the cloud API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerBrokerage {
    /// Unique identifier for the brokerage (UUID)
    pub id: Option<String>,

    /// Short, unique identifier (slug) - e.g., "QUESTRADE", "INTERACTIVE_BROKERS"
    pub slug: Option<String>,

    /// Full name of the brokerage
    pub name: Option<String>,

    /// Display-friendly name
    pub display_name: Option<String>,

    /// URL to the brokerage's website
    pub url: Option<String>,

    /// Whether the brokerage is enabled
    #[serde(default)]
    pub enabled: bool,
}

/// A brokerage connection/authorization from the cloud API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerConnection {
    /// Unique identifier for the authorization (UUID)
    pub id: String,

    /// The brokerage information
    pub brokerage: Option<BrokerConnectionBrokerage>,

    /// Connection type (e.g., "read", "trade")
    #[serde(rename = "type")]
    pub connection_type: Option<String>,

    /// Whether the connection is disabled
    #[serde(default)]
    pub disabled: bool,

    /// When the connection was disabled
    pub disabled_date: Option<String>,

    /// When the connection was last updated
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerConnectionBrokerage {
    pub id: Option<String>,
    pub slug: Option<String>,
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub aws_s3_logo_url: Option<String>,
    pub aws_s3_square_logo_url: Option<String>,
}

/// Response from the connect portal URL request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectPortalResponse {
    pub redirect_uri: Option<String>,
}

/// Request body for removing a connection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveConnectionRequest {
    pub authorization_id: String,
}

/// Request body for getting connect portal URL
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectPortalRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reconnect_authorization_id: Option<String>,
}

/// Response from syncing accounts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncAccountsResponse {
    pub synced: usize,
    pub created: usize,
    pub updated: usize,
    pub skipped: usize,
}

/// Response from syncing connections/platforms
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConnectionsResponse {
    pub synced: usize,
    pub platforms_created: usize,
    pub platforms_updated: usize,
}

impl BrokerAccount {
    /// Get the currency from the balance, defaulting to USD
    pub fn currency(&self) -> String {
        self.balance
            .as_ref()
            .and_then(|b| b.total.as_ref())
            .and_then(|t| t.currency.clone())
            .unwrap_or_else(|| "USD".to_string())
    }

    /// Map the broker's raw_type to a standardized account type
    pub fn account_type(&self) -> String {
        let raw = self.raw_type.as_deref().unwrap_or("").to_uppercase();

        // Map common broker account types to standardized types
        match raw.as_str() {
            // Tax-advantaged accounts
            "RRSP" | "RSP" => "RRSP".to_string(),
            "TFSA" => "TFSA".to_string(),
            "FHSA" => "FHSA".to_string(),
            "RESP" => "RESP".to_string(),
            "LIRA" | "LRSP" => "LIRA".to_string(),
            "RRIF" => "RRIF".to_string(),
            "LIF" => "LIF".to_string(),
            "DPSP" => "DPSP".to_string(),

            // US retirement accounts
            "IRA" | "TRADITIONAL_IRA" | "TRADITIONAL IRA" => "IRA".to_string(),
            "ROTH_IRA" | "ROTH IRA" | "ROTH" => "ROTH_IRA".to_string(),
            "401K" | "401(K)" => "401K".to_string(),
            "403B" | "403(B)" => "403B".to_string(),
            "SEP_IRA" | "SEP IRA" | "SEP" => "SEP_IRA".to_string(),
            "SIMPLE_IRA" | "SIMPLE IRA" => "SIMPLE_IRA".to_string(),
            "529" => "529".to_string(),
            "HSA" => "HSA".to_string(),

            // Standard accounts
            "MARGIN" | "MARGIN_ACCOUNT" => "MARGIN".to_string(),
            "CASH" | "CASH_ACCOUNT" => "CASH".to_string(),
            "INVESTMENT" | "BROKERAGE" | "INDIVIDUAL" => "INVESTMENT".to_string(),
            "JOINT" | "JOINT_ACCOUNT" => "JOINT".to_string(),
            "CORPORATE" | "BUSINESS" => "CORPORATE".to_string(),
            "TRUST" => "TRUST".to_string(),

            // Default fallback
            _ if raw.contains("RRSP") => "RRSP".to_string(),
            _ if raw.contains("TFSA") => "TFSA".to_string(),
            _ if raw.contains("MARGIN") => "MARGIN".to_string(),
            _ if raw.contains("CASH") => "CASH".to_string(),
            _ if raw.contains("IRA") => "IRA".to_string(),
            _ if raw.contains("401") => "401K".to_string(),
            _ => "SECURITIES".to_string(),
        }
    }

    /// Get account name, falling back to institution + account number
    pub fn display_name(&self) -> String {
        self.name
            .clone()
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| format!("{} - {}", self.institution_name, self.account_number))
    }

    /// Convert to JSON meta string
    pub fn to_meta_json(&self) -> Option<String> {
        let meta = serde_json::json!({
            "institution_name": self.institution_name,
            "brokerage_authorization": self.brokerage_authorization,
            "created_date": self.created_date,
            "status": self.status,
            "raw_type": self.raw_type,
            "is_paper": self.is_paper,
        });
        serde_json::to_string(&meta).ok()
    }
}
