use diesel::prelude::*;
use serde::Serialize;

use crate::schema::market_data_custom_providers;

/// Row in the `market_data_custom_providers` table.
#[derive(Debug, Clone, Queryable, Selectable, Insertable, AsChangeset, Serialize)]
#[diesel(table_name = market_data_custom_providers)]
pub struct CustomProviderDB {
    pub id: String,
    pub code: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub priority: i32,
    pub config: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}
