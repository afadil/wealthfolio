use crate::event_types::event_types_model::{EventType, NewEventType, UpdateEventType};
use crate::event_types::event_types_traits::EventTypeRepositoryTrait;
use crate::db::{get_connection, WriteHandle};
use crate::errors::{Result, ValidationError};
use crate::schema::{event_types, events};
use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

pub struct EventTypeRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl EventTypeRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        EventTypeRepository { pool, writer }
    }
}

#[async_trait]
impl EventTypeRepositoryTrait for EventTypeRepository {
    fn get_all_event_types(&self) -> Result<Vec<EventType>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(event_types::table
            .order(event_types::name.asc())
            .load::<EventType>(&mut conn)?)
    }

    fn get_event_type_by_id(&self, id: &str) -> Result<Option<EventType>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(event_types::table
            .find(id)
            .first::<EventType>(&mut conn)
            .optional()?)
    }

    async fn create_event_type(&self, new_event_type: NewEventType) -> Result<EventType> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<EventType> {
                let mut event_type = new_event_type;
                if event_type.id.is_none() {
                    event_type.id = Some(format!("event-type-{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string()));
                }

                diesel::insert_into(event_types::table)
                    .values(&event_type)
                    .execute(conn)?;

                Ok(event_types::table
                    .find(event_type.id.unwrap())
                    .first::<EventType>(conn)?)
            })
            .await
    }

    async fn update_event_type(&self, id: &str, update: UpdateEventType) -> Result<EventType> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<EventType> {
                diesel::update(event_types::table.find(&id_owned))
                    .set(&update)
                    .execute(conn)?;

                Ok(event_types::table
                    .find(&id_owned)
                    .first::<EventType>(conn)?)
            })
            .await
    }

    async fn delete_event_type(&self, id: &str) -> Result<usize> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                // Check if any events reference this event type
                let event_count: i64 = events::table
                    .filter(events::event_type_id.eq(&id_owned))
                    .count()
                    .get_result(conn)?;

                if event_count > 0 {
                    return Err(crate::errors::Error::Validation(
                        ValidationError::InvalidInput(format!(
                            "Cannot delete event type: {} events are assigned to it",
                            event_count
                        ))
                    ));
                }

                let deleted = diesel::delete(event_types::table.find(&id_owned))
                    .execute(conn)?;

                Ok(deleted)
            })
            .await
    }

    fn has_events(&self, event_type_id: &str) -> Result<bool> {
        let mut conn = get_connection(&self.pool)?;
        let count: i64 = events::table
            .filter(events::event_type_id.eq(event_type_id))
            .count()
            .get_result(&mut conn)?;
        Ok(count > 0)
    }
}
