//! Custom scraper provider — runtime dispatch to user-defined JSON/HTML sources.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use log::debug;
use rust_decimal::Decimal;

use crate::custom_provider::service::{
    detect_html_locale, parse_csv_records, parse_number_string, resolve_csv_column,
};
use crate::custom_provider::store::CustomProviderRepository;
use crate::custom_provider::CustomProviderSource;
use crate::quotes::constants::DATA_SOURCE_CUSTOM_SCRAPER;
use crate::secrets::SecretStore;

use wealthfolio_market_data::errors::MarketDataError;
use wealthfolio_market_data::{
    Coverage, InstrumentKind, MarketDataProvider, ProviderCapabilities, ProviderInstrument,
    Quote as MarketQuote, QuoteContext, RateLimit,
};

/// Provider that dispatches to user-defined custom source configurations.
pub struct CustomScraperProvider {
    repo: Arc<dyn CustomProviderRepository>,
    secret_store: Arc<dyn SecretStore>,
    client: reqwest::Client,
}

impl CustomScraperProvider {
    pub fn new(
        repo: Arc<dyn CustomProviderRepository>,
        secret_store: Arc<dyn SecretStore>,
    ) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
            )
            .build()
            .unwrap_or_default();
        Self {
            repo,
            secret_store,
            client,
        }
    }

    /// Expand URL template variables.
    fn expand_url(
        &self,
        url: &str,
        symbol: &str,
        context: Option<&QuoteContext>,
        from: Option<&str>,
        to: Option<&str>,
    ) -> String {
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let mut expanded = url
            .replace("{SYMBOL}", symbol)
            .replace("{TODAY}", &today)
            .replace("{FROM}", from.unwrap_or(&today))
            .replace("{TO}", to.unwrap_or(&today));

        // {ISIN} — from Bond instrument or symbol if it matches ISIN pattern
        if expanded.contains("{ISIN}") {
            let isin = context
                .and_then(|ctx| match &ctx.instrument {
                    wealthfolio_market_data::InstrumentId::Bond { isin } => {
                        Some(isin.as_ref().to_string())
                    }
                    _ => None,
                })
                .unwrap_or_else(|| symbol.to_string());
            expanded = expanded.replace("{ISIN}", &isin);
        }

        // {CURRENCY} (uppercase) and {currency} (lowercase) — from currency_hint
        if expanded.contains("{CURRENCY}") || expanded.contains("{currency}") {
            let currency = context
                .and_then(|ctx| ctx.currency_hint.as_deref())
                .unwrap_or("USD");
            expanded = expanded
                .replace("{currency}", &currency.to_lowercase())
                .replace("{CURRENCY}", currency);
        }

        // {MIC} — exchange MIC code from Equity instrument
        if expanded.contains("{MIC}") {
            let mic = context
                .and_then(|ctx| match &ctx.instrument {
                    wealthfolio_market_data::InstrumentId::Equity { mic, .. } => {
                        mic.as_ref().map(|m| m.as_ref().to_string())
                    }
                    _ => None,
                })
                .unwrap_or_default();
            expanded = expanded.replace("{MIC}", &mic);
        }

        // {DATE:format} — current date with custom format
        if expanded.contains("{DATE:") {
            let re = regex::Regex::new(r"\{DATE:([^}]+)\}").unwrap();
            expanded = re
                .replace_all(&expanded, |caps: &regex::Captures| {
                    Utc::now().format(&caps[1]).to_string()
                })
                .to_string();
        }

        expanded
    }

    /// Build HTTP headers from source config, resolving secrets.
    fn build_headers(&self, source: &CustomProviderSource) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        if let Some(headers_json) = &source.headers {
            if let Ok(map) =
                serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(headers_json)
            {
                for (k, v) in map {
                    if let Some(val_str) = v.as_str() {
                        let resolved = self.resolve_secret(val_str);
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
        headers
    }

    /// Fetch body from URL with simple 1-retry on 5xx/network errors.
    async fn fetch_body(
        &self,
        url: &str,
        headers: reqwest::header::HeaderMap,
    ) -> Result<String, MarketDataError> {
        let do_fetch = |hdrs: reqwest::header::HeaderMap| self.client.get(url).headers(hdrs).send();

        let response = match do_fetch(headers.clone()).await {
            Ok(resp) if resp.status().is_server_error() => {
                debug!("CustomScraper: 5xx from {}, retrying once", url);
                tokio::time::sleep(Duration::from_secs(1)).await;
                do_fetch(headers).await.map_err(MarketDataError::Network)?
            }
            Ok(resp) => resp,
            Err(_e) => {
                debug!("CustomScraper: network error from {}, retrying once", url);
                tokio::time::sleep(Duration::from_secs(1)).await;
                do_fetch(headers).await.map_err(MarketDataError::Network)?
            }
        };

        if !response.status().is_success() {
            return Err(MarketDataError::ProviderError {
                provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                message: format!("HTTP {}", response.status()),
            });
        }

        response.text().await.map_err(MarketDataError::Network)
    }

    /// Load and execute a source config, returning a single quote.
    async fn fetch_from_source(
        &self,
        source: &CustomProviderSource,
        symbol: &str,
        currency_hint: Option<&str>,
        context: Option<&QuoteContext>,
    ) -> Result<MarketQuote, MarketDataError> {
        let quotes = self
            .fetch_from_source_with_dates(source, symbol, currency_hint, context, None, None)
            .await?;
        quotes
            .into_iter()
            .next()
            .ok_or_else(|| MarketDataError::ProviderError {
                provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                message: format!("No quote extracted for symbol '{}'", symbol),
            })
    }

    /// Load and execute a source config, returning one or more quotes.
    async fn fetch_from_source_with_dates(
        &self,
        source: &CustomProviderSource,
        symbol: &str,
        currency_hint: Option<&str>,
        context: Option<&QuoteContext>,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<Vec<MarketQuote>, MarketDataError> {
        // Default price fallback — if URL is empty, return static price
        if source.url.is_empty() {
            if let Some(price) = source.default_price {
                let close = to_decimal(price);
                let currency = currency_hint.unwrap_or("USD").to_string();
                let src = format!("{}:{}", DATA_SOURCE_CUSTOM_SCRAPER, source.provider_id);
                return Ok(vec![MarketQuote::new(Utc::now(), close, currency, src)]);
            }
            return Err(MarketDataError::ProviderError {
                provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                message: "No URL and no default_price configured".to_string(),
            });
        }

        let url = self.expand_url(&source.url, symbol, context, from, to);
        let headers = self.build_headers(source);

        debug!("CustomScraper: fetching {} for symbol '{}'", url, symbol);

        let body = match self.fetch_body(&url, headers).await {
            Ok(b) => b,
            Err(e) => {
                // Fall back to default_price on fetch failure
                if let Some(price) = source.default_price {
                    let close = to_decimal(price);
                    let currency = currency_hint.unwrap_or("USD").to_string();
                    let src = format!("{}:{}", DATA_SOURCE_CUSTOM_SCRAPER, source.provider_id);
                    return Ok(vec![MarketQuote::new(Utc::now(), close, currency, src)]);
                }
                return Err(e);
            }
        };

        let currency = resolve_currency(source, symbol, currency_hint, &body);

        // Auto-detect locale from HTML lang if not explicitly set
        let locale = source.locale.as_deref().map(|s| s.to_string()).or_else(|| {
            if matches!(source.format.as_str(), "html" | "html_table") {
                detect_html_locale(&body)
            } else {
                None
            }
        });
        let locale_ref = locale.as_deref();

        match source.format.as_str() {
            "html_table" => {
                let rows = extract_table_rows(&body, source, locale_ref);
                if rows.is_empty() {
                    return Err(MarketDataError::ProviderError {
                        provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                        message: format!(
                            "No rows extracted from HTML table for symbol '{}'",
                            symbol
                        ),
                    });
                }
                Ok(rows_to_quotes(rows, source, &currency))
            }
            "csv" => {
                let rows = extract_csv_rows(&body, source, locale_ref);
                if rows.is_empty() {
                    return Err(MarketDataError::ProviderError {
                        provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                        message: format!("No rows extracted from CSV for symbol '{}'", symbol),
                    });
                }
                Ok(rows_to_quotes(rows, source, &currency))
            }
            "json" => {
                let rows = extract_json_rows(&body, source, symbol, currency_hint, locale_ref);
                if rows.is_empty() {
                    return Err(MarketDataError::ProviderError {
                        provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                        message: format!(
                            "Could not extract price from path '{}' for symbol '{}'",
                            source.price_path, symbol
                        ),
                    });
                }
                Ok(rows_to_quotes(rows, source, &currency))
            }
            "html" => {
                let price =
                    extract_html_value(&body, &source.price_path, locale_ref).ok_or_else(|| {
                        MarketDataError::ProviderError {
                            provider: format!(
                                "{}:{}",
                                DATA_SOURCE_CUSTOM_SCRAPER, source.provider_id
                            ),
                            message: format!(
                                "Could not extract price using CSS selector '{}' for symbol '{}'",
                                source.price_path, symbol
                            ),
                        }
                    })?;

                let close = apply_factor_invert(price, source);
                let high = source
                    .high_path
                    .as_ref()
                    .and_then(|p| extract_html_value(&body, p, locale_ref))
                    .map(|v| apply_factor_invert(v, source));
                let low = source
                    .low_path
                    .as_ref()
                    .and_then(|p| extract_html_value(&body, p, locale_ref))
                    .map(|v| apply_factor_invert(v, source));
                let volume = source
                    .volume_path
                    .as_ref()
                    .and_then(|p| extract_html_value(&body, p, locale_ref));

                let src = format!("{}:{}", DATA_SOURCE_CUSTOM_SCRAPER, source.provider_id);
                let mut quote = MarketQuote::new(Utc::now(), to_decimal(close), currency, src);
                quote.high = high.map(to_decimal);
                quote.low = low.map(to_decimal);
                quote.volume = volume.map(to_decimal);
                Ok(vec![quote])
            }
            _ => Err(MarketDataError::ProviderError {
                provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                message: format!("Unsupported format: {}", source.format),
            }),
        }
    }

    /// Resolve __SECRET__ placeholders in header values.
    fn resolve_secret(&self, val: &str) -> String {
        if val.starts_with("__SECRET__") {
            let key = val.trim_start_matches("__SECRET__");
            self.secret_store
                .get_secret(key)
                .ok()
                .flatten()
                .unwrap_or_else(|| val.to_string())
        } else {
            val.to_string()
        }
    }
}

#[async_trait]
impl MarketDataProvider for CustomScraperProvider {
    fn id(&self) -> &'static str {
        DATA_SOURCE_CUSTOM_SCRAPER
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            instrument_kinds: &[
                InstrumentKind::Equity,
                InstrumentKind::Crypto,
                InstrumentKind::Fx,
                InstrumentKind::Metal,
                InstrumentKind::Bond,
                InstrumentKind::Option,
            ],
            coverage: Coverage::global_best_effort(),
            supports_latest: true,
            supports_historical: true,
            supports_search: false,
            supports_profile: false,
        }
    }

    fn rate_limit(&self) -> RateLimit {
        RateLimit {
            requests_per_minute: 30,
            max_concurrency: 2,
            min_delay: Duration::from_millis(500),
        }
    }

    async fn get_latest_quote(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
    ) -> Result<MarketQuote, MarketDataError> {
        let symbol = match &instrument {
            ProviderInstrument::EquitySymbol { symbol } => symbol.to_string(),
            _ => {
                return Err(MarketDataError::ProviderError {
                    provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                    message: "Unexpected instrument type".to_string(),
                })
            }
        };

        let sources = self.find_sources(context, "latest")?;
        let currency_hint = context.currency_hint.as_deref();

        let mut last_err = None;
        for source in &sources {
            let sym = Self::resolve_symbol(context, source, &symbol);
            match self
                .fetch_from_source(source, &sym, currency_hint, Some(context))
                .await
            {
                Ok(quote) => return Ok(quote),
                Err(e) => {
                    log::debug!(
                        "CustomScraper [{}]: failed for symbol '{}': {}",
                        source.provider_id,
                        sym,
                        e
                    );
                    last_err = Some((source.provider_id.clone(), e));
                }
            }
        }

        let (pid, e) = last_err.unwrap();
        Err(MarketDataError::ProviderError {
            provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
            message: format!("[{}] {}", pid, extract_inner_message(&e)),
        })
    }

    async fn get_historical_quotes(
        &self,
        context: &QuoteContext,
        instrument: ProviderInstrument,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
    ) -> Result<Vec<MarketQuote>, MarketDataError> {
        let symbol = match &instrument {
            ProviderInstrument::EquitySymbol { symbol } => symbol.to_string(),
            _ => {
                return Err(MarketDataError::ProviderError {
                    provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                    message: "Unexpected instrument type".to_string(),
                })
            }
        };

        // Try historical sources first, fall back to latest
        let historical_sources = self.find_sources(context, "historical").ok();
        let currency_hint = context.currency_hint.as_deref();

        if let Some(sources) = historical_sources {
            let from_str = start.format("%Y-%m-%d").to_string();
            let to_str = end.format("%Y-%m-%d").to_string();
            let mut last_err = None;
            for source in &sources {
                let sym = Self::resolve_symbol(context, source, &symbol);
                match self
                    .fetch_from_source_with_dates(
                        source,
                        &sym,
                        currency_hint,
                        Some(context),
                        Some(&from_str),
                        Some(&to_str),
                    )
                    .await
                {
                    Ok(quotes) => return Ok(quotes),
                    Err(e) => {
                        log::debug!(
                            "CustomScraper [{}]: historical failed for '{}': {}",
                            source.provider_id,
                            sym,
                            e
                        );
                        last_err = Some((source.provider_id.clone(), e));
                    }
                }
            }
            if let Some((pid, e)) = last_err {
                return Err(MarketDataError::ProviderError {
                    provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                    message: format!("[{}] {}", pid, extract_inner_message(&e)),
                });
            }
        }

        // Fall back to latest sources — returns a single-element vec
        let latest_sources = self.find_sources(context, "latest")?;
        let mut last_err = None;
        for source in &latest_sources {
            let sym = Self::resolve_symbol(context, source, &symbol);
            match self
                .fetch_from_source(source, &sym, currency_hint, Some(context))
                .await
            {
                Ok(quote) => return Ok(vec![quote]),
                Err(e) => {
                    log::debug!(
                        "CustomScraper [{}]: latest fallback failed for '{}': {}",
                        source.provider_id,
                        sym,
                        e
                    );
                    last_err = Some((source.provider_id.clone(), e));
                }
            }
        }

        let (pid, e) = last_err.unwrap();
        Err(MarketDataError::ProviderError {
            provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
            message: format!("[{}] {}", pid, extract_inner_message(&e)),
        })
    }
}

impl CustomScraperProvider {
    /// Find candidate sources for the given kind.
    /// If `custom_provider_code` is set, returns that single source.
    /// Otherwise, returns sources from all enabled custom providers (tried in order).
    fn find_sources(
        &self,
        context: &QuoteContext,
        kind: &str,
    ) -> Result<Vec<CustomProviderSource>, MarketDataError> {
        // Explicit provider code — use it directly
        if let Some(code) = context.custom_provider_code.as_deref() {
            let source = self
                .repo
                .get_source_by_kind(code, kind)
                .map_err(|e| MarketDataError::ProviderError {
                    provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                    message: format!("Failed to load source config: {}", e),
                })?
                .ok_or_else(|| MarketDataError::ProviderError {
                    provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                    message: format!("No '{}' source configured for provider '{}'", kind, code),
                })?;
            return Ok(vec![source]);
        }

        // No explicit code — collect sources from all enabled custom providers
        let providers = self
            .repo
            .get_all()
            .map_err(|e| MarketDataError::ProviderError {
                provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                message: format!("Failed to list custom providers: {}", e),
            })?;

        // Only include sources whose URL contains {SYMBOL} — those are general-purpose.
        // Sources without {SYMBOL} are asset-specific and require explicit custom_provider_code.
        let sources: Vec<CustomProviderSource> = providers
            .into_iter()
            .filter(|p| p.enabled)
            .flat_map(|p| p.sources.into_iter().filter(|s| s.kind == kind))
            .filter(|s| s.url.contains("{SYMBOL}"))
            .collect();

        if sources.is_empty() {
            return Err(MarketDataError::ProviderError {
                provider: DATA_SOURCE_CUSTOM_SCRAPER.to_string(),
                message: format!("No enabled custom provider has a '{}' source", kind),
            });
        }

        Ok(sources)
    }

    /// Resolve the symbol for a specific custom provider source.
    /// Checks overrides keyed as `CUSTOM:<provider_id>` first, then falls back to the default symbol.
    fn resolve_symbol(
        context: &QuoteContext,
        source: &CustomProviderSource,
        default_symbol: &str,
    ) -> String {
        let override_key = format!("CUSTOM:{}", source.provider_id);
        if let Some(overrides) = &context.overrides {
            if let Some(instrument) = overrides.get(&override_key) {
                if let ProviderInstrument::EquitySymbol { symbol } = instrument {
                    return symbol.to_string();
                }
            }
        }
        default_symbol.to_string()
    }
}

// ─── Extracted row type ──────────────────────────────────────────────────────

struct ExtractedRow {
    date: Option<NaiveDate>,
    close: f64,
    high: Option<f64>,
    low: Option<f64>,
    volume: Option<f64>,
}

// ─── Conversion helpers ──────────────────────────────────────────────────────

fn to_decimal(v: f64) -> Decimal {
    Decimal::try_from(v)
        .or_else(|_| Decimal::from_f64_retain(v).ok_or(()))
        .unwrap_or_default()
}

/// Extract the inner message from a MarketDataError, avoiding redundant "Provider error: X -" wrapping.
fn extract_inner_message(e: &MarketDataError) -> String {
    match e {
        MarketDataError::ProviderError { message, .. } => message.clone(),
        other => other.to_string(),
    }
}

fn apply_factor_invert(mut price: f64, source: &CustomProviderSource) -> f64 {
    if let Some(factor) = source.factor {
        price *= factor;
    }
    if source.invert == Some(true) && price != 0.0 {
        price = 1.0 / price;
    }
    price
}

fn resolve_currency(
    source: &CustomProviderSource,
    symbol: &str,
    currency_hint: Option<&str>,
    body: &str,
) -> String {
    if source.format == "json" {
        source
            .currency_path
            .as_ref()
            .and_then(|cp| {
                let cp = cp.replace("{SYMBOL}", symbol);
                extract_json_string(body, &cp)
            })
            .or_else(|| currency_hint.map(|s| s.to_string()))
            .unwrap_or_else(|| "USD".to_string())
    } else {
        currency_hint
            .map(|s| s.to_string())
            .unwrap_or_else(|| "USD".to_string())
    }
}

fn rows_to_quotes(
    rows: Vec<ExtractedRow>,
    source: &CustomProviderSource,
    currency: &str,
) -> Vec<MarketQuote> {
    rows.into_iter()
        .map(|row| {
            let close = apply_factor_invert(row.close, source);
            let ts = row
                .date
                .and_then(|d| parse_date_to_utc(d, source.date_timezone.as_deref()))
                .unwrap_or_else(Utc::now);

            let src = format!("{}:{}", DATA_SOURCE_CUSTOM_SCRAPER, source.provider_id);
            let mut quote = MarketQuote::new(ts, to_decimal(close), currency.to_string(), src);
            quote.high = row.high.map(|v| to_decimal(apply_factor_invert(v, source)));
            quote.low = row.low.map(|v| to_decimal(apply_factor_invert(v, source)));
            quote.volume = row.volume.map(to_decimal);
            quote
        })
        .collect()
}

/// Convert a NaiveDate to DateTime<Utc>, optionally applying a timezone.
fn parse_date_to_utc(date: NaiveDate, tz_name: Option<&str>) -> Option<DateTime<Utc>> {
    let noon = date.and_hms_opt(12, 0, 0)?;
    if let Some(tz_str) = tz_name {
        if let Ok(tz) = tz_str.parse::<chrono_tz::Tz>() {
            return tz
                .from_local_datetime(&noon)
                .single()
                .map(|dt| dt.with_timezone(&Utc));
        }
    }
    Some(DateTime::<Utc>::from_naive_utc_and_offset(noon, Utc))
}

// ─── Date parsing ────────────────────────────────────────────────────────────

const COMMON_DATE_FORMATS: &[&str] = &[
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d.%m.%Y",
    "%d-%m-%Y",
    "%B %d, %Y",
    "%A, %B %d, %Y",
    "%b %d, %Y",
    "%a, %b %d, %Y",
    "%d %b %Y",
    "%d %B %Y",
    "%Y%m%d",
];

fn parse_date(s: &str, explicit_format: Option<&str>) -> Option<NaiveDate> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if let Some(fmt) = explicit_format {
        return NaiveDate::parse_from_str(s, fmt).ok();
    }
    // Try unix timestamp (seconds or milliseconds)
    if let Ok(n) = s.parse::<i64>() {
        let secs = if n > 9_999_999_999 { n / 1000 } else { n };
        if let Some(dt) = DateTime::from_timestamp(secs, 0) {
            return Some(dt.naive_utc().date());
        }
    }
    for fmt in COMMON_DATE_FORMATS {
        if let Ok(d) = NaiveDate::parse_from_str(s, fmt) {
            return Some(d);
        }
    }
    None
}

/// Extract text from a table cell, preferring the first child element's text
/// to avoid concatenating multiple responsive variants (e.g., full and abbreviated dates).
fn extract_first_text_content(el: scraper::ElementRef) -> String {
    // If the cell has child elements, use the first one's text
    let child_sel = scraper::Selector::parse("*").unwrap();
    if let Some(first_child) = el.select(&child_sel).next() {
        let text = first_child.text().collect::<String>();
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    // Fall back to direct text content
    el.text().collect::<String>().trim().to_string()
}

// ─── HTML table multi-row extraction ─────────────────────────────────────────

fn extract_table_rows(
    body: &str,
    source: &CustomProviderSource,
    locale: Option<&str>,
) -> Vec<ExtractedRow> {
    let document = scraper::Html::parse_document(body);
    let table_sel = match scraper::Selector::parse("table") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let tr_sel = scraper::Selector::parse("tr").unwrap();
    let td_sel = scraper::Selector::parse("td").unwrap();

    let (table_idx, close_col) = match parse_table_col_path(&source.price_path) {
        Some(v) => v,
        None => return Vec::new(),
    };
    let date_col = source
        .date_path
        .as_ref()
        .and_then(|p| parse_table_col_path(p))
        .map(|(_, c)| c);
    let high_col = source
        .high_path
        .as_ref()
        .and_then(|p| parse_table_col_path(p))
        .map(|(_, c)| c);
    let low_col = source
        .low_path
        .as_ref()
        .and_then(|p| parse_table_col_path(p))
        .map(|(_, c)| c);
    let volume_col = source
        .volume_path
        .as_ref()
        .and_then(|p| parse_table_col_path(p))
        .map(|(_, c)| c);

    let table_el = match document.select(&table_sel).nth(table_idx) {
        Some(t) => t,
        None => return Vec::new(),
    };

    let date_fmt = source.date_format.as_deref();
    let mut rows = Vec::new();

    for tr in table_el.select(&tr_sel) {
        let cells: Vec<String> = tr
            .select(&td_sel)
            .map(|el| extract_first_text_content(el))
            .collect();
        if cells.is_empty() || close_col >= cells.len() {
            continue;
        }

        let close = match parse_number_string(&cells[close_col], locale) {
            Some(v) => v,
            None => continue,
        };

        let date = date_col
            .and_then(|c| cells.get(c))
            .and_then(|s| parse_date(s, date_fmt));
        let high = high_col
            .and_then(|c| cells.get(c))
            .and_then(|s| parse_number_string(s, locale));
        let low = low_col
            .and_then(|c| cells.get(c))
            .and_then(|s| parse_number_string(s, locale));
        let volume = volume_col
            .and_then(|c| cells.get(c))
            .and_then(|s| parse_number_string(s, locale));

        rows.push(ExtractedRow {
            date,
            close,
            high,
            low,
            volume,
        });
    }

    rows
}

/// Parse a "table_idx:col_idx" path.
fn parse_table_col_path(path: &str) -> Option<(usize, usize)> {
    let parts: Vec<&str> = path.split(':').collect();
    if parts.len() != 2 {
        return None;
    }
    Some((parts[0].parse().ok()?, parts[1].parse().ok()?))
}

// ─── CSV multi-row extraction ────────────────────────────────────────────────

fn extract_csv_rows(
    body: &str,
    source: &CustomProviderSource,
    locale: Option<&str>,
) -> Vec<ExtractedRow> {
    let records = match parse_csv_records(body) {
        Some(r) => r,
        None => return Vec::new(),
    };
    if records.len() < 2 {
        return Vec::new();
    }

    let headers = &records[0];
    let close_col = match resolve_csv_column(headers, &source.price_path) {
        Some(c) => c,
        None => return Vec::new(),
    };
    let date_col = source
        .date_path
        .as_ref()
        .and_then(|p| resolve_csv_column(headers, p));
    let high_col = source
        .high_path
        .as_ref()
        .and_then(|p| resolve_csv_column(headers, p));
    let low_col = source
        .low_path
        .as_ref()
        .and_then(|p| resolve_csv_column(headers, p));
    let volume_col = source
        .volume_path
        .as_ref()
        .and_then(|p| resolve_csv_column(headers, p));

    let date_fmt = source.date_format.as_deref();

    records[1..]
        .iter()
        .filter_map(|row| {
            let close = row
                .get(close_col)
                .and_then(|s| parse_number_string(s, locale))?;
            let date = date_col
                .and_then(|c| row.get(c))
                .and_then(|s| parse_date(s, date_fmt));
            let high = high_col
                .and_then(|c| row.get(c))
                .and_then(|s| parse_number_string(s, locale));
            let low = low_col
                .and_then(|c| row.get(c))
                .and_then(|s| parse_number_string(s, locale));
            let volume = volume_col
                .and_then(|c| row.get(c))
                .and_then(|s| parse_number_string(s, locale));

            Some(ExtractedRow {
                date,
                close,
                high,
                low,
                volume,
            })
        })
        .collect()
}

// ─── JSON multi-row extraction ───────────────────────────────────────────────

fn extract_json_rows(
    body: &str,
    source: &CustomProviderSource,
    symbol: &str,
    currency_hint: Option<&str>,
    locale: Option<&str>,
) -> Vec<ExtractedRow> {
    use jsonpath_rust::JsonPathQuery;

    let json: serde_json::Value = match serde_json::from_str(body) {
        Ok(j) => j,
        Err(_) => return Vec::new(),
    };

    // Expand {SYMBOL}, {CURRENCY} (as-is), and {currency} (lowercase) in paths.
    let currency = currency_hint.unwrap_or("USD");
    let currency_lower = currency.to_lowercase();
    let expand_path = |p: &str| -> String {
        p.replace("{SYMBOL}", symbol)
            .replace("{currency}", &currency_lower)
            .replace("{CURRENCY}", currency)
    };

    let price_path = expand_path(&source.price_path);
    let prices = match json.clone().path(&price_path) {
        Ok(serde_json::Value::Array(arr)) => arr,
        Ok(val) => vec![val],
        Err(_) => return Vec::new(),
    };

    let dates: Vec<Option<String>> = source
        .date_path
        .as_ref()
        .and_then(|dp| {
            let dp = expand_path(dp);
            json.clone().path(&dp).ok().map(|v| match v {
                serde_json::Value::Array(arr) => {
                    arr.into_iter().map(|v| json_val_to_string(&v)).collect()
                }
                other => vec![json_val_to_string(&other)],
            })
        })
        .unwrap_or_default();

    let high_path = source.high_path.as_deref().map(|p| expand_path(p));
    let low_path = source.low_path.as_deref().map(|p| expand_path(p));
    let volume_path = source.volume_path.as_deref().map(|p| expand_path(p));
    let highs = extract_json_f64_array(&json, high_path.as_deref(), locale);
    let lows = extract_json_f64_array(&json, low_path.as_deref(), locale);
    let volumes = extract_json_f64_array(&json, volume_path.as_deref(), locale);

    let date_fmt = source.date_format.as_deref();

    debug!(
        "extract_json_rows: {} prices, {} dates, {} volumes (pricePath={}, datePath={:?})",
        prices.len(),
        dates.len(),
        volumes.len(),
        source.price_path,
        source.date_path,
    );

    prices
        .into_iter()
        .enumerate()
        .filter_map(|(i, val)| {
            let close = json_val_to_f64(&val, locale)?;
            let date = dates
                .get(i)
                .and_then(|s| s.as_ref())
                .and_then(|s| parse_date(s, date_fmt));
            Some(ExtractedRow {
                date,
                close,
                high: highs.get(i).copied().flatten(),
                low: lows.get(i).copied().flatten(),
                volume: volumes.get(i).copied().flatten(),
            })
        })
        .collect()
}

fn extract_json_f64_array(
    json: &serde_json::Value,
    path: Option<&str>,
    locale: Option<&str>,
) -> Vec<Option<f64>> {
    use jsonpath_rust::JsonPathQuery;
    let Some(path) = path else {
        return Vec::new();
    };
    match json.clone().path(path) {
        Ok(serde_json::Value::Array(arr)) => arr
            .into_iter()
            .map(|v| json_val_to_f64(&v, locale))
            .collect(),
        Ok(val) => vec![json_val_to_f64(&val, locale)],
        Err(_) => Vec::new(),
    }
}

fn json_val_to_f64(val: &serde_json::Value, locale: Option<&str>) -> Option<f64> {
    match val {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => parse_number_string(s, locale),
        _ => None,
    }
}

fn json_val_to_string(val: &serde_json::Value) -> Option<String> {
    match val {
        serde_json::Value::String(s) => Some(s.clone()),
        serde_json::Value::Null => None,
        other => Some(other.to_string()),
    }
}

// ─── Extraction helpers ──────────────────────────────────────────────────────

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

fn extract_html_value(body: &str, selector: &str, locale: Option<&str>) -> Option<f64> {
    let document = scraper::Html::parse_document(body);
    let sel = scraper::Selector::parse(selector).ok()?;
    let element = document.select(&sel).next()?;
    let text: String = element.text().collect::<String>();
    parse_number_string(text.trim(), locale)
}

// parse_number_string imported from crate::custom_provider::service
