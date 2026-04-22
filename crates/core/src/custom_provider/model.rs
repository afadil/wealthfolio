use serde::{Deserialize, Serialize};

/// Valid source kinds.
pub const VALID_SOURCE_KINDS: &[&str] = &["latest", "historical"];
/// Valid source formats.
pub const VALID_SOURCE_FORMATS: &[&str] = &["json", "html", "html_table", "csv"];

/// Cached regex for `{DATE:...}` template expansion.
pub static DATE_TEMPLATE_RE: std::sync::LazyLock<regex::Regex> =
    std::sync::LazyLock::new(|| regex::Regex::new(r"\{DATE:([^}]+)\}").unwrap());

/// Maximum HTTP response body size (10 MB).
pub const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

/// Browser-like user agent used by custom provider test and runtime requests.
pub const CUSTOM_PROVIDER_USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Context for expanding template variables in URLs and paths.
pub struct TemplateContext<'a> {
    pub symbol: &'a str,
    pub currency: &'a str,
    pub isin: Option<&'a str>,
    pub mic: Option<&'a str>,
    pub from: Option<&'a str>,
    pub to: Option<&'a str>,
}

/// Expand template variables in a string (URL or path).
///
/// Supported variables: `{SYMBOL}`, `{currency}`, `{CURRENCY}`, `{TODAY}`,
/// `{FROM}`, `{TO}`, `{ISIN}`, `{MIC}`, `{DATE:format}`.
pub fn expand_template(template: &str, ctx: &TemplateContext<'_>) -> String {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let mut out = template
        .replace("{SYMBOL}", ctx.symbol)
        .replace("{currency}", &ctx.currency.to_lowercase())
        .replace("{CURRENCY}", &ctx.currency.to_uppercase())
        .replace("{TODAY}", &today)
        .replace("{FROM}", ctx.from.unwrap_or(&today))
        .replace("{TO}", ctx.to.unwrap_or(&today));

    if out.contains("{ISIN}") {
        out = out.replace("{ISIN}", ctx.isin.unwrap_or(ctx.symbol));
    }
    if out.contains("{MIC}") {
        out = out.replace("{MIC}", ctx.mic.unwrap_or(""));
    }
    if out.contains("{DATE:") {
        out = DATE_TEMPLATE_RE
            .replace_all(&out, |caps: &regex::Captures| {
                chrono::Utc::now().format(&caps[1]).to_string()
            })
            .to_string();
    }
    out
}

/// Validate that a URL parses and uses an http(s) scheme.
///
/// The user is the author of their provider URLs, so we don't restrict which
/// hosts they can target (self-hosted providers on private networks are
/// supported). Only rejects malformed URLs and non-HTTP(S) schemes.
pub fn validate_url(raw: &str) -> Result<(), anyhow::Error> {
    let parsed =
        url::Url::parse(raw).map_err(|e| anyhow::anyhow!("Invalid URL '{}': {}", raw, e))?;

    match parsed.scheme() {
        "http" | "https" => {}
        other => {
            return Err(anyhow::anyhow!(
                "Unsupported URL scheme '{}' (only http/https allowed)",
                other
            ))
        }
    }

    if parsed.host().is_none() {
        return Err(anyhow::anyhow!("URL '{}' has no host", raw));
    }

    Ok(())
}

/// Build default browser-like headers for custom provider HTTP requests.
pub fn build_browser_like_headers(format: &str, url: &str) -> reqwest::header::HeaderMap {
    let mut headers = reqwest::header::HeaderMap::new();
    let default_accept = match format {
        "json" => "application/json, text/plain, */*",
        "csv" => "text/csv, text/plain, */*",
        _ => {
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
        }
    };
    for (name, value) in [
        ("accept", default_accept),
        ("accept-language", "en-US,en;q=0.9"),
        ("sec-fetch-dest", "empty"),
        ("sec-fetch-mode", "cors"),
        ("sec-fetch-site", "same-origin"),
        (
            "sec-ch-ua",
            "\"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
        ),
        ("sec-ch-ua-mobile", "?0"),
        ("sec-ch-ua-platform", "\"macOS\""),
        ("upgrade-insecure-requests", "1"),
    ] {
        if let (Ok(n), Ok(v)) = (
            reqwest::header::HeaderName::from_bytes(name.as_bytes()),
            reqwest::header::HeaderValue::from_str(value),
        ) {
            headers.insert(n, v);
        }
    }

    if let Ok(parsed) = reqwest::Url::parse(url) {
        let origin = parsed.origin().ascii_serialization();
        if origin != "null" {
            if let Ok(v) = reqwest::header::HeaderValue::from_str(&format!("{origin}/")) {
                headers.insert(reqwest::header::REFERER, v);
            }
        }
    }

    headers
}

/// Extract a numeric value from HTML using a CSS selector.
///
/// Shared between `custom_provider::service` (test_source) and
/// `quotes::custom_scraper_provider` (runtime quote fetching).
pub fn extract_html_value(body: &str, selector: &str, locale: Option<&str>) -> Option<f64> {
    let document = scraper::Html::parse_document(body);
    let sel = scraper::Selector::parse(selector).ok()?;
    let element = document.select(&sel).next()?;
    let text: String = element.text().collect::<String>();
    crate::custom_provider::service::parse_number_string(text.trim(), locale)
}

/// A custom provider source definition (latest or historical).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderSource {
    pub id: String,
    pub provider_id: String,
    /// "latest" or "historical"
    pub kind: String,
    /// "json", "html", "html_table", or "csv"
    pub format: String,
    pub url: String,
    /// JSONPath expression, CSS selector, or "table_idx:col_idx"
    pub price_path: String,
    pub date_path: Option<String>,
    pub date_format: Option<String>,
    pub currency_path: Option<String>,
    pub factor: Option<f64>,
    pub invert: Option<bool>,
    pub locale: Option<String>,
    /// JSON object string of extra HTTP headers
    pub headers: Option<String>,
    #[serde(default)]
    pub open_path: Option<String>,
    pub high_path: Option<String>,
    pub low_path: Option<String>,
    pub volume_path: Option<String>,
    pub default_price: Option<f64>,
    pub date_timezone: Option<String>,
}

/// A custom provider with its source definitions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomProviderWithSources {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    pub priority: i32,
    pub sources: Vec<CustomProviderSource>,
}

/// Payload for creating a new custom provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewCustomProvider {
    /// Unique code (lowercase alphanumeric + hyphens), used as provider_id
    pub code: String,
    pub name: String,
    pub description: Option<String>,
    pub priority: Option<i32>,
    pub sources: Vec<NewCustomProviderSource>,
}

/// Payload for updating a custom provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomProvider {
    pub name: Option<String>,
    pub description: Option<String>,
    pub enabled: Option<bool>,
    pub priority: Option<i32>,
    pub sources: Option<Vec<NewCustomProviderSource>>,
}

/// Source definition within a create/update payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewCustomProviderSource {
    /// "latest" or "historical"
    pub kind: String,
    /// "json", "html", "html_table", or "csv"
    pub format: String,
    pub url: String,
    pub price_path: String,
    pub date_path: Option<String>,
    pub date_format: Option<String>,
    pub currency_path: Option<String>,
    pub factor: Option<f64>,
    pub invert: Option<bool>,
    pub locale: Option<String>,
    pub headers: Option<String>,
    #[serde(default)]
    pub open_path: Option<String>,
    pub high_path: Option<String>,
    pub low_path: Option<String>,
    pub volume_path: Option<String>,
    pub default_price: Option<f64>,
    pub date_timezone: Option<String>,
}

/// Request to test a source configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSourceRequest {
    pub format: String,
    pub url: String,
    pub price_path: String,
    pub date_path: Option<String>,
    pub date_format: Option<String>,
    pub currency_path: Option<String>,
    pub factor: Option<f64>,
    pub invert: Option<bool>,
    pub locale: Option<String>,
    pub headers: Option<String>,
    /// Symbol to substitute in template variables
    pub symbol: String,
    /// Currency for {currency}/{CURRENCY} placeholders (defaults to "usd")
    pub currency: Option<String>,
    /// Start date for {FROM} placeholders while testing historical sources.
    pub from: Option<String>,
    /// End date for {TO} placeholders while testing historical sources.
    pub to: Option<String>,
    #[serde(default)]
    pub open_path: Option<String>,
    pub high_path: Option<String>,
    pub low_path: Option<String>,
    pub volume_path: Option<String>,
    pub default_price: Option<f64>,
    pub date_timezone: Option<String>,
}

/// A numeric element detected in an HTML page.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedHtmlElement {
    /// CSS selector that targets this element.
    pub selector: String,
    /// Parsed numeric value.
    pub value: f64,
    /// Raw text content of the element.
    pub text: String,
    /// Nearby label/context (e.g. "Official Close").
    pub label: String,
    /// Outer HTML snippet of the parent element for context preview.
    pub html_context: String,
}

/// A column detected in an HTML table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedColumn {
    pub index: usize,
    pub header: String,
    /// Auto-detected role: "close", "date", "high", "low", "volume", "open", or null
    pub role: Option<String>,
}

/// An HTML table detected on a page with column metadata and sample rows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedHtmlTable {
    pub index: usize,
    pub columns: Vec<DetectedColumn>,
    pub row_count: usize,
    pub sample_rows: Vec<Vec<String>>,
}

/// Result of testing a source configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TestSourceResult {
    pub success: bool,
    pub status_code: Option<u16>,
    pub price: Option<f64>,
    pub open: Option<f64>,
    pub high: Option<f64>,
    pub low: Option<f64>,
    pub volume: Option<f64>,
    pub currency: Option<String>,
    pub date: Option<String>,
    pub error: Option<String>,
    pub raw_response: Option<String>,
    /// Detected numeric elements (HTML only).
    pub detected_elements: Option<Vec<DetectedHtmlElement>>,
    /// Detected HTML tables (html_table format).
    pub detected_tables: Option<Vec<DetectedHtmlTable>>,
}
