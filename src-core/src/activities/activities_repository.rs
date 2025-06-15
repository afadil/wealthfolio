use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use diesel::expression_methods::ExpressionMethods;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use rust_decimal::Decimal;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

use super::activities_traits::ActivityRepositoryTrait;
use crate::activities::activities_constants::*;
use crate::activities::activities_errors::ActivityError;
use crate::activities::activities_model::*;
use crate::db::{get_connection, WriteHandle};
use crate::schema::{accounts, activities, activity_import_profiles, assets};
use crate::{Error, Result};
use diesel::dsl::min;
use num_traits::Zero;
use async_trait::async_trait;

/// Repository for managing activity data in the database
pub struct ActivityRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

// Inherent methods for ActivityRepository
impl ActivityRepository {
    /// Creates a new ActivityRepository instance
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        Self { pool, writer }
    }
}

// Implement the trait for the repository
#[async_trait]
impl ActivityRepositoryTrait for ActivityRepository {
    fn get_activity(&self, activity_id: &str) -> Result<Activity> {
        let mut conn = get_connection(&self.pool)?;
        let activity_db = activities::table
            .find(activity_id)
            .first::<ActivityDB>(&mut conn)
            .map_err(|e| Error::from(ActivityError::NotFound(e.to_string())))?;
        Ok(Activity::from(activity_db))
    }

    fn get_trading_activities(&self) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)?;

        let activities_db = activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq_any(TRADING_ACTIVITY_TYPES))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)?;

        Ok(activities_db.into_iter().map(Activity::from).collect())
    }

    fn get_income_activities(&self) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)?;

        let activities_db = activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq_any(INCOME_ACTIVITY_TYPES))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)?;

        Ok(activities_db.into_iter().map(Activity::from).collect())
    }

    fn get_activities(&self) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)?;

        let activities_db = activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)?;

        Ok(activities_db.into_iter().map(Activity::from).collect())
    }

    fn search_activities(
        &self,
        page: i64,                                 // Page number, 1-based
        page_size: i64,                            // Number of items per page
        account_id_filter: Option<Vec<String>>,    // Optional account_id filter
        activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
        asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
        sort: Option<Sort>,                        // Optional sort
    ) -> Result<ActivitySearchResponse> {
        let mut conn = get_connection(&self.pool)?;

        let offset = page * page_size;

        // Function to create base query
        let create_base_query = |_conn: &SqliteConnection| {
            let mut query = activities::table
                .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
                .inner_join(assets::table.on(activities::asset_id.eq(assets::id)))
                .filter(accounts::is_active.eq(true))
                .into_boxed();

            if let Some(ref account_ids) = account_id_filter {
                query = query.filter(activities::account_id.eq_any(account_ids));
            }
            if let Some(ref activity_types) = activity_type_filter {
                query = query.filter(activities::activity_type.eq_any(activity_types));
            }
            if let Some(ref keyword) = asset_id_keyword {
                query = query.filter(assets::id.like(format!("%{}%", keyword)));
            }

            // Apply sorting
            if let Some(ref sort) = sort {
                match sort.id.as_str() {
                    "date" => {
                        if sort.desc {
                            query = query.order(activities::activity_date.desc());
                        } else {
                            query = query.order(activities::activity_date.asc());
                        }
                    }
                    "activityType" => {
                        if sort.desc {
                            query = query.order(activities::activity_type.desc());
                        } else {
                            query = query.order(activities::activity_type.asc());
                        }
                    }
                    "assetSymbol" => {
                        if sort.desc {
                            query = query.order(activities::asset_id.desc());
                        } else {
                            query = query.order(activities::asset_id.asc());
                        }
                    }
                    "accountName" => {
                        if sort.desc {
                            query = query.order(accounts::name.desc());
                        } else {
                            query = query.order(accounts::name.asc());
                        }
                    }
                    _ => query = query.order(activities::activity_date.desc()), // Default order
                }
            } else {
                query = query.order(activities::activity_date.desc()); // Default order
            }

            query
        };

        // Count query
        let total_row_count = create_base_query(&conn)
            .count()
            .get_result::<i64>(&mut conn)?;

        // Data fetching query
        let results = create_base_query(&conn)
            .select((
                activities::id,
                activities::account_id,
                activities::asset_id,
                activities::activity_type,
                activities::activity_date,
                activities::quantity,
                activities::unit_price,
                activities::currency,
                activities::fee,
                activities::amount,
                activities::is_draft,
                activities::comment,
                activities::created_at,
                activities::updated_at,
                accounts::name,
                accounts::currency,
                assets::symbol,
                assets::name,
                assets::data_source,
            ))
            .limit(page_size)
            .offset(offset)
            .load::<ActivityDetails>(&mut conn)?;

        Ok(ActivitySearchResponse {
            data: results,
            meta: ActivitySearchResponseMeta { total_row_count },
        })
    }

    async fn create_activity(&self, new_activity: NewActivity) -> Result<Activity> {
        new_activity.validate()?;
        let activity_db_owned: ActivityDB = new_activity.into();
        
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Activity> {
                let mut activity_to_insert = activity_db_owned;
                activity_to_insert.id = Uuid::new_v4().to_string();
                let inserted_activity = diesel::insert_into(activities::table)
                    .values(&activity_to_insert)
                    .get_result::<ActivityDB>(conn)?;
                Ok(Activity::from(inserted_activity))
            })
            .await
    }

    async fn update_activity(&self, activity_update: ActivityUpdate) -> Result<Activity> {
        activity_update.validate()?;
        let activity_db_owned: ActivityDB = activity_update.into();
        let activity_id_owned = activity_db_owned.id.clone();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Activity> {
                let mut activity_to_update = activity_db_owned;
                let existing = activities::table
                    .find(&activity_id_owned)
                    .first::<ActivityDB>(conn)?;

                activity_to_update.created_at = existing.created_at;
                activity_to_update.updated_at = chrono::Utc::now().to_rfc3339();

                let updated_activity = diesel::update(activities::table.find(&activity_to_update.id))
                    .set(&activity_to_update)
                    .get_result::<ActivityDB>(conn)?;
                Ok(Activity::from(updated_activity))
            })
            .await
    }

    async fn delete_activity(&self, activity_id: String) -> Result<Activity> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Activity> {
                let activity = activities::table
                    .find(&activity_id)
                    .first::<ActivityDB>(conn)?;
                diesel::delete(activities::table.filter(activities::id.eq(&activity_id)))
                    .execute(conn)?;
                Ok(activity.into())
            })
            .await
    }

    /// Retrieves activities by account ID
    fn get_activities_by_account_id(&self, account_id: &String) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)?;

        let activities_db = activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::account_id.eq(account_id))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)?;

        Ok(activities_db.into_iter().map(Activity::from).collect())
    }

    /// Retrieves activities by account IDs
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)?;

        let activities_db = activities::table
            .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::account_id.eq_any(account_ids))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)?;

        Ok(activities_db.into_iter().map(Activity::from).collect())
    }

    /// Calculates the average cost for an asset in an account
    fn calculate_average_cost(&self, account_id: &str, asset_id: &str) -> Result<Decimal> {
        let mut conn = get_connection(&self.pool)?;

        #[derive(QueryableByName, Debug)]
        struct AverageCost {
            #[diesel(sql_type = diesel::sql_types::Text)]
            average_cost: String,
        }

        let result: AverageCost = diesel::sql_query(
            r#"
            WITH running_totals AS (
                SELECT
                    CAST(quantity AS TEXT) as quantity,
                    CAST(unit_price AS TEXT) as unit_price,
                    CAST(quantity AS TEXT) AS quantity_change,
                    CAST(CAST(quantity AS DECIMAL) * CAST(unit_price AS DECIMAL) AS TEXT) AS value_change,
                    CAST(SUM(CAST(quantity AS DECIMAL)) OVER (ORDER BY activity_date, id) AS TEXT) AS running_quantity,
                    CAST(SUM(CAST(quantity AS DECIMAL) * CAST(unit_price AS DECIMAL)) OVER (ORDER BY activity_date, id) AS TEXT) AS running_value
                FROM activities
                WHERE account_id = ?1 AND asset_id = ?2
                  AND activity_type IN ('BUY', 'TRANSFER_IN')
            )
            SELECT
                CASE
                    WHEN SUM(CAST(quantity_change AS DECIMAL)) > 0
                    THEN CAST(CAST(SUM(CAST(value_change AS DECIMAL)) AS DECIMAL) / CAST(SUM(CAST(quantity_change AS DECIMAL)) AS DECIMAL) AS TEXT)
                    ELSE '0'
                END AS average_cost
            FROM running_totals
            "#,
        )
        .bind::<diesel::sql_types::Text, _>(account_id)
        .bind::<diesel::sql_types::Text, _>(asset_id)
        .get_result(&mut conn)?;

        Ok(Decimal::from_str(&result.average_cost).unwrap_or_default())
    }

    /// Gets the import mapping for a given account ID
    fn get_import_mapping(&self, some_account_id: &str) -> Result<Option<ImportMapping>> {
        let mut conn = get_connection(&self.pool)?;

        activity_import_profiles::table
            .filter(activity_import_profiles::account_id.eq(some_account_id))
            .first::<ImportMapping>(&mut conn)
            .optional()
            .map_err(Error::from)
    }

    async fn save_import_mapping(&self, mapping: &ImportMapping) -> Result<()> {
        let mapping_owned = mapping.clone();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                let profile_db = mapping_owned;
                diesel::insert_into(activity_import_profiles::table)
                    .values(&profile_db)
                    .on_conflict(activity_import_profiles::account_id)
                    .do_update()
                    .set(&profile_db)
                    .execute(conn)?;
                Ok(())
            })
            .await
    }

    async fn create_activities(&self, activities_vec: Vec<NewActivity>) -> Result<usize> {
        if activities_vec.is_empty() {
            return Ok(0);
        }
        // Validate all activities first
        for new_act in &activities_vec {
            new_act.validate()?;
        }
        // Convert to ActivityDB and assign IDs
        let activities_db_owned: Vec<ActivityDB> = activities_vec
            .into_iter() // Consumes activities_vec
            .map(|new_act| {
                let mut db: ActivityDB = new_act.into();
                db.id = Uuid::new_v4().to_string();
                db
            })
            .collect();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                let num_inserted = diesel::insert_into(activities::table)
                    .values(&activities_db_owned)
                    .execute(conn)?;
                Ok(num_inserted)
            })
            .await
    }

    /// Retrieves deposit activities for specified accounts within a year as raw data
    fn get_deposit_activities(
        &self,
        account_ids: &[String],
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
    ) -> Result<Vec<(String, Decimal, Decimal, String, Option<Decimal>)>> {
        let mut conn = get_connection(&self.pool)?;

        // Use a proper join with explicit ON condition
        let results = activities::table
            .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
            .filter(accounts::id.eq_any(account_ids))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq("DEPOSIT"))
            .filter(activities::activity_date.between(
                Utc.from_utc_datetime(&start_date).to_rfc3339(),
                Utc.from_utc_datetime(&end_date).to_rfc3339(),
            ))
            .select((
                activities::account_id,
                activities::quantity,
                activities::unit_price,
                activities::currency,
                activities::amount,
            ))
            .load::<(String, String, String, String, Option<String>)>(&mut conn)
            .map_err(ActivityError::from)?;

        // Convert string values to Decimal
        let converted_results = results
            .into_iter()
            .map(|(account_id, quantity, unit_price, currency, amount)| {
                Ok((
                    account_id,
                    Decimal::from_str(&quantity)?,
                    Decimal::from_str(&unit_price)?,
                    currency,
                    amount.map(|a| Decimal::from_str(&a)).transpose()?,
                ))
            })
            .collect::<std::result::Result<Vec<_>, rust_decimal::Error>>()
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        Ok(converted_results)
    }

    fn get_income_activities_data(&self) -> Result<Vec<IncomeData>> {
        let mut conn = get_connection(&self.pool)?;

        let query = "SELECT strftime('%Y-%m', a.activity_date) as date,
             a.activity_type as income_type,
             a.asset_id as symbol,
             COALESCE(ast.name, 'Unknown') as symbol_name,
             a.currency,
             a.amount
             FROM activities a
             LEFT JOIN assets ast ON a.asset_id = ast.id
             INNER JOIN accounts acc ON a.account_id = acc.id
             WHERE a.activity_type IN ('DIVIDEND', 'INTEREST', 'OTHER_INCOME')
             AND acc.is_active = 1
             ORDER BY a.activity_date";

        // Define a struct to hold the raw query results
        #[derive(QueryableByName, Debug)]
        struct RawIncomeData {
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub date: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub income_type: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub symbol: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub symbol_name: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub currency: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub amount: String,
        }

        let raw_results = diesel::sql_query(query)
            .load::<RawIncomeData>(&mut conn)
            .map_err(ActivityError::from)?;

        // Transform raw results into IncomeData
        let results = raw_results
            .into_iter()
            .map(|raw| {
                let amount = Decimal::from_str(&raw.amount).unwrap_or_else(|_| Decimal::zero());
                Ok(IncomeData {
                    date: raw.date,
                    income_type: raw.income_type,
                    symbol: raw.symbol,
                    symbol_name: raw.symbol_name,
                    currency: raw.currency,
                    amount,
                })
            })
            .collect::<Result<Vec<IncomeData>>>()?; // Collect into Result

        Ok(results)
    }

    fn get_first_activity_date_overall(&self) -> Result<DateTime<Utc>> {
        let mut conn = get_connection(&self.pool)?;

        let min_date_str = activities::table
            .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
            .filter(accounts::is_active.eq(true))
            .select(min(activities::activity_date))
            .first::<Option<String>>(&mut conn)
            .map_err(Error::from)?
            .ok_or(ActivityError::NotFound("No activities found.".to_string()))?;

        // Parse the string result
        DateTime::parse_from_rfc3339(&min_date_str)
            .map(|dt| dt.with_timezone(&Utc))
            .map_err(|e| ActivityError::InvalidData(format!("Failed to parse date: {}", e)).into())
    }

    /// Gets the first activity date for given account IDs
    fn get_first_activity_date(
        &self,
        account_ids: Option<&[String]>,
    ) -> Result<Option<DateTime<Utc>>> {
        let mut conn = get_connection(&self.pool)?;

        let mut query = activities::table
            .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
            .filter(accounts::is_active.eq(true))
            .select(min(activities::activity_date))
            .into_boxed();

        if let Some(ids) = account_ids {
            query = query.filter(activities::account_id.eq_any(ids));
        }

        let min_date_str_opt = query
            .first::<Option<String>>(&mut conn)
            .map_err(Error::from)?;

        match min_date_str_opt {
            Some(date_str) => DateTime::parse_from_rfc3339(&date_str)
                .map(|dt| Some(dt.with_timezone(&Utc)))
                .map_err(|e| ActivityError::InvalidData(format!("Failed to parse date: {}", e)).into()),
            None => Ok(None), // If no activity found, return None
        }
    }
}
