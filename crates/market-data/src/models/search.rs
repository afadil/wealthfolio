//! Search result models for symbol lookup.

use serde::{Deserialize, Serialize};

/// Result from a ticker/symbol search.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchResult {
    /// Symbol/ticker (e.g., "AAPL", "SHOP.TO")
    pub symbol: String,

    /// Short display name (e.g., "Apple Inc")
    pub name: String,

    /// Exchange name or code from provider (e.g., "NASDAQ", "TOR")
    pub exchange: String,

    /// Canonical exchange MIC code (e.g., "XNAS", "XTSE")
    /// Mapped from provider's exchange code or symbol suffix
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exchange_mic: Option<String>,

    /// Friendly exchange name (e.g., "NASDAQ", "TSX")
    /// Derived from exchange_mic lookup
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exchange_name: Option<String>,

    /// Asset type (e.g., "EQUITY", "ETF", "MUTUALFUND")
    pub asset_type: String,

    /// Currency for the symbol (e.g., "USD", "CAD")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,

    /// Relevance score from provider (higher = better match)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,

    /// Data source provider (e.g., "YAHOO", "MANUAL")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data_source: Option<String>,
}

impl SearchResult {
    /// Create a new search result with required fields.
    pub fn new(
        symbol: impl Into<String>,
        name: impl Into<String>,
        exchange: impl Into<String>,
        asset_type: impl Into<String>,
    ) -> Self {
        Self {
            symbol: symbol.into(),
            name: name.into(),
            exchange: exchange.into(),
            exchange_mic: None,
            exchange_name: None,
            asset_type: asset_type.into(),
            currency: None,
            score: None,
            data_source: None,
        }
    }

    /// Set the currency.
    pub fn with_currency(mut self, currency: impl Into<String>) -> Self {
        self.currency = Some(currency.into());
        self
    }

    /// Set the relevance score.
    pub fn with_score(mut self, score: f64) -> Self {
        self.score = Some(score);
        self
    }

    /// Set the canonical exchange MIC.
    pub fn with_exchange_mic(mut self, mic: impl Into<String>) -> Self {
        self.exchange_mic = Some(mic.into());
        self
    }

    /// Set the friendly exchange name.
    pub fn with_exchange_name(mut self, name: impl Into<String>) -> Self {
        self.exchange_name = Some(name.into());
        self
    }

    /// Set the data source.
    pub fn with_data_source(mut self, data_source: impl Into<String>) -> Self {
        self.data_source = Some(data_source.into());
        self
    }
}
