//! Search result models for symbol lookup.

use serde::{Deserialize, Serialize};

/// Result from a ticker/symbol search.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchResult {
    /// Symbol/ticker (e.g., "AAPL", "SHOP.TO")
    pub symbol: String,

    /// Short display name (e.g., "Apple Inc")
    pub name: String,

    /// Exchange name or MIC (e.g., "NASDAQ", "XNAS")
    pub exchange: String,

    /// Asset type (e.g., "EQUITY", "ETF", "MUTUALFUND")
    pub asset_type: String,

    /// Currency for the symbol (e.g., "USD", "CAD")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub currency: Option<String>,

    /// Relevance score from provider (higher = better match)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
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
            asset_type: asset_type.into(),
            currency: None,
            score: None,
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
}
