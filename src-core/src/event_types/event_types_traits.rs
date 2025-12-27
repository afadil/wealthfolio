use crate::event_types::event_types_model::{EventType, NewEventType, UpdateEventType};
use crate::errors::Result;
use async_trait::async_trait;

/// Trait for event type repository operations
#[async_trait]
pub trait EventTypeRepositoryTrait: Send + Sync {
    /// Get all event types
    fn get_all_event_types(&self) -> Result<Vec<EventType>>;

    /// Get an event type by ID
    fn get_event_type_by_id(&self, id: &str) -> Result<Option<EventType>>;

    /// Create a new event type
    async fn create_event_type(&self, new_event_type: NewEventType) -> Result<EventType>;

    /// Update an event type
    async fn update_event_type(&self, id: &str, update: UpdateEventType) -> Result<EventType>;

    /// Delete an event type (only if no events reference it)
    async fn delete_event_type(&self, id: &str) -> Result<usize>;

    /// Check if an event type has any events assigned
    fn has_events(&self, event_type_id: &str) -> Result<bool>;
}

/// Trait for event type service operations
#[async_trait]
pub trait EventTypeServiceTrait: Send + Sync {
    /// Get all event types
    fn get_all_event_types(&self) -> Result<Vec<EventType>>;

    /// Get an event type by ID
    fn get_event_type(&self, id: &str) -> Result<Option<EventType>>;

    /// Create a new event type
    async fn create_event_type(&self, name: String, color: Option<String>) -> Result<EventType>;

    /// Update an event type
    async fn update_event_type(&self, id: &str, name: Option<String>, color: Option<String>) -> Result<EventType>;

    /// Delete an event type (fails if events are assigned)
    async fn delete_event_type(&self, id: &str) -> Result<usize>;
}
