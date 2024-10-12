use crate::models::{AppSetting, Settings, SettingsUpdate};
use crate::schema::app_settings::dsl::*;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;

pub struct SettingsRepository;

impl SettingsRepository {
    pub fn get_settings(conn: &mut SqliteConnection) -> Result<Settings, diesel::result::Error> {
        let all_settings: Vec<(String, String)> = app_settings
            .select((setting_key, setting_value))
            .load::<(String, String)>(conn)?;

        let mut settings = Settings {
            theme: String::new(),
            font: String::new(),
            base_currency: String::new(),
            instance_id: String::new(),
        };

        for (key, value) in all_settings {
            match key.as_str() {
                "theme" => settings.theme = value,
                "font" => settings.font = value,
                "base_currency" => settings.base_currency = value,
                "instance_id" => settings.instance_id = value,
                _ => {} // Ignore unknown settings
            }
        }

        // Set default values if any setting is missing
        if settings.theme.is_empty() {
            settings.theme = "light".to_string();
        }
        if settings.font.is_empty() {
            settings.font = "font-mono".to_string();
        }

        Ok(settings)
    }

    pub fn update_settings(
        conn: &mut SqliteConnection,
        new_settings: &SettingsUpdate,
    ) -> Result<(), diesel::result::Error> {
        let settings_to_insert = vec![
            AppSetting {
                setting_key: "theme".to_string(),
                setting_value: new_settings.theme.clone(),
            },
            AppSetting {
                setting_key: "font".to_string(),
                setting_value: new_settings.font.clone(),
            },
            AppSetting {
                setting_key: "base_currency".to_string(),
                setting_value: new_settings.base_currency.clone(),
            },
        ];

        diesel::replace_into(app_settings)
            .values(&settings_to_insert)
            .execute(conn)?;

        Ok(())
    }

    pub fn get_setting(
        conn: &mut SqliteConnection,
        setting_key_param: &str,
    ) -> Result<String, diesel::result::Error> {
        app_settings
            .filter(setting_key.eq(setting_key_param))
            .select(setting_value)
            .first(conn)
    }

    pub fn update_setting(
        conn: &mut SqliteConnection,
        setting_key_param: &str,
        setting_value_param: &str,
    ) -> Result<(), diesel::result::Error> {
        diesel::replace_into(app_settings)
            .values(AppSetting {
                setting_key: setting_key_param.to_string(),
                setting_value: setting_value_param.to_string(),
            })
            .execute(conn)?;
        Ok(())
    }
}
