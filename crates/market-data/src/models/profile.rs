use serde::{Deserialize, Serialize};

/// Asset profile data from market data providers
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct AssetProfile {
    /// Provider that supplied this profile (e.g., "YAHOO", "ALPHA_VANTAGE")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,

    /// Company/asset name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Business sector (e.g., "Technology")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sector: Option<String>,

    /// Industry within sector (e.g., "Consumer Electronics")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub industry: Option<String>,

    /// Company website URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,

    /// Business description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Country of domicile (ISO 3166-1 alpha-2)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,

    /// Number of full-time employees
    #[serde(skip_serializing_if = "Option::is_none")]
    pub employees: Option<u64>,

    /// Logo URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logo_url: Option<String>,

    /// Asset class (e.g., "Equity", "Fixed Income")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_class: Option<String>,

    /// Asset sub-class (e.g., "Stock", "ETF", "Bond")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub asset_sub_class: Option<String>,

    /// Market capitalization
    #[serde(skip_serializing_if = "Option::is_none")]
    pub market_cap: Option<f64>,

    /// Price-to-earnings ratio
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pe_ratio: Option<f64>,

    /// Dividend yield (as decimal, e.g., 0.025 for 2.5%)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dividend_yield: Option<f64>,

    /// 52-week high price
    #[serde(skip_serializing_if = "Option::is_none")]
    pub week_52_high: Option<f64>,

    /// 52-week low price
    #[serde(skip_serializing_if = "Option::is_none")]
    pub week_52_low: Option<f64>,
}

impl AssetProfile {
    /// Create a new empty asset profile
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a profile with basic info
    pub fn with_name(name: impl Into<String>) -> Self {
        Self {
            name: Some(name.into()),
            ..Default::default()
        }
    }

    /// Set the sector
    pub fn sector(mut self, sector: impl Into<String>) -> Self {
        self.sector = Some(sector.into());
        self
    }

    /// Set the industry
    pub fn industry(mut self, industry: impl Into<String>) -> Self {
        self.industry = Some(industry.into());
        self
    }

    /// Set the country
    pub fn country(mut self, country: impl Into<String>) -> Self {
        self.country = Some(country.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_asset_profile_builder() {
        let profile = AssetProfile::with_name("Apple Inc.")
            .sector("Technology")
            .industry("Consumer Electronics")
            .country("US");

        assert_eq!(profile.name, Some("Apple Inc.".to_string()));
        assert_eq!(profile.sector, Some("Technology".to_string()));
        assert_eq!(profile.industry, Some("Consumer Electronics".to_string()));
        assert_eq!(profile.country, Some("US".to_string()));
    }

    #[test]
    fn test_asset_profile_serialization() {
        let profile = AssetProfile {
            name: Some("Test Company".to_string()),
            sector: Some("Technology".to_string()),
            ..Default::default()
        };

        let json = serde_json::to_string(&profile).unwrap();
        assert!(json.contains("Test Company"));
        assert!(json.contains("Technology"));
        // Optional None fields should not be serialized
        assert!(!json.contains("website"));
    }
}
