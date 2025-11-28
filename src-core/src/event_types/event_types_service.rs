use crate::event_types::event_types_model::{EventType, NewEventType, UpdateEventType};
use crate::event_types::event_types_traits::{EventTypeRepositoryTrait, EventTypeServiceTrait};
use crate::errors::Result;
use async_trait::async_trait;
use chrono::Utc;
use std::sync::Arc;

pub struct EventTypeService<T: EventTypeRepositoryTrait> {
    event_type_repo: Arc<T>,
}

impl<T: EventTypeRepositoryTrait> EventTypeService<T> {
    pub fn new(event_type_repo: Arc<T>) -> Self {
        EventTypeService { event_type_repo }
    }
}

#[async_trait]
impl<T: EventTypeRepositoryTrait + Send + Sync> EventTypeServiceTrait for EventTypeService<T> {
    fn get_all_event_types(&self) -> Result<Vec<EventType>> {
        self.event_type_repo.get_all_event_types()
    }

    fn get_event_type(&self, id: &str) -> Result<Option<EventType>> {
        self.event_type_repo.get_event_type_by_id(id)
    }

    async fn create_event_type(
        &self,
        name: String,
        color: Option<String>,
    ) -> Result<EventType> {
        let now = Utc::now().to_rfc3339();

        let new_event_type = NewEventType {
            id: None,
            name,
            color,
            created_at: now.clone(),
            updated_at: now,
        };

        self.event_type_repo.create_event_type(new_event_type).await
    }

    async fn update_event_type(
        &self,
        id: &str,
        name: Option<String>,
        color: Option<String>,
    ) -> Result<EventType> {
        let update = UpdateEventType {
            name,
            color,
            updated_at: Utc::now().to_rfc3339(),
        };

        self.event_type_repo.update_event_type(id, update).await
    }

    async fn delete_event_type(&self, id: &str) -> Result<usize> {
        self.event_type_repo.delete_event_type(id).await
    }
}
