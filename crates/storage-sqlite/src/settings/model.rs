//! Database model for application settings.

use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for app settings key-value pairs
#[derive(Queryable, Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::app_settings)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingDB {
    pub setting_key: String,
    pub setting_value: String,
}
