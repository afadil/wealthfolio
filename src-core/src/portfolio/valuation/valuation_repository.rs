use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;
use chrono::NaiveDate;
use std::collections::HashMap;
use diesel::sql_query;
use diesel::sql_types::Text;
use diesel::sqlite::Sqlite;
use async_trait::async_trait;

use crate::db::{get_connection, WriteHandle};
use crate::errors::Result;
use crate::portfolio::valuation::valuation_model::{DailyAccountValuation, DailyAccountValuationDb};
use crate::schema::daily_account_valuation::dsl::*;
use crate::schema::daily_account_valuation;


#[async_trait]
pub trait ValuationRepositoryTrait: Send + Sync {
    async fn save_valuations(&self, valuation_records: &[DailyAccountValuation]) -> Result<()>;
    fn get_historical_valuations(
        &self,
        input_account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<Vec<DailyAccountValuation>>;
    fn load_latest_valuation_date(&self, account_id: &str) -> Result<Option<NaiveDate>>;
    async fn delete_valuations_for_account(&self, account_id: &str) -> Result<()>;
    fn get_latest_valuations(
        &self,
        input_account_ids: &[String],
    ) -> Result<Vec<DailyAccountValuation>>;
    fn get_valuations_on_date(
        &self,
        account_ids: &[String],
        date: NaiveDate,
    ) -> Result<Vec<DailyAccountValuation>>;
}


pub struct ValuationRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl ValuationRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl ValuationRepositoryTrait for ValuationRepository {
    async fn save_valuations(&self, valuation_records: &[DailyAccountValuation]) -> Result<()> {
        if valuation_records.is_empty() {
            return Ok(());
        }

        // Materialize the records once before moving into the closure
        let records_to_save: Vec<DailyAccountValuationDb> = valuation_records
            .iter()
            .cloned()
            .map(DailyAccountValuationDb::from)
            .collect();

        self.writer.exec(move |conn| {
            for chunk in records_to_save.chunks(1000) {
                diesel::replace_into(daily_account_valuation::table)
                    .values(chunk) // Pass the chunk directly
                    .execute(conn)?;
            }
            Ok(())
        }).await
    }

    fn get_historical_valuations(
        &self,
        input_account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<Vec<DailyAccountValuation>> {
        let mut conn = get_connection(&self.pool)?;

        let mut query = daily_account_valuation::table
            .filter(account_id.eq(input_account_id))
            .order(valuation_date.asc())
            .into_boxed();

        if let Some(start_date_val) = start_date_opt {
            query = query.filter(valuation_date.ge(start_date_val));
        }

        if let Some(end_date_val) = end_date_opt {
            query = query.filter(valuation_date.le(end_date_val));
        }

        let history_dbs = query
            .load::<DailyAccountValuationDb>(&mut conn)?;

        // Convert Vec<DailyAccountValuationDb> to Vec<DailyAccountValuation>
        // Handle potential conversion errors if necessary (using From implicitly handles unwrap_or_default)
        let history_records: Vec<DailyAccountValuation> = history_dbs
            .into_iter()
            .map(DailyAccountValuation::from)
            .collect();

        Ok(history_records)
    }

    fn load_latest_valuation_date(&self, input_account_id: &str) -> Result<Option<NaiveDate>> {
        use diesel::OptionalExtension; // Ensure OptionalExtension is in scope
        let mut conn = get_connection(&self.pool)?;

        // Select the max date. This returns Option<NaiveDate> at the SQL level.
        // Execute with .first(). This returns Result<T, Error> where T is Option<NaiveDate>.
        // Use .optional() to convert Result<Option<NaiveDate>, Error> where Error=NotFound to Ok(None),
        // and other errors to Err(...). This yields a Result<Option<Option<NaiveDate>>, Error>.
        let result: Option<Option<NaiveDate>> = daily_account_valuation::table
            .filter(account_id.eq(input_account_id))
            .select(diesel::dsl::max(valuation_date))
            .first::<Option<NaiveDate>>(&mut conn)
            .optional()?;

        // Flatten the Option<Option<NaiveDate>> to Option<NaiveDate>
        let latest_date = result.flatten();

        Ok(latest_date)
    }

    async fn delete_valuations_for_account(&self, input_account_id: &str) -> Result<()> {
        let account_id_owned = input_account_id.to_string();
        self.writer.exec(move |conn| {
            diesel::delete(daily_account_valuation::table.filter(account_id.eq(account_id_owned)))
                .execute(conn)?;
            Ok(())
        }).await
    }

    fn get_latest_valuations(
        &self,
        input_account_ids: &[String],
    ) -> Result<Vec<DailyAccountValuation>> {
        if input_account_ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut conn = get_connection(&self.pool)?;

        let placeholders: String = input_account_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<&str>>()
            .join(", ");

        // Ensure all fields from DailyAccountValuationDb are selected, in the correct order.
        let sql = format!(
            "WITH RankedValuations AS ( \
                SELECT \
                    id, account_id, valuation_date, account_currency, base_currency, \
                    fx_rate_to_base, cash_balance, investment_market_value, total_value, \
                    cost_basis, net_contribution, calculated_at, \
                    ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY valuation_date DESC) as rn \
                FROM {} \
                WHERE account_id IN ({}) \
            ) \
            SELECT \
                id, account_id, valuation_date, account_currency, base_currency, \
                fx_rate_to_base, cash_balance, investment_market_value, total_value, \
                cost_basis, net_contribution, calculated_at \
            FROM RankedValuations \
            WHERE rn = 1",
            "daily_account_valuation", // Use direct table name string
            placeholders
        );

        let mut query_builder = sql_query(sql).into_boxed::<Sqlite>();

        for acc_id_str in input_account_ids {
            query_builder = query_builder.bind::<Text, _>(acc_id_str);
        }

        let latest_valuations_db: Vec<DailyAccountValuationDb> = query_builder
            .load::<DailyAccountValuationDb>(&mut conn)?;

        // To maintain input order, we first put results into a map
        let mut results_map: HashMap<String, DailyAccountValuation> = latest_valuations_db
            .into_iter()
            .map(|db_item| (db_item.account_id.clone(), DailyAccountValuation::from(db_item)))
            .collect();

        // Then build the ordered Vec
        let mut ordered_results = Vec::new();
        for acc_id_str in input_account_ids {
            if let Some(valuation) = results_map.remove(acc_id_str) { // Use remove to avoid cloning if DailyAccountValuation is large
                ordered_results.push(valuation);
            }
        }
        Ok(ordered_results)
    }

    fn get_valuations_on_date(
        &self,
        input_account_ids: &[String],
        input_date: NaiveDate,
    ) -> Result<Vec<DailyAccountValuation>> {
        if input_account_ids.is_empty() {
            return Ok(Vec::new()); // No need to query if the list is empty
        }
        
        let mut conn = get_connection(&self.pool)?;
        
        let history_dbs = daily_account_valuation::table
            .filter(account_id.eq_any(input_account_ids)) // Use eq_any for multiple IDs
            .filter(valuation_date.eq(input_date)) // Filter by the specific date
            .load::<DailyAccountValuationDb>(&mut conn)?;

        // Convert Vec<DailyAccountValuationDb> to Vec<DailyAccountValuation>
        let history_records: Vec<DailyAccountValuation> = history_dbs
            .into_iter()
            .map(DailyAccountValuation::from)
            .collect();

        Ok(history_records)
    }
} 