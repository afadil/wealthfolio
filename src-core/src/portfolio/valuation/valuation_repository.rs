use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;
use chrono::NaiveDate;

use crate::db::get_connection;
use crate::errors::Result;
use crate::portfolio::valuation::valuation_model::{DailyAccountValuation, DailyAccountValuationDb};
use crate::schema::daily_account_valuation::dsl::*;
use crate::schema::daily_account_valuation;


pub trait ValuationRepositoryTrait: Send + Sync {
    fn save_valuations(&self, valuation_records: &[DailyAccountValuation]) -> Result<()>;
    fn get_historical_valuations(
        &self,
        input_account_id: &str,
        start_date_opt: Option<NaiveDate>,
        end_date_opt: Option<NaiveDate>,
    ) -> Result<Vec<DailyAccountValuation>>;
    fn load_latest_valuation_date(&self, account_id: &str) -> Result<Option<NaiveDate>>;
    fn delete_valuations_for_account(&self, account_id: &str) -> Result<()>;
    fn get_latest_valuations(
        &self,
        account_ids: &[String],
    ) -> Result<Vec<DailyAccountValuation>>;
    fn get_valuations_on_date(
        &self,
        account_ids: &[String],
        date: NaiveDate,
    ) -> Result<Vec<DailyAccountValuation>>;
}


pub struct ValuationRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl ValuationRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }
}

impl ValuationRepositoryTrait for ValuationRepository {
    fn save_valuations(&self, valuation_records: &[DailyAccountValuation]) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;
        let transaction_result = conn.transaction(|conn| {
            for chunk in valuation_records.chunks(1000) { 
                let history_dbs: Vec<DailyAccountValuationDb> = chunk
                    .iter()
                    .cloned() // Clone DailyAccountValuation to convert
                    .map(DailyAccountValuationDb::from)
                    .collect();

                diesel::replace_into(daily_account_valuation::table)
                    .values(&history_dbs)
                    .execute(conn)?;
            }
            Ok(())
        });

        transaction_result
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

    fn delete_valuations_for_account(&self, input_account_id: &str) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;

        diesel::delete(daily_account_valuation::table.filter(account_id.eq(input_account_id)))
            .execute(&mut conn)?;

        Ok(())
    }

    fn get_latest_valuations(
        &self,
        input_account_ids: &[String],
    ) -> Result<Vec<DailyAccountValuation>> {
        let mut conn = get_connection(&self.pool)?;
        let mut results = Vec::new();

        for input_account_id_str in input_account_ids {
            let latest_entry = daily_account_valuation::table
                .filter(account_id.eq(input_account_id_str))
                .order(valuation_date.desc())
                .first::<DailyAccountValuationDb>(&mut conn)
                .optional()?;

            if let Some(db_entry) = latest_entry {
                results.push(DailyAccountValuation::from(db_entry));
            }
        }

        Ok(results)
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