use crate::db::{get_connection, DbPool, WriteHandle};
use crate::errors::{Error, Result};
use crate::settings::{AppSetting, Settings, SettingsUpdate};
use crate::schema::app_settings::dsl::*;
use crate::schema::{accounts, assets};
use diesel::prelude::*;
use std::sync::Arc;
use async_trait::async_trait;

// Define the trait for SettingsRepository
#[async_trait]
pub trait SettingsRepositoryTrait: Send + Sync {
    fn get_settings(&self) -> Result<Settings>;
    async fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()>;
    fn get_setting(&self, setting_key_param: &str) -> Result<String>;
    async fn update_setting(&self, setting_key_param: &str, setting_value_param: &str) -> Result<()>;
    fn get_distinct_currencies_excluding_base(&self, base_currency: &str) -> Result<Vec<String>>;
}

pub struct SettingsRepository {
    pool: Arc<DbPool>,
    writer: WriteHandle,
}

impl SettingsRepository {
    pub fn new(pool: Arc<DbPool>, writer: WriteHandle) -> Self {
        SettingsRepository { pool, writer }
    }
}

// Implement the trait for SettingsRepository
#[async_trait]
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
                "auto_update_check_enabled" => {
                    // Parse the string value into a boolean
                    settings.auto_update_check_enabled = value.parse().unwrap_or(true);
                }
                _ => {} // Ignore unknown settings
            }
        }

        // Defaults are now handled by Settings::default(), but we ensure onboarding_completed
        // defaults to false if not explicitly found or if parsing fails above.
        // The call to `Settings::default()` already sets it to false initially.

        Ok(settings)
    }

    async fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()> {
        let settings = new_settings.clone();
        self.writer
            .exec(move |conn| {
                if let Some(ref theme) = settings.theme {
                    diesel::replace_into(app_settings)
                        .values(&AppSetting {
                            setting_key: "theme".to_string(),
                            setting_value: theme.clone(),
                        })
                        .execute(conn)?;
                }

                if let Some(ref font) = settings.font {
                    diesel::replace_into(app_settings)
                        .values(&AppSetting {
                            setting_key: "font".to_string(),
                            setting_value: font.clone(),
                        })
                        .execute(conn)?;
                }

                if let Some(ref base_currency) = settings.base_currency {
                    diesel::replace_into(app_settings)
                        .values(&AppSetting {
                            setting_key: "base_currency".to_string(),
                            setting_value: base_currency.clone(),
                        })
                        .execute(conn)?;
                }
                
                if let Some(onboarding_completed) = settings.onboarding_completed {
                    diesel::replace_into(app_settings)
                        .values(&AppSetting {
                            setting_key: "onboarding_completed".to_string(),
                            setting_value: onboarding_completed.to_string(),
                        })
                        .execute(conn)?;
                }

                if let Some(auto_update_check_enabled) = settings.auto_update_check_enabled {
                    diesel::replace_into(app_settings)
                        .values(&AppSetting {
                            setting_key: "auto_update_check_enabled".to_string(),
                            setting_value: auto_update_check_enabled.to_string(),
                        })
                        .execute(conn)?;
                }

                Ok(())
            })
            .await
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
                    "auto_update_check_enabled" => "true", // Add default for auto_update_check_enabled
                    _ => return Err(Error::from(diesel::result::Error::NotFound)),
                };
                Ok(default_value.to_string())
            }
            Err(e) => Err(Error::from(e)),
        }
    }

    async fn update_setting(&self, setting_key_param: &str, setting_value_param: &str) -> Result<()> {
        let key = setting_key_param.to_string();
        let value = setting_value_param.to_string();
        
        self.writer
            .exec(move |conn| {
                diesel::replace_into(app_settings)
                    .values(AppSetting {
                        setting_key: key.clone(), // Ensure key is cloned if used after move
                        setting_value: value.clone(), // Ensure value is cloned if used after move
                    })
                    .execute(conn)?;
                Ok(())
            })
            .await
    }

    fn get_distinct_currencies_excluding_base(&self, base_currency: &str) -> Result<Vec<String>> {
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
