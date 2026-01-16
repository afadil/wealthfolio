//! AI provider service - merges catalog with user settings.

use async_trait::async_trait;
use std::sync::Arc;

use crate::errors::{Result, ValidationError};
use crate::secrets::SecretStore;
use crate::settings::SettingsRepositoryTrait;

use super::{
    AiError, AiProviderCatalog, AiProviderSettings, AiProvidersResponse, FetchedModel,
    ListModelsResponse, MergedModel, MergedProvider, ModelCapabilities, ModelCapabilityOverrides,
    ProviderConfig, ProviderUserSettings, SetDefaultProviderRequest, UpdateProviderSettingsRequest,
    AI_PROVIDER_SETTINGS_KEY, AI_PROVIDER_SETTINGS_SCHEMA_VERSION,
};

/// Service trait for AI provider operations.
#[async_trait]
pub trait AiProviderServiceTrait: Send + Sync {
    /// Get all providers merged with user settings.
    fn get_ai_providers(&self) -> Result<AiProvidersResponse>;

    /// Update settings for a specific provider.
    async fn update_provider_settings(&self, request: UpdateProviderSettingsRequest) -> Result<()>;

    /// Set or clear the default provider.
    async fn set_default_provider(&self, request: SetDefaultProviderRequest) -> Result<()>;

    /// Get provider configuration for backend-only use (chat, model listing).
    /// This retrieves the API key from the secret store - never exposed to frontend.
    /// Returns AiError::MissingApiKey if API key is required but not configured.
    fn get_provider_config(&self, provider_id: &str) -> std::result::Result<ProviderConfig, AiError>;

    /// List available models from a provider.
    /// Fetches models from the provider's API using backend-stored secrets.
    /// For providers without model listing (e.g., Anthropic), returns catalog models.
    async fn list_models(
        &self,
        provider_id: &str,
    ) -> std::result::Result<super::ListModelsResponse, AiError>;
}

/// AI provider service implementation.
pub struct AiProviderService {
    settings_repo: Arc<dyn SettingsRepositoryTrait>,
    secret_store: Arc<dyn SecretStore>,
    catalog: AiProviderCatalog,
}

impl AiProviderService {
    /// Create a new AI provider service.
    pub fn new(
        settings_repo: Arc<dyn SettingsRepositoryTrait>,
        secret_store: Arc<dyn SecretStore>,
        catalog_json: &str,
    ) -> Result<Self> {
        let catalog: AiProviderCatalog = serde_json::from_str(catalog_json)?;

        Ok(Self {
            settings_repo,
            secret_store,
            catalog,
        })
    }

    /// Load user settings from app_settings, falling back to defaults if missing/corrupt.
    fn load_user_settings(&self) -> AiProviderSettings {
        match self.settings_repo.get_setting(AI_PROVIDER_SETTINGS_KEY) {
            Ok(json) => {
                serde_json::from_str(&json).unwrap_or_else(|_| self.create_default_settings())
            }
            Err(_) => self.create_default_settings(),
        }
    }

    /// Create default settings based on catalog defaults.
    fn create_default_settings(&self) -> AiProviderSettings {
        let mut settings = AiProviderSettings::default();

        // Find first provider marked as enabled by default in catalog
        // and set recommended providers as favorites
        let mut first_enabled_provider: Option<String> = None;

        for (id, provider) in &self.catalog.providers {
            if provider.default_config.enabled {
                let user_settings = ProviderUserSettings {
                    enabled: true,
                    favorite: true, // Recommended providers are favorites
                    custom_url: provider.default_config.url.clone(),
                    ..Default::default()
                };
                settings.providers.insert(id.clone(), user_settings);

                if first_enabled_provider.is_none() {
                    first_enabled_provider = Some(id.clone());
                }
            }
        }

        // Set first enabled provider as default
        settings.default_provider = first_enabled_provider;

        settings
    }

    /// Save user settings to app_settings.
    async fn save_user_settings(&self, settings: &AiProviderSettings) -> Result<()> {
        let json = serde_json::to_string(settings)?;
        self.settings_repo
            .update_setting(AI_PROVIDER_SETTINGS_KEY, &json)
            .await
    }

    /// Build the secret key for a provider (format: ai_<PROVIDER_ID>).
    fn secret_key_for_provider(provider_id: &str) -> String {
        format!("ai_{}", provider_id.to_uppercase())
    }

    /// Check if a provider has an API key stored.
    fn has_api_key(&self, provider_id: &str) -> bool {
        let secret_key = Self::secret_key_for_provider(provider_id);
        self.secret_store
            .get_secret(&secret_key)
            .ok()
            .flatten()
            .map(|s| !s.is_empty())
            .unwrap_or(false)
    }

    /// Get the API key for a provider (internal use only).
    fn get_api_key(&self, provider_id: &str) -> Option<String> {
        let secret_key = Self::secret_key_for_provider(provider_id);
        self.secret_store
            .get_secret(&secret_key)
            .ok()
            .flatten()
            .filter(|s| !s.is_empty())
    }

    /// Check if provider requires an API key based on catalog.
    fn provider_requires_api_key(&self, provider_id: &str) -> bool {
        self.catalog
            .providers
            .get(provider_id)
            .map(|p| {
                // Local providers (like Ollama) don't require API keys
                // API providers require keys
                p.provider_type == "api"
            })
            .unwrap_or(true) // Default to requiring API key for unknown providers
    }

    /// Get the custom URL for a provider from user settings.
    fn get_custom_url(&self, provider_id: &str) -> Option<String> {
        let user_settings = self.load_user_settings();
        user_settings
            .providers
            .get(provider_id)
            .and_then(|s| s.custom_url.clone())
            .or_else(|| {
                // Fall back to catalog default URL
                self.catalog
                    .providers
                    .get(provider_id)
                    .and_then(|p| p.default_config.url.clone())
            })
    }

    /// Check if a provider supports dynamic model listing via API.
    fn provider_supports_model_listing(provider_id: &str) -> bool {
        // Anthropic doesn't have a model listing API
        provider_id != "anthropic"
    }

    /// Apply capability overrides to base capabilities.
    fn apply_capability_overrides(
        base: &ModelCapabilities,
        overrides: &ModelCapabilityOverrides,
    ) -> ModelCapabilities {
        ModelCapabilities {
            tools: overrides.tools.unwrap_or(base.tools),
            thinking: base.thinking, // No override for thinking (yet)
            vision: overrides.vision.unwrap_or(base.vision),
            streaming: overrides.streaming.unwrap_or(base.streaming),
        }
    }
}

#[async_trait]
impl AiProviderServiceTrait for AiProviderService {
    fn get_ai_providers(&self) -> Result<AiProvidersResponse> {
        let user_settings = self.load_user_settings();

        let mut providers: Vec<MergedProvider> = self
            .catalog
            .providers
            .iter()
            .map(|(id, catalog_provider)| {
                // Get user settings for this provider, or use defaults
                let user = user_settings
                    .providers
                    .get(id)
                    .cloned()
                    .unwrap_or_else(|| {
                        // Use catalog defaults for providers not in user settings
                        ProviderUserSettings {
                            enabled: catalog_provider.default_config.enabled,
                            favorite: catalog_provider.default_config.enabled, // Recommended = favorite
                            selected_model: None,
                            custom_url: catalog_provider.default_config.url.clone(),
                            priority: 100, // Default priority
                            ..Default::default()
                        }
                    });

                // Convert models map to sorted vec, applying capability overrides
                let mut models: Vec<MergedModel> = catalog_provider
                    .models
                    .iter()
                    .map(|(model_id, model)| {
                        let has_overrides = user.model_capability_overrides.contains_key(model_id);
                        let capabilities = if let Some(overrides) =
                            user.model_capability_overrides.get(model_id)
                        {
                            Self::apply_capability_overrides(&model.capabilities, overrides)
                        } else {
                            model.capabilities.clone()
                        };
                        MergedModel {
                            id: model_id.clone(),
                            name: None, // Catalog models don't have separate display names
                            capabilities,
                            is_catalog: true,
                            is_favorite: user.favorite_models.contains(model_id),
                            has_capability_overrides: has_overrides,
                        }
                    })
                    .collect();
                // Sort models alphabetically for consistent ordering
                models.sort_by(|a, b| a.id.cmp(&b.id));

                // Check if provider supports dynamic model listing
                let supports_model_listing = Self::provider_supports_model_listing(id);

                MergedProvider {
                    id: id.clone(),
                    name: catalog_provider.name.clone(),
                    provider_type: catalog_provider.provider_type.clone(),
                    icon: catalog_provider.icon.clone(),
                    description: catalog_provider.description.clone(),
                    env_key: catalog_provider.env_key.clone(),
                    connection_fields: catalog_provider.connection_fields.clone(),
                    models,
                    default_model: catalog_provider.default_model.clone(),
                    documentation_url: catalog_provider.documentation_url.clone(),
                    enabled: user.enabled,
                    favorite: user.favorite,
                    selected_model: user.selected_model,
                    custom_url: user.custom_url,
                    priority: user.priority,
                    favorite_models: user.favorite_models.clone(),
                    model_capability_overrides: user.model_capability_overrides.clone(),
                    has_api_key: self.has_api_key(id),
                    is_default: user_settings.default_provider.as_ref() == Some(id),
                    supports_model_listing,
                }
            })
            .collect();

        // Sort by priority (lower first), then by provider ID for stable tiebreaker
        providers.sort_by(|a, b| {
            a.priority
                .cmp(&b.priority)
                .then_with(|| a.id.cmp(&b.id))
        });

        Ok(AiProvidersResponse {
            providers,
            capabilities: self.catalog.capabilities.clone(),
            default_provider: user_settings.default_provider,
        })
    }

    async fn update_provider_settings(&self, request: UpdateProviderSettingsRequest) -> Result<()> {
        // Verify provider exists in catalog
        if !self.catalog.providers.contains_key(&request.provider_id) {
            return Err(crate::errors::Error::Validation(ValidationError::InvalidInput(
                format!("Unknown provider: {}", request.provider_id),
            )));
        }

        let mut settings = self.load_user_settings();

        // Get or create provider settings
        let provider_settings = settings
            .providers
            .entry(request.provider_id.clone())
            .or_default();

        // Apply updates
        if let Some(enabled) = request.enabled {
            provider_settings.enabled = enabled;
        }
        if let Some(favorite) = request.favorite {
            provider_settings.favorite = favorite;
        }
        if let Some(model) = request.selected_model {
            provider_settings.selected_model = Some(model);
        }
        if let Some(url) = request.custom_url {
            provider_settings.custom_url = Some(url);
        }
        if let Some(priority) = request.priority {
            provider_settings.priority = priority;
        }

        // Handle capability override update for a specific model
        if let Some(override_update) = request.model_capability_override {
            if let Some(overrides) = override_update.overrides {
                // Set or update overrides for this model
                provider_settings
                    .model_capability_overrides
                    .insert(override_update.model_id, overrides);
            } else {
                // Remove overrides for this model (None means clear)
                provider_settings
                    .model_capability_overrides
                    .remove(&override_update.model_id);
            }
        }

        // Handle favorite models update (replaces entire list)
        if let Some(favorite_models) = request.favorite_models {
            provider_settings.favorite_models = favorite_models;
        }

        // Update schema version
        settings.schema_version = AI_PROVIDER_SETTINGS_SCHEMA_VERSION;

        self.save_user_settings(&settings).await
    }

    async fn set_default_provider(&self, request: SetDefaultProviderRequest) -> Result<()> {
        // Verify provider exists if setting a default
        if let Some(ref provider_id) = request.provider_id {
            if !self.catalog.providers.contains_key(provider_id) {
                return Err(crate::errors::Error::Validation(ValidationError::InvalidInput(
                    format!("Unknown provider: {}", provider_id),
                )));
            }
        }

        let mut settings = self.load_user_settings();
        settings.default_provider = request.provider_id;
        settings.schema_version = AI_PROVIDER_SETTINGS_SCHEMA_VERSION;

        self.save_user_settings(&settings).await
    }

    fn get_provider_config(&self, provider_id: &str) -> std::result::Result<ProviderConfig, AiError> {
        // Verify provider exists in catalog
        if !self.catalog.providers.contains_key(provider_id) {
            return Err(AiError::UnknownProvider {
                provider_id: provider_id.to_string(),
            });
        }

        let requires_api_key = self.provider_requires_api_key(provider_id);
        let api_key = self.get_api_key(provider_id);
        let base_url = self.get_custom_url(provider_id);

        // Check if API key is required but missing
        if requires_api_key && api_key.is_none() {
            return Err(AiError::MissingApiKey {
                provider_id: provider_id.to_string(),
            });
        }

        Ok(ProviderConfig {
            provider_id: provider_id.to_string(),
            api_key,
            base_url,
            requires_api_key,
        })
    }

    async fn list_models(
        &self,
        provider_id: &str,
    ) -> std::result::Result<ListModelsResponse, AiError> {
        // Get provider config (validates provider exists and has API key if needed)
        let config = self.get_provider_config(provider_id)?;

        // Get catalog provider for default base URL and to check if listing is supported
        let catalog_provider = self.catalog.providers.get(provider_id).ok_or_else(|| {
            AiError::UnknownProvider {
                provider_id: provider_id.to_string(),
            }
        })?;

        // Providers that don't support model listing return catalog models
        // Anthropic doesn't have a model listing API
        if provider_id == "anthropic" {
            let models = catalog_provider
                .models
                .keys()
                .map(|id| FetchedModel {
                    id: id.clone(),
                    name: None,
                })
                .collect();
            return Ok(ListModelsResponse {
                models,
                supports_listing: false,
            });
        }

        // Build the model list URL based on provider
        let base_url = config.base_url.as_deref().unwrap_or_else(|| {
            match provider_id {
                "openai" => "https://api.openai.com",
                "groq" => "https://api.groq.com/openai",
                "openrouter" => "https://openrouter.ai/api",
                "google" => "https://generativelanguage.googleapis.com",
                "ollama" => "http://localhost:11434",
                _ => "https://api.openai.com",
            }
        });

        let models_url = match provider_id {
            "ollama" => format!("{}/api/tags", base_url.trim_end_matches('/')),
            "google" => format!("{}/v1beta/models", base_url.trim_end_matches('/')),
            // OpenAI-compatible: OpenAI, Groq, OpenRouter
            _ => format!("{}/v1/models", base_url.trim_end_matches('/')),
        };

        // Build HTTP client and request
        let client = reqwest::Client::new();
        let mut request = client.get(&models_url);

        // Add authorization header based on provider
        if let Some(ref api_key) = config.api_key {
            request = match provider_id {
                "google" => request.query(&[("key", api_key.as_str())]),
                _ => request.header("Authorization", format!("Bearer {}", api_key)),
            };
        }

        // Make the request
        let response = request.send().await.map_err(|e| AiError::ProviderError {
            message: format!("Failed to connect to provider: {}", e),
        })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AiError::ProviderError {
                message: format!("Provider returned error {}: {}", status, body),
            });
        }

        // Parse response based on provider format
        let models = match provider_id {
            "ollama" => {
                // Ollama format: { "models": [{ "name": "llama3.2", ... }] }
                #[derive(serde::Deserialize)]
                struct OllamaResponse {
                    models: Vec<OllamaModel>,
                }
                #[derive(serde::Deserialize)]
                struct OllamaModel {
                    name: String,
                }

                let resp: OllamaResponse =
                    response.json().await.map_err(|e| AiError::ProviderError {
                        message: format!("Failed to parse Ollama response: {}", e),
                    })?;

                resp.models
                    .into_iter()
                    .map(|m| FetchedModel {
                        id: m.name.clone(),
                        name: Some(m.name),
                    })
                    .collect()
            }
            "google" => {
                // Google format: { "models": [{ "name": "models/gemini-pro", ... }] }
                #[derive(serde::Deserialize)]
                struct GoogleResponse {
                    models: Vec<GoogleModel>,
                }
                #[derive(serde::Deserialize)]
                #[serde(rename_all = "camelCase")]
                struct GoogleModel {
                    name: String,
                    display_name: Option<String>,
                }

                let resp: GoogleResponse =
                    response.json().await.map_err(|e| AiError::ProviderError {
                        message: format!("Failed to parse Google response: {}", e),
                    })?;

                resp.models
                    .into_iter()
                    .filter(|m| m.name.contains("gemini"))
                    .map(|m| {
                        // Google returns "models/gemini-pro", we want just "gemini-pro"
                        let id = m.name.strip_prefix("models/").unwrap_or(&m.name).to_string();
                        FetchedModel {
                            id,
                            name: m.display_name,
                        }
                    })
                    .collect()
            }
            // OpenAI-compatible format: OpenAI, Groq, OpenRouter
            _ => {
                // OpenAI format: { "data": [{ "id": "gpt-4", ... }] }
                #[derive(serde::Deserialize)]
                struct OpenAIResponse {
                    data: Vec<OpenAIModel>,
                }
                #[derive(serde::Deserialize)]
                struct OpenAIModel {
                    id: String,
                }

                let resp: OpenAIResponse =
                    response.json().await.map_err(|e| AiError::ProviderError {
                        message: format!("Failed to parse provider response: {}", e),
                    })?;

                resp.data
                    .into_iter()
                    .map(|m| FetchedModel {
                        id: m.id.clone(),
                        name: Some(m.id),
                    })
                    .collect()
            }
        };

        Ok(ListModelsResponse {
            models,
            supports_listing: true,
        })
    }
}
