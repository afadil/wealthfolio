use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for event types
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
#[diesel(table_name = crate::schema::event_types)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct EventType {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for creating a new event type
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::event_types)]
#[serde(rename_all = "camelCase")]
pub struct NewEventType {
    pub id: Option<String>,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for updating an event type
#[derive(AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::event_types)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventType {
    pub name: Option<String>,
    pub color: Option<String>,
    pub updated_at: String,
}
