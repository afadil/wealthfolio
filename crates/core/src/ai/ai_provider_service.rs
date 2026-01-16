//! AI provider service - merges catalog with user settings.

use async_trait::async_trait;
use std::sync::Arc;

use crate::errors::{Result, ValidationError};
use crate::secrets::SecretStore;
use crate::settings::SettingsRepositoryTrait;

use super::{
    AiProviderCatalog, AiProviderSettings, AiProvidersResponse, MergedModel, MergedProvider,
    ProviderUserSettings, SetDefaultProviderRequest, UpdateProviderSettingsRequest,
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

    /// Check if a provider has an API key stored.
    fn has_api_key(&self, env_key: &str) -> bool {
        self.secret_store
            .get_secret(env_key)
            .ok()
            .flatten()
            .map(|s| !s.is_empty())
            .unwrap_or(false)
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
                        }
                    });

                // Convert models map to sorted vec
                let mut models: Vec<MergedModel> = catalog_provider
                    .models
                    .iter()
                    .map(|(model_id, model)| MergedModel {
                        id: model_id.clone(),
                        capabilities: model.capabilities.clone(),
                    })
                    .collect();
                // Sort models alphabetically for consistent ordering
                models.sort_by(|a, b| a.id.cmp(&b.id));

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
                    has_api_key: self.has_api_key(&catalog_provider.env_key),
                    is_default: user_settings.default_provider.as_ref() == Some(id),
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
}
