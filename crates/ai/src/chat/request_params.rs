//! Per-model thinking and sampling parameters.
//!
//! Each provider changed how reasoning is requested between model
//! generations, and a shape one generation needs is rejected by the next:
//!
//! - Claude: Haiku 4.5 and older take `thinking.budget_tokens`; 4.6 and later
//!   take `thinking: {type: "adaptive"}`, and 4.7 and later reject
//!   `budget_tokens` and sampling parameters.
//! - Gemini: 2.5 takes `thinkingBudget`; Gemini 3 and later take
//!   `thinkingLevel` and ignore or reject sampling parameters.
//! - OpenAI: reasoning models take `reasoning.effort` on the Responses API and
//!   reject `temperature` unless the effort is `none`.
//!
//! "Thinking off" omits the thinking parameter. Claude 5, Gemini 3 and GPT-6
//! models keep reasoning then, at the provider's default effort, but don't
//! return it.

use serde_json::{json, Value};

use crate::model_families::{claude_version, gemini_version, is_openai_reasoning_model};

/// Token budget for models that still take a manual thinking budget.
const ANTHROPIC_THINKING_BUDGET: u64 = 8000;
const GEMINI_THINKING_BUDGET: u64 = 8192;

/// Anthropic `thinking` parameter, or `None` to leave thinking to the model.
pub(super) fn anthropic_thinking_params(model_id: &str, thinking: bool) -> Option<Value> {
    if !thinking {
        return None;
    }
    let thinking = match claude_version(model_id) {
        // Adaptive thinking returns summarized reasoning by default on 4.6.
        // From 4.7 the default is "omitted", which streams empty thinking
        // blocks, and `display` is how to ask for the summary.
        Some(version) if version >= (4, 7) => {
            json!({ "type": "adaptive", "display": "summarized" })
        }
        Some(version) if version >= (4, 6) => json!({ "type": "adaptive" }),
        // Haiku 4.5 and older, and Anthropic-compatible endpoints serving
        // non-Claude IDs, keep the budget shape they have always accepted.
        _ => json!({ "type": "enabled", "budget_tokens": ANTHROPIC_THINKING_BUDGET }),
    };
    Some(json!({ "thinking": thinking }))
}

/// Gemini `generationConfig.thinkingConfig`, or `None` to leave thinking to
/// the model.
pub(super) fn gemini_thinking_params(model_id: &str, thinking: bool) -> Option<Value> {
    if !thinking {
        return None;
    }
    // Gemini 3 still accepts `thinkingBudget` for compatibility but takes
    // `thinkingLevel`; sending both is an error. Unversioned aliases keep the
    // budget, which every thinking model accepts.
    let thinking_config = match gemini_version(model_id) {
        Some(version) if version >= (3, 0) => {
            json!({ "thinkingLevel": "high", "includeThoughts": true })
        }
        _ => json!({ "thinkingBudget": GEMINI_THINKING_BUDGET, "includeThoughts": true }),
    };
    // Nested in generationConfig to match rig's Gemini AdditionalParameters.
    Some(json!({ "generationConfig": { "thinkingConfig": thinking_config } }))
}

/// Additional parameters for the OpenAI Responses API.
pub(super) fn openai_responses_params(model_id: &str, thinking: bool) -> Value {
    // Keep conversations off OpenAI's servers. Stateless reasoning models
    // return their reasoning encrypted so it can be sent back with the tool
    // results; non-reasoning models reject the encrypted-content include.
    let mut params = json!({ "store": false });
    if is_openai_reasoning_model(model_id) {
        params["include"] = json!(["reasoning.encrypted_content"]);
        // "medium" is accepted by every reasoning model, including the ones
        // that reject "none" (GPT-6 Astra, GPT-6.1 Sol).
        if thinking {
            params["reasoning"] = json!({ "effort": "medium" });
        }
    }
    params
}

/// Temperature to send, or `None` to use the model's default.
pub(super) fn effective_temperature(
    provider_id: &str,
    model_id: &str,
    thinking: bool,
    configured: Option<f64>,
) -> Option<f64> {
    let accepted = match provider_id {
        // Claude 4.7 and later reject sampling parameters, and thinking
        // doesn't combine with a non-default temperature on any Claude model.
        "anthropic" => !thinking && claude_version(model_id).is_none_or(|v| v < (4, 7)),
        // Reasoning models reject temperature at any effort but "none", and
        // the default effort differs by model.
        "openai" => !is_openai_reasoning_model(model_id),
        // Gemini 3 and later ignore or reject sampling parameters, and Google
        // warns that a temperature below 1.0 can make Gemini 3 loop. Aliases
        // such as `gemini-flash-latest` point at current models.
        "google" | "gemini" => gemini_version(model_id).is_some_and(|v| v < (3, 0)),
        _ => true,
    };
    configured.filter(|_| accepted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_models_from_4_7_use_adaptive_thinking_with_summaries() {
        for model in [
            "claude-opus-5-5",
            "claude-sonnet-5-5",
            "claude-fable-5-1",
            "claude-opus-4-8",
            "claude-opus-4-7",
        ] {
            assert_eq!(
                anthropic_thinking_params(model, true),
                Some(json!({ "thinking": { "type": "adaptive", "display": "summarized" } })),
                "{model}"
            );
        }
    }

    #[test]
    fn claude_4_6_uses_adaptive_thinking_without_display() {
        assert_eq!(
            anthropic_thinking_params("claude-sonnet-4-6", true),
            Some(json!({ "thinking": { "type": "adaptive" } }))
        );
    }

    #[test]
    fn older_claude_models_keep_the_thinking_budget() {
        for model in [
            "claude-haiku-4-5",
            "claude-haiku-4-5-20251001",
            "proxy-model",
        ] {
            assert_eq!(
                anthropic_thinking_params(model, true),
                Some(json!({ "thinking": { "type": "enabled", "budget_tokens": 8000 } })),
                "{model}"
            );
        }
    }

    #[test]
    fn thinking_off_omits_the_parameter() {
        // Opus 5.5 and Sonnet 5.5 reject `{type: "disabled"}`; omitting the
        // parameter is valid on every model.
        assert_eq!(anthropic_thinking_params("claude-opus-5-5", false), None);
        assert_eq!(anthropic_thinking_params("claude-haiku-4-5", false), None);
        assert_eq!(
            gemini_thinking_params("gemini-3-flash-preview", false),
            None
        );
    }

    #[test]
    fn gemini_3_uses_thinking_level_and_2_5_keeps_the_budget() {
        assert_eq!(
            gemini_thinking_params("gemini-3.1-pro-preview", true),
            Some(json!({ "generationConfig": { "thinkingConfig": {
                "thinkingLevel": "high", "includeThoughts": true
            } } }))
        );
        for model in ["gemini-2.5-flash", "gemini-flash-latest"] {
            assert_eq!(
                gemini_thinking_params(model, true),
                Some(json!({ "generationConfig": { "thinkingConfig": {
                    "thinkingBudget": 8192, "includeThoughts": true
                } } })),
                "{model}"
            );
        }
    }

    #[test]
    fn temperature_is_dropped_where_claude_rejects_it() {
        assert_eq!(
            effective_temperature("anthropic", "claude-opus-5-5", false, Some(0.2)),
            None
        );
        assert_eq!(
            effective_temperature("anthropic", "claude-sonnet-4-6", true, Some(0.2)),
            None
        );
        assert_eq!(
            effective_temperature("anthropic", "claude-sonnet-4-6", false, Some(0.2)),
            Some(0.2)
        );
        assert_eq!(
            effective_temperature("ollama", "qwen3:8b", true, Some(0.2)),
            Some(0.2)
        );
    }

    #[test]
    fn temperature_is_dropped_for_openai_reasoning_models_and_gemini_3() {
        assert_eq!(
            effective_temperature("openai", "gpt-6-astra", false, Some(0.2)),
            None
        );
        assert_eq!(
            effective_temperature("openai", "gpt-4.1", false, Some(0.2)),
            Some(0.2)
        );
        for model in ["gemini-4-argon", "gemini-3.8-flash", "gemini-flash-latest"] {
            assert_eq!(
                effective_temperature("google", model, false, Some(0.2)),
                None,
                "{model}"
            );
        }
        assert_eq!(
            effective_temperature("google", "gemini-2.5-flash", false, Some(0.2)),
            Some(0.2)
        );
    }

    #[test]
    fn openai_requests_are_stateless_and_reasoning_models_carry_encrypted_reasoning() {
        assert_eq!(
            openai_responses_params("gpt-6-astra", true),
            json!({
                "store": false,
                "include": ["reasoning.encrypted_content"],
                "reasoning": { "effort": "medium" }
            })
        );
        assert_eq!(
            openai_responses_params("gpt-6-luna", false),
            json!({ "store": false, "include": ["reasoning.encrypted_content"] })
        );
        assert_eq!(
            openai_responses_params("gpt-4.1", true),
            json!({ "store": false })
        );
    }
}
