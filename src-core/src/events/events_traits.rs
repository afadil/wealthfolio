use crate::errors::Result;
use crate::events::events_model::{
    Event, EventSpendingData, EventSpendingSummary, EventWithTypeName, NewEvent, UpdateEvent,
};
use async_trait::async_trait;

/// Trait for event repository operations
#[async_trait]
pub trait EventRepositoryTrait: Send + Sync {
    /// Get all events
    fn get_all_events(&self) -> Result<Vec<Event>>;

    /// Get an event by ID
    fn get_event_by_id(&self, id: &str) -> Result<Option<Event>>;

    /// Get events by event type ID
    fn get_events_by_type(&self, event_type_id: &str) -> Result<Vec<Event>>;

    /// Create a new event
    async fn create_event(&self, new_event: NewEvent) -> Result<Event>;

    /// Update an event
    async fn update_event(&self, id: &str, update: UpdateEvent) -> Result<Event>;

    /// Delete an event (only if no activities reference it)
    async fn delete_event(&self, id: &str) -> Result<usize>;

    /// Check if an event has any activities assigned
    fn has_activities(&self, event_id: &str) -> Result<bool>;

    /// Get all events with their event type names
    fn get_events_with_type_names(&self) -> Result<Vec<EventWithTypeName>>;

    /// Get the min/max activity dates for a given event
    /// Returns (min_date, max_date) or None if no activities
    fn get_activity_date_range(&self, event_id: &str) -> Result<Option<(String, String)>>;

    /// Get activity counts grouped by event ID
    /// Returns a HashMap where keys are event IDs and values are activity counts
    fn get_activity_counts(&self) -> Result<std::collections::HashMap<String, i64>>;

    /// Get event spending data with optional date range filter
    fn get_event_spending_data(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
    ) -> Result<Vec<EventSpendingData>>;
}

/// Trait for event service operations
#[async_trait]
pub trait EventServiceTrait: Send + Sync {
    /// Get all events
    fn get_all_events(&self) -> Result<Vec<Event>>;

    /// Get all events with event type names
    fn get_events_with_type_names(&self) -> Result<Vec<EventWithTypeName>>;

    /// Get an event by ID
    fn get_event(&self, id: &str) -> Result<Option<Event>>;

    /// Get events by event type ID
    fn get_events_by_type(&self, event_type_id: &str) -> Result<Vec<Event>>;

    /// Create a new event
    async fn create_event(
        &self,
        name: String,
        description: Option<String>,
        event_type_id: String,
        start_date: String,
        end_date: String,
    ) -> Result<Event>;

    /// Update an event
    async fn update_event(
        &self,
        id: &str,
        name: Option<String>,
        description: Option<String>,
        event_type_id: Option<String>,
        start_date: Option<String>,
        end_date: Option<String>,
    ) -> Result<Event>;

    /// Delete an event (fails if activities are assigned)
    async fn delete_event(&self, id: &str) -> Result<usize>;

    /// Get activity counts grouped by event ID
    fn get_activity_counts(&self) -> Result<std::collections::HashMap<String, i64>>;

    /// Get event spending summaries with optional date range filter
    fn get_event_spending_summaries(
        &self,
        start_date: Option<&str>,
        end_date: Option<&str>,
        base_currency: &str,
    ) -> Result<Vec<EventSpendingSummary>>;
}
