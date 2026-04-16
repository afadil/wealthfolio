//! Yahoo Finance API response models.
//!
//! These models are used for parsing the quoteSummary API responses
//! which provide richer data than the standard quote endpoints.

use serde::{Deserialize, Deserializer};

/// Main response wrapper for quoteSummary API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooQuoteSummaryResponse {
    pub quote_summary: YahooQuoteSummary,
}

/// Quote summary container
#[derive(Debug, Deserialize)]
pub struct YahooQuoteSummary {
    pub result: Vec<YahooQuoteSummaryResult>,
    // Note: error field exists in API but we handle errors via HTTP status/empty results
}

/// Individual result from quoteSummary API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooQuoteSummaryResult {
    pub price: Option<YahooPriceData>,
    pub summary_profile: Option<YahooSummaryProfile>,
    pub summary_detail: Option<YahooSummaryDetail>,
    pub top_holdings: Option<YahooTopHoldings>,
}

/// Price data from quoteSummary API
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooPriceData {
    pub currency: Option<String>,
    pub short_name: Option<String>,
    pub long_name: Option<String>,
    pub quote_type: Option<String>,
    pub regular_market_price: Option<YahooPriceDetail>,
    pub regular_market_open: Option<YahooPriceDetail>,
    pub regular_market_day_high: Option<YahooPriceDetail>,
    pub regular_market_day_low: Option<YahooPriceDetail>,
    pub regular_market_volume: Option<YahooPriceDetail>,
    pub regular_market_time: Option<i64>,
}

/// Price detail with raw and formatted values
#[derive(Debug, Deserialize, Clone)]
pub struct YahooPriceDetail {
    pub raw: Option<f64>,
    // Note: fmt field exists but we only use raw values
}

/// Summary profile data (company info)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooSummaryProfile {
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub website: Option<String>,
    pub long_business_summary: Option<String>,
    #[serde(alias = "description")]
    pub description: Option<String>,
    pub country: Option<String>,
    pub full_time_employees: Option<u64>,
    // Note: city, state exist but not in AssetProfile model
}

/// Summary detail data (financial metrics)
/// Yahoo returns these as nested objects like {"raw": 123.45, "fmt": "123.45"}
/// or empty objects {} when no data is available.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooSummaryDetail {
    pub market_cap: Option<YahooPriceDetail>,
    #[serde(rename = "trailingPE")]
    pub trailing_pe: Option<YahooPriceDetail>,
    pub dividend_yield: Option<YahooPriceDetail>,
    pub fifty_two_week_high: Option<YahooPriceDetail>,
    pub fifty_two_week_low: Option<YahooPriceDetail>,
    // Note: forward_pe, dividend_rate, beta, etc. exist but not in AssetProfile model
}

/// Parse `"19.26%"` / `"19.26"` into a percentage number (same scale as Yahoo `raw` when present).
fn percent_from_fmt_string(s: &str) -> Option<f64> {
    let t = s.trim().trim_end_matches('%').trim();
    if t.is_empty() {
        return None;
    }
    t.parse::<f64>().ok()
}

#[derive(Deserialize)]
struct YahooHoldingPercentObject {
    #[serde(default)]
    raw: Option<f64>,
    #[serde(default)]
    fmt: Option<String>,
}

fn percent_from_holding_object(o: YahooHoldingPercentObject) -> Option<f64> {
    if let Some(r) = o.raw {
        return Some(r);
    }
    o.fmt.as_deref().and_then(percent_from_fmt_string)
}

/// Deserialize `holdingPercent` as a plain number, string, or `{ raw, fmt }` (Yahoo varies by symbol;
/// TSX / wrapped ETFs often send `fmt` only without `raw`).
fn deserialize_fund_holding_percent<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum HoldingPercent {
        Number(f64),
        String(String),
        /// Prefer this over a `raw`-only struct so `fmt` is used when `raw` is null.
        Object(YahooHoldingPercentObject),
    }

    match Option::<HoldingPercent>::deserialize(deserializer)? {
        None => Ok(None),
        Some(HoldingPercent::Number(n)) => Ok(Some(n)),
        Some(HoldingPercent::String(s)) => Ok(percent_from_fmt_string(&s)),
        Some(HoldingPercent::Object(o)) => Ok(percent_from_holding_object(o)),
    }
}

/// Normalize Yahoo fund line weight to 0..1 (same scale as [`sectorWeightings`]).
#[inline]
pub(crate) fn normalize_fund_holding_weight(raw: f64) -> f64 {
    if raw > 1.0 {
        raw / 100.0
    } else {
        raw
    }
}

/// Single line in the `holdings` array (top positions inside an ETF / fund).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooFundHolding {
    pub symbol: Option<String>,
    /// Yahoo usually sends `holdingName`; some symbols use `companyName` or `longName`.
    #[serde(default, alias = "companyName", alias = "longName")]
    pub holding_name: Option<String>,
    #[serde(
        default,
        alias = "pctOfAssets",
        alias = "percentHeld",
        deserialize_with = "deserialize_fund_holding_percent"
    )]
    pub holding_percent: Option<f64>,
}

impl YahooFundHolding {
    /// Weight 0..1 for the shared `AssetProfile.sectors` JSON format.
    pub fn weight_fraction(&self) -> Option<f64> {
        self.holding_percent.map(normalize_fund_holding_weight)
    }

    pub fn line_label(&self) -> Option<String> {
        let name = self.holding_name.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let sym = self.symbol.as_deref().map(str::trim).filter(|s| !s.is_empty());
        match (name, sym) {
            (Some(n), _) => Some(n.to_string()),
            (None, Some(s)) => Some(s.to_string()),
            _ => None,
        }
    }
}

/// Top holdings data for ETFs and Mutual Funds
/// Contains sector weightings and other fund-specific data
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooTopHoldings {
    /// Sector weightings - each element is a map with sector name as key
    /// e.g., [{"technology": {"raw": 0.30}}, {"healthcare": {"raw": 0.15}}]
    #[serde(default)]
    pub sector_weightings: Vec<std::collections::HashMap<String, YahooPriceDetail>>,
    /// Top equity/bond positions (common when `sectorWeightings` is empty, e.g. some TSX-listed ETFs).
    #[serde(default)]
    pub holdings: Vec<YahooFundHolding>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_price_detail() {
        let json = r#"{"raw": 150.25, "fmt": "150.25"}"#;
        let detail: YahooPriceDetail = serde_json::from_str(json).unwrap();
        assert_eq!(detail.raw, Some(150.25));
    }

    #[test]
    fn test_deserialize_price_detail_null() {
        let json = r#"{"raw": null, "fmt": null}"#;
        let detail: YahooPriceDetail = serde_json::from_str(json).unwrap();
        assert_eq!(detail.raw, None);
    }

    #[test]
    fn test_deserialize_summary_profile() {
        let json = r#"{
            "sector": "Technology",
            "industry": "Consumer Electronics",
            "website": "https://www.apple.com",
            "country": "United States",
            "fullTimeEmployees": 164000
        }"#;
        let profile: YahooSummaryProfile = serde_json::from_str(json).unwrap();
        assert_eq!(profile.sector, Some("Technology".to_string()));
        assert_eq!(profile.industry, Some("Consumer Electronics".to_string()));
        assert_eq!(profile.full_time_employees, Some(164000));
    }

    #[test]
    fn test_deserialize_summary_detail() {
        let json = r#"{
            "marketCap": {"raw": 2800000000000, "fmt": "2.8T"},
            "trailingPE": {"raw": 28.5, "fmt": "28.50"},
            "dividendYield": {"raw": 0.005, "fmt": "0.50%"},
            "fiftyTwoWeekHigh": {"raw": 199.62, "fmt": "199.62"},
            "fiftyTwoWeekLow": {"raw": 124.17, "fmt": "124.17"}
        }"#;
        let detail: YahooSummaryDetail = serde_json::from_str(json).unwrap();
        assert_eq!(
            detail.market_cap.as_ref().and_then(|d| d.raw),
            Some(2800000000000.0)
        );
        assert_eq!(detail.trailing_pe.as_ref().and_then(|d| d.raw), Some(28.5));
        assert_eq!(
            detail.dividend_yield.as_ref().and_then(|d| d.raw),
            Some(0.005)
        );
        assert_eq!(
            detail.fifty_two_week_high.as_ref().and_then(|d| d.raw),
            Some(199.62)
        );
        assert_eq!(
            detail.fifty_two_week_low.as_ref().and_then(|d| d.raw),
            Some(124.17)
        );
    }

    #[test]
    fn test_deserialize_summary_detail_empty_objects() {
        // Yahoo returns empty objects {} for fields with no data (e.g., stocks without dividends)
        let json = r#"{
            "marketCap": {"raw": 1000000000000, "fmt": "1T"},
            "trailingPE": {"raw": 50.0, "fmt": "50.00"},
            "dividendYield": {},
            "fiftyTwoWeekHigh": {"raw": 300.0, "fmt": "300.00"},
            "fiftyTwoWeekLow": {"raw": 200.0, "fmt": "200.00"}
        }"#;
        let detail: YahooSummaryDetail = serde_json::from_str(json).unwrap();
        assert_eq!(
            detail.market_cap.as_ref().and_then(|d| d.raw),
            Some(1000000000000.0)
        );
        // dividendYield is empty object - raw should be None
        assert_eq!(detail.dividend_yield.as_ref().and_then(|d| d.raw), None);
        assert_eq!(
            detail.fifty_two_week_high.as_ref().and_then(|d| d.raw),
            Some(300.0)
        );
    }

    #[test]
    fn test_deserialize_top_holdings() {
        // Yahoo returns sector weightings as array of single-key objects
        let json = r#"{
            "sectorWeightings": [
                {"realestate": {"raw": 0.0261, "fmt": "2.61%"}},
                {"consumer_cyclical": {"raw": 0.1023, "fmt": "10.23%"}},
                {"technology": {"raw": 0.2915, "fmt": "29.15%"}}
            ]
        }"#;
        let holdings: YahooTopHoldings = serde_json::from_str(json).unwrap();
        assert_eq!(holdings.sector_weightings.len(), 3);

        // Check first sector
        let first = &holdings.sector_weightings[0];
        assert!(first.contains_key("realestate"));
        assert_eq!(first.get("realestate").and_then(|d| d.raw), Some(0.0261));

        // Check technology sector
        let tech = &holdings.sector_weightings[2];
        assert!(tech.contains_key("technology"));
        assert_eq!(tech.get("technology").and_then(|d| d.raw), Some(0.2915));
    }

    #[test]
    fn test_deserialize_top_holdings_empty() {
        let json = r#"{"sectorWeightings": []}"#;
        let holdings: YahooTopHoldings = serde_json::from_str(json).unwrap();
        assert!(holdings.sector_weightings.is_empty());
    }

    #[test]
    fn test_deserialize_top_holdings_positions_only() {
        let json = r#"{
            "sectorWeightings": [],
            "holdings": [
                {"holdingName": "Apple Inc", "symbol": "AAPL", "holdingPercent": 8.5},
                {"holdingName": "Microsoft", "holdingPercent": {"raw": 7.2, "fmt": "7.2%"}}
            ]
        }"#;
        let th: YahooTopHoldings = serde_json::from_str(json).unwrap();
        assert!(th.sector_weightings.is_empty());
        assert_eq!(th.holdings.len(), 2);
        assert_eq!(th.holdings[0].line_label().as_deref(), Some("Apple Inc"));
        assert_eq!(th.holdings[0].weight_fraction(), Some(0.085));
        assert_eq!(th.holdings[1].line_label().as_deref(), Some("Microsoft"));
        assert!((th.holdings[1].weight_fraction().unwrap() - 0.072).abs() < 1e-9);
    }

    #[test]
    fn test_holding_percent_fmt_only_object() {
        let json = r#"{"holdingName":"Hamilton","symbol":"HMAX.TO","holdingPercent":{"raw":null,"fmt":"19.26%"}}"#;
        let h: YahooFundHolding = serde_json::from_str(json).unwrap();
        let wf = h.weight_fraction().expect("weight");
        assert!((wf - 0.1926).abs() < 1e-4, "got {wf}");
    }

    #[test]
    fn test_holding_company_name_alias() {
        let json = r#"{"companyName":"Hamilton Canadian","symbol":"HMAX.TO","holdingPercent":8.5}"#;
        let h: YahooFundHolding = serde_json::from_str(json).unwrap();
        assert_eq!(h.holding_name.as_deref(), Some("Hamilton Canadian"));
    }
}
