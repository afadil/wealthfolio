use diesel::prelude::*;
use diesel::Queryable;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub font: String,
    pub base_currency: String,
    pub instance_id: String,
    pub onboarding_completed: bool,
    pub auto_update_check_enabled: bool,
    pub menu_bar_visible: bool,
    pub sync_enabled: bool,
    // Phase 4: Allocation preferences
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allocation_holding_target_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allocation_default_view: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allocation_settings_banner_dismissed: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            font: "font-mono".to_string(),
            base_currency: "".to_string(),
            instance_id: "".to_string(),
            onboarding_completed: false,
            auto_update_check_enabled: true,
            menu_bar_visible: true,
            sync_enabled: true,
            allocation_holding_target_mode: None,
            allocation_default_view: None,
            allocation_settings_banner_dismissed: None,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub theme: Option<String>,
    pub font: Option<String>,
    pub base_currency: Option<String>,
    pub onboarding_completed: Option<bool>,
    pub auto_update_check_enabled: Option<bool>,
    pub menu_bar_visible: Option<bool>,
    pub sync_enabled: Option<bool>,
    // Phase 4: Allocation preferences
    pub allocation_holding_target_mode: Option<String>,
    pub allocation_default_view: Option<String>,
    pub allocation_settings_banner_dismissed: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Sort {
    pub id: String,
    pub desc: bool,
}

#[derive(Queryable, Insertable, Serialize, Deserialize, Debug)]
#[diesel(table_name= crate::schema::app_settings)]
#[serde(rename_all = "camelCase")]
pub struct AppSetting {
    pub setting_key: String,
    pub setting_value: String,
}
