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
use crate::schema::{accounts, activities, activity_import_profiles};
use crate::portfolio::income::{CapitalGainsData, CashIncomeData};
use crate::spending::SpendingData;
use crate::{Error, Result};
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
        page: i64,                                 // Page number, 0-based
        page_size: i64,                            // Number of items per page
        account_id_filter: Option<Vec<String>>,    // Optional account_id filter
        activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
        category_id_filter: Option<Vec<String>>,   // Optional category_id filter
        event_id_filter: Option<Vec<String>>,      // Optional event_id filter
        asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
        account_type_filter: Option<Vec<String>>,  // Optional account_type filter (e.g., SECURITIES, CASH)
        sort: Option<Sort>,                        // Optional sort
    ) -> Result<ActivitySearchResponse> {
        use diesel::sql_query;

        let mut conn = get_connection(&self.pool)?;
        let offset = page * page_size;

        // Build WHERE clause conditions
        let mut conditions = vec!["acc.is_active = 1".to_string()];

        if let Some(ref account_ids) = account_id_filter {
            if !account_ids.is_empty() {
                let ids = account_ids
                    .iter()
                    .map(|id| format!("'{}'", id.replace("'", "''")))
                    .collect::<Vec<_>>()
                    .join(", ");
                conditions.push(format!("a.account_id IN ({})", ids));
            }
        }

        if let Some(ref activity_types) = activity_type_filter {
            if !activity_types.is_empty() {
                let types = activity_types
                    .iter()
                    .map(|t| format!("'{}'", t.replace("'", "''")))
                    .collect::<Vec<_>>()
                    .join(", ");
                conditions.push(format!("a.activity_type IN ({})", types));
            }
        }

        if let Some(ref category_ids) = category_id_filter {
            if !category_ids.is_empty() {
                let ids = category_ids
                    .iter()
                    .map(|id| format!("'{}'", id.replace("'", "''")))
                    .collect::<Vec<_>>()
                    .join(", ");
                // Filter by either category_id or sub_category_id
                conditions.push(format!(
                    "(a.category_id IN ({}) OR a.sub_category_id IN ({}))",
                    ids, ids
                ));
            }
        }

        if let Some(ref event_ids) = event_id_filter {
            if !event_ids.is_empty() {
                let ids = event_ids
                    .iter()
                    .map(|id| format!("'{}'", id.replace("'", "''")))
                    .collect::<Vec<_>>()
                    .join(", ");
                conditions.push(format!("a.event_id IN ({})", ids));
            }
        }

        if let Some(ref keyword) = asset_id_keyword {
            let escaped = keyword.replace("'", "''");
            // Search in asset symbol, asset name, or activity name
            conditions.push(format!(
                "(ast.id LIKE '%{}%' OR ast.symbol LIKE '%{}%' OR ast.name LIKE '%{}%' OR a.name LIKE '%{}%')",
                escaped, escaped, escaped, escaped
            ));
        }

        if let Some(ref account_types) = account_type_filter {
            if !account_types.is_empty() {
                let types = account_types
                    .iter()
                    .map(|t| format!("'{}'", t.replace("'", "''")))
                    .collect::<Vec<_>>()
                    .join(", ");
                conditions.push(format!("acc.account_type IN ({})", types));
            }
        }

        let where_clause = conditions.join(" AND ");

        // Build ORDER BY clause
        let order_clause = if let Some(ref s) = sort {
            match s.id.as_str() {
                "date" => {
                    if s.desc {
                        "a.activity_date DESC, a.created_at ASC"
                    } else {
                        "a.activity_date ASC, a.created_at ASC"
                    }
                }
                "activityType" => {
                    if s.desc {
                        "a.activity_type DESC"
                    } else {
                        "a.activity_type ASC"
                    }
                }
                "assetSymbol" => {
                    if s.desc {
                        "a.asset_id DESC"
                    } else {
                        "a.asset_id ASC"
                    }
                }
                "accountName" => {
                    if s.desc {
                        "acc.name DESC"
                    } else {
                        "acc.name ASC"
                    }
                }
                _ => "a.activity_date DESC, a.created_at ASC",
            }
        } else {
            "a.activity_date DESC, a.created_at ASC"
        };

        // Count query
        let count_sql = format!(
            r#"
            SELECT COUNT(*) as count
            FROM activities a
            INNER JOIN accounts acc ON a.account_id = acc.id
            INNER JOIN assets ast ON a.asset_id = ast.id
            WHERE {}
            "#,
            where_clause
        );

        #[derive(QueryableByName)]
        struct CountResult {
            #[diesel(sql_type = diesel::sql_types::BigInt)]
            count: i64,
        }

        let count_result: CountResult = sql_query(&count_sql).get_result(&mut conn)?;
        let total_row_count = count_result.count;

        // Data query with LEFT JOINs for categories, events, and transfer account
        let data_sql = format!(
            r#"
            SELECT
                a.id,
                a.account_id,
                a.asset_id,
                a.activity_type,
                a.activity_date as date,
                a.quantity,
                a.unit_price,
                a.currency,
                a.fee,
                a.amount,
                a.is_draft,
                a.comment,
                a.created_at,
                a.updated_at,
                acc.name as account_name,
                acc.currency as account_currency,
                ast.symbol as asset_symbol,
                ast.name as asset_name,
                ast.data_source as asset_data_source,
                a.name,
                a.category_id,
                a.sub_category_id,
                a.event_id,
                cat.name as category_name,
                cat.color as category_color,
                subcat.name as sub_category_name,
                evt.name as event_name,
                a.transfer_account_id,
                transfer_acc.name as transfer_account_name
            FROM activities a
            INNER JOIN accounts acc ON a.account_id = acc.id
            INNER JOIN assets ast ON a.asset_id = ast.id
            LEFT JOIN categories cat ON a.category_id = cat.id
            LEFT JOIN categories subcat ON a.sub_category_id = subcat.id
            LEFT JOIN events evt ON a.event_id = evt.id
            LEFT JOIN accounts transfer_acc ON a.transfer_account_id = transfer_acc.id
            WHERE {}
            ORDER BY {}
            LIMIT {} OFFSET {}
            "#,
            where_clause, order_clause, page_size, offset
        );

        let results: Vec<ActivityDetails> = sql_query(&data_sql).load(&mut conn)?;

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
                    .select(ActivityDB::as_select())
                    .find(&activity_id_owned)
                    .first::<ActivityDB>(conn)?;

                activity_to_update.created_at = existing.created_at;
                activity_to_update.updated_at = chrono::Utc::now().to_rfc3339();

                let updated_activity =
                    diesel::update(activities::table.find(&activity_to_update.id))
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
                    .select(ActivityDB::as_select())
                    .find(&activity_id)
                    .first::<ActivityDB>(conn)?;
                diesel::delete(activities::table.filter(activities::id.eq(&activity_id)))
                    .execute(conn)?;
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
                            .first::<ActivityDB>(conn)?;
                        diesel::delete(activities::table.filter(activities::id.eq(&delete_id)))
                            .execute(conn)?;
                        outcome.deleted.push(Activity::from(activity_db));
                    }

                    for update in updates {
                        update.validate()?;
                        let mut activity_db: ActivityDB = update.clone().into();
                        let existing = activities::table
                            .select(ActivityDB::as_select())
                            .find(&activity_db.id)
                            .first::<ActivityDB>(conn)?;

                        activity_db.created_at = existing.created_at;
                        activity_db.updated_at = chrono::Utc::now().to_rfc3339();

                        let updated_activity =
                            diesel::update(activities::table.find(&activity_db.id))
                                .set(&activity_db)
                                .get_result::<ActivityDB>(conn)?;
                        outcome.updated.push(Activity::from(updated_activity));
                    }

                    for new_activity in creates {
                        new_activity.validate()?;
                        let temp_id = new_activity.id.clone();
                        let mut activity_db: ActivityDB = new_activity.into();
                        let generated_id = if activity_db.id.is_empty() {
                            Uuid::new_v4().to_string()
                        } else {
                            activity_db.id.clone()
                        };
                        activity_db.id = generated_id.clone();
                        let inserted_activity = diesel::insert_into(activities::table)
                            .values(&activity_db)
                            .get_result::<ActivityDB>(conn)?;
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
                .map_err(|e| {
                    ActivityError::InvalidData(format!("Failed to parse date: {}", e)).into()
                }),
            None => Ok(None), // If no activity found, return None
        }
    }

    fn get_spending_activities_data(&self) -> Result<Vec<SpendingData>> {
        let mut conn = get_connection(&self.pool)?;

        // Query spending activities from CASH accounts
        // Spending = activities with expense categories (is_income = 0)
        // OR activity types: WITHDRAWAL, FEE, TAX
        let query = r#"
            SELECT
                strftime('%Y-%m', a.activity_date) as date,
                a.activity_type,
                a.category_id,
                cat.name as category_name,
                cat.color as category_color,
                a.sub_category_id,
                subcat.name as sub_category_name,
                a.account_id,
                acc.name as account_name,
                a.currency,
                COALESCE(a.amount, '0') as amount,
                a.name
            FROM activities a
            INNER JOIN accounts acc ON a.account_id = acc.id
            LEFT JOIN categories cat ON a.category_id = cat.id
            LEFT JOIN categories subcat ON a.sub_category_id = subcat.id
            WHERE acc.is_active = 1
              AND acc.account_type = 'CASH'
              -- Exclude transfers (they represent money movement between accounts, not actual spending)
              AND a.activity_type NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')
              AND (
                  -- Expense activities by category
                  (cat.is_income = 0)
                  -- Or expense activity types without category
                  OR (a.activity_type IN ('WITHDRAWAL', 'FEE', 'TAX') AND a.category_id IS NULL)
              )
            ORDER BY a.activity_date
        "#;

        #[derive(QueryableByName, Debug)]
        struct RawSpendingData {
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub date: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub activity_type: String,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub category_id: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub category_name: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub category_color: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub sub_category_id: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub sub_category_name: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub account_id: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub account_name: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub currency: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub amount: String,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub name: Option<String>,
        }

        let raw_results = diesel::sql_query(query)
            .load::<RawSpendingData>(&mut conn)
            .map_err(ActivityError::from)?;

        let results = raw_results
            .into_iter()
            .map(|raw| {
                let amount = Decimal::from_str(&raw.amount).unwrap_or_else(|_| Decimal::zero());
                // Ensure amount is positive for spending calculations
                let amount = amount.abs();
                SpendingData {
                    date: raw.date,
                    activity_type: raw.activity_type,
                    category_id: raw.category_id,
                    category_name: raw.category_name,
                    category_color: raw.category_color,
                    sub_category_id: raw.sub_category_id,
                    sub_category_name: raw.sub_category_name,
                    account_id: raw.account_id,
                    account_name: raw.account_name,
                    currency: raw.currency,
                    amount,
                    name: raw.name,
                }
            })
            .collect();

        Ok(results)
    }

    fn get_cash_income_activities_data(&self) -> Result<Vec<CashIncomeData>> {
        let mut conn = get_connection(&self.pool)?;

        // Query income activities from CASH accounts
        // Income = activities with income categories (is_income = 1)
        // Excludes transfers to avoid double counting
        // Includes subcategory information when available
        let query = r#"
            SELECT
                strftime('%Y-%m', a.activity_date) as date,
                a.activity_type,
                a.category_id,
                cat.name as category_name,
                cat.color as category_color,
                a.sub_category_id,
                subcat.name as sub_category_name,
                a.account_id,
                acc.name as account_name,
                a.currency,
                COALESCE(a.amount, '0') as amount,
                a.name
            FROM activities a
            INNER JOIN accounts acc ON a.account_id = acc.id
            LEFT JOIN categories cat ON a.category_id = cat.id
            LEFT JOIN categories subcat ON a.sub_category_id = subcat.id
            WHERE acc.is_active = 1
              AND acc.account_type = 'CASH'
              -- Exclude transfers
              AND a.activity_type NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')
              -- Income activities by category
              AND cat.is_income = 1
            ORDER BY a.activity_date
        "#;

        #[derive(QueryableByName, Debug)]
        struct RawCashIncomeData {
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub date: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub activity_type: String,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub category_id: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub category_name: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub category_color: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub sub_category_id: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub sub_category_name: Option<String>,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub account_id: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub account_name: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub currency: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub amount: String,
            #[diesel(sql_type = diesel::sql_types::Nullable<diesel::sql_types::Text>)]
            pub name: Option<String>,
        }

        let raw_results = diesel::sql_query(query)
            .load::<RawCashIncomeData>(&mut conn)
            .map_err(ActivityError::from)?;

        let results = raw_results
            .into_iter()
            .map(|raw| {
                let amount = Decimal::from_str(&raw.amount).unwrap_or_else(|_| Decimal::zero());
                // Ensure amount is positive for income calculations
                let amount = amount.abs();
                CashIncomeData {
                    date: raw.date,
                    activity_type: raw.activity_type,
                    category_id: raw.category_id,
                    category_name: raw.category_name,
                    category_color: raw.category_color,
                    sub_category_id: raw.sub_category_id,
                    sub_category_name: raw.sub_category_name,
                    account_id: raw.account_id,
                    account_name: raw.account_name,
                    currency: raw.currency,
                    amount,
                    name: raw.name,
                }
            })
            .collect();

        Ok(results)
    }

    fn get_capital_gains_data(&self) -> Result<Vec<CapitalGainsData>> {
        let mut conn = get_connection(&self.pool)?;

        // Query SELL activities with their average cost basis calculated from BUY activities
        // Capital gains = sale_proceeds - cost_basis
        // Note: This is a simplified approach using average cost. The actual cost basis
        // should ideally come from FIFO lot matching.
        let query = r#"
            SELECT
                strftime('%Y-%m', s.activity_date) as date,
                s.asset_id as symbol,
                COALESCE(ast.name, s.asset_id) as symbol_name,
                s.currency,
                COALESCE(s.quantity, '0') as quantity,
                COALESCE(s.unit_price, '0') as unit_price,
                COALESCE(s.fee, '0') as fee,
                COALESCE(
                    (SELECT AVG(CAST(b.unit_price AS REAL))
                     FROM activities b
                     WHERE b.asset_id = s.asset_id
                       AND b.activity_type = 'BUY'
                       AND b.activity_date <= s.activity_date
                    ), 0
                ) as avg_cost
            FROM activities s
            INNER JOIN accounts acc ON s.account_id = acc.id
            LEFT JOIN assets ast ON s.asset_id = ast.id
            WHERE acc.is_active = 1
              AND s.activity_type = 'SELL'
            ORDER BY s.activity_date
        "#;

        #[derive(QueryableByName, Debug)]
        struct RawSellData {
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub date: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub symbol: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub symbol_name: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub currency: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub quantity: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub unit_price: String,
            #[diesel(sql_type = diesel::sql_types::Text)]
            pub fee: String,
            #[diesel(sql_type = diesel::sql_types::Double)]
            pub avg_cost: f64,
        }

        let raw_results = diesel::sql_query(query)
            .load::<RawSellData>(&mut conn)
            .map_err(ActivityError::from)?;

        let results: Vec<CapitalGainsData> = raw_results
            .into_iter()
            .map(|raw| {
                let quantity = Decimal::from_str(&raw.quantity).unwrap_or_else(|_| Decimal::zero());
                let unit_price =
                    Decimal::from_str(&raw.unit_price).unwrap_or_else(|_| Decimal::zero());
                let fee = Decimal::from_str(&raw.fee).unwrap_or_else(|_| Decimal::zero());

                // Sale proceeds = quantity * unit_price - fees
                let sale_proceeds = quantity * unit_price - fee;

                // Cost basis from average cost of prior BUY activities
                let avg_cost = Decimal::from_str(&raw.avg_cost.to_string()).unwrap_or(Decimal::zero());
                let cost_basis = quantity * avg_cost;
                let gain_amount = sale_proceeds - cost_basis;

                CapitalGainsData {
                    date: raw.date,
                    symbol: raw.symbol,
                    symbol_name: raw.symbol_name,
                    currency: raw.currency,
                    sale_proceeds,
                    cost_basis,
                    gain_amount,
                }
            })
            .collect();

        Ok(results)
    }
}
