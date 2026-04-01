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

/// Returns true if the IP address is private, loopback, or otherwise reserved.
fn is_private_or_reserved(addr: IpAddr) -> bool {
    match addr {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            let is_shared = octets[0] == 100 && (octets[1] & 0xC0) == 64; // 100.64.0.0/10 (CGNAT)
            let is_benchmarking = octets[0] == 198 && (octets[1] & 0xFE) == 18; // 198.18.0.0/15
            let is_multicast = octets[0] >= 224 && octets[0] <= 239; // 224.0.0.0/4
            let is_reserved = octets[0] >= 240; // 240.0.0.0/4
            ip.is_loopback()
                || ip.is_private()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_unspecified()
                || is_shared
                || is_benchmarking
                || is_multicast
                || is_reserved
        }
        IpAddr::V6(ip) => {
            let segs = ip.segments();
            let is_unique_local = (segs[0] & 0xfe00) == 0xfc00; // fc00::/7
            let is_link_local = (segs[0] & 0xffc0) == 0xfe80; // fe80::/10
            let is_multicast = (segs[0] & 0xff00) == 0xff00; // ff00::/8
            ip.is_loopback()
                || ip.is_unspecified()
                || is_unique_local
                || is_link_local
                || is_multicast
        }
    }
}

/// Validate that a URL is safe to fetch (no SSRF).
///
/// Rejects non-HTTP(S) schemes and URLs with literal private/loopback addresses.
/// Does NOT resolve DNS — call [`validate_url_resolved`] after this for full protection.
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
            if is_private_or_reserved(IpAddr::V4(ip)) {
                return Err(anyhow::anyhow!(
                    "URLs targeting private/reserved IP address {} are not allowed",
                    ip
                ));
            }
        }
        Some(url::Host::Ipv6(ip)) => {
            if is_private_or_reserved(IpAddr::V6(ip)) {
                return Err(anyhow::anyhow!(
                    "URLs targeting private/reserved IP address {} are not allowed",
                    ip
                ));
            }
        }
        None => return Err(anyhow::anyhow!("URL '{}' has no host", raw)),
    }

    Ok(())
}

/// Validate a URL by resolving its hostname and checking the resolved IPs.
///
/// Catches DNS-based SSRF where a public-looking hostname resolves to a
/// private/loopback address.
pub async fn validate_url_resolved(raw: &str) -> Result<(), anyhow::Error> {
    // First run the fast syntactic check
    validate_url(raw)?;

    let parsed = url::Url::parse(raw)?;

    // Only domain hostnames need DNS resolution; literal IPs were already checked.
    if let Some(url::Host::Domain(domain)) = parsed.host() {
        let port = parsed.port_or_known_default().unwrap_or(443);
        let host_port = format!("{}:{}", domain, port);

        let addrs: Vec<std::net::SocketAddr> = tokio::net::lookup_host(&host_port).await?.collect();

        if addrs.is_empty() {
            return Err(anyhow::anyhow!(
                "DNS resolution for '{}' returned no addresses",
                domain
            ));
        }

        for addr in &addrs {
            if is_private_or_reserved(addr.ip()) {
                return Err(anyhow::anyhow!(
                    "DNS for '{}' resolves to private/reserved address {} — not allowed",
                    domain,
                    addr.ip()
                ));
            }
        }
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
