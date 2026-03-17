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

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{create_pool, run_migrations, write_actor::spawn_writer};
    use tempfile::tempdir;
    use wealthfolio_core::lots::DisposalMethod;

    async fn setup() -> (
        LotsRepository,
        Arc<Pool<ConnectionManager<SqliteConnection>>>,
        tempfile::TempDir,
    ) {
        std::env::set_var("CONNECT_API_URL", "http://test.local");
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db").to_string_lossy().to_string();
        run_migrations(&db_path).unwrap();
        let pool = create_pool(&db_path).unwrap();
        let writer = spawn_writer((*pool).clone()).unwrap();
        let repo = LotsRepository::new(Arc::clone(&pool), writer);
        (repo, pool, dir)
    }

    fn insert_account(pool: &Arc<Pool<ConnectionManager<SqliteConnection>>>, id: &str) {
        let mut conn = get_connection(pool).unwrap();
        diesel::sql_query(format!(
            "INSERT INTO accounts (id, name, account_type, currency, is_default, is_active, \
             created_at, updated_at, tracking_mode, is_archived) \
             VALUES ('{}', 'Test', 'REGULAR', 'USD', 0, 1, datetime('now'), datetime('now'), 'TRANSACTIONS', 0)",
            id
        ))
        .execute(&mut conn)
        .unwrap();
    }

    fn insert_asset(pool: &Arc<Pool<ConnectionManager<SqliteConnection>>>, id: &str) {
        let mut conn = get_connection(pool).unwrap();
        diesel::sql_query(format!(
            "INSERT INTO assets (id, kind, is_active, quote_mode, quote_ccy, created_at, updated_at) \
             VALUES ('{}', 'INVESTMENT', 1, 'MARKET', 'USD', datetime('now'), datetime('now'))",
            id
        ))
        .execute(&mut conn)
        .unwrap();
    }

    fn make_lot_record(id: &str, account_id: &str, asset_id: &str, qty: &str) -> LotRecord {
        LotRecord {
            id: id.to_string(),
            account_id: account_id.to_string(),
            asset_id: asset_id.to_string(),
            open_date: "2024-01-15".to_string(),
            open_activity_id: None,
            original_quantity: qty.to_string(),
            remaining_quantity: qty.to_string(),
            cost_per_unit: "150".to_string(),
            total_cost_basis: "15000".to_string(),
            fee_allocated: "0".to_string(),
            disposal_method: DisposalMethod::Fifo,
            is_closed: false,
            close_date: None,
            close_activity_id: None,
            is_wash_sale: false,
            holding_period: None,
            created_at: "2024-01-15T00:00:00.000Z".to_string(),
            updated_at: "2024-01-15T00:00:00.000Z".to_string(),
        }
    }

    #[tokio::test]
    async fn replace_inserts_and_replaces_lots_for_account() {
        let (repo, pool, _dir) = setup().await;
        insert_account(&pool, "acc1");
        insert_asset(&pool, "AAPL");
        insert_asset(&pool, "MSFT");

        // Insert 3 lots: 2 AAPL, 1 MSFT
        let initial = vec![
            make_lot_record("l1", "acc1", "AAPL", "50"),
            make_lot_record("l2", "acc1", "AAPL", "30"),
            make_lot_record("l3", "acc1", "MSFT", "100"),
        ];
        repo.replace_lots_for_account("acc1", &initial)
            .await
            .unwrap();
        assert_eq!(repo.count_open_lots().unwrap(), 3);

        // Replace with 2 different lots
        let replacement = vec![
            make_lot_record("l4", "acc1", "AAPL", "80"),
            make_lot_record("l5", "acc1", "MSFT", "60"),
        ];
        repo.replace_lots_for_account("acc1", &replacement)
            .await
            .unwrap();
        assert_eq!(repo.count_open_lots().unwrap(), 2);

        // Old IDs must be gone
        let mut conn = get_connection(&pool).unwrap();
        let ids: Vec<String> = crate::schema::lots::dsl::lots
            .select(crate::schema::lots::dsl::id)
            .load(&mut conn)
            .unwrap();
        assert!(!ids.contains(&"l1".to_string()));
        assert!(ids.contains(&"l4".to_string()));
        assert!(ids.contains(&"l5".to_string()));
    }

    #[tokio::test]
    async fn replace_only_affects_target_account() {
        let (repo, pool, _dir) = setup().await;
        insert_account(&pool, "acc1");
        insert_account(&pool, "acc2");
        insert_asset(&pool, "AAPL");
        insert_asset(&pool, "LQD");

        repo.replace_lots_for_account(
            "acc1",
            &[
                make_lot_record("a1", "acc1", "AAPL", "50"),
                make_lot_record("a2", "acc1", "AAPL", "30"),
            ],
        )
        .await
        .unwrap();

        repo.replace_lots_for_account(
            "acc2",
            &[
                make_lot_record("b1", "acc2", "LQD", "100"),
                make_lot_record("b2", "acc2", "LQD", "50"),
                make_lot_record("b3", "acc2", "LQD", "25"),
            ],
        )
        .await
        .unwrap();

        assert_eq!(repo.count_open_lots().unwrap(), 5);

        // Replace only acc1; acc2 must be untouched
        repo.replace_lots_for_account("acc1", &[make_lot_record("a3", "acc1", "AAPL", "80")])
            .await
            .unwrap();

        assert_eq!(repo.count_open_lots().unwrap(), 4); // 1 (acc1) + 3 (acc2)

        let mut conn = get_connection(&pool).unwrap();
        let acc2_count: i64 = crate::schema::lots::dsl::lots
            .filter(crate::schema::lots::dsl::account_id.eq("acc2"))
            .select(diesel::dsl::count_star())
            .first(&mut conn)
            .unwrap();
        assert_eq!(acc2_count, 3);
    }

    #[tokio::test]
    async fn replace_with_empty_slice_clears_account() {
        let (repo, pool, _dir) = setup().await;
        insert_account(&pool, "acc1");
        insert_asset(&pool, "AAPL");

        repo.replace_lots_for_account("acc1", &[make_lot_record("l1", "acc1", "AAPL", "50")])
            .await
            .unwrap();
        assert_eq!(repo.count_open_lots().unwrap(), 1);

        repo.replace_lots_for_account("acc1", &[]).await.unwrap();
        assert_eq!(repo.count_open_lots().unwrap(), 0);
    }
}
