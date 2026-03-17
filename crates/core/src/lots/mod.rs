//! Persisted tax lots.
//!
//! A [`LotRecord`] is the durable, relational form of a tax lot: one row per
//! acquisition, updated in-place as shares are sold. This is distinct from the
//! in-memory [`crate::portfolio::snapshot::Lot`], which is a computation
//! intermediate produced by the holdings calculator during snapshot generation.
//!
//! The `lots` table is initially empty. Step A2 (shadow-write) will begin
//! populating it alongside the existing JSON snapshot path.

use serde::{Deserialize, Serialize};

/// A row in the `lots` table — a persisted tax lot.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LotRecord {
    pub id: String,
    pub account_id: String,
    pub asset_id: String,

    /// Date the lot was opened (ISO 8601, e.g. "2024-03-15").
    pub open_date: String,
    /// The activity that created this lot. NULL for HOLDINGS-mode lots created
    /// directly from snapshot positions.
    pub open_activity_id: Option<String>,

    /// Total quantity acquired. Never changes after creation.
    pub original_quantity: String,
    /// Quantity still held. Reduced on each SELL/TRANSFER_OUT disposal.
    pub remaining_quantity: String,

    /// Cost per unit in the asset's quote currency.
    pub cost_per_unit: String,
    /// Total cost basis (cost_per_unit × original_quantity + fee_allocated).
    pub total_cost_basis: String,
    /// Transaction fees allocated to this lot.
    pub fee_allocated: String,

    /// Cost basis disposal method for this lot.
    pub disposal_method: DisposalMethod,

    /// True once remaining_quantity reaches zero.
    pub is_closed: bool,

    /// Date the lot was fully disposed (ISO 8601). None if still open.
    pub close_date: Option<String>,
    /// The activity that fully closed this lot. None if still open.
    pub close_activity_id: Option<String>,

    /// Tax flags — populated during the tax phase (Phase C).
    pub is_wash_sale: bool,
    pub holding_period: Option<HoldingPeriod>,

    pub created_at: String,
    pub updated_at: String,
}

/// Cost basis disposal method.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum DisposalMethod {
    /// First in, first out (default).
    #[default]
    Fifo,
    /// Last in, first out.
    Lifo,
    /// Highest cost first (tax-loss harvesting).
    Hifo,
    /// Weighted average cost (Canada ACB, many international jurisdictions).
    AvgCost,
    /// User selects specific lots.
    SpecificId,
}

impl DisposalMethod {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fifo => "FIFO",
            Self::Lifo => "LIFO",
            Self::Hifo => "HIFO",
            Self::AvgCost => "AVG_COST",
            Self::SpecificId => "SPECIFIC_ID",
        }
    }
}

/// Holding period for capital gains classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HoldingPeriod {
    ShortTerm,
    LongTerm,
}
