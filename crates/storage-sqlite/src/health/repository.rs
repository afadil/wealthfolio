//! Health dismissal repository implementation.

use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use std::sync::Arc;

use wealthfolio_core::health::{HealthDismissalStore, IssueDismissal};
use wealthfolio_core::Result;

use super::model::HealthIssueDismissalDB;
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::health_issue_dismissals;
use crate::schema::health_issue_dismissals::dsl::*;

pub struct HealthDismissalRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl HealthDismissalRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    fn get_dismissals_impl(&self) -> Result<Vec<IssueDismissal>> {
        let mut conn = get_connection(&self.pool)?;
        let dismissals_db = health_issue_dismissals
            .load::<HealthIssueDismissalDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(dismissals_db
            .into_iter()
            .map(IssueDismissal::from)
            .collect())
    }

    fn get_dismissal_impl(&self, id: &str) -> Result<Option<IssueDismissal>> {
        let mut conn = get_connection(&self.pool)?;
        let result = health_issue_dismissals
            .find(id)
            .first::<HealthIssueDismissalDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;
        Ok(result.map(IssueDismissal::from))
    }
}

#[async_trait]
impl HealthDismissalStore for HealthDismissalRepository {
    async fn save_dismissal(&self, dismissal: &IssueDismissal) -> Result<()> {
        let dismissal_db: HealthIssueDismissalDB = dismissal.clone().into();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::insert_into(health_issue_dismissals::table)
                    .values(&dismissal_db)
                    .on_conflict(issue_id)
                    .do_update()
                    .set(&dismissal_db)
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }

    async fn remove_dismissal(&self, id: &str) -> Result<()> {
        let id_owned = id.to_string();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::delete(health_issue_dismissals.find(id_owned))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }

    async fn get_dismissals(&self) -> Result<Vec<IssueDismissal>> {
        self.get_dismissals_impl()
    }

    async fn get_dismissal(&self, id: &str) -> Result<Option<IssueDismissal>> {
        self.get_dismissal_impl(id)
    }

    async fn clear_all(&self) -> Result<()> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::delete(health_issue_dismissals::table)
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(())
            })
            .await
    }
}
