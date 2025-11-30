//! Fund models for FMarket API

use serde::Deserialize;

/// Fund information from FMarket listing API
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FundInfo {
    /// Fund ID in FMarket database
    pub id: i32,

    /// Short name/symbol (e.g., "VESAF", "TCBF")
    pub short_name: String,

    /// Full fund name
    pub name: String,

    /// Fund code
    pub code: Option<String>,

    /// Current NAV value
    pub nav: Option<f64>,

    /// Fund asset type info
    #[serde(rename = "dataFundAssetType")]
    pub fund_asset_type: Option<FundAssetType>,

    /// Fund owner/manager info
    pub owner: Option<FundOwner>,
}

/// Fund asset type classification
#[derive(Debug, Clone, Deserialize)]
pub struct FundAssetType {
    /// Asset type name: "STOCK", "BOND", "BALANCED"
    pub name: Option<String>,
}

/// Fund owner/management company
#[derive(Debug, Clone, Deserialize)]
pub struct FundOwner {
    /// Management company name
    pub name: Option<String>,
}

/// NAV history record from FMarket API
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavRecord {
    /// Date in format "YYYY-MM-DD" or "YYYYMMDD"
    pub nav_date: String,

    /// NAV per unit
    pub nav: f64,
}

impl NavRecord {
    /// Normalize date to YYYY-MM-DD format
    pub fn normalized_date(&self) -> String {
        if self.nav_date.contains('-') {
            self.nav_date.clone()
        } else if self.nav_date.len() == 8 {
            // YYYYMMDD -> YYYY-MM-DD
            format!(
                "{}-{}-{}",
                &self.nav_date[0..4],
                &self.nav_date[4..6],
                &self.nav_date[6..8]
            )
        } else {
            self.nav_date.clone()
        }
    }
}

/// FMarket API response wrapper
#[derive(Debug, Clone, Deserialize)]
pub struct FMarketResponse<T> {
    pub data: T,
}

/// Fund list response data
#[derive(Debug, Clone, Deserialize)]
pub struct FundListData {
    pub rows: Vec<FundInfo>,
    pub total: Option<i32>,
}

/// NAV history response data (just a Vec)
pub type NavHistoryData = Vec<NavRecord>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nav_record_date_normalization() {
        let record = NavRecord {
            nav_date: "20240115".to_string(),
            nav: 25000.0,
        };
        assert_eq!(record.normalized_date(), "2024-01-15");

        let record2 = NavRecord {
            nav_date: "2024-01-15".to_string(),
            nav: 25000.0,
        };
        assert_eq!(record2.normalized_date(), "2024-01-15");
    }
}
