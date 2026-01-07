use crate::errors::{Error, Result, ValidationError};
use crate::event_types::event_types_traits::EventTypeRepositoryTrait;
use crate::events::events_model::{
    Event, EventSpendingSummary, EventWithTypeName, NewEvent, UpdateEvent,
};
use crate::events::events_traits::{EventRepositoryTrait, EventServiceTrait};
use async_trait::async_trait;
use chrono::Utc;
use std::collections::HashMap;
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
            updated_at: Utc::now().to_rfc3339(),
        };

        self.event_repo.update_event(id, update).await
    }

    async fn delete_event(&self, id: &str) -> Result<usize> {
        self.event_repo.delete_event(id).await
    }

    fn get_activity_counts(&self) -> Result<HashMap<String, i64>> {
        self.event_repo.get_activity_counts()
    }

    fn get_event_spending_summaries(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
        base_currency: &str,
    ) -> Result<Vec<EventSpendingSummary>> {
        let spending_data = self.event_repo.get_event_spending_data(start_date, end_date)?;

        let mut summaries: HashMap<String, EventSpendingSummary> = HashMap::new();

        for data in spending_data {
            let summary = summaries
                .entry(data.event_id.clone())
                .or_insert_with(|| {
                    EventSpendingSummary::new(
                        data.event_id.clone(),
                        data.event_name.clone(),
                        data.event_type_id.clone(),
                        data.event_type_name.clone(),
                        data.event_type_color.clone(),
                        data.start_date.clone(),
                        data.end_date.clone(),
                        base_currency.to_string(),
                    )
                });

            // For simplicity, assume same currency (currency conversion can be added later)
            let converted_amount = if data.currency == base_currency {
                data.amount
            } else {
                // TODO: Add currency conversion when needed
                data.amount
            };

            summary.add_spending(&data, converted_amount);
        }

        let mut result: Vec<EventSpendingSummary> = summaries.into_values().collect();
        result.sort_by(|a, b| b.start_date.cmp(&a.start_date));
        Ok(result)
    }
}
