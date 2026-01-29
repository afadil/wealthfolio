//! Versioned prompt templates for AI assistant.
//!
//! Provides system prompts, portfolio-domain guidance, tool usage rules,
//! and advice guardrails with versioning support.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Current schema version for prompt templates.
pub const PROMPT_TEMPLATE_SCHEMA_VERSION: u32 = 1;

// ============================================================================
// Template Knob Types
// ============================================================================

/// Configuration knob type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum KnobType {
    String,
    Enum,
    Boolean,
    Number,
}

/// A configuration knob that can be derived from context or set explicitly.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateKnob {
    /// Human-readable description of the knob.
    pub description: String,
    /// The type of value this knob accepts.
    #[serde(rename = "type")]
    pub knob_type: KnobType,
    /// Available options for enum-type knobs.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<String>>,
    /// Default value as a string.
    pub default: String,
    /// How the value is derived (e.g., "context", "user", "system").
    #[serde(default = "default_derived_from")]
    pub derived_from: String,
}

fn default_derived_from() -> String {
    "context".to_string()
}

// ============================================================================
// Template Section Types
// ============================================================================

/// A section of the prompt template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSection {
    /// The content of this section.
    pub content: String,
}

/// All sections that make up a complete prompt template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSections {
    /// Core system prompt defining the assistant's role.
    pub system: TemplateSection,
    /// Portfolio-specific domain knowledge and data access guidance.
    pub portfolio_domain: TemplateSection,
    /// Rules for how and when to use tools.
    pub tool_usage: TemplateSection,
    /// CSV import instructions (critical for file attachments).
    #[serde(default)]
    pub csv_import: Option<TemplateSection>,
    /// Guardrails for advice, disclaimers, and safety.
    pub advice_guardrails: TemplateSection,
}

// ============================================================================
// Prompt Template Types
// ============================================================================

/// Level of detail for responses.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum DetailLevel {
    Brief,
    #[default]
    Standard,
    Detailed,
}

impl DetailLevel {
    /// Parse from string, defaulting to Standard if unknown.
    pub fn from_str_or_default(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "brief" => Self::Brief,
            "detailed" => Self::Detailed,
            _ => Self::Standard,
        }
    }
}

/// A versioned prompt template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplate {
    /// Unique identifier for this template.
    pub id: String,
    /// Semantic version string (e.g., "1.0.0").
    pub version: String,
    /// Human-readable name.
    pub name: String,
    /// Description of the template's purpose.
    pub description: String,
    /// Whether this is the default template.
    #[serde(default)]
    pub is_default: bool,
    /// The prompt sections.
    pub sections: TemplateSections,
    /// Configuration knobs for customization.
    #[serde(default)]
    pub knobs: HashMap<String, TemplateKnob>,
    /// Instructions for each detail level.
    #[serde(default)]
    pub detail_level_instructions: HashMap<String, String>,
}

impl PromptTemplate {
    /// Build the complete system prompt for a chat run.
    ///
    /// Combines all sections and applies knob values (locale, detail level).
    pub fn build_system_prompt(&self, locale: Option<&str>, detail_level: DetailLevel) -> String {
        let mut parts = Vec::new();

        // Core system prompt
        parts.push(self.sections.system.content.clone());

        // Portfolio domain knowledge
        parts.push(self.sections.portfolio_domain.content.clone());

        // Tool usage rules
        parts.push(self.sections.tool_usage.content.clone());

        // CSV import instructions (important for smaller models)
        if let Some(csv_import) = &self.sections.csv_import {
            parts.push(csv_import.content.clone());
        }

        // Advice guardrails
        parts.push(self.sections.advice_guardrails.content.clone());

        // Detail level instruction
        let detail_key = match detail_level {
            DetailLevel::Brief => "brief",
            DetailLevel::Standard => "standard",
            DetailLevel::Detailed => "detailed",
        };
        if let Some(instruction) = self.detail_level_instructions.get(detail_key) {
            parts.push(format!("\nRESPONSE STYLE:\n{}", instruction));
        }

        // Locale instruction (if non-default)
        if let Some(loc) = locale {
            if !loc.is_empty() && loc != "en-US" {
                parts.push(format!(
                    "\nLOCALE:\nRespond in the language and formatting conventions for: {}",
                    loc
                ));
            }
        }

        parts.join("\n\n")
    }

    /// Get the template ID and version as a combined key.
    pub fn id_version_key(&self) -> String {
        format!("{}@{}", self.id, self.version)
    }
}

// ============================================================================
// Template Catalog Types
// ============================================================================

/// Metadata about the template catalog.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateCatalogMetadata {
    /// Last update date (ISO 8601).
    pub last_updated: String,
    /// Maintainer identifier.
    pub maintainer: String,
}

/// The complete template catalog loaded from JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplateCatalog {
    /// Schema version for migration support.
    pub schema_version: u32,
    /// Templates keyed by ID.
    pub templates: HashMap<String, PromptTemplate>,
    /// Catalog metadata.
    pub metadata: TemplateCatalogMetadata,
}

impl PromptTemplateCatalog {
    /// Load catalog from JSON string.
    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    /// Get a template by ID.
    pub fn get_template(&self, id: &str) -> Option<&PromptTemplate> {
        self.templates.get(id)
    }

    /// Get a template by ID and version.
    pub fn get_template_by_version(&self, id: &str, version: &str) -> Option<&PromptTemplate> {
        self.templates.get(id).filter(|t| t.version == version)
    }

    /// Get the default template.
    pub fn get_default_template(&self) -> Option<&PromptTemplate> {
        self.templates.values().find(|t| t.is_default)
    }

    /// List all template IDs with their versions.
    pub fn list_templates(&self) -> Vec<(&str, &str)> {
        self.templates
            .values()
            .map(|t| (t.id.as_str(), t.version.as_str()))
            .collect()
    }
}

// ============================================================================
// Run Configuration Types
// ============================================================================

/// Configuration for a single chat run, including selected template.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRunConfig {
    /// Template ID to use.
    pub template_id: String,
    /// Template version to use.
    pub template_version: String,
    /// Locale for response formatting (derived from context in v1).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    /// Detail level for responses (derived from context in v1).
    #[serde(default)]
    pub detail_level: DetailLevel,
}

impl Default for ChatRunConfig {
    fn default() -> Self {
        Self {
            template_id: "wealthfolio-assistant-v1".to_string(),
            template_version: "1.0.0".to_string(),
            locale: None,
            detail_level: DetailLevel::Standard,
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_TEMPLATE_JSON: &str = r#"{
        "schemaVersion": 1,
        "templates": {
            "test-template": {
                "id": "test-template",
                "version": "1.0.0",
                "name": "Test Template",
                "description": "Test description",
                "isDefault": true,
                "sections": {
                    "system": { "content": "System prompt" },
                    "portfolioDomain": { "content": "Portfolio domain" },
                    "toolUsage": { "content": "Tool usage" },
                    "adviceGuardrails": { "content": "Guardrails" }
                },
                "knobs": {
                    "locale": {
                        "description": "Locale",
                        "type": "string",
                        "default": "en-US",
                        "derivedFrom": "context"
                    }
                },
                "detailLevelInstructions": {
                    "brief": "Be brief",
                    "standard": "Be standard",
                    "detailed": "Be detailed"
                }
            }
        },
        "metadata": {
            "lastUpdated": "2026-01-15",
            "maintainer": "test"
        }
    }"#;

    #[test]
    fn test_parse_catalog() {
        let catalog = PromptTemplateCatalog::from_json(TEST_TEMPLATE_JSON).unwrap();
        assert_eq!(catalog.schema_version, 1);
        assert!(catalog.templates.contains_key("test-template"));
    }

    #[test]
    fn test_get_default_template() {
        let catalog = PromptTemplateCatalog::from_json(TEST_TEMPLATE_JSON).unwrap();
        let template = catalog.get_default_template().unwrap();
        assert_eq!(template.id, "test-template");
        assert!(template.is_default);
    }

    #[test]
    fn test_build_system_prompt() {
        let catalog = PromptTemplateCatalog::from_json(TEST_TEMPLATE_JSON).unwrap();
        let template = catalog.get_template("test-template").unwrap();

        let prompt = template.build_system_prompt(None, DetailLevel::Standard);
        assert!(prompt.contains("System prompt"));
        assert!(prompt.contains("Portfolio domain"));
        assert!(prompt.contains("Tool usage"));
        assert!(prompt.contains("Guardrails"));
        assert!(prompt.contains("Be standard"));
    }

    #[test]
    fn test_build_system_prompt_with_locale() {
        let catalog = PromptTemplateCatalog::from_json(TEST_TEMPLATE_JSON).unwrap();
        let template = catalog.get_template("test-template").unwrap();

        let prompt = template.build_system_prompt(Some("es-ES"), DetailLevel::Brief);
        assert!(prompt.contains("Be brief"));
        assert!(prompt.contains("es-ES"));
    }

    #[test]
    fn test_detail_level_from_str() {
        assert_eq!(
            DetailLevel::from_str_or_default("brief"),
            DetailLevel::Brief
        );
        assert_eq!(
            DetailLevel::from_str_or_default("DETAILED"),
            DetailLevel::Detailed
        );
        assert_eq!(
            DetailLevel::from_str_or_default("unknown"),
            DetailLevel::Standard
        );
    }
}
