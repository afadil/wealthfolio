//! SQLite repository for tax lot rows.

use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;

use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use wealthfolio_core::errors::Result;
use wealthfolio_core::lots::{HoldingPeriod, LotRecord, LotRepositoryTrait};

// ── Diesel model ──────────────────────────────────────────────────────────────

#[derive(Debug, Insertable)]
#[diesel(table_name = crate::schema::lots)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
struct LotRecordDB {
    id: String,
    account_id: String,
    asset_id: String,
    open_date: String,
    open_activity_id: Option<String>,
    original_quantity: String,
    remaining_quantity: String,
    cost_per_unit: String,
    total_cost_basis: String,
    fee_allocated: String,
    disposal_method: String,
    is_closed: i32,
    close_date: Option<String>,
    close_activity_id: Option<String>,
    is_wash_sale: i32,
    holding_period: Option<String>,
    created_at: String,
    updated_at: String,
}

impl From<&LotRecord> for LotRecordDB {
    fn from(r: &LotRecord) -> Self {
        LotRecordDB {
            id: r.id.clone(),
            account_id: r.account_id.clone(),
            asset_id: r.asset_id.clone(),
            open_date: r.open_date.clone(),
            open_activity_id: r.open_activity_id.clone(),
            original_quantity: r.original_quantity.clone(),
            remaining_quantity: r.remaining_quantity.clone(),
            cost_per_unit: r.cost_per_unit.clone(),
            total_cost_basis: r.total_cost_basis.clone(),
            fee_allocated: r.fee_allocated.clone(),
            disposal_method: r.disposal_method.as_str().to_string(),
            is_closed: r.is_closed as i32,
            close_date: r.close_date.clone(),
            close_activity_id: r.close_activity_id.clone(),
            is_wash_sale: r.is_wash_sale as i32,
            holding_period: r.holding_period.map(|hp| match hp {
                HoldingPeriod::ShortTerm => "SHORT_TERM".to_string(),
                HoldingPeriod::LongTerm => "LONG_TERM".to_string(),
            }),
            created_at: r.created_at.clone(),
            updated_at: r.updated_at.clone(),
        }
    }
}

// ── Repository ────────────────────────────────────────────────────────────────

pub struct LotsRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl LotsRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl LotRepositoryTrait for LotsRepository {
    async fn replace_lots_for_account(&self, account_id: &str, lots: &[LotRecord]) -> Result<()> {
        use crate::schema::lots::dsl;

        let account_id = account_id.to_string();
        let db_lots: Vec<LotRecordDB> = lots.iter().map(LotRecordDB::from).collect();

        self.writer
            .exec(move |conn| {
                diesel::delete(dsl::lots.filter(dsl::account_id.eq(&account_id)))
                    .execute(conn)
                    .map_err(StorageError::from)?;

                if !db_lots.is_empty() {
                    diesel::insert_into(dsl::lots)
                        .values(&db_lots)
                        .execute(conn)
                        .map_err(StorageError::from)?;
                }

                Ok(())
            })
            .await
    }

    fn count_open_lots(&self) -> Result<i64> {
        use crate::schema::lots::dsl;
        use diesel::dsl::count_star;

        let mut conn = get_connection(&self.pool)?;
        let n: i64 = dsl::lots
            .select(count_star())
            .first(&mut conn)
            .map_err(StorageError::from)?;
        Ok(n)
    }
}
