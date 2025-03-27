use diesel::prelude::*;
use diesel::r2d2::{Pool, ConnectionManager};
use diesel::sqlite::SqliteConnection;
use diesel::expression_methods::ExpressionMethods;
use log::info;
use uuid::Uuid;
use chrono::NaiveDate;
use chrono::NaiveDateTime;
use std::sync::Arc;
use rust_decimal::Decimal;
use std::str::FromStr;

use crate::activities::activities_constants::*;
use crate::activities::activities_errors::{ActivityError, Result};
use crate::activities::activities_model::*;
use crate::schema::{accounts, activities, activity_import_profiles, assets};
use crate::db::get_connection;

/// Repository for managing activity data in the database
pub struct ActivityRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl ActivityRepository {
    /// Creates a new ActivityRepository instance
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        Self { pool }
    }

    /// Retrieves all trading activities for active accounts
    pub fn get_trading_activities(&self) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq_any(TRADING_ACTIVITY_TYPES))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)
            .map(|activities| activities.into_iter().map(Activity::from).collect())
            .map_err(ActivityError::from)
    }

    /// Retrieves all income activities for active accounts
    pub fn get_income_activities(&self) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq_any(INCOME_ACTIVITY_TYPES))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)
            .map(|activities| activities.into_iter().map(Activity::from).collect())
            .map_err(ActivityError::from)
    }

    /// Retrieves all activities for active accounts
    pub fn get_activities(&self) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)
            .map(|activities| activities.into_iter().map(Activity::from).collect())
            .map_err(ActivityError::from)
    }

    pub fn search_activities(
        &self,
        page: i64,                                 // Page number, 1-based
        page_size: i64,                            // Number of items per page
        account_id_filter: Option<Vec<String>>,    // Optional account_id filter
        activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
        asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
        sort: Option<Sort>,                        // Optional sort
    ) -> Result<ActivitySearchResponse> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

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
        let total_row_count = create_base_query(&conn).count().get_result::<i64>(&mut conn)?;

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
                assets::data_source
            ))
            .limit(page_size)
            .offset(offset)
            .load::<ActivityDetails>(&mut conn)?;

        Ok(ActivitySearchResponse {
            data: results,
            meta: ActivitySearchResponseMeta { total_row_count },
        })
    }

    /// Creates a new activity
    pub fn create_activity(&self, new_activity: NewActivity) -> Result<Activity> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        new_activity.validate()?;

        let mut activity_db: ActivityDB = new_activity.into();
        activity_db.id = Uuid::new_v4().to_string();

        info!("Creating activity in DB: {:?}", activity_db);

        diesel::insert_into(activities::table)
            .values(&activity_db)
            .get_result::<ActivityDB>(&mut conn)
            .map(Activity::from)
            .map_err(ActivityError::from)
    }

    /// Updates an existing activity
    pub fn update_activity(&self, activity_update: ActivityUpdate) -> Result<Activity> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        activity_update.validate()?;

        let mut activity_db: ActivityDB = activity_update.into();
        let existing = activities::table
            .find(&activity_db.id)
            .first::<ActivityDB>(&mut conn)?;

        activity_db.created_at = existing.created_at;
        activity_db.updated_at = chrono::Utc::now().naive_utc();

        diesel::update(activities::table.find(&activity_db.id))
            .set(&activity_db)
            .get_result::<ActivityDB>(&mut conn)
            .map(Activity::from)
            .map_err(ActivityError::from)
    }

    /// Deletes an activity by ID
    pub fn delete_activity(&self, activity_id: String) -> Result<Activity> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        let activity = activities::table
            .find(&activity_id)
            .first::<ActivityDB>(&mut conn)?;

        diesel::delete(activities::table.filter(activities::id.eq(activity_id)))
            .execute(&mut conn)?;

        Ok(activity.into())
    }

     /// Retrieves activities by account ID
    pub fn get_activities_by_account_id(&self, account_id: &String) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::account_id.eq(account_id))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)
            .map(|activities| activities.into_iter().map(Activity::from).collect())
            .map_err(ActivityError::from)
    }

    /// Retrieves activities by account IDs
    pub fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        activities::table
            .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::account_id.eq_any(account_ids))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)
            .map(|activities| activities.into_iter().map(Activity::from).collect())
            .map_err(ActivityError::from)
    }

    /// Calculates the average cost for an asset in an account
    pub fn calculate_average_cost(
        &self,
        account_id: &str,
        asset_id: &str,
    ) -> Result<Decimal> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

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

    /// Gets the first activity date for given account IDs
    pub fn get_first_activity_date(
        &self,
        account_ids: Option<&[String]>,
    ) -> Result<Option<NaiveDate>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        let mut query = activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .into_boxed();

        if let Some(ids) = account_ids {
            query = query.filter(activities::account_id.eq_any(ids));
        }

        query
            .select(diesel::dsl::min(diesel::dsl::date(
                activities::activity_date,
            )))
            .first::<Option<NaiveDate>>(&mut conn)
            .map_err(ActivityError::from)
    }

    /// Gets the import mapping for a given account ID
    pub fn get_import_mapping(&self, some_account_id: &str) -> Result<Option<ImportMapping>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        activity_import_profiles::table
            .filter(activity_import_profiles::account_id.eq(some_account_id))
            .first::<ImportMapping>(&mut conn)
            .optional()
            .map_err(ActivityError::from)
    }

    /// Saves or updates an import mapping
    pub fn save_import_mapping(&self, mapping: &ImportMapping) -> Result<()> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        diesel::insert_into(activity_import_profiles::table)
            .values(mapping)
            .on_conflict(activity_import_profiles::account_id)
            .do_update()
            .set((
                activity_import_profiles::field_mappings.eq(&mapping.field_mappings),
                activity_import_profiles::activity_mappings.eq(&mapping.activity_mappings),
                activity_import_profiles::symbol_mappings.eq(&mapping.symbol_mappings),
                activity_import_profiles::updated_at.eq(&mapping.updated_at),
            ))
            .execute(&mut conn)
            .map_err(ActivityError::from)?;
        Ok(())
    }

    /// Creates multiple activities in a single transaction
    pub fn create_activities(&self, mut activities: Vec<NewActivity>) -> Result<usize> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        conn.transaction(|conn| {
            // Generate UUIDs for activities that don't have IDs
            for activity in activities.iter_mut() {
                if activity.id.is_none() {
                    activity.id = Some(Uuid::new_v4().to_string());
                }
                // Validate each activity
                activity.validate()?;
            }

            // Convert NewActivity to ActivityDB for insertion
            let activities_db: Vec<ActivityDB> = activities.into_iter()
                .map(|activity| {
                    let mut activity_db: ActivityDB = activity.into();
                    activity_db.created_at = chrono::Utc::now().naive_utc();
                    activity_db.updated_at = activity_db.created_at;
                    activity_db
                })
                .collect();

            // Perform batch insert
            diesel::insert_into(activities::table)
                .values(activities_db)
                .execute(conn)
                .map_err(ActivityError::from)
        })
    }

    /// Retrieves deposit activities for specified accounts within a year as raw data
    pub fn get_deposit_activities(
        &self,
        account_ids: &[String],
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
    ) -> Result<Vec<(String, Decimal, Decimal, String, Option<Decimal>)>> {
        let mut conn = get_connection(&self.pool)
            .map_err(|e| ActivityError::DatabaseError(e.to_string()))?;

        // Use a proper join with explicit ON condition
        let results = activities::table
            .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
            .filter(accounts::id.eq_any(account_ids))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq("DEPOSIT"))
            .filter(activities::activity_date.between(start_date, end_date))
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
} 