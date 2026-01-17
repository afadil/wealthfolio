use super::SettingsRepositoryTrait;
use crate::errors::{DatabaseError, Error, Result};
use crate::fx::FxServiceTrait;
use crate::settings::{Settings, SettingsUpdate};
use async_trait::async_trait;
use log::{debug, error};
use std::sync::Arc;

// Define the trait for SettingsService
#[async_trait]
pub trait SettingsServiceTrait: Send + Sync {
    fn get_settings(&self) -> Result<Settings>;

    async fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()>;

    fn get_base_currency(&self) -> Result<Option<String>>;

    async fn update_base_currency(&self, new_base_currency: &str) -> Result<()>;

    fn is_auto_update_check_enabled(&self) -> Result<bool>;

    fn is_sync_enabled(&self) -> Result<bool>;

    /// Get a single setting value by key. Returns None if not found.
    fn get_setting_value(&self, key: &str) -> Result<Option<String>>;

    /// Set a single setting value by key.
    async fn set_setting_value(&self, key: &str, value: &str) -> Result<()>;
}

pub struct SettingsService {
    settings_repository: Arc<dyn SettingsRepositoryTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

// Implement the trait for SettingsService
#[async_trait]
impl SettingsServiceTrait for SettingsService {
    fn get_settings(&self) -> Result<Settings> {
        self.settings_repository.get_settings()
    }

    async fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()> {
        let current_base_currency = self.get_base_currency()?;

        if let Some(ref new_base_currency_val) = new_settings.base_currency {
            if current_base_currency.as_deref() != Some(new_base_currency_val.as_str()) {
                self.update_base_currency(new_base_currency_val.as_str())
                    .await?;
            }
        }

        self.settings_repository
            .update_settings(new_settings)
            .await?;
        Ok(())
    }

    fn get_base_currency(&self) -> Result<Option<String>> {
        match self.settings_repository.get_setting("base_currency") {
            Ok(value) => Ok(Some(value)),
            Err(Error::Database(DatabaseError::NotFound(_))) => Ok(None),
            Err(e) => Err(e),
        }
    }

    async fn update_base_currency(&self, new_base_currency: &str) -> Result<()> {
        let all_currencies = self
            .settings_repository
            .get_distinct_currencies_excluding_base(new_base_currency)?;

        debug!(
            "Registering currency pairs for currencies: {:?}",
            all_currencies
        );

        for currency_code in all_currencies {
            let registration_result = self
                .fx_service
                .register_currency_pair(currency_code.as_str(), new_base_currency)
                .await;

            if let Err(e) = registration_result {
                error!(
                    "Failed to register currency pair {}{}: {}. Skipping.",
                    new_base_currency, currency_code, e
                );
            }
        }

        self.settings_repository
            .update_setting("base_currency", new_base_currency)
            .await?;
        Ok(())
    }

    fn is_auto_update_check_enabled(&self) -> Result<bool> {
        match self
            .settings_repository
            .get_setting("auto_update_check_enabled")
        {
            Ok(value) => Ok(value.parse().unwrap_or(true)),
            Err(Error::Database(DatabaseError::NotFound(_))) => Ok(true),
            Err(e) => Err(e),
        }
    }

    fn is_sync_enabled(&self) -> Result<bool> {
        match self.settings_repository.get_setting("sync_enabled") {
            Ok(value) => Ok(value.parse().unwrap_or(false)),
            Err(Error::Database(DatabaseError::NotFound(_))) => Ok(false),
            Err(e) => Err(e),
        }
    }

    fn get_setting_value(&self, key: &str) -> Result<Option<String>> {
        match self.settings_repository.get_setting(key) {
            Ok(value) => Ok(Some(value)),
            Err(Error::Database(DatabaseError::NotFound(_))) => Ok(None),
            Err(e) => Err(e),
        }
    }

    async fn set_setting_value(&self, key: &str, value: &str) -> Result<()> {
        self.settings_repository.update_setting(key, value).await
    }
}

impl SettingsService {
    pub fn new(
        settings_repository: Arc<dyn SettingsRepositoryTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
    ) -> Self {
        SettingsService {
            settings_repository,
            fx_service,
        }
    }
}
