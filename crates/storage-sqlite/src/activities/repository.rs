use chrono::{DateTime, NaiveDateTime, TimeZone, Utc};
use diesel::expression_methods::ExpressionMethods;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use rust_decimal::Decimal;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

use wealthfolio_core::activities::{
    Activity, ActivityBulkIdentifierMapping, ActivityBulkMutationResult, ActivityDetails,
    ActivityRepositoryTrait, ActivitySearchResponse, ActivitySearchResponseMeta, ActivityUpdate,
    ImportMapping, IncomeData, NewActivity, Sort, INCOME_ACTIVITY_TYPES, TRADING_ACTIVITY_TYPES,
};
use wealthfolio_core::activities::ActivityError;
use wealthfolio_core::{Error, Result};

use super::model::{ActivityDB, ActivityDetailsDB, ImportMappingDB};
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{accounts, activities, activity_import_profiles, assets};
use async_trait::async_trait;
use diesel::dsl::min;
use num_traits::Zero;

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
            .select(ActivityDB::as_select())
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
            .load::<ActivityDB>(&mut conn)
            .map_err(StorageError::from)?;

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
            .load::<ActivityDB>(&mut conn)
            .map_err(StorageError::from)?;

        Ok(activities_db.into_iter().map(Activity::from).collect())
    }

    fn get_activities(&self) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)?;

        let activities_db = activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)
            .map_err(StorageError::from)?;

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
        needs_review_filter: Option<bool>,           // Optional needs_review filter (maps to DRAFT status)
    ) -> Result<ActivitySearchResponse> {
        let mut conn = get_connection(&self.pool)?;

        let offset = page * page_size;

        // Function to create base query - now using LEFT JOIN for assets since asset_id can be NULL
        let create_base_query = |_conn: &SqliteConnection| {
            let mut query = activities::table
                .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
                .left_join(assets::table.on(activities::asset_id.eq(assets::id.nullable())))
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
            // Map needs_review_filter to status filter (DRAFT status means needs review)
            if let Some(needs_review) = needs_review_filter {
                if needs_review {
                    query = query.filter(activities::status.eq("DRAFT"));
                } else {
                    query = query.filter(activities::status.ne("DRAFT"));
                }
            }

            // Apply sorting
            if let Some(ref sort) = sort {
                match sort.id.as_str() {
                    "date" => {
                        if sort.desc {
                            query = query.order((
                                activities::activity_date.desc(),
                                activities::created_at.asc(),
                            ));
                        } else {
                            query = query.order((
                                activities::activity_date.asc(),
                                activities::created_at.asc(),
                            ));
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
                    _ => {
                        query = query.order((
                            activities::activity_date.desc(),
                            activities::created_at.asc(),
                        ))
                    } // Default order
                }
            } else {
                query = query.order((
                    activities::activity_date.desc(),
                    activities::created_at.asc(),
                )); // Default order
            }

            query
        };

        // Count query
        let total_row_count = create_base_query(&conn)
            .count()
            .get_result::<i64>(&mut conn)
            .map_err(StorageError::from)?;

        // Data fetching query - updated to match new schema fields
        let results_db = create_base_query(&conn)
            .select((
                activities::id,
                activities::account_id,
                activities::asset_id,
                activities::activity_type,
                activities::subtype,
                activities::status,
                activities::activity_date,
                activities::quantity,
                activities::unit_price,
                activities::currency,
                activities::fee,
                activities::amount,
                activities::notes,
                activities::fx_rate,
                activities::needs_review,
                activities::is_user_modified,
                activities::source_system,
                activities::source_record_id,
                activities::idempotency_key,
                activities::import_run_id,
                activities::created_at,
                activities::updated_at,
                accounts::name,
                accounts::currency,
                assets::symbol.nullable(),
                assets::name.nullable(),
                assets::data_source.nullable(),
            ))
            .limit(page_size)
            .offset(offset)
            .load::<ActivityDetailsDB>(&mut conn)
            .map_err(StorageError::from)?;

        let results: Vec<ActivityDetails> = results_db.into_iter().map(ActivityDetails::from).collect();

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
                    .get_result::<ActivityDB>(conn)
                    .map_err(StorageError::from)?;
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
                    .select(ActivityDB::as_select())
                    .find(&activity_id_owned)
                    .first::<ActivityDB>(conn)
                    .map_err(StorageError::from)?;

                // Preserve fields from existing record that shouldn't be overwritten
                let ActivityDB {
                    created_at,
                    fx_rate,
                    source_system,
                    source_record_id,
                    source_group_id,
                    idempotency_key,
                    import_run_id,
                    activity_type_override,
                    source_type,
                    subtype,
                    settlement_date,
                    metadata,
                    ..
                } = existing;

                activity_to_update.created_at = created_at;
                if activity_to_update.fx_rate.is_none() {
                    activity_to_update.fx_rate = fx_rate;
                }
                // Preserve source identity fields
                if activity_to_update.source_system.is_none() {
                    activity_to_update.source_system = source_system;
                }
                if activity_to_update.source_record_id.is_none() {
                    activity_to_update.source_record_id = source_record_id;
                }
                if activity_to_update.source_group_id.is_none() {
                    activity_to_update.source_group_id = source_group_id;
                }
                if activity_to_update.idempotency_key.is_none() {
                    activity_to_update.idempotency_key = idempotency_key;
                }
                if activity_to_update.import_run_id.is_none() {
                    activity_to_update.import_run_id = import_run_id;
                }
                // Preserve classification fields
                if activity_to_update.activity_type_override.is_none() {
                    activity_to_update.activity_type_override = activity_type_override;
                }
                if activity_to_update.source_type.is_none() {
                    activity_to_update.source_type = source_type;
                }
                if activity_to_update.subtype.is_none() {
                    activity_to_update.subtype = subtype;
                }
                if activity_to_update.settlement_date.is_none() {
                    activity_to_update.settlement_date = settlement_date;
                }
                if activity_to_update.metadata.is_none() {
                    activity_to_update.metadata = metadata;
                }
                activity_to_update.updated_at = chrono::Utc::now().to_rfc3339();

                let updated_activity =
                    diesel::update(activities::table.find(&activity_to_update.id))
                        .set(&activity_to_update)
                        .get_result::<ActivityDB>(conn)
                        .map_err(StorageError::from)?;
                Ok(Activity::from(updated_activity))
            })
            .await
    }

    async fn delete_activity(&self, activity_id: String) -> Result<Activity> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Activity> {
                let activity = activities::table
                    .select(ActivityDB::as_select())
                    .find(&activity_id)
                    .first::<ActivityDB>(conn)
                    .map_err(StorageError::from)?;
                diesel::delete(activities::table.filter(activities::id.eq(&activity_id)))
                    .execute(conn)
                    .map_err(StorageError::from)?;
                Ok(activity.into())
            })
            .await
    }

    async fn bulk_mutate_activities(
        &self,
        creates: Vec<NewActivity>,
        updates: Vec<ActivityUpdate>,
        delete_ids: Vec<String>,
    ) -> Result<ActivityBulkMutationResult> {
        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<ActivityBulkMutationResult> {
                    let mut outcome = ActivityBulkMutationResult::default();

                    for delete_id in delete_ids {
                        let activity_db = activities::table
                            .select(ActivityDB::as_select())
                            .find(&delete_id)
                            .first::<ActivityDB>(conn)
                            .map_err(StorageError::from)?;
                        diesel::delete(activities::table.filter(activities::id.eq(&delete_id)))
                            .execute(conn)
                            .map_err(StorageError::from)?;
                        outcome.deleted.push(Activity::from(activity_db));
                    }

                    for update in updates {
                        update.validate()?;
                        let mut activity_db: ActivityDB = update.clone().into();
                        let existing = activities::table
                            .select(ActivityDB::as_select())
                            .find(&activity_db.id)
                            .first::<ActivityDB>(conn)
                            .map_err(StorageError::from)?;

                        // Preserve fields from existing record
                        let ActivityDB {
                            created_at,
                            fx_rate,
                            source_system,
                            source_record_id,
                            source_group_id,
                            idempotency_key,
                            import_run_id,
                            activity_type_override,
                            source_type,
                            subtype,
                            settlement_date,
                            metadata,
                            ..
                        } = existing;

                        activity_db.created_at = created_at;
                        if activity_db.fx_rate.is_none() {
                            activity_db.fx_rate = fx_rate;
                        }
                        if activity_db.source_system.is_none() {
                            activity_db.source_system = source_system;
                        }
                        if activity_db.source_record_id.is_none() {
                            activity_db.source_record_id = source_record_id;
                        }
                        if activity_db.source_group_id.is_none() {
                            activity_db.source_group_id = source_group_id;
                        }
                        if activity_db.idempotency_key.is_none() {
                            activity_db.idempotency_key = idempotency_key;
                        }
                        if activity_db.import_run_id.is_none() {
                            activity_db.import_run_id = import_run_id;
                        }
                        if activity_db.activity_type_override.is_none() {
                            activity_db.activity_type_override = activity_type_override;
                        }
                        if activity_db.source_type.is_none() {
                            activity_db.source_type = source_type;
                        }
                        if activity_db.subtype.is_none() {
                            activity_db.subtype = subtype;
                        }
                        if activity_db.settlement_date.is_none() {
                            activity_db.settlement_date = settlement_date;
                        }
                        if activity_db.metadata.is_none() {
                            activity_db.metadata = metadata;
                        }
                        activity_db.updated_at = chrono::Utc::now().to_rfc3339();

                        let updated_activity =
                            diesel::update(activities::table.find(&activity_db.id))
                                .set(&activity_db)
                                .get_result::<ActivityDB>(conn)
                                .map_err(StorageError::from)?;
                        outcome.updated.push(Activity::from(updated_activity));
                    }

                    for new_activity in creates {
                        new_activity.validate()?;
                        let temp_id = new_activity.id.clone();
                        let mut activity_db: ActivityDB = new_activity.into();
                        // Always generate a new UUID for created activities
                        let generated_id = Uuid::new_v4().to_string();
                        activity_db.id = generated_id.clone();
                        let inserted_activity = diesel::insert_into(activities::table)
                            .values(&activity_db)
                            .get_result::<ActivityDB>(conn)
                            .map_err(StorageError::from)?;
                        outcome
                            .created
                            .push(Activity::from(inserted_activity.clone()));
                        outcome
                            .created_mappings
                            .push(ActivityBulkIdentifierMapping {
                                temp_id: temp_id.filter(|id| !id.is_empty()),
                                activity_id: generated_id,
                            });
                    }

                    Ok(outcome)
                },
            )
            .await
    }

    /// Retrieves activities by account ID
    fn get_activities_by_account_id(&self, account_id: &str) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)?;

        let activities_db = activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::account_id.eq(account_id))
            .select(ActivityDB::as_select())
            .order(activities::activity_date.asc())
            .load::<ActivityDB>(&mut conn)
            .map_err(StorageError::from)?;

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
            .load::<ActivityDB>(&mut conn)
            .map_err(StorageError::from)?;

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
        .get_result(&mut conn)
        .map_err(StorageError::from)?;

        Ok(Decimal::from_str(&result.average_cost).unwrap_or_default())
    }

    /// Gets the import mapping for a given account ID
    fn get_import_mapping(&self, some_account_id: &str) -> Result<Option<ImportMapping>> {
        let mut conn = get_connection(&self.pool)?;

        let result = activity_import_profiles::table
            .filter(activity_import_profiles::account_id.eq(some_account_id))
            .first::<ImportMappingDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;

        Ok(result.map(ImportMapping::from))
    }

    async fn save_import_mapping(&self, mapping: &ImportMapping) -> Result<()> {
        let mapping_db: ImportMappingDB = mapping.clone().into();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> {
                diesel::insert_into(activity_import_profiles::table)
                    .values(&mapping_db)
                    .on_conflict(activity_import_profiles::account_id)
                    .do_update()
                    .set(&mapping_db)
                    .execute(conn)
                    .map_err(StorageError::from)?;
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
                    .execute(conn)
                    .map_err(StorageError::from)?;
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
            .load::<(String, Option<String>, Option<String>, String, Option<String>)>(&mut conn)
            .map_err(ActivityError::from)?;

        // Convert string values to Decimal
        let converted_results = results
            .into_iter()
            .map(|(account_id, quantity, unit_price, currency, amount)| {
                Ok((
                    account_id,
                    quantity
                        .map(|q| Decimal::from_str(&q))
                        .transpose()?
                        .unwrap_or(Decimal::ZERO),
                    unit_price
                        .map(|p| Decimal::from_str(&p))
                        .transpose()?
                        .unwrap_or(Decimal::ZERO),
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
             COALESCE(a.asset_id, 'CASH') as symbol,
             COALESCE(ast.name, 'Cash') as symbol_name,
             a.currency,
             COALESCE(a.amount, '0') as amount
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
            .map_err(StorageError::from)?
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
            .map_err(StorageError::from)?;

        match min_date_str_opt {
            Some(date_str) => DateTime::parse_from_rfc3339(&date_str)
                .map(|dt| Some(dt.with_timezone(&Utc)))
                .map_err(|e| {
                    ActivityError::InvalidData(format!("Failed to parse date: {}", e)).into()
                }),
            None => Ok(None), // If no activity found, return None
        }
    }
}
