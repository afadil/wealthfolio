pub(crate) fn ensure_openai_v1_base_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    if base.ends_with("/v1") {
        base.to_string()
    } else {
        format!("{}/v1", base)
    }
}

pub(crate) fn openai_compatible_models_url(base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let base = base.strip_suffix("/v1").unwrap_or(base);
    format!("{}/v1/models", base)
}

/// Whether the `openai` provider talks to OpenAI itself rather than an
/// OpenAI-compatible server behind a custom endpoint. Only OpenAI serves the
/// Responses API that current GPT models need for tool calls.
pub(crate) fn is_openai_platform_url(base_url: Option<&str>) -> bool {
    base_url.is_none_or(|url| {
        reqwest::Url::parse(url)
            .ok()
            .is_some_and(|url| url.host_str() == Some("api.openai.com"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_default_or_api_openai_com_counts_as_the_openai_platform() {
        assert!(is_openai_platform_url(None));
        assert!(is_openai_platform_url(Some("https://api.openai.com")));
        assert!(is_openai_platform_url(Some("https://api.openai.com/v1/")));
        assert!(!is_openai_platform_url(Some("http://localhost:8080/v1")));
        assert!(!is_openai_platform_url(Some(
            "https://openai.example.com/v1"
        )));
    }

    #[test]
    fn ensure_openai_v1_base_url_accepts_bare_or_v1_url() {
        let cases = [
            ("http://localhost:8080", "http://localhost:8080/v1"),
            ("http://localhost:8080/", "http://localhost:8080/v1"),
            ("http://localhost:8080/v1", "http://localhost:8080/v1"),
            ("http://localhost:8080/v1/", "http://localhost:8080/v1"),
            ("https://api.openai.com", "https://api.openai.com/v1"),
            (
                "https://api.groq.com/openai",
                "https://api.groq.com/openai/v1",
            ),
            ("https://openrouter.ai/api", "https://openrouter.ai/api/v1"),
        ];

        for (input, expected) in cases {
            assert_eq!(ensure_openai_v1_base_url(input), expected, "input: {input}");
        }
    }

    #[test]
    fn openai_compatible_models_url_accepts_bare_or_v1_url() {
        let cases = [
            ("http://localhost:8080", "http://localhost:8080/v1/models"),
            ("http://localhost:8080/", "http://localhost:8080/v1/models"),
            (
                "http://localhost:8080/v1",
                "http://localhost:8080/v1/models",
            ),
            (
                "http://localhost:8080/v1/",
                "http://localhost:8080/v1/models",
            ),
            (
                "https://api.groq.com/openai",
                "https://api.groq.com/openai/v1/models",
            ),
            (
                "https://openrouter.ai/api/v1",
                "https://openrouter.ai/api/v1/models",
            ),
        ];

        for (input, expected) in cases {
            assert_eq!(
                openai_compatible_models_url(input),
                expected,
                "input: {input}"
            );
        }
    }
}
