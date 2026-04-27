//! Database models for portfolio targets.

use chrono::NaiveDateTime;
use diesel::prelude::*;
use log::error;
use serde::{Deserialize, Serialize};

fn text_to_datetime(s: &str) -> NaiveDateTime {
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.naive_utc())
        .unwrap_or_else(|e| {
            error!("Failed to parse datetime '{}': {}", s, e);
            chrono::Utc::now().naive_utc()
        })
}

// --- PortfolioTarget ---

#[derive(
    Queryable, Identifiable, AsChangeset, Selectable, Debug, Clone, Serialize, Deserialize,
)]
#[diesel(table_name = crate::schema::portfolio_targets)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct PortfolioTargetDB {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub taxonomy_id: String,
    pub is_active: i32,
    pub rebalance_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::portfolio_targets)]
pub struct NewPortfolioTargetDB {
    pub id: String,
    pub name: String,
    pub account_id: String,
    pub taxonomy_id: String,
    pub is_active: i32,
    pub rebalance_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

// --- TargetAllocation ---

#[derive(
    Queryable, Identifiable, AsChangeset, Selectable, Debug, Clone, Serialize, Deserialize,
)]
#[diesel(table_name = crate::schema::portfolio_target_allocations)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct TargetAllocationDB {
    pub id: String,
    pub target_id: String,
    pub category_id: String,
    pub target_percent: i32,
    pub is_locked: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::portfolio_target_allocations)]
pub struct NewTargetAllocationDB {
    pub id: String,
    pub target_id: String,
    pub category_id: String,
    pub target_percent: i32,
    pub is_locked: i32,
    pub created_at: String,
    pub updated_at: String,
}

// --- HoldingTarget ---

#[derive(
    Queryable, Identifiable, AsChangeset, Selectable, Debug, Clone, Serialize, Deserialize,
)]
#[diesel(table_name = crate::schema::holding_targets)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct HoldingTargetDB {
    pub id: String,
    pub allocation_id: String,
    pub asset_id: String,
    pub target_percent: i32,
    pub is_locked: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Insertable, Debug, Clone)]
#[diesel(table_name = crate::schema::holding_targets)]
pub struct NewHoldingTargetDB {
    pub id: String,
    pub allocation_id: String,
    pub asset_id: String,
    pub target_percent: i32,
    pub is_locked: i32,
    pub created_at: String,
    pub updated_at: String,
}

// --- Conversions: DB -> Domain ---

impl From<PortfolioTargetDB> for wealthfolio_core::portfolio::targets::PortfolioTarget {
    fn from(db: PortfolioTargetDB) -> Self {
        Self {
            id: db.id,
            name: db.name,
            account_id: db.account_id,
            taxonomy_id: db.taxonomy_id,
            is_active: db.is_active != 0,
            rebalance_mode: db.rebalance_mode,
            created_at: text_to_datetime(&db.created_at),
            updated_at: text_to_datetime(&db.updated_at),
        }
    }
}

impl From<TargetAllocationDB> for wealthfolio_core::portfolio::targets::TargetAllocation {
    fn from(db: TargetAllocationDB) -> Self {
        Self {
            id: db.id,
            target_id: db.target_id,
            category_id: db.category_id,
            target_percent: db.target_percent,
            is_locked: db.is_locked != 0,
            created_at: text_to_datetime(&db.created_at),
            updated_at: text_to_datetime(&db.updated_at),
        }
    }
}

impl From<HoldingTargetDB> for wealthfolio_core::portfolio::targets::HoldingTarget {
    fn from(db: HoldingTargetDB) -> Self {
        Self {
            id: db.id,
            allocation_id: db.allocation_id,
            asset_id: db.asset_id,
            target_percent: db.target_percent,
            is_locked: db.is_locked != 0,
            created_at: text_to_datetime(&db.created_at),
            updated_at: text_to_datetime(&db.updated_at),
        }
    }
}

// --- Conversions: Domain -> DB (for inserts) ---

impl From<wealthfolio_core::portfolio::targets::NewPortfolioTarget> for NewPortfolioTargetDB {
    fn from(domain: wealthfolio_core::portfolio::targets::NewPortfolioTarget) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: domain
                .id
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            name: domain.name,
            account_id: domain.account_id,
            taxonomy_id: domain.taxonomy_id,
            is_active: if domain.is_active { 1 } else { 0 },
            rebalance_mode: domain.rebalance_mode,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl From<wealthfolio_core::portfolio::targets::NewTargetAllocation> for NewTargetAllocationDB {
    fn from(domain: wealthfolio_core::portfolio::targets::NewTargetAllocation) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: domain
                .id
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            target_id: domain.target_id,
            category_id: domain.category_id,
            target_percent: domain.target_percent,
            is_locked: if domain.is_locked { 1 } else { 0 },
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

impl From<wealthfolio_core::portfolio::targets::NewHoldingTarget> for NewHoldingTargetDB {
    fn from(domain: wealthfolio_core::portfolio::targets::NewHoldingTarget) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: domain
                .id
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
            allocation_id: domain.allocation_id,
            asset_id: domain.asset_id,
            target_percent: domain.target_percent,
            is_locked: if domain.is_locked { 1 } else { 0 },
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
