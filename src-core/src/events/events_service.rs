use crate::event_types::event_types_traits::EventTypeRepositoryTrait;
use crate::events::events_model::{Event, EventWithTypeName, NewEvent, UpdateEvent};
use crate::events::events_traits::{EventRepositoryTrait, EventServiceTrait};
use crate::errors::{Error, Result, ValidationError};
use async_trait::async_trait;
use chrono::Utc;
use std::sync::Arc;

pub struct EventService<R: EventRepositoryTrait, T: EventTypeRepositoryTrait> {
    event_repo: Arc<R>,
    event_type_repo: Arc<T>,
}

impl<R: EventRepositoryTrait, T: EventTypeRepositoryTrait> EventService<R, T> {
    pub fn new(event_repo: Arc<R>, event_type_repo: Arc<T>) -> Self {
        EventService {
            event_repo,
            event_type_repo,
        }
    }
}

#[async_trait]
impl<R: EventRepositoryTrait + Send + Sync, T: EventTypeRepositoryTrait + Send + Sync>
    EventServiceTrait for EventService<R, T>
{
    fn get_all_events(&self) -> Result<Vec<Event>> {
        self.event_repo.get_all_events()
    }

    fn get_events_with_type_names(&self) -> Result<Vec<EventWithTypeName>> {
        self.event_repo.get_events_with_type_names()
    }

    fn get_event(&self, id: &str) -> Result<Option<Event>> {
        self.event_repo.get_event_by_id(id)
    }

    fn get_events_by_type(&self, event_type_id: &str) -> Result<Vec<Event>> {
        self.event_repo.get_events_by_type(event_type_id)
    }

    async fn create_event(
        &self,
        name: String,
        description: Option<String>,
        event_type_id: String,
        start_date: String,
        end_date: String,
        is_dynamic_range: bool,
    ) -> Result<Event> {
        if self.event_type_repo.get_event_type_by_id(&event_type_id)?.is_none() {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Event type not found".to_string(),
            )));
        }

        if start_date > end_date {
            return Err(Error::Validation(ValidationError::InvalidInput(
                "Start date must be before or equal to end date".to_string(),
            )));
        }

        let now = Utc::now().to_rfc3339();

        let new_event = NewEvent {
            id: None,
            name,
            description,
            event_type_id,
            start_date,
            end_date,
            is_dynamic_range: if is_dynamic_range { 1 } else { 0 },
            created_at: now.clone(),
            updated_at: now,
        };

        self.event_repo.create_event(new_event).await
    }

    async fn update_event(
        &self,
        id: &str,
        name: Option<String>,
        description: Option<String>,
        event_type_id: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
        is_dynamic_range: Option<bool>,
    ) -> Result<Event> {
        if let Some(ref type_id) = event_type_id {
            if self.event_type_repo.get_event_type_by_id(type_id)?.is_none() {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Event type not found".to_string(),
                )));
            }
        }

        if let (Some(ref start), Some(ref end)) = (&start_date, &end_date) {
            if start > end {
                return Err(Error::Validation(ValidationError::InvalidInput(
                    "Start date must be before or equal to end date".to_string(),
                )));
            }
        }

        let update = UpdateEvent {
            name,
            description,
            event_type_id,
            start_date,
            end_date,
            is_dynamic_range: is_dynamic_range.map(|b| if b { 1 } else { 0 }),
            updated_at: Utc::now().to_rfc3339(),
        };

        self.event_repo.update_event(id, update).await
    }

    async fn delete_event(&self, id: &str) -> Result<usize> {
        self.event_repo.delete_event(id).await
    }

    fn validate_transaction_date(&self, event_id: &str, transaction_date: &str) -> Result<bool> {
        let event = self.event_repo.get_event_by_id(event_id)?
            .ok_or_else(|| Error::Validation(ValidationError::InvalidInput(
                format!("Event not found: {}", event_id)
            )))?;

        let is_within_range = transaction_date >= event.start_date.as_str()
            && transaction_date <= event.end_date.as_str();

        Ok(is_within_range)
    }

    async fn recalculate_dynamic_event_dates(&self, event_id: &str) -> Result<Option<Event>> {
        let event = match self.event_repo.get_event_by_id(event_id)? {
            Some(e) => e,
            None => return Ok(None),
        };

        if !event.is_dynamic() {
            return Ok(Some(event));
        }

        let date_range = self.event_repo.get_activity_date_range(event_id)?;

        let (new_start, new_end) = match date_range {
            Some((min_date, max_date)) => (min_date, max_date),
            None => return Ok(Some(event)),
        };

        if new_start == event.start_date && new_end == event.end_date {
            return Ok(Some(event));
        }

        let update = UpdateEvent {
            name: None,
            description: None,
            event_type_id: None,
            start_date: Some(new_start),
            end_date: Some(new_end),
            is_dynamic_range: None,
            updated_at: Utc::now().to_rfc3339(),
        };

        let updated_event = self.event_repo.update_event(event_id, update).await?;
        Ok(Some(updated_event))
    }
}
