//! Provider-specific symbol resolution.
//!
//! This module provides mappings from canonical (ticker, MIC) pairs to
//! provider-specific symbols. Each provider (Yahoo, Alpha Vantage, etc.)
//! uses different suffixes to identify exchanges.

use std::borrow::Cow;
use std::collections::HashMap;

use crate::models::{Mic, ProviderId};

use super::exchange_registry::REGISTRY;

/// Provider-specific exchange suffix and currency.
#[derive(Clone, Debug)]
pub struct ExchangeSuffix {
    /// The suffix to append to the ticker (e.g., ".TO" for Yahoo TSX).
    pub suffix: Cow<'static, str>,
    /// The trading currency for this exchange (e.g., "CAD" for TSX).
    pub currency: Cow<'static, str>,
}

/// MIC to provider suffix mapping database.
///
/// Maps ISO 10383 Market Identifier Codes to provider-specific suffixes
/// for each supported provider.
pub struct ExchangeMap {
    mappings: HashMap<Mic, HashMap<ProviderId, ExchangeSuffix>>,
}

impl Default for ExchangeMap {
    fn default() -> Self {
        Self::new()
    }
}

impl ExchangeMap {
    /// Create a new ExchangeMap with default mappings.
    pub fn new() -> Self {
        let mut map = Self {
            mappings: HashMap::new(),
        };
        map.load_defaults();
        map
    }

    /// Load all default exchange mappings from the JSON registry.
    fn load_defaults(&mut self) {
        for entry in &REGISTRY.catalog.exchanges {
            let mut provider_map: HashMap<ProviderId, ExchangeSuffix> = HashMap::new();

            if let Some(ref yahoo) = entry.yahoo {
                let currency = yahoo
                    .currency
                    .as_deref()
                    .or(entry.currency.as_deref())
                    .unwrap_or("USD");
                provider_map.insert(
                    Cow::Owned("YAHOO".to_string()),
                    ExchangeSuffix {
                        suffix: Cow::Owned(yahoo.suffix.clone()),
                        currency: Cow::Owned(currency.to_string()),
                    },
                );
            }

            if let Some(ref av) = entry.alpha_vantage {
                let currency = av
                    .currency
                    .as_deref()
                    .or(entry.currency.as_deref())
                    .unwrap_or("USD");
                provider_map.insert(
                    Cow::Owned("ALPHA_VANTAGE".to_string()),
                    ExchangeSuffix {
                        suffix: Cow::Owned(av.suffix.clone()),
                        currency: Cow::Owned(currency.to_string()),
                    },
                );
            }

            if !provider_map.is_empty() {
                self.mappings
                    .insert(Cow::Owned(entry.mic.clone()), provider_map);
            }
        }
    }

    /// Get the suffix for a MIC and provider.
    pub fn get_suffix(&self, mic: &Mic, provider: &ProviderId) -> Option<&str> {
        self.mappings
            .get(mic)?
            .get(provider)
            .map(|s| s.suffix.as_ref())
    }

    /// Get the currency for a MIC and provider.
    pub fn get_currency(&self, mic: &Mic, provider: &ProviderId) -> Option<&str> {
        self.mappings
            .get(mic)?
            .get(provider)
            .map(|s| s.currency.as_ref())
    }

    /// Check if a MIC is supported.
    pub fn has_mic(&self, mic: &Mic) -> bool {
        self.mappings.contains_key(mic)
    }

    /// Check if a MIC/provider combination is supported.
    pub fn has_mapping(&self, mic: &Mic, provider: &ProviderId) -> bool {
        self.mappings
            .get(mic)
            .map(|p| p.contains_key(provider))
            .unwrap_or(false)
    }
}

/// Map Yahoo exchange code to MIC.
pub fn yahoo_exchange_to_mic(code: &str) -> Option<Mic> {
    REGISTRY
        .yahoo_code_to_mic
        .get(code)
        .map(|mic| Cow::Owned(mic.clone()))
}

/// Known Yahoo exchange suffixes.
///
/// Returns the whitelist used by `strip_yahoo_suffix` to safely extract
/// the canonical ticker from a Yahoo symbol.
pub fn yahoo_exchange_suffixes() -> &'static [&'static str] {
    REGISTRY.yahoo_suffixes
}

/// Map Yahoo Finance symbol suffix to canonical MIC.
pub fn yahoo_suffix_to_mic(suffix: &str) -> Option<&'static str> {
    REGISTRY
        .yahoo_suffix_to_mic
        .get(&suffix.to_uppercase())
        .copied()
}

/// Extract canonical ticker from Yahoo provider symbol.
///
/// Uses a whitelist approach to safely strip exchange suffixes while preserving
/// share classes like BRK.B or RDS.A (since .B and .A are not in the whitelist).
pub fn strip_yahoo_suffix(symbol: &str) -> &str {
    // Handle special suffixes first
    if let Some(stripped) = symbol.strip_suffix("=X") {
        // FX pairs like EURUSD=X
        return stripped;
    }
    if let Some(stripped) = symbol.strip_suffix("=F") {
        // Futures like GC=F
        return stripped;
    }

    // Only strip if suffix is in our known exchange whitelist
    for suffix in yahoo_exchange_suffixes() {
        if let Some(stripped) = symbol.strip_suffix(suffix) {
            return stripped;
        }
    }

    // No known suffix found - return as-is (preserves BRK.B, RDS.A, etc.)
    symbol
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exchange_map_north_america() {
        let map = ExchangeMap::new();

        // NYSE - no suffix for US exchanges
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XNYS"), &Cow::Borrowed("YAHOO")),
            Some("")
        );
        assert_eq!(
            map.get_currency(&Cow::Borrowed("XNYS"), &Cow::Borrowed("YAHOO")),
            Some("USD")
        );

        // Toronto
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XTSE"), &Cow::Borrowed("YAHOO")),
            Some(".TO")
        );
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XTSE"), &Cow::Borrowed("ALPHA_VANTAGE")),
            Some(".TRT")
        );
        assert_eq!(
            map.get_currency(&Cow::Borrowed("XTSE"), &Cow::Borrowed("YAHOO")),
            Some("CAD")
        );
    }

    #[test]
    fn test_exchange_map_europe() {
        let map = ExchangeMap::new();

        // London - Note: Yahoo returns GBp (pence)
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XLON"), &Cow::Borrowed("YAHOO")),
            Some(".L")
        );
        assert_eq!(
            map.get_currency(&Cow::Borrowed("XLON"), &Cow::Borrowed("YAHOO")),
            Some("GBp")
        );

        // XETRA
        assert_eq!(
            map.get_suffix(&Cow::Borrowed("XETR"), &Cow::Borrowed("YAHOO")),
            Some(".DE")
        );
    }

    #[test]
    fn test_yahoo_exchange_to_mic() {
        // NASDAQ variants
        assert_eq!(
            yahoo_exchange_to_mic("NMS"),
            Some(Cow::Owned("XNAS".to_string()))
        );
        assert_eq!(
            yahoo_exchange_to_mic("NGM"),
            Some(Cow::Owned("XNAS".to_string()))
        );

        // Toronto
        assert_eq!(
            yahoo_exchange_to_mic("TOR"),
            Some(Cow::Owned("XTSE".to_string()))
        );

        // Unknown
        assert_eq!(yahoo_exchange_to_mic("UNKNOWN"), None);
    }

    #[test]
    fn test_strip_yahoo_suffix() {
        // Normal exchange suffixes
        assert_eq!(strip_yahoo_suffix("SHOP.TO"), "SHOP");
        assert_eq!(strip_yahoo_suffix("AAPL"), "AAPL");
        assert_eq!(strip_yahoo_suffix("VOD.L"), "VOD");

        // Share classes preserved
        assert_eq!(strip_yahoo_suffix("BRK.B"), "BRK.B");
        assert_eq!(strip_yahoo_suffix("RDS.A"), "RDS.A");

        // Special suffixes
        assert_eq!(strip_yahoo_suffix("EURUSD=X"), "EURUSD");
        assert_eq!(strip_yahoo_suffix("GC=F"), "GC");
    }

    #[test]
    fn test_yahoo_suffix_to_mic() {
        // North America
        assert_eq!(yahoo_suffix_to_mic("TO"), Some("XTSE"));
        assert_eq!(yahoo_suffix_to_mic("V"), Some("XTSX"));
        assert_eq!(yahoo_suffix_to_mic("to"), Some("XTSE")); // Case insensitive

        // UK & Europe
        assert_eq!(yahoo_suffix_to_mic("L"), Some("XLON"));
        assert_eq!(yahoo_suffix_to_mic("DE"), Some("XETR"));
        assert_eq!(yahoo_suffix_to_mic("PA"), Some("XPAR"));

        // Asia
        assert_eq!(yahoo_suffix_to_mic("T"), Some("XTKS"));
        assert_eq!(yahoo_suffix_to_mic("HK"), Some("XHKG"));

        // Unknown
        assert_eq!(yahoo_suffix_to_mic("UNKNOWN"), None);
        assert_eq!(yahoo_suffix_to_mic("B"), None); // Share class, not suffix
    }
}
