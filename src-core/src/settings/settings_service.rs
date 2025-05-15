use super::settings_repository::SettingsRepositoryTrait;
use crate::fx::fx_traits::FxServiceTrait;
use crate::errors::{Error, Result, DatabaseError};
use crate::settings::{Settings, SettingsUpdate};
use log::{debug, error};
use std::sync::Arc;

// Define the trait for SettingsService
pub trait SettingsServiceTrait: Send + Sync {
    fn get_settings(&self) -> Result<Settings>;

    fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()>;

    fn get_base_currency(&self) -> Result<Option<String>>;

    fn update_base_currency(&self, new_base_currency: &str) -> Result<()>;
}

pub struct SettingsService {
    settings_repository: Arc<dyn SettingsRepositoryTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
}

// Implement the trait for SettingsService
impl SettingsServiceTrait for SettingsService {
    fn get_settings(&self) -> Result<Settings> {
        self.settings_repository.get_settings()
    }

    fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()> {
        let current_base_currency = self.get_base_currency()?;

        if let Some(ref new_base_currency_val) = new_settings.base_currency {
            if current_base_currency.as_deref() != Some(new_base_currency_val.as_str()) {
                 self.update_base_currency(new_base_currency_val.as_str())?;
            }
        }
        
        self.settings_repository.update_settings(new_settings)?;
        Ok(())
    }

    fn get_base_currency(&self) -> Result<Option<String>> {
        match self.settings_repository.get_setting("base_currency") {
            Ok(value) => Ok(Some(value)),
            Err(Error::Database(DatabaseError::QueryFailed(diesel::result::Error::NotFound))) => Ok(None),
            Err(e) => Err(e),
        }
    }

    fn update_base_currency(&self, new_base_currency: &str) -> Result<()> {
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
                .register_currency_pair(currency_code.as_str(), new_base_currency);

            if let Err(e) = registration_result {
                error!(
                    "Failed to register currency pair {}{}: {}. Skipping.",
                    new_base_currency, currency_code, e
                );
            }
        }

        self.settings_repository
            .update_setting("base_currency", new_base_currency)?;
        Ok(())
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
