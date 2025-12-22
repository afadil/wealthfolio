//! Models representing broker data from the cloud API.
//! These models mirror the provider API response structures.

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

/// A broker account from the cloud API (mirrors the provider account payload)
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
    #[serde(alias = "disabled_date")]
    pub disabled_date: Option<String>,

    /// When the connection was last updated
    #[serde(alias = "updated_date", alias = "updated_at")]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrokerConnectionBrokerage {
    pub id: Option<String>,
    pub slug: Option<String>,
    pub name: Option<String>,
    #[serde(alias = "display_name")]
    pub display_name: Option<String>,
    #[serde(alias = "aws_s3_logo_url")]
    pub aws_s3_logo_url: Option<String>,
    #[serde(alias = "aws_s3_square_logo_url")]
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

/// Pagination details from the broker API.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PaginationDetails {
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(default)]
    pub limit: Option<i64>,
    #[serde(default)]
    pub total: Option<i64>,
}

/// A paginated list of universal activity objects.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PaginatedUniversalActivity {
    #[serde(default)]
    #[serde(alias = "activities", alias = "universalActivities", alias = "universal_activities")]
    pub data: Vec<AccountUniversalActivity>,
    #[serde(default)]
    #[serde(alias = "paginationDetails", alias = "page")]
    pub pagination: Option<PaginationDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivityCurrency {
    pub id: Option<String>,
    pub code: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivitySymbol {
    pub id: Option<String>,
    pub symbol: Option<String>,
    pub raw_symbol: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub symbol_type: Option<AccountUniversalActivitySymbolType>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivitySymbolType {
    pub id: Option<String>,
    pub code: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub is_supported: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivityOptionSymbol {
    pub id: Option<String>,
    pub ticker: Option<String>,
}

/// A transaction or activity from an institution.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AccountUniversalActivity {
    pub id: Option<String>,
    pub symbol: Option<AccountUniversalActivitySymbol>,
    #[serde(rename = "option_symbol")]
    pub option_symbol: Option<AccountUniversalActivityOptionSymbol>,
    pub price: Option<f64>,
    pub units: Option<f64>,
    pub amount: Option<f64>,
    pub currency: Option<AccountUniversalActivityCurrency>,
    #[serde(rename = "type")]
    pub activity_type: Option<String>,
    #[serde(rename = "option_type")]
    pub option_type: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "trade_date")]
    pub trade_date: Option<String>,
    #[serde(rename = "settlement_date")]
    pub settlement_date: Option<String>,
    pub fee: Option<f64>,
    pub fx_rate: Option<f64>,
    pub institution: Option<String>,
    #[serde(rename = "external_reference_id")]
    pub external_reference_id: Option<String>,
    #[serde(rename = "provider_type")]
    pub provider_type: Option<String>,
}

/// Response from syncing activities.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SyncActivitiesResponse {
    pub accounts_synced: usize,
    pub activities_upserted: usize,
    pub assets_inserted: usize,
    pub accounts_failed: usize,
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
