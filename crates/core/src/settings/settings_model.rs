//! Settings domain models.

use serde::{Deserialize, Serialize};

pub const INSIGHTS_OVERVIEW_LAYOUT_KEY: &str = "insights_overview_layout";

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_theme_id")]
    pub theme_id: String,
    pub theme: String,
    pub font: String,
    pub language: String,
    pub formatting_region: String,
    pub base_currency: String,
    pub timezone: String,
    pub onboarding_completed: bool,
    pub auto_update_check_enabled: bool,
    pub menu_bar_visible: bool,
    pub sync_enabled: bool,
    /// Read-only restore state; clearing UI feedback must not authorize sync.
    #[serde(default)]
    pub restore_reconnect_required: bool,
    pub default_return_metric: String,
    /// Versioned dashboard preferences; the frontend validates the layout schema.
    #[serde(default)]
    pub insights_overview_layout: Option<serde_json::Map<String, serde_json::Value>>,
}

fn default_theme_id() -> String {
    "flexoki".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme_id: default_theme_id(),
            theme: "light".to_string(),
            font: "font-mono".to_string(),
            language: "en".to_string(),
            formatting_region: "system".to_string(),
            base_currency: "".to_string(),
            timezone: "".to_string(),
            onboarding_completed: false,
            auto_update_check_enabled: true,
            menu_bar_visible: true,
            sync_enabled: true,
            restore_reconnect_required: false,
            default_return_metric: "twr".to_string(),
            insights_overview_layout: None,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SettingsUpdate {
    pub theme_id: Option<String>,
    pub theme: Option<String>,
    pub font: Option<String>,
    pub language: Option<String>,
    pub formatting_region: Option<String>,
    pub base_currency: Option<String>,
    pub timezone: Option<String>,
    pub onboarding_completed: Option<bool>,
    pub auto_update_check_enabled: Option<bool>,
    pub menu_bar_visible: Option<bool>,
    pub sync_enabled: Option<bool>,
    pub default_return_metric: Option<String>,
    pub insights_overview_layout: Option<serde_json::Map<String, serde_json::Value>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Sort {
    pub id: String,
    pub desc: bool,
}

/// Domain model for app setting key-value pair
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppSetting {
    pub setting_key: String,
    pub setting_value: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_settings_json_defaults_palette_without_changing_appearance() {
        let mut value = serde_json::to_value(Settings::default()).unwrap();
        value.as_object_mut().unwrap().remove("themeId");
        value["theme"] = serde_json::json!("system");
        value["font"] = serde_json::json!("font-serif");

        let settings: Settings = serde_json::from_value(value).unwrap();
        assert_eq!(settings.theme_id, "flexoki");
        assert_eq!(settings.theme, "system");
        assert_eq!(settings.font, "font-serif");
    }

    #[test]
    fn unknown_palette_round_trips_and_omitted_updates_remain_partial() {
        let settings = Settings {
            theme_id: "future-palette".to_string(),
            ..Settings::default()
        };
        let json = serde_json::to_value(settings).unwrap();
        assert_eq!(json["themeId"], "future-palette");
        let restored: Settings = serde_json::from_value(json).unwrap();
        assert_eq!(restored.theme_id, "future-palette");

        let update: SettingsUpdate =
            serde_json::from_value(serde_json::json!({ "theme": "dark" })).unwrap();
        assert!(update.theme_id.is_none());
        assert!(update.font.is_none());
        assert_eq!(update.theme.as_deref(), Some("dark"));
    }
}
