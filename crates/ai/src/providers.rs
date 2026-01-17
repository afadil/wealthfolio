//! AI provider catalog and client management.
//!
//! This module provides:
//! - Provider catalog loaded from JSON configuration
//! - Client factory for rig-core providers
//! - API key management via the environment's secret store

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use crate::env::AiEnvironment;
use crate::error::AiError;
use crate::provider_model::{
    CapabilityInfo, ConnectionField, ModelCapabilities, ProviderDefaultConfig,
};

// ============================================================================
// Provider Catalog (Static JSON)
// ============================================================================

/// Static provider catalog loaded from embedded JSON.
static PROVIDER_CATALOG: Lazy<ProviderCatalog> = Lazy::new(|| {
    let json = include_str!("ai_providers.json");
    serde_json::from_str(json).expect("Failed to parse ai_providers.json")
});

#[derive(Debug, Deserialize)]
struct ProviderCatalog {
    providers: HashMap<String, ProviderCatalogEntry>,
    capabilities: HashMap<String, CapabilityInfo>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderCatalogEntry {
    name: String,
    #[serde(rename = "type")]
    provider_type: String,
    icon: String,
    description: String,
    #[serde(default)]
    env_key: Option<String>,
    #[serde(default)]
    default_config: ProviderDefaultConfig,
    #[serde(default)]
    connection_fields: Vec<ConnectionField>,
    models: HashMap<String, ModelCatalogEntry>,
    default_model: String,
    /// Fast model for title generation (falls back to default_model if not set).
    #[serde(default)]
    title_model_id: Option<String>,
    #[serde(default)]
    documentation_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelCatalogEntry {
    #[serde(default)]
    capabilities: ModelCapabilities,
}

// ============================================================================
// Local Types (simplified views for this service)
// ============================================================================

/// Simple provider info for catalog listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleProviderInfo {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub icon: String,
    pub description: String,
    pub default_model: String,
    pub documentation_url: Option<String>,
    #[serde(default)]
    pub default_config: ProviderDefaultConfig,
    #[serde(default)]
    pub connection_fields: Vec<ConnectionField>,
    #[serde(default)]
    pub models: Vec<SimpleModelInfo>,
    #[serde(default)]
    pub env_key: Option<String>,
}

/// Simple model info.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleModelInfo {
    pub id: String,
    #[serde(default)]
    pub capabilities: ModelCapabilities,
}

/// Provider setting for display.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleProviderSetting {
    pub id: String,
    pub name: String,
    pub description: String,
    pub provider_type: String,
    pub icon: String,
    pub default_model: String,
    pub enabled: bool,
    #[serde(default)]
    pub supports_custom_url: bool,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub documentation_url: Option<String>,
    #[serde(default)]
    pub env_key: Option<String>,
    #[serde(default)]
    pub models: Vec<SimpleModelInfo>,
}

/// Combined settings response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimpleSettings {
    pub provider_id: String,
    pub model: String,
    pub has_api_key: bool,
    pub providers: Vec<SimpleProviderSetting>,
    #[serde(default)]
    pub capabilities: HashMap<String, CapabilityInfo>,
}

// ============================================================================
// Provider Service
// ============================================================================

/// Service key for storing AI provider settings.
pub const AI_SETTINGS_KEY: &str = "ai_settings";

/// Provider service for managing AI settings.
pub struct ProviderService<E: AiEnvironment> {
    env: Arc<E>,
}

impl<E: AiEnvironment> ProviderService<E> {
    /// Create a new provider service.
    pub fn new(env: Arc<E>) -> Self {
        Self { env }
    }

    /// Get all provider info from the catalog.
    pub fn get_provider_catalog(&self) -> Vec<SimpleProviderInfo> {
        PROVIDER_CATALOG
            .providers
            .iter()
            .map(|(id, entry)| SimpleProviderInfo {
                id: id.clone(),
                name: entry.name.clone(),
                provider_type: entry.provider_type.clone(),
                icon: entry.icon.clone(),
                description: entry.description.clone(),
                default_model: entry.default_model.clone(),
                documentation_url: entry.documentation_url.clone(),
                default_config: entry.default_config.clone(),
                connection_fields: entry.connection_fields.clone(),
                models: entry
                    .models
                    .iter()
                    .map(|(id, m)| SimpleModelInfo {
                        id: id.clone(),
                        capabilities: m.capabilities.clone(),
                    })
                    .collect(),
                env_key: entry.env_key.clone(),
            })
            .collect()
    }

    /// Get capability info.
    pub fn get_capabilities(&self) -> HashMap<String, CapabilityInfo> {
        PROVIDER_CATALOG.capabilities.clone()
    }

    /// Get the current AI settings (merged from catalog + stored settings).
    pub fn get_settings(&self) -> Result<SimpleSettings, AiError> {
        // Load stored settings
        let stored: StoredAiSettings = self
            .env
            .settings_service()
            .get_setting_value(AI_SETTINGS_KEY)
            .map_err(|e| AiError::Internal(e.to_string()))?
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        // Get current provider and model
        let provider_id = stored
            .provider_id
            .clone()
            .unwrap_or_else(|| "ollama".to_string());
        let model = stored.model.clone().unwrap_or_else(|| {
            PROVIDER_CATALOG
                .providers
                .get(&provider_id)
                .map(|p| p.default_model.clone())
                .unwrap_or_else(|| "deepseek-r1:8b".to_string())
        });

        // Check if we have an API key
        let has_api_key = self.has_api_key(&provider_id);

        // Build provider settings
        let providers: Vec<SimpleProviderSetting> = PROVIDER_CATALOG
            .providers
            .iter()
            .map(|(id, entry)| {
                let stored_provider = stored.providers.get(id);
                let enabled = stored_provider
                    .and_then(|p| p.enabled)
                    .unwrap_or(entry.default_config.enabled);
                let url = stored_provider
                    .and_then(|p| p.url.clone())
                    .or_else(|| entry.default_config.url.clone());

                SimpleProviderSetting {
                    id: id.clone(),
                    name: entry.name.clone(),
                    description: entry.description.clone(),
                    provider_type: entry.provider_type.clone(),
                    icon: entry.icon.clone(),
                    default_model: entry.default_model.clone(),
                    enabled,
                    supports_custom_url: entry.provider_type == "local",
                    url,
                    documentation_url: entry.documentation_url.clone(),
                    env_key: entry.env_key.clone(),
                    models: entry
                        .models
                        .iter()
                        .map(|(id, m)| SimpleModelInfo {
                            id: id.clone(),
                            capabilities: m.capabilities.clone(),
                        })
                        .collect(),
                }
            })
            .collect();

        Ok(SimpleSettings {
            provider_id,
            model,
            has_api_key,
            providers,
            capabilities: PROVIDER_CATALOG.capabilities.clone(),
        })
    }

    /// Get API key for a provider from the secret store.
    pub fn get_api_key(&self, provider_id: &str) -> Result<Option<String>, AiError> {
        let env_key = PROVIDER_CATALOG
            .providers
            .get(provider_id)
            .and_then(|p| p.env_key.clone());

        match env_key {
            Some(key) => self
                .env
                .secret_store()
                .get_secret(&key)
                .map_err(|e| AiError::Internal(e.to_string())),
            None => Ok(None),
        }
    }

    /// Check if a provider has an API key stored.
    pub fn has_api_key(&self, provider_id: &str) -> bool {
        self.get_api_key(provider_id)
            .ok()
            .flatten()
            .map(|k| !k.is_empty())
            .unwrap_or(false)
    }

    /// Set API key for a provider.
    pub async fn set_api_key(&self, provider_id: &str, api_key: &str) -> Result<(), AiError> {
        let env_key = PROVIDER_CATALOG
            .providers
            .get(provider_id)
            .and_then(|p| p.env_key.clone())
            .ok_or_else(|| AiError::Internal(format!("No env_key for provider {}", provider_id)))?;

        self.env
            .secret_store()
            .set_secret(&env_key, api_key)
            .map_err(|e| AiError::Internal(e.to_string()))
    }

    /// Delete API key for a provider.
    pub async fn delete_api_key(&self, provider_id: &str) -> Result<(), AiError> {
        let env_key = PROVIDER_CATALOG
            .providers
            .get(provider_id)
            .and_then(|p| p.env_key.clone())
            .ok_or_else(|| AiError::Internal(format!("No env_key for provider {}", provider_id)))?;

        self.env
            .secret_store()
            .delete_secret(&env_key)
            .map_err(|e| AiError::Internal(e.to_string()))
    }

    /// Get model capabilities for a specific provider/model combination.
    /// Returns default capabilities (no tools) if model is not found in catalog.
    pub fn get_model_capabilities(&self, provider_id: &str, model_id: &str) -> ModelCapabilities {
        PROVIDER_CATALOG
            .providers
            .get(provider_id)
            .and_then(|p| p.models.get(model_id))
            .map(|m| m.capabilities.clone())
            .unwrap_or_else(|| {
                // Default: no tools for unknown models to be safe
                ModelCapabilities {
                    tools: false,
                    thinking: false,
                    vision: false,
                    streaming: true,
                }
            })
    }

    /// Get the title model ID for a provider.
    /// Returns title_model_id if configured, otherwise falls back to default_model.
    pub fn get_title_model(&self, provider_id: &str) -> Option<String> {
        PROVIDER_CATALOG.providers.get(provider_id).map(|p| {
            p.title_model_id
                .clone()
                .unwrap_or_else(|| p.default_model.clone())
        })
    }

    /// Get provider URL (for local providers like Ollama).
    pub fn get_provider_url(&self, provider_id: &str) -> Option<String> {
        let stored: StoredAiSettings = self
            .env
            .settings_service()
            .get_setting_value(AI_SETTINGS_KEY)
            .ok()
            .flatten()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        stored
            .providers
            .get(provider_id)
            .and_then(|p| p.url.clone())
            .or_else(|| {
                PROVIDER_CATALOG
                    .providers
                    .get(provider_id)
                    .and_then(|p| p.default_config.url.clone())
            })
    }

    /// Update AI settings.
    pub async fn update_settings(
        &self,
        provider_id: Option<String>,
        model: Option<String>,
        provider_config: Option<StoredProviderConfig>,
    ) -> Result<SimpleSettings, AiError> {
        // Load current stored settings
        let mut stored: StoredAiSettings = self
            .env
            .settings_service()
            .get_setting_value(AI_SETTINGS_KEY)
            .ok()
            .flatten()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        // Update fields
        if let Some(p) = provider_id {
            stored.provider_id = Some(p);
        }
        if let Some(m) = model {
            stored.model = Some(m);
        }
        if let Some(config) = provider_config {
            stored.providers.insert(
                config.id.clone(),
                StoredProviderSettings {
                    enabled: Some(config.enabled),
                    url: config.url,
                },
            );
        }

        // Save
        let json = serde_json::to_string(&stored).map_err(|e| AiError::Internal(e.to_string()))?;
        self.env
            .settings_service()
            .set_setting_value(AI_SETTINGS_KEY, &json)
            .await
            .map_err(|e| AiError::Internal(e.to_string()))?;

        self.get_settings()
    }
}

/// Stored AI settings (in app_settings).
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAiSettings {
    pub provider_id: Option<String>,
    pub model: Option<String>,
    #[serde(default)]
    pub providers: HashMap<String, StoredProviderSettings>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredProviderSettings {
    pub enabled: Option<bool>,
    pub url: Option<String>,
}

/// Config update for a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredProviderConfig {
    pub id: String,
    pub enabled: bool,
    pub url: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_catalog_loads() {
        let catalog = &*PROVIDER_CATALOG;
        assert!(!catalog.providers.is_empty());
        assert!(catalog.providers.contains_key("openai"));
        assert!(catalog.providers.contains_key("ollama"));
    }

    #[test]
    fn test_capabilities_loads() {
        let catalog = &*PROVIDER_CATALOG;
        assert!(catalog.capabilities.contains_key("tools"));
        assert!(catalog.capabilities.contains_key("thinking"));
    }
}
