use crate::db::{get_connection, WriteHandle};
use crate::errors::{Result, ValidationError};
use crate::events::events_model::{Event, EventSpendingData, EventWithTypeName, NewEvent, UpdateEvent};
use crate::events::events_traits::EventRepositoryTrait;
use crate::schema::{activities, categories, event_types, events};
use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use rust_decimal::Decimal;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

pub struct EventRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl EventRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        EventRepository { pool, writer }
    }
}

#[async_trait]
impl EventRepositoryTrait for EventRepository {
    fn get_all_events(&self) -> Result<Vec<Event>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(events::table
            .order((events::start_date.desc(), events::name.asc()))
            .load::<Event>(&mut conn)?)
    }

    fn get_event_by_id(&self, id: &str) -> Result<Option<Event>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(events::table
            .find(id)
            .first::<Event>(&mut conn)
            .optional()?)
    }

    fn get_events_by_type(&self, event_type_id: &str) -> Result<Vec<Event>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(events::table
            .filter(events::event_type_id.eq(event_type_id))
            .order(events::start_date.desc())
            .load::<Event>(&mut conn)?)
    }

    async fn create_event(&self, new_event: NewEvent) -> Result<Event> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Event> {
                let mut event = new_event;
                if event.id.is_none() {
                    event.id = Some(format!("event-{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string()));
                }

                diesel::insert_into(events::table)
                    .values(&event)
                    .execute(conn)?;

                Ok(events::table
                    .find(event.id.unwrap())
                    .first::<Event>(conn)?)
            })
            .await
    }

    async fn update_event(&self, id: &str, update: UpdateEvent) -> Result<Event> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Event> {
                diesel::update(events::table.find(&id_owned))
                    .set(&update)
                    .execute(conn)?;

                Ok(events::table
                    .find(&id_owned)
                    .first::<Event>(conn)?)
            })
            .await
    }

    async fn delete_event(&self, id: &str) -> Result<usize> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                let activity_count: i64 = activities::table
                    .filter(activities::event_id.eq(&id_owned))
                    .count()
                    .get_result(conn)?;

                if activity_count > 0 {
                    return Err(crate::errors::Error::Validation(
                        ValidationError::InvalidInput(format!(
                            "Cannot delete event: {} activities are assigned to it",
                            activity_count
                        ))
                    ));
                }

                let deleted = diesel::delete(events::table.find(&id_owned))
                    .execute(conn)?;

                Ok(deleted)
            })
            .await
    }

    fn has_activities(&self, event_id: &str) -> Result<bool> {
        let mut conn = get_connection(&self.pool)?;
        let count: i64 = activities::table
            .filter(activities::event_id.eq(event_id))
            .count()
            .get_result(&mut conn)?;
        Ok(count > 0)
    }

    fn get_events_with_type_names(&self) -> Result<Vec<EventWithTypeName>> {
        let mut conn = get_connection(&self.pool)?;

        let results: Vec<(Event, String)> = events::table
            .inner_join(event_types::table.on(events::event_type_id.eq(event_types::id)))
            .select((
                events::all_columns,
                event_types::name,
            ))
            .order((events::start_date.desc(), events::name.asc()))
            .load::<(Event, String)>(&mut conn)?;

        Ok(results
            .into_iter()
            .map(|(event, event_type_name)| EventWithTypeName {
                event,
                event_type_name,
            })
            .collect())
    }

    fn get_activity_date_range(&self, event_id: &str) -> Result<Option<(String, String)>> {
        use diesel::dsl::{min, max};

        let mut conn = get_connection(&self.pool)?;

        let result: (Option<String>, Option<String>) = activities::table
            .filter(activities::event_id.eq(event_id))
            .select((
                min(activities::activity_date),
                max(activities::activity_date),
            ))
            .first(&mut conn)?;

        match (result.0, result.1) {
            (Some(min_date), Some(max_date)) => Ok(Some((min_date, max_date))),
            _ => Ok(None),
        }
    }

    fn get_activity_counts(&self) -> Result<HashMap<String, i64>> {
        use diesel::dsl::sql;
        use diesel::sql_types::BigInt;

        let mut conn = get_connection(&self.pool)?;

        let counts: Vec<(String, i64)> = activities::table
            .filter(activities::event_id.is_not_null())
            .select((
                activities::event_id.assume_not_null(),
                sql::<BigInt>("COUNT(*)"),
            ))
            .group_by(activities::event_id)
            .load::<(String, i64)>(&mut conn)?;

        Ok(counts.into_iter().collect())
    }

    fn get_event_spending_data(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> Result<Vec<EventSpendingData>> {
        let mut conn = get_connection(&self.pool)?;

        // Query ALL activities linked to events
        // For event spending, we include all activities the user has explicitly linked to an event
        // since they want to track total spending/activity for that event regardless of activity type
        let mut query = activities::table
            .inner_join(events::table.on(activities::event_id.eq(events::id.nullable())))
            .inner_join(event_types::table.on(events::event_type_id.eq(event_types::id)))
            .left_join(categories::table.on(activities::category_id.eq(categories::id.nullable())))
            .filter(activities::event_id.is_not_null())
            .into_boxed();

        // Filter events by their start_date falling within the period
        // This includes all activities for events that started in the selected period
        if let Some(start) = start_date {
            query = query.filter(events::start_date.ge(start));
        }
        if let Some(end) = end_date {
            query = query.filter(events::start_date.le(end));
        }

        let results: Vec<(
            String,           // event_id
            String,           // event_name
            String,           // event_type_id
            String,           // event_type_name
            Option<String>,   // event_type_color
            String,           // start_date
            String,           // end_date
            String,           // activity_date
            Option<String>,   // category_id
            Option<String>,   // category_name
            Option<String>,   // category_color
            String,           // currency
            String,           // quantity
            String,           // unit_price
            Option<String>,   // amount (direct amount for cash activities)
            String,           // activity_type
        )> = query
            .select((
                events::id,
                events::name,
                events::event_type_id,
                event_types::name,
                event_types::color,
                events::start_date,
                events::end_date,
                activities::activity_date,
                activities::category_id,
                categories::name.nullable(),
                categories::color.nullable(),
                activities::currency,
                activities::quantity,
                activities::unit_price,
                activities::amount,
                activities::activity_type,
            ))
            .order(activities::activity_date.desc())
            .load(&mut conn)?;

        Ok(results
            .into_iter()
            .map(|row| {
                // For cash activities (DEPOSIT/WITHDRAWAL), the amount is stored directly
                // For investment activities, we calculate from quantity * unit_price
                let direct_amount = row.14.as_ref()
                    .and_then(|a| Decimal::from_str(a).ok())
                    .unwrap_or(Decimal::ZERO);
                let quantity = Decimal::from_str(&row.12).unwrap_or(Decimal::ZERO);
                let unit_price = Decimal::from_str(&row.13).unwrap_or(Decimal::ZERO);
                let calculated_amount = quantity * unit_price;
                let activity_type = &row.15;

                // Use direct amount if it's non-zero, otherwise use calculated amount
                // For spending calculations:
                // - DEPOSIT: negative amount (subtracts from spending, e.g., refunds)
                // - Other types (WITHDRAWAL, etc.): positive amount (adds to spending)
                let base_amount = if direct_amount != Decimal::ZERO {
                    direct_amount.abs()
                } else {
                    calculated_amount.abs()
                };
                let amount = if activity_type == "DEPOSIT" {
                    -base_amount
                } else {
                    base_amount
                };

                EventSpendingData {
                    event_id: row.0,
                    event_name: row.1,
                    event_type_id: row.2,
                    event_type_name: row.3,
                    event_type_color: row.4,
                    start_date: row.5,
                    end_date: row.6,
                    activity_date: row.7,
                    category_id: row.8,
                    category_name: row.9,
                    category_color: row.10,
                    currency: row.11,
                    amount,
                }
            })
            .collect())
    }
}
