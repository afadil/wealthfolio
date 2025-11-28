use crate::events::events_model::{Event, EventWithTypeName, NewEvent, UpdateEvent};
use crate::events::events_traits::EventRepositoryTrait;
use crate::db::{get_connection, WriteHandle};
use crate::errors::{Result, ValidationError};
use crate::schema::{activities, event_types, events};
use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
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
                // Check if any activities reference this event
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
}
