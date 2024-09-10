// settings_service.rs

use crate::models::{NewSettings, Settings};
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
}
