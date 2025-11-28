use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for events
#[derive(
    Queryable,
    Identifiable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::events)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub event_type_id: String,
    pub start_date: String,
    pub end_date: String,
    pub is_dynamic_range: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for creating a new event
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::events)]
#[serde(rename_all = "camelCase")]
pub struct NewEvent {
    pub id: Option<String>,
    pub name: String,
    pub description: Option<String>,
    pub event_type_id: String,
    pub start_date: String,
    pub end_date: String,
    pub is_dynamic_range: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for updating an event
#[derive(AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::events)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEvent {
    pub name: Option<String>,
    pub description: Option<String>,
    pub event_type_id: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub is_dynamic_range: Option<i32>,
    pub updated_at: String,
}

/// Event with event type name for frontend display
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventWithTypeName {
    #[serde(flatten)]
    pub event: Event,
    pub event_type_name: String,
}

impl Event {
    pub fn is_dynamic(&self) -> bool {
        self.is_dynamic_range == 1
    }
}
