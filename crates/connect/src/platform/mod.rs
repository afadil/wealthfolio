//! Platform contracts for Wealthfolio Connect.

use serde::{Deserialize, Serialize};

/// Domain model representing a brokerage platform.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    /// Slug identifier (e.g., "QUESTRADE", "INTERACTIVE_BROKERS")
    pub id: String,
    /// Display name of the platform
    pub name: Option<String>,
    /// URL to the platform's website
    pub url: String,
    /// External UUID from broker API
    pub external_id: Option<String>,
    /// Kind of platform (e.g., "BROKERAGE", "BANK")
    pub kind: String,
    /// Website URL for the platform
    pub website_url: Option<String>,
    /// Logo URL for the platform
    pub logo_url: Option<String>,
}
