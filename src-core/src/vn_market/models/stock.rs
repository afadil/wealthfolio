//! Stock and Index models for VCI API

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;

/// Symbol information from VCI listing API
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VciSymbol {
    /// Stock symbol (e.g., "VNM", "FPT")
    pub symbol: String,

    /// Exchange board: "HSX" (HOSE), "HNX", "UPCOM", "DELISTED"
    pub board: String,

    /// Asset type: "STOCK", "ETF", "BOND", etc.
    #[serde(rename = "type")]
    pub asset_type: String,

    /// Company name in Vietnamese (can be null for delisted stocks)
    #[serde(default)]
    pub organ_name: Option<String>,

    /// Short name (can be null for delisted stocks)
    #[serde(default)]
    pub organ_short_name: Option<String>,

    /// English company name
    #[serde(default)]
    pub en_organ_name: Option<String>,

    /// English short name
    #[serde(default)]
    pub en_organ_short_name: Option<String>,
}

impl VciSymbol {
    /// Map exchange code to standard format
    pub fn exchange(&self) -> &str {
        match self.board.as_str() {
            "HSX" => "HOSE",
            other => other,
        }
    }

    /// Check if this is a stock (not ETF, bond, etc.)
    pub fn is_stock(&self) -> bool {
        self.asset_type == "STOCK"
    }

    /// Check if this symbol is currently listed (not delisted)
    pub fn is_listed(&self) -> bool {
        self.board != "DELISTED"
    }

    /// Get the display name (organ_name or symbol if name is not available)
    pub fn display_name(&self) -> &str {
        self.organ_name.as_deref().unwrap_or(&self.symbol)
    }
}

/// Raw OHLC response from VCI API (array format)
/// Note: The VCI API may return timestamps as strings, so we use a custom deserializer
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VciOhlcResponse {
    /// Symbol (optional, may not be present in all responses)
    #[serde(default)]
    pub symbol: Option<String>,
    /// Timestamps (Unix seconds) - VCI returns these as strings
    #[serde(deserialize_with = "deserialize_timestamps")]
    pub t: Vec<i64>,
    /// Open prices (in 1000 VND units)
    pub o: Vec<f64>,
    /// High prices (in 1000 VND units)
    pub h: Vec<f64>,
    /// Low prices (in 1000 VND units)
    pub l: Vec<f64>,
    /// Close prices (in 1000 VND units)
    pub c: Vec<f64>,
    /// Volume
    pub v: Vec<i64>,
}

/// Custom deserializer for timestamps that can be either strings or integers
fn deserialize_timestamps<'de, D>(deserializer: D) -> Result<Vec<i64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{self, SeqAccess, Visitor};
    use std::fmt;

    struct TimestampVisitor;

    impl<'de> Visitor<'de> for TimestampVisitor {
        type Value = Vec<i64>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a sequence of timestamps (either strings or integers)")
        }

        fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
        where
            A: SeqAccess<'de>,
        {
            let mut timestamps = Vec::new();

            while let Some(value) = seq.next_element::<serde_json::Value>()? {
                let ts = match value {
                    serde_json::Value::Number(n) => {
                        n.as_i64().ok_or_else(|| de::Error::custom("invalid timestamp number"))?
                    }
                    serde_json::Value::String(s) => {
                        s.parse::<i64>().map_err(|_| de::Error::custom(format!("invalid timestamp string: {}", s)))?
                    }
                    _ => return Err(de::Error::custom("expected number or string for timestamp")),
                };
                timestamps.push(ts);
            }

            Ok(timestamps)
        }
    }

    deserializer.deserialize_seq(TimestampVisitor)
}

impl VciOhlcResponse {
    /// Check if response has data
    pub fn is_empty(&self) -> bool {
        self.t.is_empty()
    }

    /// Get number of records
    pub fn len(&self) -> usize {
        self.t.len()
    }
}

/// Processed quote data from VCI
#[derive(Debug, Clone)]
pub struct VciQuote {
    /// Stock symbol
    pub symbol: String,
    /// Quote timestamp
    pub timestamp: DateTime<Utc>,
    /// Open price in VND
    pub open: Decimal,
    /// High price in VND
    pub high: Decimal,
    /// Low price in VND
    pub low: Decimal,
    /// Close price in VND
    pub close: Decimal,
    /// Trading volume
    pub volume: i64,
}

/// VCI interval mapping
#[derive(Debug, Clone, Copy)]
pub enum VciInterval {
    OneMinute,
    OneHour,
    OneDay,
}

impl VciInterval {
    /// Get API value for interval
    pub fn as_api_value(&self) -> &'static str {
        match self {
            VciInterval::OneMinute => "ONE_MINUTE",
            VciInterval::OneHour => "ONE_HOUR",
            VciInterval::OneDay => "ONE_DAY",
        }
    }
}

/// Index symbol mapping (vnstock uses different codes)
pub fn map_index_symbol(symbol: &str) -> Option<&'static str> {
    match symbol.to_uppercase().as_str() {
        "VNINDEX" => Some("VNINDEX"),
        "HNXINDEX" => Some("HNXIndex"),
        "UPCOMINDEX" => Some("HNXUpcomIndex"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vci_symbol_exchange_mapping() {
        let symbol = VciSymbol {
            symbol: "VNM".to_string(),
            board: "HSX".to_string(),
            asset_type: "STOCK".to_string(),
            organ_name: Some("Vinamilk".to_string()),
            organ_short_name: None,
            en_organ_name: None,
            en_organ_short_name: None,
        };
        assert_eq!(symbol.exchange(), "HOSE");
    }

    #[test]
    fn test_vci_symbol_delisted() {
        let symbol = VciSymbol {
            symbol: "VHI".to_string(),
            board: "DELISTED".to_string(),
            asset_type: "STOCK".to_string(),
            organ_name: None,
            organ_short_name: None,
            en_organ_name: None,
            en_organ_short_name: None,
        };
        assert!(!symbol.is_listed());
        assert_eq!(symbol.display_name(), "VHI");
    }

    #[test]
    fn test_index_symbol_mapping() {
        assert_eq!(map_index_symbol("VNINDEX"), Some("VNINDEX"));
        assert_eq!(map_index_symbol("HNXINDEX"), Some("HNXIndex"));
        assert_eq!(map_index_symbol("UNKNOWN"), None);
    }
}
