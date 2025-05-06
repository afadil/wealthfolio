use crate::db::{get_connection, DbPool};
use crate::errors::{Error, Result};
use crate::settings::{AppSetting, Settings, SettingsUpdate};
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

        let mut settings = Settings::default(); // Use default implementation

        for (key, value) in all_settings {
            match key.as_str() {
                "theme" => settings.theme = value,
                "font" => settings.font = value,
                "base_currency" => settings.base_currency = value,
                "instance_id" => settings.instance_id = value,
                "onboarding_completed" => {
                    // Parse the string value into a boolean
                    settings.onboarding_completed = value.parse().unwrap_or(false);
                }
                _ => {} // Ignore unknown settings
            }
        }

        // Defaults are now handled by Settings::default(), but we ensure onboarding_completed
        // defaults to false if not explicitly found or if parsing fails above.
        // The call to `Settings::default()` already sets it to false initially.

        Ok(settings)
    }

    fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()> {
        let mut conn = get_connection(&self.pool)?;
        
        conn.transaction::<_, Error, _>(|conn| {
            if let Some(ref theme) = new_settings.theme {
                diesel::replace_into(app_settings)
                    .values(&AppSetting {
                        setting_key: "theme".to_string(),
                        setting_value: theme.clone(),
                    })
                    .execute(conn)?;
            }

            if let Some(ref font) = new_settings.font {
                diesel::replace_into(app_settings)
                    .values(&AppSetting {
                        setting_key: "font".to_string(),
                        setting_value: font.clone(),
                    })
                    .execute(conn)?;
            }

            if let Some(ref base_currency) = new_settings.base_currency {
                 diesel::replace_into(app_settings)
                    .values(&AppSetting {
                        setting_key: "base_currency".to_string(),
                        setting_value: base_currency.clone(),
                    })
                    .execute(conn)?;
            }
            
            if let Some(onboarding_completed) = new_settings.onboarding_completed {
                diesel::replace_into(app_settings)
                    .values(&AppSetting {
                        setting_key: "onboarding_completed".to_string(),
                        setting_value: onboarding_completed.to_string(),
                    })
                    .execute(conn)?;
            }

            Ok(())
        })
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
                    "onboarding_completed" => "false", // Add default for onboarding_completed
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
