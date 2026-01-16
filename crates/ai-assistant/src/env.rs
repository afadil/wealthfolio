//! Environment abstraction for secrets, config, and time.
//!
//! This module provides an abstraction layer that allows Tauri and Axum
//! to supply runtime-specific dependencies (secret store, config, time)
//! without the AI crate depending on specific implementations.

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use std::sync::Arc;

use wealthfolio_core::ai::ProviderConfig;

/// Environment abstraction for runtime dependencies.
///
/// This trait allows the AI assistant to access secrets, configuration,
/// and time without knowing the specific runtime (Tauri vs Axum).
#[async_trait]
pub trait AiEnvironment: Send + Sync {
    /// Get provider configuration including API key from secret store.
    /// The AI assistant never receives secrets from the frontend.
    ///
    /// # Arguments
    /// * `provider_id` - The provider identifier (e.g., "openai", "anthropic")
    ///
    /// # Returns
    /// * `Ok(ProviderConfig)` - Configuration with API key attached
    /// * `Err` - If provider not found or API key required but missing
    fn get_provider_config(&self, provider_id: &str) -> Result<ProviderConfig, EnvError>;

    /// Get the current time.
    /// Abstracted for testing purposes.
    fn now(&self) -> DateTime<Utc>;

    /// Get the user's base currency (e.g., "USD", "EUR").
    fn get_base_currency(&self) -> String;

    /// Get a locale hint for response formatting (e.g., "en-US", "es-ES").
    fn get_locale(&self) -> Option<String>;

    /// Get the default provider ID from user settings.
    fn get_default_provider(&self) -> Option<String>;

    /// Get the default model ID for a provider.
    fn get_default_model(&self, provider_id: &str) -> Option<String>;

    /// Get the title generation model ID for a provider.
    ///
    /// This is a fast model used for auto-generating thread titles.
    /// Falls back to the default model if not configured.
    fn get_title_model(&self, provider_id: &str) -> Option<String>;
}

/// Environment errors.
#[derive(Debug, Clone, thiserror::Error)]
pub enum EnvError {
    /// Provider not found in catalog.
    #[error("Unknown provider: {0}")]
    UnknownProvider(String),

    /// API key required but not configured.
    #[error("API key required for provider: {0}")]
    MissingApiKey(String),

    /// Configuration error.
    #[error("Configuration error: {0}")]
    ConfigError(String),
}

/// Runtime environment implementation.
///
/// This struct is constructed by Tauri/Axum with the actual service
/// dependencies and passed to the AI assistant service.
pub struct RuntimeEnvironment {
    /// AI provider service for config and secrets.
    provider_service: Arc<dyn wealthfolio_core::ai::AiProviderServiceTrait>,
    /// Settings for base currency and locale.
    base_currency: String,
    locale: Option<String>,
}

impl RuntimeEnvironment {
    /// Create a new runtime environment.
    pub fn new(
        provider_service: Arc<dyn wealthfolio_core::ai::AiProviderServiceTrait>,
        base_currency: String,
        locale: Option<String>,
    ) -> Self {
        Self {
            provider_service,
            base_currency,
            locale,
        }
    }
}

#[async_trait]
impl AiEnvironment for RuntimeEnvironment {
    fn get_provider_config(&self, provider_id: &str) -> Result<ProviderConfig, EnvError> {
        self.provider_service
            .get_provider_config(provider_id)
            .map_err(|e| match e {
                wealthfolio_core::ai::AiError::UnknownProvider { provider_id } => {
                    EnvError::UnknownProvider(provider_id)
                }
                wealthfolio_core::ai::AiError::MissingApiKey { provider_id } => {
                    EnvError::MissingApiKey(provider_id)
                }
                _ => EnvError::ConfigError(e.to_string()),
            })
    }

    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }

    fn get_base_currency(&self) -> String {
        self.base_currency.clone()
    }

    fn get_locale(&self) -> Option<String> {
        self.locale.clone()
    }

    fn get_default_provider(&self) -> Option<String> {
        self.provider_service
            .get_ai_providers()
            .ok()
            .and_then(|r| r.default_provider)
    }

    fn get_default_model(&self, provider_id: &str) -> Option<String> {
        self.provider_service
            .get_ai_providers()
            .ok()
            .and_then(|r| {
                r.providers
                    .iter()
                    .find(|p| p.id == provider_id)
                    .map(|p| {
                        // Use selected model if set, otherwise use default
                        p.selected_model
                            .clone()
                            .unwrap_or_else(|| p.default_model.clone())
                    })
            })
    }

    fn get_title_model(&self, provider_id: &str) -> Option<String> {
        self.provider_service.get_title_model(provider_id)
    }
}

/// Test environment for unit testing without network access.
#[cfg(test)]
pub mod test_env {
    use super::*;
    use std::collections::HashMap;

    /// Mock environment for testing.
    pub struct MockEnvironment {
        pub configs: HashMap<String, ProviderConfig>,
        pub base_currency: String,
        pub locale: Option<String>,
        pub default_provider: Option<String>,
        pub default_models: HashMap<String, String>,
        pub title_models: HashMap<String, String>,
        pub fixed_time: Option<DateTime<Utc>>,
    }

    impl MockEnvironment {
        pub fn new() -> Self {
            Self {
                configs: HashMap::new(),
                base_currency: "USD".to_string(),
                locale: Some("en-US".to_string()),
                default_provider: None,
                default_models: HashMap::new(),
                title_models: HashMap::new(),
                fixed_time: None,
            }
        }

        pub fn with_provider(mut self, id: &str, api_key: Option<&str>) -> Self {
            self.configs.insert(
                id.to_string(),
                ProviderConfig {
                    provider_id: id.to_string(),
                    api_key: api_key.map(|s| s.to_string()),
                    base_url: None,
                    requires_api_key: api_key.is_some(),
                },
            );
            self
        }

        pub fn with_ollama(mut self, base_url: &str) -> Self {
            self.configs.insert(
                "ollama".to_string(),
                ProviderConfig {
                    provider_id: "ollama".to_string(),
                    api_key: None,
                    base_url: Some(base_url.to_string()),
                    requires_api_key: false,
                },
            );
            self
        }
    }

    impl Default for MockEnvironment {
        fn default() -> Self {
            Self::new()
        }
    }

    #[async_trait]
    impl AiEnvironment for MockEnvironment {
        fn get_provider_config(&self, provider_id: &str) -> Result<ProviderConfig, EnvError> {
            self.configs
                .get(provider_id)
                .cloned()
                .ok_or_else(|| EnvError::UnknownProvider(provider_id.to_string()))
        }

        fn now(&self) -> DateTime<Utc> {
            self.fixed_time.unwrap_or_else(Utc::now)
        }

        fn get_base_currency(&self) -> String {
            self.base_currency.clone()
        }

        fn get_locale(&self) -> Option<String> {
            self.locale.clone()
        }

        fn get_default_provider(&self) -> Option<String> {
            self.default_provider.clone()
        }

        fn get_default_model(&self, provider_id: &str) -> Option<String> {
            self.default_models.get(provider_id).cloned()
        }

        fn get_title_model(&self, provider_id: &str) -> Option<String> {
            self.title_models
                .get(provider_id)
                .cloned()
                .or_else(|| self.default_models.get(provider_id).cloned())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_env::MockEnvironment;
    use super::*;

    #[test]
    fn test_mock_environment() {
        let env = MockEnvironment::new()
            .with_provider("openai", Some("sk-test"))
            .with_ollama("http://localhost:11434");

        let openai_config = env.get_provider_config("openai").unwrap();
        assert_eq!(openai_config.api_key, Some("sk-test".to_string()));

        let ollama_config = env.get_provider_config("ollama").unwrap();
        assert!(ollama_config.api_key.is_none());
        assert_eq!(
            ollama_config.base_url,
            Some("http://localhost:11434".to_string())
        );

        let missing = env.get_provider_config("anthropic");
        assert!(matches!(missing, Err(EnvError::UnknownProvider(_))));
    }
}
