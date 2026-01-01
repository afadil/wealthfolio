//! Repository for import run persistence.

use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use wealthfolio_core::errors::Result;
use wealthfolio_core::sync::ImportRun;

use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::import_runs;

use super::model::ImportRunDB;

pub struct ImportRunRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl ImportRunRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    /// Create a new import run
    pub async fn create(&self, import_run: ImportRun) -> Result<ImportRun> {
        self.writer
            .exec(move |conn| {
                let db_model: ImportRunDB = import_run.into();

                diesel::insert_into(import_runs::table)
                    .values(&db_model)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(db_model.into())
            })
            .await
    }

    /// Update an import run
    pub async fn update(&self, import_run: ImportRun) -> Result<ImportRun> {
        self.writer
            .exec(move |conn| {
                let db_model: ImportRunDB = import_run.into();

                diesel::update(import_runs::table.find(&db_model.id))
                    .set(&db_model)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                Ok(db_model.into())
            })
            .await
    }

    /// Get import run by ID
    pub fn get_by_id(&self, id: &str) -> Result<Option<ImportRun>> {
        let mut conn = get_connection(&self.pool)?;

        let result = import_runs::table
            .find(id)
            .first::<ImportRunDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(Into::into))
    }

    /// Get recent import runs for an account
    pub fn get_recent_for_account(&self, account_id: &str, limit: i64) -> Result<Vec<ImportRun>> {
        let mut conn = get_connection(&self.pool)?;

        let results = import_runs::table
            .filter(import_runs::account_id.eq(account_id))
            .order(import_runs::started_at.desc())
            .limit(limit)
            .load::<ImportRunDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Into::into).collect())
    }

    /// Get runs needing review
    pub fn get_needs_review(&self) -> Result<Vec<ImportRun>> {
        let mut conn = get_connection(&self.pool)?;

        let results = import_runs::table
            .filter(import_runs::status.eq("NEEDS_REVIEW"))
            .order(import_runs::started_at.desc())
            .load::<ImportRunDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(results.into_iter().map(Into::into).collect())
    }
}
