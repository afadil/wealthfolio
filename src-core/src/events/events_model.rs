use diesel::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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


/// Raw event spending data retrieved from activities
#[derive(Debug, Clone)]
pub struct EventSpendingData {
    pub event_id: String,
    pub event_name: String,
    pub event_type_id: String,
    pub event_type_name: String,
    pub event_type_color: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub activity_date: String,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub category_color: Option<String>,
    pub currency: String,
    pub amount: Decimal,
}

/// Category spending breakdown for an event
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventCategorySpending {
    pub category_id: Option<String>,
    pub category_name: String,
    pub color: Option<String>,
    pub amount: Decimal,
    pub transaction_count: i32,
}

/// Summary of spending for a single event
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventSpendingSummary {
    pub event_id: String,
    pub event_name: String,
    pub event_type_id: String,
    pub event_type_name: String,
    pub event_type_color: Option<String>,
    pub start_date: String,
    pub end_date: String,
    pub total_spending: Decimal,
    pub transaction_count: i32,
    pub currency: String,
    pub by_category: HashMap<String, EventCategorySpending>,
    pub daily_spending: HashMap<String, Decimal>,
}

impl EventSpendingSummary {
    pub fn new(
        event_id: String,
        event_name: String,
        event_type_id: String,
        event_type_name: String,
        event_type_color: Option<String>,
        start_date: String,
        end_date: String,
        currency: String,
    ) -> Self {
        EventSpendingSummary {
            event_id,
            event_name,
            event_type_id,
            event_type_name,
            event_type_color,
            start_date,
            end_date,
            total_spending: Decimal::ZERO,
            transaction_count: 0,
            currency,
            by_category: HashMap::new(),
            daily_spending: HashMap::new(),
        }
    }

    pub fn add_spending(&mut self, data: &EventSpendingData, converted_amount: Decimal) {
        let category_key = data
            .category_id
            .clone()
            .unwrap_or_else(|| "uncategorized".to_string());

        let category_entry = self
            .by_category
            .entry(category_key)
            .or_insert_with(|| EventCategorySpending {
                category_id: data.category_id.clone(),
                category_name: data
                    .category_name
                    .clone()
                    .unwrap_or_else(|| "Uncategorized".to_string()),
                color: data.category_color.clone(),
                amount: Decimal::ZERO,
                transaction_count: 0,
            });
        category_entry.amount += converted_amount;
        category_entry.transaction_count += 1;

        *self
            .daily_spending
            .entry(data.activity_date.clone())
            .or_insert(Decimal::ZERO) += converted_amount;

        self.total_spending += converted_amount;
        self.transaction_count += 1;
    }
}
