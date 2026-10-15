//! Model families read from provider model IDs.
//!
//! Request shapes and default capabilities depend on the model generation:
//! Claude 4.6 and later take adaptive thinking instead of a token budget,
//! Gemini 3 takes a thinking level instead of a budget, and OpenAI reasoning
//! models reject sampling parameters. The chat path has only the model ID when
//! it builds a request, so these rules work from the ID alone and need no
//! extra request to the provider.

use crate::provider_model::ModelCapabilities;

/// `(major, minor)` read from the first one- or two-digit numbers after
/// `prefix`. Longer numbers are date stamps (`claude-opus-4-20250514`) and
/// end the version.
fn version_after(model_id: &str, prefix: &str) -> Option<(u32, u32)> {
    let start = model_id.find(prefix)? + prefix.len();
    let mut numbers = model_id[start..]
        .split(['-', '.', '@', ':'])
        .skip_while(|part| !is_version_number(part));
    let major = numbers.next()?.parse().ok()?;
    let minor = numbers
        .next()
        .filter(|part| is_version_number(part))
        .and_then(|part| part.parse().ok())
        .unwrap_or(0);
    Some((major, minor))
}

fn is_version_number(part: &str) -> bool {
    (1..=2).contains(&part.len()) && part.bytes().all(|b| b.is_ascii_digit())
}

/// Version of a Claude model, e.g. `claude-opus-5-5` → `(5, 5)` and
/// `claude-3-7-sonnet-20250219` → `(3, 7)`.
pub(crate) fn claude_version(model_id: &str) -> Option<(u32, u32)> {
    version_after(model_id, "claude-")
}

/// Version of a Gemini model, e.g. `gemini-3.1-pro-preview` → `(3, 1)`.
/// Aliases such as `gemini-flash-latest` carry no version.
pub(crate) fn gemini_version(model_id: &str) -> Option<(u32, u32)> {
    let start = model_id.find("gemini-")? + "gemini-".len();
    let rest = &model_id[start..];
    // Only a version right after the prefix counts: `gemini-flash-latest`
    // must not read a number further along the ID.
    rest.starts_with(|c: char| c.is_ascii_digit())
        .then(|| version_after(model_id, "gemini-"))
        .flatten()
}

/// Whether the ID names an OpenAI reasoning model: the o-series and GPT-5 or
/// later, except the `-chat` models (`gpt-5-chat-latest`), which don't reason.
/// These take `reasoning.effort` and reject `temperature`.
pub(crate) fn is_openai_reasoning_model(model_id: &str) -> bool {
    let id = model_id.rsplit('/').next().unwrap_or(model_id);
    if id.contains("-chat") {
        return false;
    }
    if let Some(rest) = id.strip_prefix("gpt-") {
        return rest
            .split(['-', '.'])
            .next()
            .and_then(|major| major.parse::<u32>().ok())
            .is_some_and(|major| major >= 5);
    }
    let mut chars = id.chars();
    chars.next() == Some('o') && chars.next().is_some_and(|c| c.is_ascii_digit())
}

/// Capabilities of a model the catalog doesn't list, before the user's
/// overrides apply. A model the user configured is described by its overrides
/// alone, with unset keys off, as before providers had defaults; the settings
/// screen saves every key when the user changes one.
pub(crate) fn non_catalog_capabilities(
    provider_id: &str,
    model_id: &str,
    configured: bool,
) -> ModelCapabilities {
    if configured {
        no_capabilities()
    } else {
        default_capabilities(provider_id, model_id)
    }
}

fn no_capabilities() -> ModelCapabilities {
    ModelCapabilities {
        tools: false,
        thinking: false,
        vision: false,
        streaming: true,
    }
}

/// Capabilities assumed for a model the catalog doesn't list and the user
/// hasn't configured. Providers whose models all share a capability get it
/// here, so a newly released model keeps its tools without a manual override.
/// Providers that mix many vendors (Groq, OpenRouter, Ollama) start with
/// everything off.
pub(crate) fn default_capabilities(provider_id: &str, model_id: &str) -> ModelCapabilities {
    match provider_id {
        // Every Claude model the API still serves takes tools and images and
        // can think (adaptive on 4.6+, a budget before that). Other IDs on a
        // custom Anthropic-compatible endpoint get nothing assumed.
        "anthropic" if model_id.contains("claude") => ModelCapabilities {
            tools: true,
            thinking: true,
            vision: true,
            streaming: true,
        },
        "openai" if is_openai_chat_model(model_id) => {
            let reasoning = is_openai_reasoning_model(model_id);
            ModelCapabilities {
                tools: true,
                thinking: reasoning,
                // GPT-5 and later, and the o-series reasoning models except
                // o1-mini and o3-mini, take image input. Older chat models
                // vary, so leave them off.
                vision: reasoning
                    && !model_id.starts_with("o1-mini")
                    && !model_id.starts_with("o3-mini"),
                streaming: true,
            }
        }
        "google" | "gemini" if model_id.contains("gemini") && is_chat_model(model_id) => {
            ModelCapabilities {
                tools: true,
                thinking: gemini_version(model_id).is_none_or(|version| version >= (2, 5)),
                vision: true,
                streaming: true,
            }
        }
        _ => no_capabilities(),
    }
}

/// OpenAI lists embedding, audio, image and moderation models next to chat
/// models in `/v1/models`.
fn is_openai_chat_model(model_id: &str) -> bool {
    (model_id.starts_with("gpt-") || is_openai_reasoning_model(model_id)) && is_chat_model(model_id)
}

fn is_chat_model(model_id: &str) -> bool {
    const NON_CHAT_MARKERS: [&str; 9] = [
        "embedding",
        "audio",
        "realtime",
        "transcribe",
        "tts",
        "image",
        "moderation",
        "search",
        "aqa",
    ];
    !NON_CHAT_MARKERS
        .iter()
        .any(|marker| model_id.contains(marker))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_claude_versions_from_every_id_style() {
        assert_eq!(claude_version("claude-opus-5-5"), Some((5, 5)));
        assert_eq!(claude_version("claude-fable-5-1"), Some((5, 1)));
        assert_eq!(claude_version("claude-opus-5"), Some((5, 0)));
        assert_eq!(claude_version("claude-sonnet-4-6"), Some((4, 6)));
        assert_eq!(claude_version("claude-haiku-4-5-20251001"), Some((4, 5)));
        assert_eq!(claude_version("claude-opus-4-20250514"), Some((4, 0)));
        assert_eq!(claude_version("claude-sonnet-4-0"), Some((4, 0)));
        assert_eq!(claude_version("claude-3-7-sonnet-20250219"), Some((3, 7)));
        assert_eq!(claude_version("anthropic/claude-opus-4.5"), Some((4, 5)));
        assert_eq!(claude_version("my-proxy-model"), None);
    }

    #[test]
    fn reads_gemini_versions_but_not_aliases() {
        assert_eq!(gemini_version("gemini-3-flash-preview"), Some((3, 0)));
        assert_eq!(gemini_version("gemini-3.1-pro-preview"), Some((3, 1)));
        assert_eq!(gemini_version("gemini-2.5-flash"), Some((2, 5)));
        assert_eq!(gemini_version("gemini-2.0-flash-001"), Some((2, 0)));
        assert_eq!(gemini_version("gemini-flash-latest"), None);
    }

    #[test]
    fn recognizes_openai_reasoning_models() {
        for id in [
            "gpt-5.4-mini",
            "gpt-5",
            "gpt-6-astra",
            "gpt-6.1-sol",
            "o3",
            "o4-mini",
        ] {
            assert!(is_openai_reasoning_model(id), "{id}");
        }
        for id in [
            "gpt-4.1",
            "gpt-4o-mini",
            "omni-moderation-latest",
            "chatgpt-4o-latest",
            "gpt-5-chat-latest",
        ] {
            assert!(!is_openai_reasoning_model(id), "{id}");
        }
    }

    #[test]
    fn fetched_models_from_single_vendor_providers_keep_tools() {
        for (provider, model) in [
            ("anthropic", "claude-opus-5-5"),
            ("openai", "gpt-6-astra"),
            ("google", "gemini-3-flash-preview"),
        ] {
            let caps = default_capabilities(provider, model);
            assert!(
                caps.tools && caps.thinking && caps.vision,
                "{provider}/{model}"
            );
        }
        let gpt4 = default_capabilities("openai", "gpt-4.1");
        assert!(gpt4.tools && !gpt4.thinking);
        let flash2 = default_capabilities("google", "gemini-2.0-flash");
        assert!(flash2.tools && !flash2.thinking);
    }

    #[test]
    fn configured_models_keep_unset_capabilities_off() {
        let configured = non_catalog_capabilities("anthropic", "claude-opus-5-5", true);
        assert!(!configured.tools && !configured.thinking && !configured.vision);
        let unconfigured = non_catalog_capabilities("anthropic", "claude-opus-5-5", false);
        assert!(unconfigured.tools && unconfigured.thinking && unconfigured.vision);
    }

    #[test]
    fn mini_o_series_models_take_no_images() {
        assert!(!default_capabilities("openai", "o3-mini").vision);
        assert!(!default_capabilities("openai", "o1-mini-2024-09-12").vision);
        assert!(default_capabilities("openai", "o4-mini").vision);
        assert!(default_capabilities("openai", "o3").vision);
    }

    #[test]
    fn non_chat_and_multi_vendor_models_start_without_tools() {
        for (provider, model) in [
            ("openai", "text-embedding-3-large"),
            ("openai", "gpt-4o-mini-tts"),
            ("openai", "gpt-image-1"),
            ("google", "gemini-embedding-001"),
            ("groq", "llama-3.3-70b-versatile"),
            ("openrouter", "anthropic/claude-opus-5-5"),
            ("ollama", "qwen3:8b"),
            ("anthropic", "my-proxy-model"),
        ] {
            assert!(
                !default_capabilities(provider, model).tools,
                "{provider}/{model}"
            );
        }
    }
}
