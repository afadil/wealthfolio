//! FMarket API client for mutual funds

use reqwest::Client;
use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;

use crate::vn_market::errors::VnMarketError;
use crate::vn_market::models::fund::{FMarketResponse, FundInfo, FundListData, NavRecord};
use crate::vn_market::utils::headers::fmarket_headers;

const FMARKET_BASE_URL: &str = "https://api.fmarket.vn/res/products";
const REQUEST_TIMEOUT_SECS: u64 = 30;

/// FMarket API client for fetching mutual fund data
#[derive(Clone)]
pub struct FMarketClient {
    client: Client,
    /// Cache of fund short_name -> fund_id mapping
    fund_id_cache: HashMap<String, i32>,
}

/// Request payload for fund listing filter
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FundFilterRequest {
    types: Vec<String>,
    issuer_ids: Vec<i32>,
    sort_order: String,
    sort_field: String,
    page: i32,
    page_size: i32,
    is_ipo: bool,
    fund_asset_types: Vec<String>,
    bond_remain_periods: Vec<String>,
    search_field: String,
    is_buy_by_reward: bool,
    third_app_ids: Vec<i32>,
}

impl Default for FundFilterRequest {
    fn default() -> Self {
        Self {
            types: vec!["NEW_FUND".to_string(), "TRADING_FUND".to_string()],
            issuer_ids: vec![],
            sort_order: "DESC".to_string(),
            sort_field: "navTo6Months".to_string(),
            page: 1,
            page_size: 100,
            is_ipo: false,
            fund_asset_types: vec![],
            bond_remain_periods: vec![],
            search_field: String::new(),
            is_buy_by_reward: false,
            third_app_ids: vec![],
        }
    }
}

/// Request payload for NAV history
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NavHistoryRequest {
    is_all_data: i32,
    product_id: i32,
    from_date: String,
    to_date: String,
}

impl FMarketClient {
    /// Create a new FMarket client
    pub fn new() -> Self {
        let client = Client::builder()
            .default_headers(fmarket_headers())
            .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            fund_id_cache: HashMap::new(),
        }
    }

    /// Get all funds listing
    pub async fn get_funds_listing(&self) -> Result<Vec<FundInfo>, VnMarketError> {
        let url = format!("{}/filter", FMARKET_BASE_URL);

        let payload = FundFilterRequest::default();

        let response = self.client.post(&url).json(&payload).send().await?;

        if !response.status().is_success() {
            return Err(VnMarketError::ApiError(format!(
                "FMarket listing request failed: {}",
                response.status()
            )));
        }

        let result: FMarketResponse<FundListData> = response.json().await?;
        Ok(result.data.rows)
    }

    /// Get fund NAV history for a date range
    ///
    /// # Arguments
    /// * `fund_id` - FMarket fund ID
    /// * `start_date` - Start date in YYYY-MM-DD format
    /// * `end_date` - End date in YYYY-MM-DD format
    pub async fn get_nav_history(
        &self,
        fund_id: i32,
        start_date: &str,
        end_date: &str,
    ) -> Result<Vec<NavRecord>, VnMarketError> {
        // URL is slightly different: /res/product/get-nav-history (singular "product")
        let url = "https://api.fmarket.vn/res/product/get-nav-history";

        // Convert YYYY-MM-DD to YYYYMMDD
        let from_date = start_date.replace('-', "");
        let to_date = end_date.replace('-', "");

        let payload = NavHistoryRequest {
            is_all_data: 0,
            product_id: fund_id,
            from_date,
            to_date,
        };

        let response = self.client.post(url).json(&payload).send().await?;

        if !response.status().is_success() {
            return Err(VnMarketError::ApiError(format!(
                "FMarket NAV history request failed for fund {}: {}",
                fund_id,
                response.status()
            )));
        }

        let result: FMarketResponse<Vec<NavRecord>> = response.json().await?;
        Ok(result.data)
    }

    /// Get all NAV history for a fund (from inception)
    pub async fn get_all_nav_history(&self, fund_id: i32) -> Result<Vec<NavRecord>, VnMarketError> {
        let url = "https://api.fmarket.vn/res/product/get-nav-history";

        let today = chrono::Utc::now().format("%Y%m%d").to_string();

        let payload = serde_json::json!({
            "isAllData": 1,
            "productId": fund_id,
            "fromDate": null,
            "toDate": today,
        });

        let response = self.client.post(url).json(&payload).send().await?;

        if !response.status().is_success() {
            return Err(VnMarketError::ApiError(format!(
                "FMarket full NAV history request failed for fund {}: {}",
                fund_id,
                response.status()
            )));
        }

        let result: FMarketResponse<Vec<NavRecord>> = response.json().await?;
        Ok(result.data)
    }

    /// Search for a fund by symbol and get its ID
    pub async fn search_fund(&self, symbol: &str) -> Result<Option<FundInfo>, VnMarketError> {
        let url = format!("{}/filter", FMARKET_BASE_URL);

        let payload = FundFilterRequest {
            search_field: symbol.to_uppercase(),
            ..Default::default()
        };

        let response = self.client.post(&url).json(&payload).send().await?;

        if !response.status().is_success() {
            return Err(VnMarketError::ApiError(format!(
                "FMarket search request failed: {}",
                response.status()
            )));
        }

        let result: FMarketResponse<FundListData> = response.json().await?;

        // Find exact match by short_name
        let fund = result
            .data
            .rows
            .into_iter()
            .find(|f| f.short_name.to_uppercase() == symbol.to_uppercase());

        Ok(fund)
    }

    /// Get fund ID from symbol (uses cache)
    pub async fn get_fund_id(&mut self, symbol: &str) -> Result<i32, VnMarketError> {
        let symbol_upper = symbol.to_uppercase();

        // Check cache first
        if let Some(&id) = self.fund_id_cache.get(&symbol_upper) {
            return Ok(id);
        }

        // Search for fund
        let fund = self
            .search_fund(&symbol_upper)
            .await?
            .ok_or_else(|| VnMarketError::FundNotFound(symbol.to_string()))?;

        // Cache the ID
        self.fund_id_cache.insert(symbol_upper, fund.id);

        Ok(fund.id)
    }

    /// Refresh fund ID cache with all funds
    pub async fn refresh_fund_cache(&mut self) -> Result<usize, VnMarketError> {
        let funds = self.get_funds_listing().await?;

        self.fund_id_cache.clear();
        for fund in &funds {
            self.fund_id_cache
                .insert(fund.short_name.to_uppercase(), fund.id);
            if let Some(code) = &fund.code {
                self.fund_id_cache.insert(code.to_uppercase(), fund.id);
            }
        }

        Ok(self.fund_id_cache.len())
    }

    /// Check if a symbol is a known fund
    pub fn is_known_fund(&self, symbol: &str) -> bool {
        self.fund_id_cache.contains_key(&symbol.to_uppercase())
    }
}

impl Default for FMarketClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_get_funds_listing() {
        let client = FMarketClient::new();
        let funds = client.get_funds_listing().await.unwrap();

        assert!(!funds.is_empty());
        // Check for common funds
        assert!(funds.iter().any(|f| f.short_name == "VESAF" || f.short_name == "TCBF"));
    }

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_search_fund() {
        let client = FMarketClient::new();
        let fund = client.search_fund("VESAF").await.unwrap();

        assert!(fund.is_some());
        let fund = fund.unwrap();
        assert_eq!(fund.short_name, "VESAF");
        assert!(fund.id > 0);
    }

    #[tokio::test]
    #[ignore] // Requires network access
    async fn test_get_nav_history() {
        let mut client = FMarketClient::new();

        // First get fund ID
        let fund_id = client.get_fund_id("VESAF").await.unwrap();

        // Then get NAV history
        let history = client
            .get_nav_history(fund_id, "2024-01-01", "2024-01-31")
            .await
            .unwrap();

        assert!(!history.is_empty());
        assert!(history[0].nav > 0.0);
    }
}
