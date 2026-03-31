use std::sync::Arc;

use log::info;

use crate::errors::{Result, ValidationError};
use crate::secrets::SecretStore;

use super::model::*;
use super::store::CustomProviderRepository;

/// Reserved codes that cannot be used for custom providers.
const RESERVED_CODES: &[&str] = &[
    "yahoo",
    "alpha_vantage",
    "marketdata_app",
    "metal_price_api",
    "finnhub",
    "openfigi",
    "us_treasury_calc",
    "boerse_frankfurt",
    "custom_scraper",
    "manual",
    "broker",
];

pub struct CustomProviderService {
    repo: Arc<dyn CustomProviderRepository>,
    secret_store: Arc<dyn SecretStore>,
}

impl CustomProviderService {
    pub fn new(
        repo: Arc<dyn CustomProviderRepository>,
        secret_store: Arc<dyn SecretStore>,
    ) -> Self {
        Self { repo, secret_store }
    }

    /// List all custom providers with their sources.
    pub fn get_all(&self) -> Result<Vec<CustomProviderWithSources>> {
        self.repo.get_all()
    }

    /// Create a new custom provider.
    pub async fn create(&self, payload: NewCustomProvider) -> Result<CustomProviderWithSources> {
        let code = payload.code.trim().to_lowercase();
        if code.is_empty() {
            return Err(ValidationError::InvalidInput("Code cannot be empty".into()).into());
        }
        if !code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(ValidationError::InvalidInput(
                "Code must contain only lowercase letters, numbers, and hyphens".into(),
            )
            .into());
        }
        if RESERVED_CODES.contains(&code.as_str()) {
            return Err(
                ValidationError::InvalidInput(format!("Code '{}' is reserved", code)).into(),
            );
        }

        let provider = crate::quotes::provider_settings::MarketDataProviderSetting {
            id: code.clone(),
            name: payload.name.clone(),
            description: payload.description.clone().unwrap_or_default(),
            url: None,
            priority: 50,
            enabled: true,
            logo_filename: None,
            last_synced_at: None,
            last_sync_status: None,
            last_sync_error: None,
            capabilities: None,
            provider_type: Some("custom".to_string()),
        };

        self.repo.create(&provider, &payload.sources).await?;
        info!("Created custom provider: {}", code);

        let all = self.repo.get_all()?;
        all.into_iter()
            .find(|p| p.id == code)
            .ok_or_else(|| crate::Error::Unexpected("Created provider not found".into()))
    }

    /// Update an existing custom provider.
    pub async fn update(
        &self,
        provider_id: &str,
        payload: UpdateCustomProvider,
    ) -> Result<CustomProviderWithSources> {
        let existing_providers = self.repo.get_all()?;
        let existing = existing_providers
            .iter()
            .find(|p| p.id == provider_id)
            .ok_or_else(|| {
                crate::Error::from(ValidationError::InvalidInput(format!(
                    "Custom provider '{}' not found",
                    provider_id
                )))
            })?;

        let provider = crate::quotes::provider_settings::MarketDataProviderSetting {
            id: provider_id.to_string(),
            name: payload.name.unwrap_or_else(|| existing.name.clone()),
            description: payload
                .description
                .unwrap_or_else(|| existing.description.clone()),
            url: None,
            priority: payload.priority.unwrap_or(existing.priority),
            enabled: payload.enabled.unwrap_or(existing.enabled),
            logo_filename: None,
            last_synced_at: None,
            last_sync_status: None,
            last_sync_error: None,
            capabilities: None,
            provider_type: Some("custom".to_string()),
        };

        self.repo.update_provider(&provider).await?;

        if let Some(sources) = &payload.sources {
            self.repo.update_sources(provider_id, sources).await?;
        }

        info!("Updated custom provider: {}", provider_id);

        let all = self.repo.get_all()?;
        all.into_iter()
            .find(|p| p.id == provider_id)
            .ok_or_else(|| crate::Error::Unexpected("Updated provider not found".into()))
    }

    /// Delete a custom provider. Fails if it is not a user-created provider or assets reference it.
    pub async fn delete(&self, provider_id: &str) -> Result<()> {
        // Only allow deleting providers that actually belong to the user
        let exists = self
            .repo
            .get_all()?
            .into_iter()
            .any(|p| p.id == provider_id);
        if !exists {
            return Err(ValidationError::InvalidInput(format!(
                "Provider '{}' not found or is not a custom provider.",
                provider_id
            ))
            .into());
        }
        let asset_count = self.repo.get_asset_count_for_provider(provider_id)?;
        if asset_count > 0 {
            return Err(ValidationError::InvalidInput(format!(
                "Cannot delete '{}': {} asset(s) still use it as preferred provider. \
                 Change their preferred provider first, then try again.",
                provider_id, asset_count
            ))
            .into());
        }
        self.repo.delete(provider_id).await?;
        info!("Deleted custom provider: {}", provider_id);
        Ok(())
    }

    /// Test a source configuration by fetching and extracting a price.
    pub async fn test_source(&self, payload: TestSourceRequest) -> Result<TestSourceResult> {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let mut url = payload.url.replace("{SYMBOL}", &payload.symbol);
        url = url.replace("{TODAY}", &today);
        url = url.replace("{FROM}", &today);
        url = url.replace("{TO}", &today);
        if url.contains("{DATE:") {
            let re = regex::Regex::new(r"\{DATE:([^}]+)\}").unwrap();
            url = re
                .replace_all(&url, |caps: &regex::Captures| {
                    chrono::Utc::now().format(&caps[1]).to_string()
                })
                .to_string();
        }

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
            )
            .build()
            .map_err(|e| crate::Error::Unexpected(format!("HTTP client error: {}", e)))?;

        let mut headers = reqwest::header::HeaderMap::new();
        if let Some(headers_json) = &payload.headers {
            if let Ok(map) =
                serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(headers_json)
            {
                for (k, v) in map {
                    if let Some(val_str) = v.as_str() {
                        let resolved = if val_str.starts_with("__SECRET__") {
                            let key = val_str.trim_start_matches("__SECRET__");
                            self.secret_store
                                .get_secret(key)
                                .ok()
                                .flatten()
                                .unwrap_or_else(|| val_str.to_string())
                        } else {
                            val_str.to_string()
                        };
                        if let (Ok(name), Ok(value)) = (
                            reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                            reqwest::header::HeaderValue::from_str(&resolved),
                        ) {
                            headers.insert(name, value);
                        }
                    }
                }
            }
        }

        let response = match client.get(&url).headers(headers).send().await {
            Ok(resp) => resp,
            Err(e) => {
                return Ok(TestSourceResult {
                    success: false,
                    price: None,
                    currency: None,
                    date: None,
                    error: Some(format!("HTTP request failed: {}", e)),
                    raw_response: None,
                    detected_elements: None,
                    detected_tables: None,
                });
            }
        };

        let status = response.status();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Ok(TestSourceResult {
                success: false,
                price: None,
                currency: None,
                date: None,
                error: Some(format!("HTTP {}: {}", status, &body[..body.len().min(500)])),
                raw_response: Some(body),
                detected_elements: None,
                detected_tables: None,
            });
        }

        // Build path expander that handles all template variables
        let symbol = &payload.symbol;
        let expand_path = |p: &str| -> String {
            // Infer currency from URL (e.g., vs_currencies=cad → "cad")
            let currency_lower = url
                .split("vs_currenc")
                .nth(1)
                .and_then(|s| s.split('=').nth(1))
                .and_then(|s| s.split('&').next())
                .unwrap_or("usd")
                .to_string();
            let currency_upper = currency_lower.to_uppercase();
            p.replace("{SYMBOL}", symbol)
                .replace("{currency}", &currency_lower)
                .replace("{CURRENCY}", &currency_upper)
        };

        match payload.format.as_str() {
            "json" => {
                let price_path = expand_path(&payload.price_path);
                let price = extract_json_value(&body, &price_path);
                let currency = payload
                    .currency_path
                    .as_ref()
                    .map(|cp| expand_path(cp))
                    .and_then(|cp| extract_json_string(&body, &cp));
                let date = payload
                    .date_path
                    .as_ref()
                    .map(|dp| expand_path(dp))
                    .and_then(|dp| extract_json_string(&body, &dp));

                match price {
                    Some(mut p) => {
                        if let Some(factor) = payload.factor {
                            p *= factor;
                        }
                        if payload.invert == Some(true) && p != 0.0 {
                            p = 1.0 / p;
                        }
                        Ok(TestSourceResult {
                            success: true,
                            price: Some(p),
                            currency,
                            date,
                            error: None,
                            raw_response: Some(body),
                            detected_elements: None,
                            detected_tables: None,
                        })
                    }
                    None => Ok(TestSourceResult {
                        success: false,
                        price: None,
                        currency: None,
                        date: None,
                        error: Some(format!(
                            "Could not extract price using path '{}'",
                            price_path
                        )),
                        raw_response: Some(body),
                        detected_elements: None,
                        detected_tables: None,
                    }),
                }
            }
            "html" => {
                let detected = detect_html_elements(&body, payload.locale.as_deref());
                let price =
                    extract_html_value(&body, &payload.price_path, payload.locale.as_deref());
                match price {
                    Some(mut p) => {
                        if let Some(factor) = payload.factor {
                            p *= factor;
                        }
                        if payload.invert == Some(true) && p != 0.0 {
                            p = 1.0 / p;
                        }
                        Ok(TestSourceResult {
                            success: true,
                            price: Some(p),
                            currency: None,
                            date: None,
                            error: None,
                            raw_response: None,
                            detected_elements: Some(detected),
                            detected_tables: None,
                        })
                    }
                    None => Ok(TestSourceResult {
                        success: false,
                        price: None,
                        currency: None,
                        date: None,
                        error: Some(format!(
                            "Could not extract price using CSS selector '{}'",
                            payload.price_path
                        )),
                        raw_response: None,
                        detected_elements: Some(detected),
                        detected_tables: None,
                    }),
                }
            }
            "html_table" => {
                let tables = detect_html_tables(&body);
                let price = if !payload.price_path.is_empty() {
                    extract_table_value(&body, &payload.price_path, payload.locale.as_deref())
                } else {
                    None
                };

                match price {
                    Some(mut p) => {
                        if let Some(factor) = payload.factor {
                            p *= factor;
                        }
                        if payload.invert == Some(true) && p != 0.0 {
                            p = 1.0 / p;
                        }
                        Ok(TestSourceResult {
                            success: true,
                            price: Some(p),
                            currency: None,
                            date: None,
                            error: None,
                            raw_response: None,
                            detected_elements: None,
                            detected_tables: Some(tables),
                        })
                    }
                    None => Ok(TestSourceResult {
                        success: !tables.is_empty(),
                        price: None,
                        currency: None,
                        date: None,
                        error: if tables.is_empty() {
                            Some("No HTML tables found on page".to_string())
                        } else {
                            None
                        },
                        raw_response: None,
                        detected_elements: None,
                        detected_tables: Some(tables),
                    }),
                }
            }
            "csv" => match parse_csv_test(&body, &payload.price_path, payload.locale.as_deref()) {
                Some(mut p) => {
                    if let Some(factor) = payload.factor {
                        p *= factor;
                    }
                    if payload.invert == Some(true) && p != 0.0 {
                        p = 1.0 / p;
                    }
                    Ok(TestSourceResult {
                        success: true,
                        price: Some(p),
                        currency: None,
                        date: None,
                        error: None,
                        raw_response: Some(body),
                        detected_elements: None,
                        detected_tables: None,
                    })
                }
                None => Ok(TestSourceResult {
                    success: false,
                    price: None,
                    currency: None,
                    date: None,
                    error: Some(format!(
                        "Could not extract price from CSV using column '{}'",
                        payload.price_path
                    )),
                    raw_response: Some(body),
                    detected_elements: None,
                    detected_tables: None,
                }),
            },
            _ => Ok(TestSourceResult {
                success: false,
                price: None,
                currency: None,
                date: None,
                error: Some(format!("Unsupported format: {}", payload.format)),
                raw_response: None,
                detected_elements: None,
                detected_tables: None,
            }),
        }
    }
}

/// Extract a numeric value from JSON using a JSONPath expression.
fn extract_json_value(body: &str, path: &str) -> Option<f64> {
    use jsonpath_rust::JsonPathQuery;
    let json: serde_json::Value = serde_json::from_str(body).ok()?;
    let result = json.path(path).ok()?;
    // path() returns a Value::Array of matches
    let first = match &result {
        serde_json::Value::Array(arr) => arr.first()?,
        other => other,
    };
    match first {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => parse_number_string(s, None),
        _ => None,
    }
}

/// Extract a string value from JSON using a JSONPath expression.
fn extract_json_string(body: &str, path: &str) -> Option<String> {
    use jsonpath_rust::JsonPathQuery;
    let json: serde_json::Value = serde_json::from_str(body).ok()?;
    let result = json.path(path).ok()?;
    let first = match &result {
        serde_json::Value::Array(arr) => arr.first()?,
        other => other,
    };
    match first {
        serde_json::Value::String(s) => Some(s.clone()),
        other => Some(other.to_string()),
    }
}

/// Extract a numeric value from HTML using a CSS selector.
fn extract_html_value(body: &str, selector: &str, locale: Option<&str>) -> Option<f64> {
    let document = scraper::Html::parse_document(body);
    let sel = scraper::Selector::parse(selector).ok()?;
    let element = document.select(&sel).next()?;
    let text: String = element.text().collect::<String>();
    parse_number_string(text.trim(), locale)
}

/// Detect all numeric elements in an HTML page, returning structured data with
/// CSS selectors, values, labels, and HTML context snippets.
fn detect_html_elements(body: &str, locale: Option<&str>) -> Vec<DetectedHtmlElement> {
    use scraper::node::Node;

    let document = scraper::Html::parse_document(body);
    let mut results = Vec::new();
    let mut seen_selectors = std::collections::HashSet::new();

    let skip_tags: &[&str] = &[
        "script", "style", "meta", "link", "noscript", "head", "title",
    ];

    // Select all elements and check their direct text children for numbers
    let all = match scraper::Selector::parse("*") {
        Ok(s) => s,
        Err(_) => return results,
    };

    for element_ref in document.select(&all) {
        if results.len() >= 50 {
            break;
        }

        let tag = element_ref.value().name();
        if skip_tags.contains(&tag) {
            continue;
        }

        // Collect only direct text children (not descendant text)
        let mut direct_text = String::new();
        for child in element_ref.children() {
            if let Node::Text(t) = child.value() {
                direct_text.push_str(&t);
            }
        }
        let trimmed = direct_text.trim();
        if trimmed.is_empty() || trimmed.len() > 30 {
            continue;
        }

        let value = match parse_number_string(trimmed, locale) {
            Some(v) => v,
            None => continue,
        };

        let selector = build_css_selector(element_ref);
        if seen_selectors.contains(&selector) {
            continue;
        }
        seen_selectors.insert(selector.clone());

        let label = find_context_label(element_ref);
        let html_context = extract_html_context(element_ref);

        results.push(DetectedHtmlElement {
            selector,
            value,
            text: trimmed.to_string(),
            label,
            html_context,
        });
    }

    results
}

/// Build a CSS selector for an element using id, classes, and parent context.
fn build_css_selector(el: scraper::ElementRef) -> String {
    let tag = el.value().name().to_string();

    if let Some(id) = el.value().id() {
        return format!("#{}", css_escape_ident(id));
    }

    let classes: Vec<&str> = el
        .value()
        .classes()
        .filter(|c| c.len() > 1)
        .take(3)
        .collect();
    let self_part = if !classes.is_empty() {
        format!(
            "{}.{}",
            tag,
            classes
                .iter()
                .map(|c| css_escape_ident(c))
                .collect::<Vec<_>>()
                .join(".")
        )
    } else {
        tag.clone()
    };

    // Check parent for more specific selector
    if let Some(parent_node) = el.parent() {
        if let Some(parent_ref) = scraper::ElementRef::wrap(parent_node) {
            let parent_tag = parent_ref.value().name();
            if parent_tag != "body" && parent_tag != "html" {
                if let Some(pid) = parent_ref.value().id() {
                    return format!("#{} > {}", css_escape_ident(pid), self_part);
                }

                let parent_classes: Vec<&str> = parent_ref
                    .value()
                    .classes()
                    .filter(|c| c.len() > 1)
                    .take(2)
                    .collect();
                if !parent_classes.is_empty() {
                    return format!(
                        "{}.{} > {}",
                        parent_tag,
                        parent_classes
                            .iter()
                            .map(|c| css_escape_ident(c))
                            .collect::<Vec<_>>()
                            .join("."),
                        self_part
                    );
                }

                return format!("{} > {}", parent_tag, self_part);
            }
        }
    }

    self_part
}

/// Find nearby text that describes what a numeric element represents.
fn find_context_label(el: scraper::ElementRef) -> String {
    use scraper::node::Node;

    // 1. Previous sibling element's text
    let mut prev = el.prev_sibling();
    while let Some(node) = prev {
        if let Some(elem) = scraper::ElementRef::wrap(node) {
            let text: String = elem.text().collect::<String>();
            let trimmed = text.trim();
            if !trimmed.is_empty()
                && trimmed.len() < 40
                && !trimmed.chars().next().map_or(false, |c| c.is_ascii_digit())
            {
                return trimmed.to_string();
            }
            break;
        }
        // Skip text nodes between elements
        if let Node::Text(t) = node.value() {
            let t = t.trim();
            if !t.is_empty()
                && t.len() < 40
                && !t.chars().next().map_or(false, |c| c.is_ascii_digit())
            {
                return t.to_string();
            }
        }
        prev = node.prev_sibling();
    }

    // 2. Table context: row header
    let in_td = el.value().name() == "td"
        || el
            .parent()
            .and_then(scraper::ElementRef::wrap)
            .map_or(false, |p| p.value().name() == "td");
    if in_td {
        // Walk up to find the <tr>
        let mut node = el.parent();
        while let Some(n) = node {
            if let Some(elem) = scraper::ElementRef::wrap(n) {
                if elem.value().name() == "tr" {
                    // Get first cell text (skip if it's the element itself)
                    if let Ok(th_sel) = scraper::Selector::parse("th, td:first-child") {
                        if let Some(first_cell) = elem.select(&th_sel).next() {
                            if first_cell.id() != el.id() {
                                let text: String = first_cell.text().collect::<String>();
                                let trimmed = text.trim();
                                if !trimmed.is_empty() && trimmed.len() < 40 {
                                    return trimmed.to_string();
                                }
                            }
                        }
                    }
                    break;
                }
            }
            node = n.parent();
        }
    }

    // 3. Parent's first non-numeric child text
    if let Some(parent_node) = el.parent() {
        for child in parent_node.children() {
            if child.id() == el.id() {
                continue;
            }
            if let Some(child_el) = scraper::ElementRef::wrap(child) {
                let text: String = child_el.text().collect::<String>();
                let trimmed = text.trim();
                if !trimmed.is_empty()
                    && trimmed.len() < 40
                    && !trimmed.chars().next().map_or(false, |c| c.is_ascii_digit())
                {
                    return trimmed.to_string();
                }
            }
            break;
        }
    }

    String::new()
}

/// Extract a HTML snippet around the element for context preview.
/// Walks up to the grandparent to show enough DOM structure for users
/// to understand the right selector.
fn extract_html_context(el: scraper::ElementRef) -> String {
    let skip = |name: &str| name == "body" || name == "html";

    // Try grandparent first for broader context
    if let Some(parent_node) = el.parent() {
        if let Some(parent_ref) = scraper::ElementRef::wrap(parent_node) {
            if !skip(parent_ref.value().name()) {
                if let Some(gp_node) = parent_ref.parent() {
                    if let Some(gp_ref) = scraper::ElementRef::wrap(gp_node) {
                        if !skip(gp_ref.value().name()) {
                            let html = gp_ref.html();
                            return truncate_str(&html, 500);
                        }
                    }
                }
                // Grandparent is body/html — use parent
                return truncate_str(&parent_ref.html(), 500);
            }
        }
    }
    // Fall back to element's own HTML
    truncate_str(&el.html(), 500)
}

/// Truncate a string at a character boundary, appending "..." if truncated.
fn truncate_str(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s.to_string();
    }
    // Walk backward from max_bytes to find a char boundary
    let end = s[..=max_bytes.min(s.len() - 1)]
        .char_indices()
        .rev()
        .next()
        .map_or(0, |(i, _)| i);
    format!("{}...", &s[..end])
}

/// Escape a CSS identifier (class name, id) for use in selectors.
fn css_escape_ident(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for (i, c) in s.chars().enumerate() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            if i == 0 && c.is_ascii_digit() {
                result.push('\\');
            }
            result.push(c);
        } else {
            result.push('\\');
            result.push(c);
        }
    }
    result
}

/// Parse a number string, handling locale-specific formatting.
/// Strips currency symbols, whitespace, and normalizes decimal separators.
pub fn parse_number_string(s: &str, locale: Option<&str>) -> Option<f64> {
    let cleaned = s.trim();
    if cleaned.is_empty() {
        return None;
    }

    // Strip currency symbols and whitespace
    let stripped: String = cleaned
        .chars()
        .filter(|c| {
            !matches!(
                c,
                '$' | '€' | '£' | '¥' | '₹' | '₽' | '₿' | '%' | '+' | '\u{00a0}'
            ) && !c.is_whitespace()
        })
        .collect();

    if stripped.is_empty() || !stripped.starts_with(|c: char| c.is_ascii_digit() || c == '-') {
        return None;
    }

    let normalized = match locale {
        Some(l)
            if l.starts_with("de")
                || l.starts_with("fr")
                || l.starts_with("es")
                || l.starts_with("it") =>
        {
            // European: 1.234,56 → 1234.56
            stripped.replace('.', "").replace(',', ".")
        }
        _ => {
            // Auto-detect European format: comma followed by 1-2 digits at end (e.g. "1.234,56")
            let has_european_comma = stripped.rfind(',').map_or(false, |pos| {
                let after = stripped.len() - pos - 1;
                (1..=2).contains(&after) && stripped[pos + 1..].chars().all(|c| c.is_ascii_digit())
            });
            let has_trailing_dot = stripped.rfind('.').map_or(false, |pos| {
                let after = stripped.len() - pos - 1;
                (1..=2).contains(&after) && stripped[pos + 1..].chars().all(|c| c.is_ascii_digit())
            });

            if has_european_comma && !has_trailing_dot {
                stripped.replace('.', "").replace(',', ".")
            } else if stripped.contains(',') && !stripped.contains('.') {
                // Check if comma is a thousands separator (exactly 3 digits after last comma)
                let last_comma = stripped.rfind(',').unwrap();
                let digits_after = stripped.len() - last_comma - 1;
                if digits_after == 3
                    && stripped[last_comma + 1..]
                        .chars()
                        .all(|c| c.is_ascii_digit())
                {
                    stripped.replace(',', "")
                } else {
                    stripped.replace(',', ".")
                }
            } else {
                stripped.replace(',', "")
            }
        }
    };

    let numeric: String = normalized
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == '-')
        .collect();

    numeric.parse::<f64>().ok()
}

// ─── HTML table detection ────────────────────────────────────────────────────

/// Role keywords for auto-detecting column purpose from header text.
const CLOSE_KEYWORDS: &[&str] = &[
    "close", "price", "last", "schluss", "clôture", "chiusura", "kurs", "precio",
];
const DATE_KEYWORDS: &[&str] = &["date", "datum", "fecha", "data", "tag"];
const HIGH_KEYWORDS: &[&str] = &["high", "hoch", "max", "alto", "máximo"];
const LOW_KEYWORDS: &[&str] = &["low", "tief", "min", "bajo", "basso", "mínimo"];
const VOLUME_KEYWORDS: &[&str] = &["volume", "vol", "volumen"];
const OPEN_KEYWORDS: &[&str] = &["open", "apertura", "ouverture", "eröffnung"];

fn detect_column_role(header: &str) -> Option<String> {
    let lower = header.to_lowercase();
    if DATE_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return Some("date".to_string());
    }
    if CLOSE_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return Some("close".to_string());
    }
    if HIGH_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return Some("high".to_string());
    }
    if LOW_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return Some("low".to_string());
    }
    if VOLUME_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return Some("volume".to_string());
    }
    if OPEN_KEYWORDS.iter().any(|k| lower.contains(k)) {
        return Some("open".to_string());
    }
    None
}

/// Detect HTML tables on a page, extracting column metadata and sample rows.
fn detect_html_tables(body: &str) -> Vec<DetectedHtmlTable> {
    let document = scraper::Html::parse_document(body);
    let table_sel = match scraper::Selector::parse("table") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let tr_sel = scraper::Selector::parse("tr").unwrap();
    let th_sel = scraper::Selector::parse("th").unwrap();
    let td_sel = scraper::Selector::parse("td").unwrap();

    let mut tables = Vec::new();
    for (table_idx, table_el) in document.select(&table_sel).take(10).enumerate() {
        // Extract headers: try <thead><tr><th> first, then first <tr> cells
        let mut headers: Vec<String> = Vec::new();
        if let Ok(thead_sel) = scraper::Selector::parse("thead th") {
            headers = table_el
                .select(&thead_sel)
                .map(|el| el.text().collect::<String>().trim().to_string())
                .collect();
        }

        let mut rows: Vec<Vec<String>> = Vec::new();
        let mut body_start = 0;

        for (row_idx, tr) in table_el.select(&tr_sel).enumerate() {
            let cells: Vec<String> = tr
                .select(&td_sel)
                .map(|el| el.text().collect::<String>().trim().to_string())
                .collect();

            if cells.is_empty() {
                // This row has no <td>s — might be a header row with <th>s
                if headers.is_empty() {
                    headers = tr
                        .select(&th_sel)
                        .map(|el| el.text().collect::<String>().trim().to_string())
                        .collect();
                }
                continue;
            }

            // If no headers found yet, use first data row as headers
            if headers.is_empty() && row_idx == 0 {
                headers = cells;
                body_start = 1;
                continue;
            }

            if rows.len() < 5 {
                rows.push(cells.clone());
            }
        }

        // Skip tables with fewer than 2 columns or 1 row
        if headers.len() < 2 && rows.is_empty() {
            continue;
        }

        let row_count = table_el
            .select(&tr_sel)
            .count()
            .saturating_sub(body_start + 1);

        let columns: Vec<DetectedColumn> = headers
            .iter()
            .enumerate()
            .map(|(i, h)| DetectedColumn {
                index: i,
                header: h.clone(),
                role: detect_column_role(h),
            })
            .collect();

        tables.push(DetectedHtmlTable {
            index: table_idx,
            columns,
            row_count: row_count.max(rows.len()),
            sample_rows: rows,
        });
    }

    tables
}

/// Extract a single numeric value from an HTML table using "table_idx:col_idx" path.
fn extract_table_value(body: &str, path: &str, locale: Option<&str>) -> Option<f64> {
    let parts: Vec<&str> = path.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    let table_idx: usize = parts[0].parse().ok()?;
    let col_idx: usize = parts[1].parse().ok()?;

    let document = scraper::Html::parse_document(body);
    let table_sel = scraper::Selector::parse("table").ok()?;
    let table_el = document.select(&table_sel).nth(table_idx)?;

    let tr_sel = scraper::Selector::parse("tr").ok()?;
    let td_sel = scraper::Selector::parse("td").ok()?;

    // Find first row with <td> cells
    for tr in table_el.select(&tr_sel) {
        let cells: Vec<String> = tr
            .select(&td_sel)
            .map(|el| el.text().collect::<String>().trim().to_string())
            .collect();
        if cells.is_empty() || col_idx >= cells.len() {
            continue;
        }
        return parse_number_string(&cells[col_idx], locale);
    }
    None
}

// ─── CSV parsing ─────────────────────────────────────────────────────────────

/// Extract a price from CSV data for test_source. Uses last row.
fn parse_csv_test(body: &str, price_col: &str, locale: Option<&str>) -> Option<f64> {
    let records = parse_csv_records(body)?;
    if records.is_empty() {
        return None;
    }
    let (headers, data_rows) = (&records[0], &records[1..]);
    let last_row = data_rows.last()?;

    let col_idx = resolve_csv_column(headers, price_col)?;
    let val = last_row.get(col_idx)?;
    parse_number_string(val, locale)
}

/// Parse CSV body into rows, auto-detecting delimiter (; vs ,).
pub fn parse_csv_records(body: &str) -> Option<Vec<Vec<String>>> {
    // Try comma first
    let records = try_csv_parse(body, b',');
    if let Some(ref rows) = records {
        if rows.first().map_or(false, |r| r.len() > 1) {
            return records;
        }
    }
    // Fall back to semicolon
    try_csv_parse(body, b';')
}

fn try_csv_parse(body: &str, delimiter: u8) -> Option<Vec<Vec<String>>> {
    let mut rdr = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(false)
        .flexible(true)
        .from_reader(body.as_bytes());

    let rows: Vec<Vec<String>> = rdr
        .records()
        .filter_map(|r| r.ok())
        .map(|r| r.iter().map(|f| f.to_string()).collect())
        .collect();

    if rows.is_empty() {
        None
    } else {
        Some(rows)
    }
}

/// Resolve a column identifier (name or 0-based index) to a column index.
pub fn resolve_csv_column(headers: &[String], col: &str) -> Option<usize> {
    // Try as index first
    if let Ok(idx) = col.parse::<usize>() {
        return if idx < headers.len() { Some(idx) } else { None };
    }
    // Try as header name (case-insensitive)
    let col_lower = col.to_lowercase();
    headers
        .iter()
        .position(|h| h.trim().to_lowercase() == col_lower)
}

/// Detect the HTML lang attribute as a locale fallback.
pub fn detect_html_locale(body: &str) -> Option<String> {
    let document = scraper::Html::parse_document(body);
    let sel = scraper::Selector::parse("html").ok()?;
    let el = document.select(&sel).next()?;
    let lang = el.value().attr("lang")?;
    Some(lang[..2.min(lang.len())].to_lowercase())
}
