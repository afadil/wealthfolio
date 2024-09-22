// settings_service.rs

use crate::models::{Asset, ExchangeRate, NewSettings, Quote, Settings};
use crate::schema::assets::dsl::*;
use crate::schema::settings::dsl::*;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;

pub struct SettingsService {
    settings_id: i32,
}

impl SettingsService {
    pub fn new() -> Self {
        SettingsService { settings_id: 1 }
    }

    pub fn get_settings(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Settings, diesel::result::Error> {
        settings.find(self.settings_id).first::<Settings>(conn)
    }

    pub fn update_settings(
        &self,
        conn: &mut SqliteConnection,
        new_setting: &NewSettings,
    ) -> Result<(), diesel::result::Error> {
        // First, try to update
        let rows_affected = diesel::update(settings.find(self.settings_id))
            .set(new_setting)
            .execute(conn)?;

        // Check if the update affected any rows
        if rows_affected == 0 {
            // If no rows were affected, perform an insert
            diesel::insert_into(settings)
                .values(new_setting)
                .execute(conn)?;
        }

        Ok(())
    }

    pub fn update_base_currency(
        &self,
        conn: &mut SqliteConnection,
        new_base_currency: &str,
    ) -> Result<(), diesel::result::Error> {
        diesel::update(settings.find(self.settings_id))
            .set(base_currency.eq(new_base_currency))
            .execute(conn)?;
        Ok(())
    }

    pub fn update_exchange_rate(
        &self,
        conn: &mut SqliteConnection,
        rate: &ExchangeRate,
    ) -> Result<ExchangeRate, diesel::result::Error> {
        let asset = Asset {
            id: rate.id.clone(),
            symbol: format!("{}{}=X", rate.from_currency, rate.to_currency),
            name: Some(rate.rate.to_string()),
            asset_type: Some("Currency".to_string()),
            data_source: rate.source.clone(),
            currency: rate.to_currency.clone(),
            updated_at: chrono::Utc::now().naive_utc(),
            ..Default::default()
        };

        diesel::update(assets.find(&asset.id))
            .set(&asset)
            .execute(conn)?;

        Ok(rate.clone())
    }

    pub fn get_exchange_rate_symbols(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<ExchangeRate>, diesel::result::Error> {
        use crate::schema::assets::dsl as assets_dsl;

        let asset_rates: Vec<Asset> = assets_dsl::assets
            .filter(assets_dsl::asset_type.eq("Currency"))
            .load::<Asset>(conn)?;

        Ok(asset_rates
            .into_iter()
            .map(|asset| {
                let symbol_parts: Vec<&str> = asset.symbol.split('=').collect();
                ExchangeRate {
                    id: asset.id,
                    from_currency: symbol_parts[0][..3].to_string(),
                    to_currency: symbol_parts[0][3..].to_string(),
                    rate: 0.0,
                    source: asset.data_source,
                }
            })
            .collect())
    }

    pub fn get_latest_quote(
        &self,
        conn: &mut SqliteConnection,
        fx_symbol: &str,
    ) -> Result<Option<Quote>, diesel::result::Error> {
        use crate::schema::quotes::dsl::*;
        quotes
            .filter(symbol.eq(fx_symbol))
            .order(date.desc())
            .first(conn)
            .optional()
    }

    pub fn get_exchange_rates(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<ExchangeRate>, diesel::result::Error> {
        // Get exchange rate symbols
        let mut exchange_rates = self.get_exchange_rate_symbols(conn)?;

        // For each exchange rate, get the latest quote
        for rate in &mut exchange_rates {
            let fx_symbol = format!("{}{}=X", rate.from_currency, rate.to_currency);
            if let Some(quote) = self.get_latest_quote(conn, &fx_symbol)? {
                rate.rate = quote.close;
            }
        }

        Ok(exchange_rates)
    }
}
