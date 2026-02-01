//! Traits for addon service operations.

use async_trait::async_trait;

use super::{AddonManifest, AddonUpdateCheckResult, ExtractedAddon, InstalledAddon};

/// Service trait for addon business logic operations.
#[async_trait]
pub trait AddonServiceTrait: Send + Sync {
    // Installation operations
    async fn install_addon_zip(
        &self,
        zip_data: Vec<u8>,
        enable_after_install: bool,
    ) -> Result<AddonManifest, String>;

    async fn install_addon_from_staging(
        &self,
        addon_id: &str,
        enable_after_install: bool,
    ) -> Result<AddonManifest, String>;

    async fn uninstall_addon(&self, addon_id: &str) -> Result<(), String>;

    // Query operations
    fn list_installed_addons(&self) -> Result<Vec<InstalledAddon>, String>;

    fn load_addon_for_runtime(&self, addon_id: &str) -> Result<ExtractedAddon, String>;

    fn get_enabled_addons_on_startup(&self) -> Result<Vec<ExtractedAddon>, String>;

    // Update operations
    async fn check_addon_update(&self, addon_id: &str) -> Result<AddonUpdateCheckResult, String>;

    async fn check_all_addon_updates(&self) -> Result<Vec<AddonUpdateCheckResult>, String>;

    async fn update_addon_from_store(&self, addon_id: &str) -> Result<AddonManifest, String>;

    // Toggle operation
    fn toggle_addon(&self, addon_id: &str, enabled: bool) -> Result<(), String>;

    // Staging operations
    async fn download_addon_to_staging(&self, addon_id: &str) -> Result<ExtractedAddon, String>;

    fn clear_staging(&self, addon_id: Option<&str>) -> Result<(), String>;

    // Store operations
    async fn fetch_store_listings(&self) -> Result<Vec<serde_json::Value>, String>;

    async fn submit_rating(
        &self,
        addon_id: &str,
        rating: u8,
        review: Option<String>,
    ) -> Result<serde_json::Value, String>;

    // Utility operations
    fn extract_addon_zip(&self, zip_data: Vec<u8>) -> Result<ExtractedAddon, String>;
}
