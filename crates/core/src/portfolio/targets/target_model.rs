//! Domain models for portfolio target allocations.

use chrono::NaiveDateTime;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// A target allocation profile for an account or the entire portfolio.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioTarget {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub taxonomy_id: String,
    pub is_active: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Data for creating a new portfolio target.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewPortfolioTarget {
    pub id: Option<String>,
    pub name: String,
    pub account_id: String,
    pub taxonomy_id: String,
    pub is_active: bool,
}

impl Default for NewPortfolioTarget {
    fn default() -> Self {
        Self {
            id: None,
            name: String::new(),
            account_id: "PORTFOLIO".to_string(),
            taxonomy_id: "asset_classes".to_string(),
            is_active: true,
        }
    }
}

/// A target percentage for a specific category within a portfolio target.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetAllocation {
    pub id: String,
    pub target_id: String,
    pub category_id: String,
    pub target_percent: i32,
    pub is_locked: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Data for creating or updating a target allocation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewTargetAllocation {
    pub id: Option<String>,
    pub target_id: String,
    pub category_id: String,
    pub target_percent: i32,
    pub is_locked: bool,
}

impl Default for NewTargetAllocation {
    fn default() -> Self {
        Self {
            id: None,
            target_id: String::new(),
            category_id: String::new(),
            target_percent: 0,
            is_locked: false,
        }
    }
}

/// Deviation between current and target allocation for a single category.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AllocationDeviation {
    pub category_id: String,
    pub category_name: String,
    pub color: String,
    pub target_percent: Decimal,
    pub current_percent: Decimal,
    pub deviation_percent: Decimal,
    pub current_value: Decimal,
    pub target_value: Decimal,
    pub value_delta: Decimal,
    pub is_locked: bool,
}

/// A target percentage for a specific holding within a category allocation.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingTarget {
    pub id: String,
    pub allocation_id: String,
    pub asset_id: String,
    pub target_percent: i32,
    pub is_locked: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Data for creating or updating a holding target.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewHoldingTarget {
    pub id: Option<String>,
    pub allocation_id: String,
    pub asset_id: String,
    pub target_percent: i32,
    pub is_locked: bool,
}

impl Default for NewHoldingTarget {
    fn default() -> Self {
        Self {
            id: None,
            allocation_id: String::new(),
            asset_id: String::new(),
            target_percent: 0,
            is_locked: false,
        }
    }
}

/// Full deviation report for a portfolio target.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviationReport {
    pub target_id: String,
    pub target_name: String,
    pub account_id: String,
    pub taxonomy_id: String,
    pub total_value: Decimal,
    pub deviations: Vec<AllocationDeviation>,
}
