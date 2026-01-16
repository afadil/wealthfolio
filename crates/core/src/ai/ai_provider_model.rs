//! AI provider domain models.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Current schema version for AI provider settings.
/// Increment when making breaking changes to the settings structure.
pub const AI_PROVIDER_SETTINGS_SCHEMA_VERSION: u32 = 1;

/// The app_settings key used to store AI provider settings.
pub const AI_PROVIDER_SETTINGS_KEY: &str = "ai_provider_settings";

// ============================================================================
// Catalog Types (read from JSON, immutable)
// ============================================================================

/// Model capabilities from the catalog.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModelCapabilities {
    pub tools: bool,
    pub thinking: bool,
    pub vision: bool,
}

/// A single model definition from the catalog.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogModel {
    pub capabilities: ModelCapabilities,
}

/// Connection field definition for provider configuration UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionField {
    pub key: String,
    pub label: String,
    #[serde(rename = "type")]
    pub field_type: String,
    pub placeholder: String,
    pub required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub help_url: Option<String>,
}

/// Default configuration from the catalog.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderDefaultConfig {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// A provider definition from the catalog (immutable source of truth).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogProvider {
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    pub icon: String,
    pub description: String,
    pub env_key: String,
    pub default_config: ProviderDefaultConfig,
    pub connection_fields: Vec<ConnectionField>,
    pub models: HashMap<String, CatalogModel>,
    pub default_model: String,
    pub documentation_url: String,
}

/// Capability metadata from the catalog.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityInfo {
    pub name: String,
    pub description: String,
    pub icon: String,
}

/// The full catalog structure loaded from JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProviderCatalog {
    pub providers: HashMap<String, CatalogProvider>,
    pub capabilities: HashMap<String, CapabilityInfo>,
}

// ============================================================================
// User Settings Types (stored in app_settings)
// ============================================================================

/// Per-provider user settings (stored in app_settings).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUserSettings {
    /// Whether this provider is enabled by the user.
    #[serde(default)]
    pub enabled: bool,
    /// Whether this provider is marked as favorite.
    #[serde(default)]
    pub favorite: bool,
    /// User-selected model (overrides catalog default).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    /// Custom URL for local providers like Ollama.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_url: Option<String>,
    /// Priority for sorting (lower = higher priority).
    #[serde(default)]
    pub priority: i32,
}

/// The complete AI provider settings blob stored in app_settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderSettings {
    /// Schema version for migration support.
    pub schema_version: u32,
    /// Default provider ID to use.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_provider: Option<String>,
    /// Per-provider user settings keyed by provider ID.
    #[serde(default)]
    pub providers: HashMap<String, ProviderUserSettings>,
}

impl Default for AiProviderSettings {
    fn default() -> Self {
        Self {
            schema_version: AI_PROVIDER_SETTINGS_SCHEMA_VERSION,
            default_provider: None,
            providers: HashMap::new(),
        }
    }
}

// ============================================================================
// Merged View Types (returned to UI)
// ============================================================================

/// A model in the merged view returned to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedModel {
    pub id: String,
    pub capabilities: ModelCapabilities,
}

/// A provider in the merged view returned to the UI.
/// Combines catalog data with user settings and computed fields.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergedProvider {
    // From catalog (immutable)
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub provider_type: String,
    pub icon: String,
    pub description: String,
    pub env_key: String,
    pub connection_fields: Vec<ConnectionField>,
    pub models: Vec<MergedModel>,
    pub default_model: String,
    pub documentation_url: String,

    // From user settings (mutable)
    pub enabled: bool,
    pub favorite: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_url: Option<String>,
    pub priority: i32,

    // Computed
    pub has_api_key: bool,
    pub is_default: bool,
}

/// The complete merged response returned to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProvidersResponse {
    pub providers: Vec<MergedProvider>,
    pub capabilities: HashMap<String, CapabilityInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_provider: Option<String>,
}

// ============================================================================
// Update Types (for modifying settings)
// ============================================================================

/// Request to update a single provider's settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProviderSettingsRequest {
    pub provider_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
}

/// Request to set the default provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultProviderRequest {
    /// Provider ID to set as default, or None to clear.
    pub provider_id: Option<String>,
}
