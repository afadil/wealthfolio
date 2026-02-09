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
    /// Whether the model supports streaming responses.
    #[serde(default = "default_streaming")]
    pub streaming: bool,
}

fn default_streaming() -> bool {
    true // Most models support streaming by default
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
    #[serde(default = "default_priority")]
    pub priority: i32,
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
    /// Fast model for title generation (falls back to default_model if not set).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_model_id: Option<String>,
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

/// Capability overrides for a specific model (tools/thinking/vision).
/// User can set these for fetched/unknown models that aren't in the catalog.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilityOverrides {
    /// Override for tools capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<bool>,
    /// Override for thinking capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<bool>,
    /// Override for vision capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vision: Option<bool>,
    /// Override for streaming capability.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streaming: Option<bool>,
}

fn default_priority() -> i32 {
    100
}

/// Per-provider user settings (stored in app_settings).
#[derive(Debug, Clone, Serialize, Deserialize)]
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
    #[serde(default = "default_priority")]
    pub priority: i32,
    /// Capability overrides keyed by model ID. Only needed for fetched/unknown models.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub model_capability_overrides: HashMap<String, ModelCapabilityOverrides>,
    /// List of fetched model IDs that user has marked as favorites.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub favorite_models: Vec<String>,
    /// Allowlist of tool IDs that this provider can use.
    /// None = all tools enabled (default), Some([]) = no tools, Some([...]) = only specified tools.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools_allowlist: Option<Vec<String>>,
}

impl Default for ProviderUserSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            favorite: false,
            selected_model: None,
            custom_url: None,
            priority: default_priority(),
            model_capability_overrides: HashMap::new(),
            favorite_models: Vec::new(),
            tools_allowlist: None,
        }
    }
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
    /// Display name (may differ from id for fetched models).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub capabilities: ModelCapabilities,
    /// Whether this model is from the catalog (true) or dynamically fetched (false).
    pub is_catalog: bool,
    /// Whether this model is marked as a user favorite.
    pub is_favorite: bool,
    /// Whether capabilities have user overrides applied.
    pub has_capability_overrides: bool,
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
    /// User's favorite model IDs (including fetched models not in catalog).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub favorite_models: Vec<String>,
    /// Capability overrides for specific models.
    /// Note: Always serialized (no skip_serializing_if) because frontend expects this field.
    #[serde(default)]
    pub model_capability_overrides: HashMap<String, ModelCapabilityOverrides>,
    /// Allowlist of tool IDs that this provider can use.
    /// None = all tools enabled (default), Some([]) = no tools, Some([...]) = only specified tools.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools_allowlist: Option<Vec<String>>,

    // Computed
    pub has_api_key: bool,
    pub is_default: bool,
    /// Whether this provider supports dynamic model listing via API.
    pub supports_model_listing: bool,
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
    /// Set capability overrides for a specific model.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_capability_override: Option<ModelCapabilityOverrideUpdate>,
    /// Update the list of favorite models (replaces the entire list).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorite_models: Option<Vec<String>>,
    /// Update tools allowlist.
    /// Use Some(None) to clear (all tools enabled), Some(Some([])) to set specific tools.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools_allowlist: Option<Option<Vec<String>>>,
}

/// Update for a single model's capability overrides.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilityOverrideUpdate {
    /// The model ID to update.
    pub model_id: String,
    /// The capability overrides to set. Use None to remove overrides for this model.
    pub overrides: Option<ModelCapabilityOverrides>,
}

/// Request to set the default provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultProviderRequest {
    /// Provider ID to set as default, or None to clear.
    pub provider_id: Option<String>,
}

// ============================================================================
// Provider API Error Types
// ============================================================================

/// Provider-specific API errors (for frontend consumption).
/// Different from the main AiError which is used internally.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ProviderApiError {
    /// API key is required but not configured for the provider.
    #[serde(rename_all = "camelCase")]
    MissingApiKey { provider_id: String },
    /// Provider is not found in the catalog.
    #[serde(rename_all = "camelCase")]
    UnknownProvider { provider_id: String },
    /// Provider API returned an error.
    #[serde(rename_all = "camelCase")]
    ProviderError { message: String },
    /// Invalid input provided.
    #[serde(rename_all = "camelCase")]
    InvalidInput { message: String },
}

impl std::fmt::Display for ProviderApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderApiError::MissingApiKey { provider_id } => {
                write!(f, "API key required for provider '{}'", provider_id)
            }
            ProviderApiError::UnknownProvider { provider_id } => {
                write!(f, "Unknown provider: {}", provider_id)
            }
            ProviderApiError::ProviderError { message } => {
                write!(f, "Provider error: {}", message)
            }
            ProviderApiError::InvalidInput { message } => {
                write!(f, "Invalid input: {}", message)
            }
        }
    }
}

impl std::error::Error for ProviderApiError {}

// ============================================================================
// Provider Configuration Types (for chat/model listing)
// ============================================================================

/// Configuration needed to connect to a provider (retrieved internally by backend).
/// This is returned only to internal callers, never exposed to frontend.
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    /// The provider ID.
    pub provider_id: String,
    /// The API key (if required and available).
    pub api_key: Option<String>,
    /// The base URL (for local providers like Ollama, or custom endpoints).
    pub base_url: Option<String>,
    /// Whether API key is required for this provider.
    pub requires_api_key: bool,
}

/// Model info returned from provider API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchedModel {
    /// Model ID as returned by provider.
    pub id: String,
    /// Optional display name.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Response from model listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListModelsResponse {
    /// List of models from the provider.
    pub models: Vec<FetchedModel>,
    /// Whether the provider supports dynamic model listing.
    /// If false, only catalog models are available.
    pub supports_listing: bool,
}
