//! Gold price models for SJC API

use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::Deserialize;

/// Gold price response from SJC API
#[derive(Debug, Clone, Deserialize)]
pub struct SjcResponse {
    /// Whether the request was successful
    pub success: bool,

    /// Gold price data
    pub data: Vec<SjcGoldPrice>,
}

/// Individual gold price record from SJC
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct SjcGoldPrice {
    /// Gold type name (e.g., "Vàng miếng SJC")
    pub type_name: String,

    /// Branch name
    pub branch_name: String,

    /// Buy price in VND
    pub buy_value: f64,

    /// Sell price in VND
    pub sell_value: f64,
}

impl SjcGoldPrice {
    /// Get buy price as Decimal
    pub fn buy_price(&self) -> Decimal {
        Decimal::from_f64_retain(self.buy_value).unwrap_or_default()
    }

    /// Get sell price as Decimal
    pub fn sell_price(&self) -> Decimal {
        Decimal::from_f64_retain(self.sell_value).unwrap_or_default()
    }

    /// Get close price (using sell price as reference)
    pub fn close_price(&self) -> Decimal {
        let sell = self.sell_price();
        if sell > Decimal::ZERO {
            sell
        } else {
            self.buy_price()
        }
    }
}

/// Processed gold quote with date
#[derive(Debug, Clone)]
pub struct GoldQuote {
    /// Symbol (e.g., "VN.GOLD")
    pub symbol: String,
    /// Quote date
    pub date: NaiveDate,
    /// Buy price in VND
    pub buy_price: Decimal,
    /// Sell price in VND
    pub sell_price: Decimal,
    /// Close price (typically sell price)
    pub close: Decimal,
}

impl GoldQuote {
    /// Create from SJC response
    pub fn from_sjc(symbol: &str, date: NaiveDate, sjc: &SjcGoldPrice) -> Self {
        Self {
            symbol: symbol.to_string(),
            date,
            buy_price: sjc.buy_price(),
            sell_price: sjc.sell_price(),
            close: sjc.close_price(),
        }
    }
}

/// Gold symbol types
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GoldUnit {
    /// Lượng (tael) - standard unit
    Luong,
    /// Chỉ - 1/10 of Lượng
    Chi,
}

impl GoldUnit {
    /// Parse from symbol suffix
    pub fn from_symbol(symbol: &str) -> Self {
        if symbol.to_uppercase().ends_with(".C") {
            GoldUnit::Chi
        } else {
            GoldUnit::Luong
        }
    }

    /// Get conversion factor from Lượng
    pub fn conversion_factor(&self) -> Decimal {
        match self {
            GoldUnit::Luong => Decimal::ONE,
            GoldUnit::Chi => Decimal::new(1, 1), // 0.1
        }
    }
}

/// Normalize gold symbol to base symbol (VN.GOLD)
pub fn normalize_gold_symbol(symbol: &str) -> String {
    let upper = symbol.to_uppercase();
    if upper.ends_with(".C") {
        "VN.GOLD".to_string()
    } else if upper.contains("GOLD") {
        "VN.GOLD".to_string()
    } else {
        upper
    }
}

/// Check if a symbol is a gold symbol
pub fn is_gold_symbol(symbol: &str) -> bool {
    let upper = symbol.to_uppercase();
    upper.contains("GOLD") || upper == "SJC" || upper.starts_with("VN.GOLD")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gold_unit_from_symbol() {
        assert_eq!(GoldUnit::from_symbol("VN.GOLD"), GoldUnit::Luong);
        assert_eq!(GoldUnit::from_symbol("VN.GOLD.C"), GoldUnit::Chi);
    }

    #[test]
    fn test_normalize_gold_symbol() {
        assert_eq!(normalize_gold_symbol("VN.GOLD"), "VN.GOLD");
        assert_eq!(normalize_gold_symbol("VN.GOLD.C"), "VN.GOLD");
        assert_eq!(normalize_gold_symbol("vn.gold"), "VN.GOLD");
    }

    #[test]
    fn test_is_gold_symbol() {
        assert!(is_gold_symbol("VN.GOLD"));
        assert!(is_gold_symbol("VN.GOLD.C"));
        assert!(is_gold_symbol("GOLD"));
        assert!(!is_gold_symbol("VNM"));
    }
}
