use diesel::prelude::*;
use serde::{Deserialize, Serialize};

use crate::{errors::ValidationError, Error, Result};

// ============================================================================
// Domain Models (for business logic)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RebalancingStrategy {
    pub id: String,
    pub name: String,
    pub account_id: Option<String>,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetClassTarget {
    pub id: String,
    pub strategy_id: String,
    pub asset_class: String,
    pub target_percent: f32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HoldingTarget {
    pub id: String,
    pub asset_class_id: String,
    pub asset_id: String,
    pub target_percent_of_class: f32,
    pub created_at: String,
    pub updated_at: String,
}

// ============================================================================
// Input Models (for API)
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewRebalancingStrategy {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub name: String,
    pub account_id: Option<String>,
    pub is_active: bool,
}

impl NewRebalancingStrategy {
    pub fn validate(&self) -> Result<()> {
        if self.name.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Strategy name cannot be empty".to_string(),
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAssetClassTarget {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub strategy_id: String,
    pub asset_class: String,
    pub target_percent: f32,
}

impl NewAssetClassTarget {
    pub fn validate(&self) -> Result<()> {
        if self.asset_class.trim().is_empty() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Asset class cannot be empty".to_string(),
            )));
        }
        if !(0.0..=100.0).contains(&self.target_percent) {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Target percent must be between 0 and 100".to_string(),
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewHoldingTarget {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub asset_class_id: String,
    pub asset_id: String,
    pub target_percent_of_class: f32,
}

impl NewHoldingTarget {
    pub fn validate(&self) -> Result<()> {
        if !(0.0..=100.0).contains(&self.target_percent_of_class) {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Target percent must be between 0 and 100".to_string(),
            )));
        }
        Ok(())
    }
}

// ============================================================================
// Database Models (Diesel)
// ============================================================================

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Associations,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::rebalancing_strategies)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[diesel(belongs_to(crate::schema::accounts::table, foreign_key = account_id))]
pub struct RebalancingStrategyDB {
    pub id: String,
    pub name: String,
    pub account_id: Option<String>,
    pub is_active: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Associations,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::asset_class_targets)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[diesel(belongs_to(RebalancingStrategyDB, foreign_key = strategy_id))]
pub struct AssetClassTargetDB {
    pub id: String,
    pub strategy_id: String,
    pub asset_class: String,
    pub target_percent: f32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(
    Queryable,
    Identifiable,
    Insertable,
    AsChangeset,
    Selectable,
    Associations,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::holding_targets)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[diesel(belongs_to(AssetClassTargetDB, foreign_key = asset_class_id))]
pub struct HoldingTargetDB {
    pub id: String,
    pub asset_class_id: String,
    pub asset_id: String,
    pub target_percent_of_class: f32,
    pub created_at: String,
    pub updated_at: String,
}

// ============================================================================
// Conversions
// ============================================================================

impl From<RebalancingStrategyDB> for RebalancingStrategy {
    fn from(db: RebalancingStrategyDB) -> Self {
        Self {
            id: db.id,
            name: db.name,
            account_id: db.account_id,
            is_active: db.is_active != 0,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<NewRebalancingStrategy> for RebalancingStrategyDB {
    fn from(domain: NewRebalancingStrategy) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: domain.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            name: domain.name,
            account_id: domain.account_id,
            is_active: if domain.is_active { 1 } else { 0 },
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl From<AssetClassTargetDB> for AssetClassTarget {
    fn from(db: AssetClassTargetDB) -> Self {
        Self {
            id: db.id,
            strategy_id: db.strategy_id,
            asset_class: db.asset_class,
            target_percent: db.target_percent,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<NewAssetClassTarget> for AssetClassTargetDB {
    fn from(domain: NewAssetClassTarget) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: domain.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            strategy_id: domain.strategy_id,
            asset_class: domain.asset_class,
            target_percent: domain.target_percent,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl From<HoldingTargetDB> for HoldingTarget {
    fn from(db: HoldingTargetDB) -> Self {
        Self {
            id: db.id,
            asset_class_id: db.asset_class_id,
            asset_id: db.asset_id,
            target_percent_of_class: db.target_percent_of_class,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<NewHoldingTarget> for HoldingTargetDB {
    fn from(domain: NewHoldingTarget) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: domain.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            asset_class_id: domain.asset_class_id,
            asset_id: domain.asset_id,
            target_percent_of_class: domain.target_percent_of_class,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
