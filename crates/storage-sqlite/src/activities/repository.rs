use chrono::{DateTime, NaiveDate, NaiveDateTime, TimeZone, Utc};
use diesel::expression_methods::ExpressionMethods;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use rust_decimal::Decimal;
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

use wealthfolio_core::activities::ActivityError;
use wealthfolio_core::activities::{
    Activity, ActivityBulkIdentifierMapping, ActivityBulkMutationResult, ActivityDetails,
    ActivityRepositoryTrait, ActivitySearchResponse, ActivitySearchResponseMeta, ActivityUpdate,
    ActivityUpsert, BulkUpsertResult, ImportMapping, IncomeData, NewActivity, Sort,
    INCOME_ACTIVITY_TYPES, TRADING_ACTIVITY_TYPES,
};
use wealthfolio_core::limits::ContributionActivity;
use wealthfolio_core::{Error, Result};

use super::model::{ActivityDB, ActivityDetailsDB, ImportMappingDB};
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{accounts, activities, activity_import_profiles, assets};
use crate::utils::chunk_for_sqlite;
use async_trait::async_trait;
use diesel::dsl::{max, min};
use num_traits::Zero;

/// Repository for managing activity data in the database
pub struct ActivityRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

fn apply_decimal_patch(existing: Option<String>, patch: Option<Option<Decimal>>) -> Option<String> {
    match patch {
        None => existing,
        Some(None) => None,
        Some(Some(value)) => Some(value.to_string()),
    }
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
        needs_review_filter: Option<bool>, // Optional needs_review filter (maps to DRAFT status)
        date_from: Option<NaiveDate>,      // Optional start date filter (inclusive)
        date_to: Option<NaiveDate>,        // Optional end date filter (inclusive)
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
                let pattern = format!("%{}%", keyword);
                query = query.filter(
                    assets::id
                        .like(pattern.clone())
                        .or(assets::name.like(pattern)),
                );
            }
            // Map needs_review_filter to status filter (DRAFT status means needs review)
            if let Some(needs_review) = needs_review_filter {
                if needs_review {
                    query = query.filter(activities::status.eq("DRAFT"));
                } else {
                    query = query.filter(activities::status.ne("DRAFT"));
                }
            }
            // Date range filters (activity_date is stored as RFC3339 string, compare lexicographically)
            if let Some(from_date) = date_from {
                // Start of day in RFC3339 format for lexicographic comparison
                let from_str = format!("{}T00:00:00", from_date);
                query = query.filter(activities::activity_date.ge(from_str));
            }
            if let Some(to_date) = date_to {
                // End of day in RFC3339 format for lexicographic comparison
                let to_str = format!("{}T23:59:59", to_date);
                query = query.filter(activities::activity_date.le(to_str));
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
                assets::display_code.nullable(),
                assets::name.nullable(),
                assets::quote_mode.nullable(),
                activities::metadata,
            ))
            .limit(page_size)
            .offset(offset)
            .load::<ActivityDetailsDB>(&mut conn)
            .map_err(StorageError::from)?;

        let results: Vec<ActivityDetails> =
            results_db.into_iter().map(ActivityDetails::from).collect();

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
        let activity_update_owned = activity_update.clone();
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
                    quantity,
                    unit_price,
                    amount,
                    fee,
                    ..
                } = existing;

                activity_to_update.created_at = created_at;
                activity_to_update.quantity =
                    apply_decimal_patch(quantity, activity_update_owned.quantity);
                activity_to_update.unit_price =
                    apply_decimal_patch(unit_price, activity_update_owned.unit_price);
                activity_to_update.amount =
                    apply_decimal_patch(amount, activity_update_owned.amount);
                activity_to_update.fee = apply_decimal_patch(fee, activity_update_owned.fee);
                activity_to_update.fx_rate =
                    apply_decimal_patch(fx_rate, activity_update_owned.fx_rate);
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
                        let update_owned = update.clone();
                        let mut activity_db: ActivityDB = update.into();
                        let existing = activities::table
                            .select(ActivityDB::as_select())
                            .find(&activity_db.id)
                            .first::<ActivityDB>(conn)
                            .map_err(StorageError::from)?;

                        // Preserve fields from existing record
                        let ActivityDB {
                            created_at,
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
                            quantity,
                            unit_price,
                            amount,
                            fee,
                            fx_rate,
                            ..
                        } = existing;

                        activity_db.created_at = created_at;
                        activity_db.quantity = apply_decimal_patch(quantity, update_owned.quantity);
                        activity_db.unit_price =
                            apply_decimal_patch(unit_price, update_owned.unit_price);
                        activity_db.amount = apply_decimal_patch(amount, update_owned.amount);
                        activity_db.fee = apply_decimal_patch(fee, update_owned.fee);
                        activity_db.fx_rate = apply_decimal_patch(fx_rate, update_owned.fx_rate);
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
    /// Note: Filters by is_archived (not is_active) so hidden accounts still have their
    /// activities included in calculations. Only archived accounts are excluded.
    fn get_activities_by_account_ids(&self, account_ids: &[String]) -> Result<Vec<Activity>> {
        let mut conn = get_connection(&self.pool)?;

        let activities_db = activities::table
            .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
            .filter(accounts::is_archived.eq(false))
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

    /// Fetches contribution-eligible activities (DEPOSIT, TRANSFER_IN, TRANSFER_OUT, CREDIT)
    /// for the given accounts within the date range.
    fn get_contribution_activities(
        &self,
        account_ids: &[String],
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
    ) -> Result<Vec<ContributionActivity>> {
        let mut conn = get_connection(&self.pool)?;

        const CONTRIBUTION_TYPES: [&str; 4] = ["DEPOSIT", "TRANSFER_IN", "TRANSFER_OUT", "CREDIT"];

        let results = activities::table
            .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
            .filter(accounts::id.eq_any(account_ids))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq_any(CONTRIBUTION_TYPES))
            .filter(activities::activity_date.between(
                Utc.from_utc_datetime(&start_date).to_rfc3339(),
                Utc.from_utc_datetime(&end_date).to_rfc3339(),
            ))
            .select((
                activities::account_id,
                activities::activity_type,
                activities::activity_date,
                activities::amount,
                activities::currency,
                activities::metadata,
                activities::source_group_id,
            ))
            .load::<(
                String,
                String,
                String,
                Option<String>,
                String,
                Option<String>,
                Option<String>,
            )>(&mut conn)
            .map_err(ActivityError::from)?;

        // Convert to ContributionActivity structs
        let activities = results
            .into_iter()
            .filter_map(
                |(
                    account_id,
                    activity_type,
                    activity_date_str,
                    amount_str,
                    currency,
                    metadata,
                    source_group_id,
                )| {
                    // Parse date - try RFC3339 first, then date-only format
                    let activity_date = chrono::DateTime::parse_from_rfc3339(&activity_date_str)
                        .map(|dt| dt.naive_utc().date())
                        .or_else(|_| NaiveDate::parse_from_str(&activity_date_str, "%Y-%m-%d"))
                        .ok()?;

                    let amount = amount_str.and_then(|s| Decimal::from_str(&s).ok());

                    Some(ContributionActivity {
                        account_id,
                        activity_type,
                        activity_date,
                        amount,
                        currency,
                        metadata,
                        source_group_id,
                    })
                },
            )
            .collect();

        Ok(activities)
    }

    fn get_income_activities_data(&self) -> Result<Vec<IncomeData>> {
        let mut conn = get_connection(&self.pool)?;

        // For income reporting, we need to handle different subtypes:
        // - Regular DIVIDEND/INTEREST: use the `amount` field directly
        // - STAKING_REWARD/DRIP/DIVIDEND_IN_KIND subtypes: if amount is 0, calculate from:
        //   1. quantity * unit_price (if unit_price is available)
        //   2. quantity * market_price from quotes table (fallback)
        let query = "SELECT strftime('%Y-%m', a.activity_date) as date,
             a.activity_type as income_type,
             COALESCE(a.asset_id, 'CASH') as asset_id,
             COALESCE(ast.kind, 'CASH') as asset_kind,
             COALESCE(ast.symbol, 'CASH') as symbol,
             COALESCE(ast.name, 'Cash') as symbol_name,
             a.currency,
             CASE
                 WHEN a.subtype IN ('STAKING_REWARD', 'DRIP', 'DIVIDEND_IN_KIND')
                      AND (a.amount IS NULL OR CAST(a.amount AS REAL) = 0)
                 THEN CASE
                     WHEN a.unit_price IS NOT NULL AND CAST(a.unit_price AS REAL) > 0
                     THEN CAST(CAST(a.quantity AS REAL) * CAST(a.unit_price AS REAL) AS TEXT)
                     WHEN q.close IS NOT NULL
                     THEN CAST(CAST(a.quantity AS REAL) * CAST(q.close AS REAL) AS TEXT)
                     ELSE '0'
                 END
                 ELSE COALESCE(a.amount, '0')
             END as amount
             FROM activities a
             LEFT JOIN assets ast ON a.asset_id = ast.id
             INNER JOIN accounts acc ON a.account_id = acc.id
             LEFT JOIN quotes q ON a.asset_id = q.asset_id
                 AND date(a.activity_date) = q.day
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
            pub asset_id: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub asset_kind: String,
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
                    asset_id: raw.asset_id,
                    asset_kind: raw.asset_kind,
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

    /// Gets the first and last activity dates for each asset in the provided list.
    ///
    /// Uses chunking to avoid SQLite's parameter limit in IN (...) queries.
    fn get_activity_bounds_for_assets(
        &self,
        asset_ids: &[String],
    ) -> Result<HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)>> {
        if asset_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let mut conn = get_connection(&self.pool)?;
        let mut result_map: HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)> =
            HashMap::new();

        // Chunk the asset_ids to avoid SQLite parameter limits
        for chunk in chunk_for_sqlite(asset_ids) {
            // Query to get MIN and MAX activity dates per asset_id
            let results = activities::table
                .inner_join(accounts::table.on(activities::account_id.eq(accounts::id)))
                .filter(accounts::is_active.eq(true))
                .filter(activities::asset_id.eq_any(chunk))
                .group_by(activities::asset_id)
                .select((
                    activities::asset_id.assume_not_null(),
                    min(activities::activity_date),
                    max(activities::activity_date),
                ))
                .load::<(String, Option<String>, Option<String>)>(&mut conn)
                .map_err(StorageError::from)?;

            for (asset_id, min_date_str, max_date_str) in results {
                // Parse the date strings (they are stored as RFC3339, extract the date portion)
                let first_date = min_date_str.and_then(|s| {
                    // Activity dates are stored as RFC3339, parse to get the date
                    DateTime::parse_from_rfc3339(&s)
                        .ok()
                        .map(|dt| dt.date_naive())
                });

                let last_date = max_date_str.and_then(|s| {
                    DateTime::parse_from_rfc3339(&s)
                        .ok()
                        .map(|dt| dt.date_naive())
                });

                result_map.insert(asset_id, (first_date, last_date));
            }
        }

        Ok(result_map)
    }

    /// Checks for existing activities with the given idempotency keys.
    ///
    /// Returns a map of {idempotency_key: existing_activity_id} for keys that already exist.
    fn check_existing_duplicates(
        &self,
        idempotency_keys: &[String],
    ) -> Result<HashMap<String, String>> {
        if idempotency_keys.is_empty() {
            return Ok(HashMap::new());
        }

        let mut conn = get_connection(&self.pool)?;
        let mut result_map: HashMap<String, String> = HashMap::new();

        // Chunk the keys to avoid SQLite parameter limits
        for chunk in chunk_for_sqlite(idempotency_keys) {
            let results = activities::table
                .filter(activities::idempotency_key.eq_any(chunk))
                .select((activities::id, activities::idempotency_key))
                .load::<(String, Option<String>)>(&mut conn)
                .map_err(StorageError::from)?;

            for (activity_id, key_opt) in results {
                if let Some(key) = key_opt {
                    result_map.insert(key, activity_id);
                }
            }
        }

        Ok(result_map)
    }

    /// Upserts multiple activities (insert or update on conflict by ID or idempotency_key).
    /// Respects is_user_modified flag - skips updates to user-modified activities.
    ///
    /// Returns statistics about the operation.
    async fn bulk_upsert(&self, activities_vec: Vec<ActivityUpsert>) -> Result<BulkUpsertResult> {
        use diesel::upsert::excluded;

        if activities_vec.is_empty() {
            return Ok(BulkUpsertResult::default());
        }

        // Convert to ActivityDB
        let activity_rows: Vec<ActivityDB> =
            activities_vec.into_iter().map(ActivityDB::from).collect();

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<BulkUpsertResult> {
                // Collect all activity IDs and idempotency keys for batch lookup
                let activity_ids: Vec<String> =
                    activity_rows.iter().map(|a| a.id.clone()).collect();
                let idempotency_keys: Vec<String> = activity_rows
                    .iter()
                    .filter_map(|a| a.idempotency_key.clone())
                    .collect();

                // Fetch existing activities by ID or idempotency_key in one query
                // This allows us to check is_user_modified and handle idempotency conflicts
                let existing_activities: Vec<(String, Option<String>, i32)> = activities::table
                    .filter(
                        activities::id
                            .eq_any(&activity_ids)
                            .or(activities::idempotency_key.eq_any(&idempotency_keys)),
                    )
                    .select((
                        activities::id,
                        activities::idempotency_key,
                        activities::is_user_modified,
                    ))
                    .load::<(String, Option<String>, i32)>(conn)
                    .map_err(StorageError::from)?;

                // Build lookup maps for quick access
                let mut existing_by_id: HashMap<String, i32> = HashMap::new();
                let mut existing_by_idemp: HashMap<String, (String, i32)> = HashMap::new();

                for (id, idemp_key, is_modified) in existing_activities {
                    existing_by_id.insert(id.clone(), is_modified);
                    if let Some(key) = idemp_key {
                        existing_by_idemp.insert(key, (id, is_modified));
                    }
                }

                let mut result = BulkUpsertResult::default();

                for mut activity_db in activity_rows {
                    let now_update = chrono::Utc::now().to_rfc3339();
                    let activity_id = activity_db.id.clone();
                    let idempotency_key = activity_db.idempotency_key.clone();

                    // Check if this activity exists and is user-modified
                    // First check by ID
                    if let Some(&is_modified) = existing_by_id.get(&activity_id) {
                        if is_modified != 0 {
                            log::debug!(
                                "Skipping user-modified activity {} (type={})",
                                activity_id,
                                activity_db.activity_type
                            );
                            result.skipped += 1;
                            continue;
                        }
                    }

                    // If not found by ID, check by idempotency_key
                    // This handles cases where provider IDs changed but content is the same
                    let is_existing = existing_by_id.contains_key(&activity_id);
                    if !is_existing {
                        if let Some(ref key) = idempotency_key {
                            if let Some((existing_id, is_modified)) = existing_by_idemp.get(key) {
                                if *is_modified != 0 {
                                    log::debug!(
                                        "Skipping update for user-modified activity (matched by idempotency_key: {} -> {})",
                                        activity_id,
                                        existing_id
                                    );
                                    result.skipped += 1;
                                    continue;
                                }
                                // Found by idempotency_key - update the existing record instead
                                log::debug!(
                                    "Activity {} matched existing {} by idempotency_key, updating existing",
                                    activity_id,
                                    existing_id
                                );
                                activity_db.id = existing_id.clone();
                            }
                        }
                    }

                    // Determine if this is a create or update for counting purposes
                    let will_update = existing_by_id.contains_key(&activity_db.id)
                        || (idempotency_key.is_some()
                            && existing_by_idemp.contains_key(idempotency_key.as_ref().unwrap()));

                    match diesel::insert_into(activities::table)
                        .values(&activity_db)
                        .on_conflict(activities::id)
                        .do_update()
                        .set((
                            activities::account_id.eq(excluded(activities::account_id)),
                            activities::asset_id.eq(excluded(activities::asset_id)),
                            activities::activity_type.eq(excluded(activities::activity_type)),
                            activities::subtype.eq(excluded(activities::subtype)),
                            activities::activity_date.eq(excluded(activities::activity_date)),
                            activities::quantity.eq(excluded(activities::quantity)),
                            activities::unit_price.eq(excluded(activities::unit_price)),
                            activities::currency.eq(excluded(activities::currency)),
                            activities::fee.eq(excluded(activities::fee)),
                            activities::amount.eq(excluded(activities::amount)),
                            activities::status.eq(excluded(activities::status)),
                            activities::notes.eq(excluded(activities::notes)),
                            activities::fx_rate.eq(excluded(activities::fx_rate)),
                            activities::metadata.eq(excluded(activities::metadata)),
                            activities::source_system.eq(excluded(activities::source_system)),
                            activities::source_record_id.eq(excluded(activities::source_record_id)),
                            activities::source_group_id.eq(excluded(activities::source_group_id)),
                            activities::needs_review.eq(excluded(activities::needs_review)),
                            activities::idempotency_key.eq(excluded(activities::idempotency_key)),
                            activities::import_run_id.eq(excluded(activities::import_run_id)),
                            activities::updated_at.eq(now_update),
                        ))
                        .execute(conn)
                    {
                        Ok(count) => {
                            if count > 0 {
                                result.upserted += count;
                                if will_update {
                                    result.updated += count;
                                } else {
                                    result.created += count;
                                }
                            }
                        }
                        Err(e) => {
                            log::error!(
                                "Failed to upsert activity {} (type={}): {:?}",
                                activity_db.id,
                                activity_db.activity_type,
                                e
                            );
                            return Err(StorageError::from(e).into());
                        }
                    }
                }

                if result.skipped > 0 {
                    log::info!(
                        "Skipped {} user-modified activities during bulk upsert",
                        result.skipped
                    );
                }

                log::debug!(
                    "Bulk upsert complete: {} upserted ({} created, {} updated), {} skipped",
                    result.upserted,
                    result.created,
                    result.updated,
                    result.skipped
                );

                Ok(result)
            })
            .await
    }

    async fn reassign_asset(&self, old_asset_id: &str, new_asset_id: &str) -> Result<u32> {
        let old_id = old_asset_id.to_string();
        let new_id = new_asset_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<u32> {
                let count =
                    diesel::update(activities::table.filter(activities::asset_id.eq(&old_id)))
                        .set(activities::asset_id.eq(&new_id))
                        .execute(conn)
                        .map_err(StorageError::from)?;
                Ok(count as u32)
            })
            .await
    }

    async fn get_activity_accounts_and_currencies_by_asset_id(
        &self,
        asset_id: &str,
    ) -> Result<(Vec<String>, Vec<String>)> {
        let asset_id_owned = asset_id.to_string();
        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<(Vec<String>, Vec<String>)> {
                    let rows: Vec<(String, String)> = activities::table
                        .filter(activities::asset_id.eq(&asset_id_owned))
                        .select((activities::account_id, activities::currency))
                        .distinct()
                        .load(conn)
                        .map_err(StorageError::from)?;

                    let mut account_ids: HashSet<String> = HashSet::new();
                    let mut currencies: HashSet<String> = HashSet::new();

                    for (account_id, currency) in rows {
                        if !account_id.is_empty() {
                            account_ids.insert(account_id);
                        }
                        if !currency.is_empty() {
                            currencies.insert(currency);
                        }
                    }

                    Ok((
                        account_ids.into_iter().collect(),
                        currencies.into_iter().collect(),
                    ))
                },
            )
            .await
    }
}
