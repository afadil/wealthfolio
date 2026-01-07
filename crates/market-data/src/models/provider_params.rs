use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::types::{Currency, ProviderSymbol};

/// Provider-specific instrument parameters.
/// Produced by resolver, consumed by providers.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProviderInstrument {
    /// Equity with provider-specific suffix
    EquitySymbol { symbol: ProviderSymbol },

    /// Crypto as single symbol (Yahoo: "BTC-USD")
    CryptoSymbol { symbol: ProviderSymbol },

    /// Crypto as separate base/market (AlphaVantage)
    CryptoPair {
        symbol: ProviderSymbol,
        market: Currency,
    },

    /// FX as single symbol (Yahoo: "EURUSD=X")
    FxSymbol { symbol: ProviderSymbol },

    /// FX as from/to pair (AlphaVantage)
    FxPair { from: Currency, to: Currency },

    /// Metal symbol
    MetalSymbol {
        symbol: ProviderSymbol,
        quote: Currency,
    },
}

/// Provider-specific symbol overrides stored on Asset
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderOverrides {
    #[serde(flatten)]
    pub overrides: HashMap<String, ProviderInstrument>,
}

impl ProviderOverrides {
    /// Create a new empty ProviderOverrides
    pub fn new() -> Self {
        Self::default()
    }

    /// Parse ProviderOverrides from a JSON value.
    ///
    /// Expected format:
    /// ```json
    /// {
    ///   "YAHOO": { "type": "equity_symbol", "symbol": "SHOP.TO" },
    ///   "ALPHA_VANTAGE": { "type": "equity_symbol", "symbol": "SHOP" }
    /// }
    /// ```
    pub fn from_json(json: &serde_json::Value) -> Result<Self, serde_json::Error> {
        serde_json::from_value(json.clone())
    }

    /// Get the override for a specific provider
    pub fn get(&self, provider_id: &str) -> Option<&ProviderInstrument> {
        self.overrides.get(provider_id)
    }

    /// Insert an override for a provider
    pub fn insert(&mut self, provider_id: String, instrument: ProviderInstrument) {
        self.overrides.insert(provider_id, instrument);
    }

    /// Check if an override exists for a provider
    pub fn contains(&self, provider_id: &str) -> bool {
        self.overrides.contains_key(provider_id)
    }

    /// Check if there are any overrides
    pub fn is_empty(&self) -> bool {
        self.overrides.is_empty()
    }

    /// Get the number of overrides
    pub fn len(&self) -> usize {
        self.overrides.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;
    use std::sync::Arc;

    #[test]
    fn test_provider_instrument_serialization() {
        let equity = ProviderInstrument::EquitySymbol {
            symbol: Arc::from("SHOP.TO"),
        };
        let json = serde_json::to_string(&equity).unwrap();
        assert!(json.contains("equity_symbol"));
        assert!(json.contains("SHOP.TO"));
    }

    #[test]
    fn test_fx_pair_serialization() {
        let fx = ProviderInstrument::FxPair {
            from: Cow::Borrowed("EUR"),
            to: Cow::Borrowed("USD"),
        };
        let json = serde_json::to_string(&fx).unwrap();
        assert!(json.contains("fx_pair"));
        assert!(json.contains("EUR"));
        assert!(json.contains("USD"));
    }

    #[test]
    fn test_provider_overrides_serialization() {
        let mut overrides = ProviderOverrides::default();
        overrides.overrides.insert(
            "YAHOO".to_string(),
            ProviderInstrument::EquitySymbol {
                symbol: Arc::from("SHOP.TO"),
            },
        );

        let json = serde_json::to_string(&overrides).unwrap();
        assert!(json.contains("YAHOO"));
        assert!(json.contains("SHOP.TO"));
    }
}
