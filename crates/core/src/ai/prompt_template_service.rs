//! Prompt template service - loads and selects versioned prompt templates.

use async_trait::async_trait;
use log::{info, warn};

use crate::errors::Result;

use super::{
    ChatRunConfig, DetailLevel, PromptTemplate, PromptTemplateCatalog,
    PROMPT_TEMPLATE_SCHEMA_VERSION,
};

/// Service trait for prompt template operations.
#[async_trait]
pub trait PromptTemplateServiceTrait: Send + Sync {
    /// Get all available prompt templates.
    fn list_templates(&self) -> Vec<PromptTemplateInfo>;

    /// Get a specific template by ID.
    fn get_template(&self, template_id: &str) -> Option<&PromptTemplate>;

    /// Get a template by ID and version.
    fn get_template_by_version(&self, template_id: &str, version: &str)
        -> Option<&PromptTemplate>;

    /// Get the default template.
    fn get_default_template(&self) -> Option<&PromptTemplate>;

    /// Build the system prompt for a chat run configuration.
    fn build_system_prompt(&self, config: &ChatRunConfig) -> Result<String>;
}

/// Summary info about a template.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplateInfo {
    pub id: String,
    pub version: String,
    pub name: String,
    pub description: String,
    pub is_default: bool,
}

/// Prompt template service implementation.
pub struct PromptTemplateService {
    catalog: PromptTemplateCatalog,
}

impl PromptTemplateService {
    /// Create a new prompt template service.
    pub fn new(catalog_json: &str) -> Result<Self> {
        let catalog: PromptTemplateCatalog = serde_json::from_str(catalog_json)?;

        // Validate schema version
        if catalog.schema_version > PROMPT_TEMPLATE_SCHEMA_VERSION {
            warn!(
                "Prompt template catalog has newer schema version ({}) than supported ({})",
                catalog.schema_version, PROMPT_TEMPLATE_SCHEMA_VERSION
            );
        }

        Ok(Self { catalog })
    }

    /// Get the catalog reference.
    pub fn catalog(&self) -> &PromptTemplateCatalog {
        &self.catalog
    }
}

#[async_trait]
impl PromptTemplateServiceTrait for PromptTemplateService {
    fn list_templates(&self) -> Vec<PromptTemplateInfo> {
        self.catalog
            .templates
            .values()
            .map(|t| PromptTemplateInfo {
                id: t.id.clone(),
                version: t.version.clone(),
                name: t.name.clone(),
                description: t.description.clone(),
                is_default: t.is_default,
            })
            .collect()
    }

    fn get_template(&self, template_id: &str) -> Option<&PromptTemplate> {
        self.catalog.get_template(template_id)
    }

    fn get_template_by_version(
        &self,
        template_id: &str,
        version: &str,
    ) -> Option<&PromptTemplate> {
        self.catalog.get_template_by_version(template_id, version)
    }

    fn get_default_template(&self) -> Option<&PromptTemplate> {
        self.catalog.get_default_template()
    }

    fn build_system_prompt(&self, config: &ChatRunConfig) -> Result<String> {
        // Try to get template by ID and version first
        let template = self
            .get_template_by_version(&config.template_id, &config.template_version)
            .or_else(|| self.get_template(&config.template_id))
            .or_else(|| self.get_default_template())
            .ok_or_else(|| {
                crate::errors::Error::Validation(crate::errors::ValidationError::InvalidInput(
                    format!(
                        "Template not found: {}@{}",
                        config.template_id, config.template_version
                    ),
                ))
            })?;

        // Log if we fell back to a different version
        if template.version != config.template_version {
            info!(
                "Using template {}@{} instead of requested {}@{}",
                template.id, template.version, config.template_id, config.template_version
            );
        }

        Ok(template.build_system_prompt(config.locale.as_deref(), config.detail_level))
    }
}

/// Build a default ChatRunConfig from context.
///
/// In v1, locale and detail_level are derived from context rather than
/// being user-configurable per thread.
pub fn build_run_config_from_context(
    locale: Option<&str>,
    detail_level: Option<&str>,
) -> ChatRunConfig {
    ChatRunConfig {
        template_id: "wealthfolio-assistant-v1".to_string(),
        template_version: "1.0.0".to_string(),
        locale: locale.map(|s| s.to_string()),
        detail_level: detail_level
            .map(|s| DetailLevel::from_str_or_default(s))
            .unwrap_or_default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_CATALOG_JSON: &str = r#"{
        "schemaVersion": 1,
        "templates": {
            "wealthfolio-assistant-v1": {
                "id": "wealthfolio-assistant-v1",
                "version": "1.0.0",
                "name": "Wealthfolio Assistant",
                "description": "Default assistant",
                "isDefault": true,
                "sections": {
                    "system": { "content": "You are Wealthfolio Assistant." },
                    "portfolioDomain": { "content": "Portfolio data access." },
                    "toolUsage": { "content": "Use tools wisely." },
                    "adviceGuardrails": { "content": "Not financial advice." }
                },
                "knobs": {},
                "detailLevelInstructions": {
                    "brief": "Be brief.",
                    "standard": "Be balanced.",
                    "detailed": "Be thorough."
                }
            }
        },
        "metadata": {
            "lastUpdated": "2026-01-15",
            "maintainer": "test"
        }
    }"#;

    #[test]
    fn test_service_creation() {
        let service = PromptTemplateService::new(TEST_CATALOG_JSON).unwrap();
        assert_eq!(service.list_templates().len(), 1);
    }

    #[test]
    fn test_get_default_template() {
        let service = PromptTemplateService::new(TEST_CATALOG_JSON).unwrap();
        let template = service.get_default_template().unwrap();
        assert_eq!(template.id, "wealthfolio-assistant-v1");
    }

    #[test]
    fn test_build_system_prompt() {
        let service = PromptTemplateService::new(TEST_CATALOG_JSON).unwrap();
        let config = ChatRunConfig::default();
        let prompt = service.build_system_prompt(&config).unwrap();

        assert!(prompt.contains("Wealthfolio Assistant"));
        assert!(prompt.contains("Portfolio data access"));
        assert!(prompt.contains("Use tools wisely"));
        assert!(prompt.contains("Not financial advice"));
    }

    #[test]
    fn test_build_run_config_from_context() {
        let config = build_run_config_from_context(Some("es-ES"), Some("detailed"));
        assert_eq!(config.locale, Some("es-ES".to_string()));
        assert_eq!(config.detail_level, DetailLevel::Detailed);
    }

    #[test]
    fn test_fallback_to_default_template() {
        let service = PromptTemplateService::new(TEST_CATALOG_JSON).unwrap();
        let config = ChatRunConfig {
            template_id: "nonexistent".to_string(),
            template_version: "0.0.0".to_string(),
            ..Default::default()
        };

        // Should fall back to default template
        let prompt = service.build_system_prompt(&config).unwrap();
        assert!(prompt.contains("Wealthfolio Assistant"));
    }
}
