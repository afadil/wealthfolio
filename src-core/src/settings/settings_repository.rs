use crate::models::{AppSetting, Settings};
use crate::schema::app_settings::dsl::*;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;

pub struct SettingsRepository;

impl SettingsRepository {
    pub fn get_settings(conn: &mut SqliteConnection) -> Result<Settings, diesel::result::Error> {
        let theme = app_settings
            .filter(setting_key.eq("theme"))
            .select(setting_value)
            .first::<String>(conn)?;

        let font = app_settings
            .filter(setting_key.eq("font"))
            .select(setting_value)
            .first::<String>(conn)?;

        let base_currency = app_settings
            .filter(setting_key.eq("base_currency"))
            .select(setting_value)
            .first::<String>(conn)?;

        Ok(Settings {
            theme,
            font,
            base_currency,
        })
    }

    pub fn update_settings(
        conn: &mut SqliteConnection,
        new_settings: &Settings,
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
