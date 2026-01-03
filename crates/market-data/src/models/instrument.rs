use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::types::{Currency, Mic};

/// Asset classification
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AssetKind {
    #[default]
    Security,
    Crypto,
    Cash,
    FxRate,
    Option,
    Commodity,
    PrivateEquity,
    Property,
    Vehicle,
    Liability,
    Other,
}

/// Provider-agnostic instrument identifier.
/// This is what the domain layer works with.
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub enum InstrumentId {
    /// Exchange-traded security
    Equity { ticker: Arc<str>, mic: Option<Mic> },

    /// Cryptocurrency pair
    Crypto { base: Arc<str>, quote: Currency },

    /// Foreign exchange pair
    Fx { base: Currency, quote: Currency },

    /// Precious metal
    Metal { code: Arc<str>, quote: Currency },
}

impl InstrumentId {
    /// Returns the asset kind for this instrument
    pub fn kind(&self) -> AssetKind {
        match self {
            Self::Equity { .. } => AssetKind::Security,
            Self::Crypto { .. } => AssetKind::Crypto,
            Self::Fx { .. } => AssetKind::FxRate,
            Self::Metal { .. } => AssetKind::Commodity,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::borrow::Cow;

    #[test]
    fn test_equity_kind() {
        let equity = InstrumentId::Equity {
            ticker: Arc::from("AAPL"),
            mic: Some(Cow::Borrowed("XNAS")),
        };
        assert_eq!(equity.kind(), AssetKind::Security);
    }

    #[test]
    fn test_crypto_kind() {
        let crypto = InstrumentId::Crypto {
            base: Arc::from("BTC"),
            quote: Cow::Borrowed("USD"),
        };
        assert_eq!(crypto.kind(), AssetKind::Crypto);
    }

    #[test]
    fn test_fx_kind() {
        let fx = InstrumentId::Fx {
            base: Cow::Borrowed("EUR"),
            quote: Cow::Borrowed("USD"),
        };
        assert_eq!(fx.kind(), AssetKind::FxRate);
    }

    #[test]
    fn test_metal_kind() {
        let metal = InstrumentId::Metal {
            code: Arc::from("XAU"),
            quote: Cow::Borrowed("USD"),
        };
        assert_eq!(metal.kind(), AssetKind::Commodity);
    }
}
