use crate::db::{get_connection, DbPool};
use crate::errors::{Error, Result};
use crate::models::{AppSetting, Settings, SettingsUpdate};
use crate::schema::app_settings::dsl::*;
use crate::schema::{accounts, assets};
use diesel::prelude::*;
use std::sync::Arc;

// Define the trait for SettingsRepository
pub trait SettingsRepositoryTrait: Send + Sync {
    fn get_settings(&self) -> Result<Settings>;
    fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()>;
    fn get_setting(&self, setting_key_param: &str) -> Result<String>;
    fn update_setting(&self, setting_key_param: &str, setting_value_param: &str) -> Result<()>;
    fn get_distinct_currencies_excluding_base(&self, base_currency: &str) -> Result<Vec<String>>;
}

pub struct SettingsRepository {
    pool: Arc<DbPool>,
}

impl SettingsRepository {
    pub fn new(pool: Arc<DbPool>) -> Self {
        SettingsRepository { pool }
    }
}

// Implement the trait for SettingsRepository
impl SettingsRepositoryTrait for SettingsRepository {
    fn get_settings(&self) -> Result<Settings> {
        let mut conn = get_connection(&self.pool)?;
        let all_settings: Vec<(String, String)> = app_settings
            .select((setting_key, setting_value))
            .load::<(String, String)>(&mut conn)
            .map_err(Error::from)?;

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

    fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;
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
            .execute(&mut conn)
            .map_err(Error::from)?;

        Ok(())
    }

    fn get_setting(&self, setting_key_param: &str) -> Result<String> {
        let mut conn = get_connection(&self.pool)?;
        let result = app_settings
            .filter(setting_key.eq(setting_key_param))
            .select(setting_value)
            .first(&mut conn);

        match result {
            Ok(value) => Ok(value),
            Err(diesel::result::Error::NotFound) => {
                // Return default values for known settings
                let default_value = match setting_key_param {
                    "theme" => "light",
                    "font" => "font-mono",
                    _ => return Err(Error::from(diesel::result::Error::NotFound)),
                };
                Ok(default_value.to_string())
            }
            Err(e) => Err(Error::from(e)),
        }
    }

    fn update_setting(
        &self,
        setting_key_param: &str,
        setting_value_param: &str,
    ) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;
        diesel::replace_into(app_settings)
            .values(AppSetting {
                setting_key: setting_key_param.to_string(),
                setting_value: setting_value_param.to_string(),
            })
            .execute(&mut conn)
            .map_err(Error::from)?;
        Ok(())
    }

    fn get_distinct_currencies_excluding_base(
        &self,
        base_currency: &str,
    ) -> Result<Vec<String>> {
        let mut conn = get_connection(&self.pool)?;

        let currency_assets: Vec<String> = assets::table
            .filter(assets::asset_type.eq("FOREX"))
            .filter(assets::currency.ne(base_currency))
            .select(assets::currency)
            .distinct()
            .load::<String>(&mut conn)
            .map_err(Error::from)?;

        let account_currencies: Vec<String> = accounts::table
            .filter(accounts::currency.ne(base_currency))
            .select(accounts::currency)
            .distinct()
            .load::<String>(&mut conn)
            .map_err(Error::from)?;

        let mut all_currencies: Vec<String> = Vec::new();
        all_currencies.extend(currency_assets);
        all_currencies.extend(account_currencies);
        all_currencies.sort();
        all_currencies.dedup();

        Ok(all_currencies)
    }
}
