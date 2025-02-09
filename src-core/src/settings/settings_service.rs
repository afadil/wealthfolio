use super::settings_repository::SettingsRepository;
use crate::models::{Settings, SettingsUpdate};
use crate::fx::fx_service::CurrencyExchangeService;
use crate::schema::{assets, accounts};
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use log::{debug, error};

pub struct SettingsService {
    fx_service: CurrencyExchangeService,
}

impl SettingsService {
    pub fn new() -> Self {
        SettingsService {
            fx_service: CurrencyExchangeService::new(),
        }
    }

    pub fn get_settings(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Settings, diesel::result::Error> {
        SettingsRepository::get_settings(conn)
    }

    pub async fn update_settings(
        &self,
        conn: &mut SqliteConnection,
        new_settings: &SettingsUpdate,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Check if base currency is different from current
        let current_base_currency = self.get_base_currency(conn)?;
        if current_base_currency.as_deref() != Some(new_settings.base_currency.as_str()) {
            self.update_base_currency(conn, &new_settings.base_currency).await?;
            return Ok(());
        }

        // For other settings updates
        SettingsRepository::update_settings(conn, new_settings)?;
        Ok(())
    }

    pub fn get_base_currency(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Option<String>, diesel::result::Error> {
        match SettingsRepository::get_setting(conn, "base_currency") {
            Ok(value) => Ok(Some(String::from(value))),
            Err(diesel::result::Error::NotFound) => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub async fn update_base_currency(
        &self,
        conn: &mut SqliteConnection,
        new_base_currency: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Get all existing currency symbols from assets
        let currency_assets: Vec<String> = assets::table
            .filter(assets::asset_type.eq("Currency"))
            .filter(assets::currency.ne(new_base_currency)) // Exclude new base currency
            .select(assets::currency)
            .distinct()
            .load::<String>(conn)?;

        // Get all account currencies
        let account_currencies: Vec<String> = accounts::table
            .filter(accounts::currency.ne(new_base_currency)) // Exclude new base currency
            .select(accounts::currency)
            .distinct()
            .load::<String>(conn)?;

        // Combine and deduplicate currencies
        let mut all_currencies: Vec<String> = Vec::new();
        all_currencies.extend(currency_assets);
        all_currencies.extend(account_currencies);
        all_currencies.sort();
        all_currencies.dedup();

        debug!("Registering currency pairs for currencies: {:?}", all_currencies);

        // Create currency pairs between new base currency and all existing currencies
        for currency_code in all_currencies {
            if let Err(e) = self.fx_service
                .register_currency(
                    conn,
                    new_base_currency.to_string(),
                    currency_code.clone(),
                )
                .await
            {
                error!("Failed to register currency pair {}{}: {}", new_base_currency, currency_code, e);
            }
        }

        // Update the base currency setting
        SettingsRepository::update_setting(conn, "base_currency", new_base_currency)?;
        Ok(())
    }
}
