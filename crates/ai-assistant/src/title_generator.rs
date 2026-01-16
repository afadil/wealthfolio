//! Title generation service for chat threads.
//!
//! Auto-generates short descriptive titles from user messages using a fast model.
//! Falls back to truncating the first user message if generation fails.

use async_trait::async_trait;
use log::{debug, warn};
use std::sync::Arc;

use crate::env::AiEnvironment;
use crate::providers::{CompletionConfig, ProviderAdapter, ProviderRegistry};
use crate::types::AiAssistantError;

// ============================================================================
// Title Generator Trait
// ============================================================================

/// Trait for generating thread titles.
#[async_trait]
pub trait TitleGeneratorTrait: Send + Sync {
    /// Generate a title from the first user message.
    ///
    /// Returns a short (3-8 word) descriptive title suitable for sidebar display.
    /// Falls back to truncating the message if LLM generation fails.
    async fn generate_title(&self, user_message: &str, provider_id: &str) -> String;
}

// ============================================================================
// Title Generator Implementation
// ============================================================================

/// Configuration for title generation.
pub struct TitleGeneratorConfig {
    /// Max characters for the truncated fallback title.
    pub fallback_max_chars: usize,
    /// Max tokens to generate for the title.
    pub max_tokens: u32,
    /// Temperature for title generation (lower = more focused).
    pub temperature: f32,
}

impl Default for TitleGeneratorConfig {
    fn default() -> Self {
        Self {
            fallback_max_chars: 50,
            max_tokens: 20,
            temperature: 0.3,
        }
    }
}

/// Title generator implementation using LLM providers.
pub struct TitleGenerator {
    env: Arc<dyn AiEnvironment>,
    provider_registry: Arc<ProviderRegistry>,
    config: TitleGeneratorConfig,
}

impl TitleGenerator {
    /// Create a new title generator.
    pub fn new(
        env: Arc<dyn AiEnvironment>,
        provider_registry: Arc<ProviderRegistry>,
        config: TitleGeneratorConfig,
    ) -> Self {
        Self {
            env,
            provider_registry,
            config,
        }
    }

    /// Get the title model for a provider.
    ///
    /// Uses titleModelId from provider config if available, otherwise falls back
    /// to the default model for that provider.
    fn get_title_model(&self, provider_id: &str) -> Option<String> {
        self.env.get_title_model(provider_id).or_else(|| {
            debug!(
                "No titleModelId for provider {}, falling back to default model",
                provider_id
            );
            self.env.get_default_model(provider_id)
        })
    }

    /// Get a provider adapter that can be used for title generation.
    fn get_provider(&self, provider_id: &str) -> Option<Arc<dyn ProviderAdapter>> {
        self.provider_registry.get(provider_id)
    }

    /// Generate a title using the LLM.
    async fn generate_with_llm(
        &self,
        user_message: &str,
        provider: Arc<dyn ProviderAdapter>,
        model_id: &str,
    ) -> Result<String, AiAssistantError> {
        let system_prompt = TITLE_GENERATION_PROMPT.to_string();

        let config = CompletionConfig {
            model_id: model_id.to_string(),
            system_prompt,
            messages: vec![crate::types::ChatMessage::user("temp", user_message)],
            tools: vec![], // No tools for title generation
            stream: false,
            max_tokens: Some(self.config.max_tokens),
            temperature: Some(self.config.temperature),
        };

        let result = provider.complete(config).await?;

        // Clean up the title (remove quotes, trim whitespace)
        let title = result
            .content
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .trim()
            .to_string();

        if title.is_empty() {
            return Err(AiAssistantError::Internal {
                message: "LLM returned empty title".to_string(),
            });
        }

        Ok(title)
    }

    /// Generate a fallback title by truncating the user message.
    fn generate_fallback(&self, user_message: &str) -> String {
        truncate_to_title(user_message, self.config.fallback_max_chars)
    }
}

#[async_trait]
impl TitleGeneratorTrait for TitleGenerator {
    async fn generate_title(&self, user_message: &str, provider_id: &str) -> String {
        // Try to get provider and model
        let provider = match self.get_provider(provider_id) {
            Some(p) => p,
            None => {
                debug!(
                    "Provider {} not available, using fallback title",
                    provider_id
                );
                return self.generate_fallback(user_message);
            }
        };

        let model_id = match self.get_title_model(provider_id) {
            Some(m) => m,
            None => {
                debug!(
                    "No title model available for provider {}, using fallback",
                    provider_id
                );
                return self.generate_fallback(user_message);
            }
        };

        debug!(
            "Generating title with provider {} model {}",
            provider_id, model_id
        );

        // Try LLM generation, fall back to truncation on failure
        match self.generate_with_llm(user_message, provider, &model_id).await {
            Ok(title) => {
                debug!("Generated title: {}", title);
                title
            }
            Err(e) => {
                warn!("Title generation failed, using fallback: {}", e);
                self.generate_fallback(user_message)
            }
        }
    }
}

// ============================================================================
// Prompt Template
// ============================================================================

const TITLE_GENERATION_PROMPT: &str = r#"Generate a short, descriptive title (3-8 words) for a chat conversation based on the user's first message. The title should:
- Be concise and capture the main topic
- Not include quotes or punctuation at the end
- Not start with "Title:" or similar prefixes
- Be suitable for display in a sidebar

Respond with only the title, nothing else."#;

// ============================================================================
// Utility Functions
// ============================================================================

/// Truncate a string to create a title, respecting word boundaries.
pub fn truncate_to_title(text: &str, max_chars: usize) -> String {
    let text = text.trim();

    // If short enough, return as-is
    if text.len() <= max_chars {
        return text.to_string();
    }

    // Find the last word boundary before max_chars
    let truncated = &text[..max_chars];
    let last_space = truncated.rfind(char::is_whitespace);

    let title = match last_space {
        Some(pos) if pos > max_chars / 2 => &truncated[..pos],
        _ => truncated,
    };

    format!("{}...", title.trim())
}

// ============================================================================
// Fake Provider for Testing
// ============================================================================

/// A fake title generator for testing that returns deterministic titles.
pub struct FakeTitleGenerator {
    /// Fixed title to return, or None to use fallback.
    pub fixed_title: Option<String>,
    /// Fallback max chars.
    pub fallback_max_chars: usize,
}

impl FakeTitleGenerator {
    /// Create a fake generator that returns a fixed title.
    pub fn with_title(title: &str) -> Self {
        Self {
            fixed_title: Some(title.to_string()),
            fallback_max_chars: 50,
        }
    }

    /// Create a fake generator that always uses fallback.
    pub fn with_fallback() -> Self {
        Self {
            fixed_title: None,
            fallback_max_chars: 50,
        }
    }
}

#[async_trait]
impl TitleGeneratorTrait for FakeTitleGenerator {
    async fn generate_title(&self, user_message: &str, _provider_id: &str) -> String {
        match &self.fixed_title {
            Some(title) => title.clone(),
            None => truncate_to_title(user_message, self.fallback_max_chars),
        }
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_to_title_short() {
        let result = truncate_to_title("Short message", 50);
        assert_eq!(result, "Short message");
    }

    #[test]
    fn test_truncate_to_title_long() {
        let result = truncate_to_title(
            "This is a much longer message that needs to be truncated for the sidebar",
            50,
        );
        assert!(result.len() <= 53); // 50 + "..."
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_truncate_to_title_word_boundary() {
        // Should break at word boundary, not mid-word
        let result = truncate_to_title("What are my portfolio holdings today", 30);
        assert_eq!(result, "What are my portfolio...");
    }

    #[test]
    fn test_truncate_to_title_preserves_short_words() {
        let result = truncate_to_title("A very short start", 50);
        assert_eq!(result, "A very short start");
    }

    #[tokio::test]
    async fn test_fake_title_generator_fixed() {
        let generator = FakeTitleGenerator::with_title("Test Title");
        let title = generator.generate_title("Any message", "openai").await;
        assert_eq!(title, "Test Title");
    }

    #[tokio::test]
    async fn test_fake_title_generator_fallback() {
        let generator = FakeTitleGenerator::with_fallback();
        let title = generator
            .generate_title("What is my portfolio value?", "openai")
            .await;
        assert_eq!(title, "What is my portfolio value?");
    }

    #[tokio::test]
    async fn test_fake_title_generator_fallback_long() {
        let generator = FakeTitleGenerator::with_fallback();
        let title = generator
            .generate_title(
                "Can you show me a detailed breakdown of all my investment holdings across all accounts with their current market values?",
                "openai"
            )
            .await;
        assert!(title.ends_with("..."));
        assert!(title.len() <= 53);
    }
}
