use serde::{Deserialize, Serialize};
use std::net::IpAddr;

/// Valid source kinds.
pub const VALID_SOURCE_KINDS: &[&str] = &["latest", "historical"];
/// Valid source formats.
pub const VALID_SOURCE_FORMATS: &[&str] = &["json", "html", "html_table", "csv"];

/// Cached regex for `{DATE:...}` template expansion.
pub static DATE_TEMPLATE_RE: std::sync::LazyLock<regex::Regex> =
    std::sync::LazyLock::new(|| regex::Regex::new(r"\{DATE:([^}]+)\}").unwrap());

/// Maximum HTTP response body size (10 MB).
pub const MAX_RESPONSE_BYTES: usize = 10 * 1024 * 1024;

/// Validate that a URL is safe to fetch (no SSRF).
///
/// Rejects non-HTTP(S) schemes and URLs targeting private/loopback addresses.
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

    match parsed.host() {
        Some(url::Host::Domain(domain)) => {
            if domain == "localhost" {
                return Err(anyhow::anyhow!("URLs targeting localhost are not allowed"));
            }
        }
        Some(url::Host::Ipv4(ip)) => {
            let ip_addr = IpAddr::V4(ip);
            if ip.is_loopback()
                || ip.is_private()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_unspecified()
            {
                return Err(anyhow::anyhow!(
                    "URLs targeting private/reserved IP address {} are not allowed",
                    ip_addr
                ));
            }
        }
        Some(url::Host::Ipv6(ip)) => {
            let ip_addr = IpAddr::V6(ip);
            if ip.is_loopback() || ip.is_unspecified() {
                return Err(anyhow::anyhow!(
                    "URLs targeting private/reserved IP address {} are not allowed",
                    ip_addr
                ));
            }
        }
        None => return Err(anyhow::anyhow!("URL '{}' has no host", raw)),
    }

    Ok(())
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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSourceResult {
    pub success: bool,
    pub price: Option<f64>,
    pub currency: Option<String>,
    pub date: Option<String>,
    pub error: Option<String>,
    pub raw_response: Option<String>,
    /// Detected numeric elements (HTML only).
    pub detected_elements: Option<Vec<DetectedHtmlElement>>,
    /// Detected HTML tables (html_table format).
    pub detected_tables: Option<Vec<DetectedHtmlTable>>,
}
