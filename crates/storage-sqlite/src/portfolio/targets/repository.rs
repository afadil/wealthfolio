//! Repository implementation for portfolio targets.

use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

use wealthfolio_core::portfolio::targets::{
    NewPortfolioTarget, NewTargetAllocation, PortfolioTarget, PortfolioTargetRepositoryTrait,
    TargetAllocation,
};
use wealthfolio_core::Result;

use super::model::{
    NewPortfolioTargetDB, NewTargetAllocationDB, PortfolioTargetDB, TargetAllocationDB,
};
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{portfolio_target_allocations, portfolio_targets};

pub struct PortfolioTargetRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl PortfolioTargetRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl PortfolioTargetRepositoryTrait for PortfolioTargetRepository {
    fn get_targets_by_account(&self, account_id: &str) -> Result<Vec<PortfolioTarget>> {
        let mut conn = get_connection(&self.pool)?;
        let results = portfolio_targets::table
            .filter(portfolio_targets::account_id.eq(account_id))
            .order(portfolio_targets::created_at.asc())
            .load::<PortfolioTargetDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(results.into_iter().map(PortfolioTarget::from).collect())
    }

    fn get_target(&self, id: &str) -> Result<Option<PortfolioTarget>> {
        let mut conn = get_connection(&self.pool)?;
        let result = portfolio_targets::table
            .find(id)
            .first::<PortfolioTargetDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;
        Ok(result.map(PortfolioTarget::from))
    }

    async fn create_target(&self, target: NewPortfolioTarget) -> Result<PortfolioTarget> {
        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<PortfolioTarget> {
                    let db: NewPortfolioTargetDB = target.into();

                    let result = diesel::insert_into(portfolio_targets::table)
                        .values(&db)
                        .returning(PortfolioTargetDB::as_returning())
                        .get_result(conn)
                        .map_err(StorageError::from)?;

                    Ok(PortfolioTarget::from(result))
                },
            )
            .await
    }

    async fn update_target(&self, target: PortfolioTarget) -> Result<PortfolioTarget> {
        let id = target.id.clone();
        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<PortfolioTarget> {
                    let now = chrono::Utc::now().to_rfc3339();
                    let db = PortfolioTargetDB {
                        id: target.id,
                        name: target.name,
                        account_id: target.account_id,
                        taxonomy_id: target.taxonomy_id,
                        is_active: if target.is_active { 1 } else { 0 },
                        created_at: target.created_at.and_utc().to_rfc3339(),
                        updated_at: now,
                    };

                    let result = diesel::update(portfolio_targets::table.find(&id))
                        .set(&db)
                        .returning(PortfolioTargetDB::as_returning())
                        .get_result(conn)
                        .map_err(StorageError::from)?;

                    Ok(PortfolioTarget::from(result))
                },
            )
            .await
    }

    async fn delete_target(&self, id: &str) -> Result<usize> {
        let id = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                let count = diesel::delete(portfolio_targets::table.find(&id))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(count)
            })
            .await
    }

    fn get_allocations_by_target(&self, target_id: &str) -> Result<Vec<TargetAllocation>> {
        let mut conn = get_connection(&self.pool)?;
        let results = portfolio_target_allocations::table
            .filter(portfolio_target_allocations::target_id.eq(target_id))
            .order(portfolio_target_allocations::created_at.asc())
            .load::<TargetAllocationDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(results.into_iter().map(TargetAllocation::from).collect())
    }

    async fn upsert_allocation(&self, allocation: NewTargetAllocation) -> Result<TargetAllocation> {
        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<TargetAllocation> {
                    let now = chrono::Utc::now().to_rfc3339();

                    // Check if allocation already exists for this target+category
                    let existing = portfolio_target_allocations::table
                        .filter(
                            portfolio_target_allocations::target_id
                                .eq(&allocation.target_id)
                                .and(
                                    portfolio_target_allocations::category_id
                                        .eq(&allocation.category_id),
                                ),
                        )
                        .first::<TargetAllocationDB>(conn)
                        .optional()
                        .map_err(StorageError::from)?;

                    if let Some(existing) = existing {
                        // Update existing
                        let updated = TargetAllocationDB {
                            id: existing.id.clone(),
                            target_id: existing.target_id,
                            category_id: existing.category_id,
                            target_percent: allocation.target_percent,
                            is_locked: if allocation.is_locked { 1 } else { 0 },
                            created_at: existing.created_at,
                            updated_at: now,
                        };

                        let result =
                            diesel::update(portfolio_target_allocations::table.find(&existing.id))
                                .set(&updated)
                                .returning(TargetAllocationDB::as_returning())
                                .get_result(conn)
                                .map_err(StorageError::from)?;

                        Ok(TargetAllocation::from(result))
                    } else {
                        // Insert new
                        let db = NewTargetAllocationDB {
                            id: allocation.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
                            target_id: allocation.target_id,
                            category_id: allocation.category_id,
                            target_percent: allocation.target_percent,
                            is_locked: if allocation.is_locked { 1 } else { 0 },
                            created_at: now.clone(),
                            updated_at: now,
                        };

                        let result = diesel::insert_into(portfolio_target_allocations::table)
                            .values(&db)
                            .returning(TargetAllocationDB::as_returning())
                            .get_result(conn)
                            .map_err(StorageError::from)?;

                        Ok(TargetAllocation::from(result))
                    }
                },
            )
            .await
    }

    async fn delete_allocation(&self, id: &str) -> Result<usize> {
        let id = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                let count = diesel::delete(portfolio_target_allocations::table.find(&id))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(count)
            })
            .await
    }

    async fn delete_allocations_by_target(&self, target_id: &str) -> Result<usize> {
        let target_id = target_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                let count = diesel::delete(
                    portfolio_target_allocations::table
                        .filter(portfolio_target_allocations::target_id.eq(&target_id)),
                )
                .execute(conn)
                .map_err(StorageError::from)?;
                Ok(count)
            })
            .await
    }
}
