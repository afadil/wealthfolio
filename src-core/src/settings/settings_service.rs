use super::settings_repository::SettingsRepository;
use crate::models::Settings;
use diesel::sqlite::SqliteConnection;

pub struct SettingsService;

impl SettingsService {
    pub fn new() -> Self {
        SettingsService
    }

    pub fn get_settings(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Settings, diesel::result::Error> {
        SettingsRepository::get_settings(conn)
    }

    pub fn update_settings(
        &self,
        conn: &mut SqliteConnection,
        new_settings: &Settings,
    ) -> Result<(), diesel::result::Error> {
        SettingsRepository::update_settings(conn, new_settings)
    }

    pub fn get_setting(
        &self,
        conn: &mut SqliteConnection,
        setting_key: &str,
    ) -> Result<String, diesel::result::Error> {
        SettingsRepository::get_setting(conn, setting_key)
    }

    pub fn update_setting(
        &self,
        conn: &mut SqliteConnection,
        setting_key: &str,
        setting_value: &str,
    ) -> Result<(), diesel::result::Error> {
        SettingsRepository::update_setting(conn, setting_key, setting_value)
    }

    pub fn get_base_currency(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<String, diesel::result::Error> {
        self.get_setting(conn, "base_currency")
    }

    pub fn update_base_currency(
        &self,
        conn: &mut SqliteConnection,
        new_base_currency: &str,
    ) -> Result<(), diesel::result::Error> {
        self.update_setting(conn, "base_currency", new_base_currency)
    }
}
