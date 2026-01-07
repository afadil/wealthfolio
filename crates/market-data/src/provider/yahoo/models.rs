//! Yahoo Finance API response models.
//!
//! These models are used for parsing the quoteSummary API responses
//! which provide richer data than the standard quote endpoints.

use serde::Deserialize;

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
    // Note: top_holdings exists but we don't extract sector weightings currently
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
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YahooSummaryDetail {
    pub market_cap: Option<f64>,
    #[serde(rename = "trailingPE")]
    pub trailing_pe: Option<f64>,
    pub dividend_yield: Option<f64>,
    pub fifty_two_week_high: Option<f64>,
    pub fifty_two_week_low: Option<f64>,
    // Note: forward_pe, dividend_rate, beta, etc. exist but not in AssetProfile model
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
            "marketCap": 2800000000000,
            "trailingPE": 28.5,
            "dividendYield": 0.005,
            "fiftyTwoWeekHigh": 199.62,
            "fiftyTwoWeekLow": 124.17
        }"#;
        let detail: YahooSummaryDetail = serde_json::from_str(json).unwrap();
        assert_eq!(detail.market_cap, Some(2800000000000.0));
        assert_eq!(detail.trailing_pe, Some(28.5));
        assert_eq!(detail.dividend_yield, Some(0.005));
        assert_eq!(detail.fifty_two_week_high, Some(199.62));
        assert_eq!(detail.fifty_two_week_low, Some(124.17));
    }
}
