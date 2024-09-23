use crate::{
    models::{
        Activity, ActivityDetails, ActivitySearchResponse, ActivitySearchResponseMeta,
        ActivityUpdate, NewActivity, Sort,
    },
    schema::{accounts, activities, assets},
};
use diesel::prelude::*;
use uuid::Uuid;

pub struct ActivityRepository;

impl ActivityRepository {
    pub fn new() -> Self {
        ActivityRepository
    }

    pub fn get_trading_activities(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Activity>, diesel::result::Error> {
        activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq_any(vec!["BUY", "SELL", "SPLIT"]))
            .select(activities::all_columns)
            .order(activities::activity_date.asc())
            .load::<Activity>(conn)
    }

    pub fn get_income_activities(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Activity>, diesel::result::Error> {
        activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq_any(vec!["DIVIDEND", "INTEREST"]))
            .select(activities::all_columns)
            .order(activities::activity_date.asc())
            .load::<Activity>(conn)
    }

    pub fn get_activities(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<Activity>, diesel::result::Error> {
        activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .select(activities::all_columns)
            .order(activities::activity_date.asc())
            .load::<Activity>(conn)
    }

    pub fn search_activities(
        &self,
        conn: &mut SqliteConnection,
        page: i64,                                 // Page number, 1-based
        page_size: i64,                            // Number of items per page
        account_id_filter: Option<Vec<String>>,    // Optional account_id filter
        activity_type_filter: Option<Vec<String>>, // Optional activity_type filter
        asset_id_keyword: Option<String>,          // Optional asset_id keyword for search
        sort: Option<Sort>,                        // Optional sort
    ) -> Result<ActivitySearchResponse, diesel::result::Error> {
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
        let total_row_count = create_base_query(conn).count().get_result::<i64>(conn)?;

        // Data fetching query
        let results = create_base_query(conn)
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
                activities::is_draft,
                activities::comment,
                activities::created_at,
                activities::updated_at,
                accounts::name,
                accounts::currency,
                assets::symbol,
                assets::name,
            ))
            .limit(page_size)
            .offset(offset)
            .load::<ActivityDetails>(conn)?;

        Ok(ActivitySearchResponse {
            data: results,
            meta: ActivitySearchResponseMeta { total_row_count },
        })
    }

    pub fn insert_new_activity(
        &self,
        conn: &mut SqliteConnection,
        mut new_activity: NewActivity,
    ) -> Result<Activity, diesel::result::Error> {
        let id = Uuid::new_v4().to_string();
        new_activity.id = Some(id);
        Ok(diesel::insert_into(activities::table)
            .values(&new_activity)
            .returning(Activity::as_returning())
            .get_result(conn)
            .expect("Error saving new activity"))
    }

    pub fn update_activity(
        &self,
        conn: &mut SqliteConnection,
        activity: ActivityUpdate,
    ) -> Result<Activity, diesel::result::Error> {
        let activity_id = activity.id.clone();

        Ok(diesel::update(activities::table)
            .filter(activities::id.eq(activity_id))
            .set(&activity)
            .get_result(conn)
            .expect("Error saving activity"))
    }

    pub fn delete_activity(
        &self,
        conn: &mut SqliteConnection,
        activity_id: String,
    ) -> Result<Activity, diesel::result::Error> {
        let activity = activities::table
            .filter(activities::id.eq(&activity_id))
            .first::<Activity>(conn)?;

        diesel::delete(activities::table.filter(activities::id.eq(activity_id))).execute(conn)?;

        Ok(activity)
    }

    pub fn get_activities_by_account_ids(
        &self,
        conn: &mut SqliteConnection,
        account_ids: &[String],
    ) -> Result<Vec<Activity>, diesel::result::Error> {
        activities::table
            .inner_join(accounts::table.on(accounts::id.eq(activities::account_id)))
            .filter(accounts::is_active.eq(true))
            .filter(activities::account_id.eq_any(account_ids))
            .select(activities::all_columns)
            .order(activities::activity_date.asc())
            .load::<Activity>(conn)
    }
}
