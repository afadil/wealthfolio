//! Repository traits for settings.

use async_trait::async_trait;

use crate::errors::Result;
use crate::settings::{Settings, SettingsUpdate};

/// Repository trait for managing application settings.
#[async_trait]
pub trait SettingsRepositoryTrait: Send + Sync {
    /// Get all settings.
    fn get_settings(&self) -> Result<Settings>;

    /// Update multiple settings at once.
    async fn update_settings(&self, new_settings: &SettingsUpdate) -> Result<()>;

    /// Get a single setting value by key.
    fn get_setting(&self, setting_key: &str) -> Result<String>;

    /// Update a single setting.
    async fn update_setting(&self, setting_key: &str, setting_value: &str) -> Result<()>;

    /// Get all distinct currencies (excluding the base currency) from accounts and assets.
    fn get_distinct_currencies_excluding_base(&self, base_currency: &str) -> Result<Vec<String>>;
}
