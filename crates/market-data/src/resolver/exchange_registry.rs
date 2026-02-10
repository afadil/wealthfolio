//! JSON-driven exchange metadata registry.
//!
//! Loads `exchanges.json` at compile time via `include_str!` and builds
//! reverse-lookup indexes once via `lazy_static`.

use std::collections::HashMap;

use lazy_static::lazy_static;
use serde::Deserialize;

// ── JSON schema ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(crate) struct ExchangeCatalog {
    pub exchanges: Vec<ExchangeEntry>,
    pub currency_priority: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct ExchangeEntry {
    pub mic: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub long_name: Option<String>,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub close: Option<[u8; 2]>,
    #[serde(default)]
    pub yahoo: Option<YahooInfo>,
    #[serde(default)]
    pub alpha_vantage: Option<ProviderInfo>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct YahooInfo {
    pub suffix: String,
    #[serde(default)]
    pub currency: Option<String>,
    #[serde(default)]
    pub codes: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct ProviderInfo {
    pub suffix: String,
    #[serde(default)]
    pub currency: Option<String>,
}

// ── Public API type for frontend consumption ─────────────────────────────────

/// Simplified exchange info exposed to callers (API endpoints, frontend).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeInfo {
    pub mic: String,
    pub name: String,
    pub long_name: String,
    pub currency: String,
}

/// Return the list of "real" exchanges (those with a name).
pub fn get_exchange_list() -> Vec<ExchangeInfo> {
    REGISTRY
        .catalog
        .exchanges
        .iter()
        .filter_map(|e| {
            let name = e.name.as_ref()?;
            Some(ExchangeInfo {
                mic: e.mic.clone(),
                long_name: e.long_name.as_ref().unwrap_or(name).clone(),
                name: name.clone(),
                currency: e.currency.as_ref()?.clone(),
            })
        })
        .collect()
}

// ── Registry with pre-built indexes ──────────────────────────────────────────

fn leak_str(s: String) -> &'static str {
    Box::leak(s.into_boxed_str())
}

pub(crate) struct ExchangeRegistry {
    pub catalog: ExchangeCatalog,
    /// mic → leaked &'static str for exchange name
    pub name_by_mic: HashMap<String, &'static str>,
    /// mic → leaked &'static str for currency
    pub currency_by_mic: HashMap<String, &'static str>,
    /// mic → leaked &'static str for timezone
    pub timezone_by_mic: HashMap<String, &'static str>,
    /// mic → market close time
    pub close_by_mic: HashMap<String, (u8, u8)>,
    /// Leaked static slices for `exchanges_for_currency`
    pub currency_priority_slices: HashMap<&'static str, &'static [&'static str]>,
    /// Yahoo exchange code (e.g. "NMS") → MIC
    pub yahoo_code_to_mic: HashMap<String, String>,
    /// Yahoo suffix without dot (upper, e.g. "TO") → leaked MIC
    pub yahoo_suffix_to_mic: HashMap<String, &'static str>,
    /// All known Yahoo suffixes (e.g. ".TO", ".L") – leaked for 'static lifetime
    pub yahoo_suffixes: &'static [&'static str],
}

lazy_static! {
    pub(crate) static ref REGISTRY: ExchangeRegistry = ExchangeRegistry::load();
}

impl ExchangeRegistry {
    fn load() -> Self {
        let json = include_str!("exchanges.json");
        let catalog: ExchangeCatalog =
            serde_json::from_str(json).expect("exchanges.json must be valid");

        // Leaked metadata maps
        let mut name_by_mic = HashMap::new();
        let mut currency_by_mic = HashMap::new();
        let mut timezone_by_mic = HashMap::new();
        let mut close_by_mic = HashMap::new();

        for entry in &catalog.exchanges {
            if let Some(ref name) = entry.name {
                name_by_mic.insert(entry.mic.clone(), leak_str(name.clone()));
            }
            if let Some(ref ccy) = entry.currency {
                currency_by_mic.insert(entry.mic.clone(), leak_str(ccy.clone()));
            }
            if let Some(ref tz) = entry.timezone {
                timezone_by_mic.insert(entry.mic.clone(), leak_str(tz.clone()));
            }
            if let Some(close) = entry.close {
                close_by_mic.insert(entry.mic.clone(), (close[0], close[1]));
            }
        }

        // yahoo_code_to_mic: codes → mic
        let mut yahoo_code_to_mic = HashMap::new();
        for entry in &catalog.exchanges {
            if let Some(ref yahoo) = entry.yahoo {
                for code in &yahoo.codes {
                    yahoo_code_to_mic.insert(code.clone(), entry.mic.clone());
                }
            }
        }

        // yahoo_suffix_to_mic: suffix (without dot, uppercased) → leaked mic
        // Also collect suffixes for the whitelist
        let mut suffix_to_mic = HashMap::new();
        let mut suffix_set = Vec::new();
        for entry in &catalog.exchanges {
            if let Some(ref yahoo) = entry.yahoo {
                if !yahoo.suffix.is_empty() {
                    let without_dot = yahoo.suffix.trim_start_matches('.');
                    suffix_to_mic.insert(without_dot.to_uppercase(), leak_str(entry.mic.clone()));
                    suffix_set.push(yahoo.suffix.clone());
                }
            }
        }

        // Deduplicate suffixes (e.g. ".AE" appears for both XDFM and XADS)
        suffix_set.sort();
        suffix_set.dedup();

        // Leak suffix strings for 'static lifetime
        let leaked_suffixes: Vec<&'static str> = suffix_set.into_iter().map(leak_str).collect();
        let yahoo_suffixes: &'static [&'static str] = Box::leak(leaked_suffixes.into_boxed_slice());

        // currency_priority_slices: leak for 'static
        let mut currency_priority_slices = HashMap::new();
        for (currency, mics) in &catalog.currency_priority {
            let leaked_mics: Vec<&'static str> = mics.iter().map(|s| leak_str(s.clone())).collect();
            let slice: &'static [&'static str] = Box::leak(leaked_mics.into_boxed_slice());
            currency_priority_slices.insert(leak_str(currency.clone()), slice);
        }

        ExchangeRegistry {
            catalog,
            name_by_mic,
            currency_by_mic,
            timezone_by_mic,
            close_by_mic,
            currency_priority_slices,
            yahoo_code_to_mic,
            yahoo_suffix_to_mic: suffix_to_mic,
            yahoo_suffixes,
        }
    }
}
