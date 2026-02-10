use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct HoldingsQuery {
    #[serde(rename = "accountId")]
    pub account_id: String,
}

#[derive(Deserialize)]
pub struct HoldingItemQuery {
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "assetId")]
    pub asset_id: String,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "startDate")]
    pub start_date: Option<String>,
    #[serde(rename = "endDate")]
    pub end_date: Option<String>,
}

#[derive(Deserialize)]
pub struct AllocationHoldingsQuery {
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "taxonomyId")]
    pub taxonomy_id: String,
    #[serde(rename = "categoryId")]
    pub category_id: String,
}

#[derive(Deserialize)]
pub struct SnapshotsQuery {
    #[serde(rename = "accountId")]
    pub account_id: String,
    #[serde(rename = "dateFrom")]
    pub date_from: Option<String>,
    #[serde(rename = "dateTo")]
    pub date_to: Option<String>,
}

#[derive(Deserialize)]
pub struct SnapshotDateQuery {
    #[serde(rename = "accountId")]
    pub account_id: String,
    pub date: String,
}

#[derive(Deserialize)]
pub struct DeleteSnapshotQuery {
    #[serde(rename = "accountId")]
    pub account_id: String,
    pub date: String,
}

/// Information about a snapshot for UI display
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotInfo {
    pub id: String,
    pub snapshot_date: String,
    pub source: String,
    pub position_count: usize,
    pub cash_currency_count: usize,
}

/// Input for a single holding when saving manual holdings
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingInput {
    /// For existing holdings, pass the known asset ID directly (preferred)
    pub asset_id: Option<String>,
    /// Symbol (e.g., "AAPL", "META.TO") - used when asset_id is not provided
    pub symbol: String,
    pub quantity: String,
    pub currency: String,
    pub average_cost: Option<String>,
    /// Exchange MIC code for new holdings (e.g., "XNAS", "XTSE"). Used when asset_id is not provided.
    pub exchange_mic: Option<String>,
}

/// Request body for saving manual holdings
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveManualHoldingsRequest {
    pub account_id: String,
    pub holdings: Vec<HoldingInput>,
    pub cash_balances: HashMap<String, String>,
    pub snapshot_date: Option<String>,
}

/// A single position in a holdings snapshot for CSV import
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingsPositionInput {
    /// Symbol from CSV (e.g., "AAPL", "GOOGL")
    pub symbol: String,
    /// Quantity held
    pub quantity: String,
    /// Optional price per unit at snapshot date
    pub price: Option<String>,
    /// Currency for this position
    pub currency: String,
}

/// A single snapshot from CSV import (one date's worth of holdings)
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingsSnapshotInput {
    /// The date of this snapshot (YYYY-MM-DD)
    pub date: String,
    /// Securities held on this date
    pub positions: Vec<HoldingsPositionInput>,
    /// Cash balances by currency (e.g., {"USD": "10000", "EUR": "5000"})
    pub cash_balances: HashMap<String, String>,
}

/// Result of importing holdings CSV
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportHoldingsCsvResult {
    /// Number of snapshots successfully imported
    pub snapshots_imported: usize,
    /// Number of snapshots that failed to import
    pub snapshots_failed: usize,
    /// Error messages for failed snapshots (date -> error)
    pub errors: Vec<String>,
}

/// Request body for importing holdings CSV
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportHoldingsCsvRequest {
    pub account_id: String,
    pub snapshots: Vec<HoldingsSnapshotInput>,
}
