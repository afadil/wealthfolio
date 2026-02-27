use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use wealthfolio_core::bank_connect::{BankDownloadRun, NewBankDownloadRun};
use wealthfolio_core::errors::Result;

#[derive(Queryable, Selectable, Insertable, AsChangeset, Clone, Debug)]
#[diesel(table_name = crate::schema::bank_download_runs)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
pub struct BankDownloadRunDB {
    pub id: String,
    pub bank_key: String,
    pub account_name: Option<String>,
    pub status: String,
    pub files_downloaded: i32,
    pub files_skipped: i32,
    pub error_message: Option<String>,
    pub started_at: String,
    pub completed_at: Option<String>,
}

impl From<BankDownloadRunDB> for BankDownloadRun {
    fn from(db: BankDownloadRunDB) -> Self {
        BankDownloadRun {
            id: db.id,
            bank_key: db.bank_key,
            account_name: db.account_name,
            status: db.status,
            files_downloaded: db.files_downloaded,
            files_skipped: db.files_skipped,
            error_message: db.error_message,
            started_at: db.started_at,
            completed_at: db.completed_at,
        }
    }
}

pub struct BankConnectRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    #[allow(dead_code)]
    writer: WriteHandle,
}

impl BankConnectRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }

    pub fn create_run(&self, new_run: NewBankDownloadRun) -> Result<BankDownloadRun> {
        use crate::schema::bank_download_runs;

        let db_record = BankDownloadRunDB {
            id: new_run.id,
            bank_key: new_run.bank_key,
            account_name: new_run.account_name,
            status: new_run.status,
            files_downloaded: 0,
            files_skipped: 0,
            error_message: None,
            started_at: new_run.started_at,
            completed_at: None,
        };

        let mut conn = get_connection(&self.pool).map_err(StorageError::from)?;
        diesel::insert_into(bank_download_runs::table)
            .values(&db_record)
            .execute(&mut conn)
            .map_err(StorageError::from)?;

        Ok(db_record.into())
    }

    pub fn update_run(
        &self,
        id: &str,
        status: &str,
        files_downloaded: i32,
        files_skipped: i32,
        error_message: Option<String>,
        completed_at: Option<String>,
    ) -> Result<()> {
        use crate::schema::bank_download_runs::dsl;

        let run_id = id.to_string();
        let status_val = status.to_string();

        let mut conn = get_connection(&self.pool).map_err(StorageError::from)?;
        diesel::update(dsl::bank_download_runs.filter(dsl::id.eq(run_id)))
            .set((
                dsl::status.eq(status_val),
                dsl::files_downloaded.eq(files_downloaded),
                dsl::files_skipped.eq(files_skipped),
                dsl::error_message.eq(error_message),
                dsl::completed_at.eq(completed_at),
            ))
            .execute(&mut conn)
            .map_err(StorageError::from)?;
        Ok(())
    }

    pub fn list_runs(&self, bank_key: Option<&str>) -> Result<Vec<BankDownloadRun>> {
        use crate::schema::bank_download_runs::dsl;

        let mut conn = get_connection(&self.pool).map_err(StorageError::from)?;

        let results: Vec<BankDownloadRunDB> = if let Some(key) = bank_key {
            dsl::bank_download_runs
                .filter(dsl::bank_key.eq(key))
                .order(dsl::started_at.desc())
                .load::<BankDownloadRunDB>(&mut conn)
                .map_err(StorageError::from)?
        } else {
            dsl::bank_download_runs
                .order(dsl::started_at.desc())
                .load::<BankDownloadRunDB>(&mut conn)
                .map_err(StorageError::from)?
        };

        Ok(results.into_iter().map(Into::into).collect())
    }
}
