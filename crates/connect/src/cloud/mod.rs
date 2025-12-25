//! Wealthfolio Connect API client.
//!
//! This module provides a shared HTTP client for communicating with the
//! Wealthfolio Connect cloud service via tRPC.

use log::debug;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{de::DeserializeOwned, Deserialize};
use std::time::Duration;

use crate::broker::{
    BrokerAccount, BrokerConnection, ConnectPortalRequest, ConnectPortalResponse,
    PaginatedUniversalActivity, PlanPricingPeriods, PlanPricing, PlansResponse, SubscriptionPlan,
    UserInfo,
};

// ─────────────────────────────────────────────────────────────────────────────
// tRPC Response Parsing
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct TrpcResponse<T> {
    result: TrpcResult<T>,
}

#[derive(Debug, Deserialize)]
struct TrpcResult<T> {
    data: T,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TrpcEnvelope<T> {
    Single(TrpcResponse<T>),
    Batch(Vec<TrpcResponse<T>>),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TrpcData<T> {
    Json { json: T },
    Raw(T),
}

impl<T> TrpcData<T> {
    fn into_inner(self) -> T {
        match self {
            Self::Raw(v) => v,
            Self::Json { json } => json,
        }
    }
}

fn parse_trpc_body<T: DeserializeOwned>(
    status: reqwest::StatusCode,
    body: &str,
) -> Result<T, String> {
    let envelope: TrpcEnvelope<TrpcData<T>> = serde_json::from_str(body).map_err(|e| {
        // tRPC can return errors with HTTP 200 (especially for query procedures).
        // Try to surface a clean error message.
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
            let message = v
                .pointer("/error/message")
                .and_then(|m| m.as_str())
                .or_else(|| v.pointer("/0/error/message").and_then(|m| m.as_str()));
            if let Some(message) = message {
                return format!("tRPC error (status {}): {}", status, message);
            }
        }
        format!("Failed to parse tRPC response (status {}): {}", status, e)
    })?;

    let data = match envelope {
        TrpcEnvelope::Single(r) => r.result.data,
        TrpcEnvelope::Batch(items) => items
            .into_iter()
            .next()
            .ok_or_else(|| "Empty batched tRPC response".to_string())?
            .result
            .data,
    };

    Ok(data.into_inner())
}

async fn parse_trpc_response<T: DeserializeOwned>(response: reqwest::Response) -> Result<T, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;
    parse_trpc_body(status, &body)
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types (raw API format before conversion)
// ─────────────────────────────────────────────────────────────────────────────

/// A subscription plan as returned by the API
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiSubscriptionPlan {
    pub id: String,
    pub name: String,
    pub description: String,
    pub features: Vec<String>,
    pub pricing: ApiPlanPricing,
    #[serde(default)]
    #[allow(dead_code)]
    pub is_available: Option<bool>,
    #[serde(default)]
    #[allow(dead_code)]
    pub yearly_discount_percent: Option<i32>,
}

/// Pricing as returned by the API (just numbers)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiPlanPricing {
    pub monthly: f64,
    pub yearly: f64,
    #[serde(default)]
    #[allow(dead_code)]
    pub yearly_per_month: Option<f64>,
}

/// Plans object from API (keyed by plan id)
#[derive(Debug, Clone, Deserialize)]
struct ApiPlansMap {
    pub essentials: Option<ApiSubscriptionPlan>,
    pub duo: Option<ApiSubscriptionPlan>,
    pub plus: Option<ApiSubscriptionPlan>,
}

/// Raw response from subscription.plans endpoint
#[derive(Debug, Clone, Deserialize)]
struct ApiPlansResponse {
    pub plans: ApiPlansMap,
}

impl From<ApiSubscriptionPlan> for SubscriptionPlan {
    fn from(api: ApiSubscriptionPlan) -> Self {
        Self {
            id: api.id,
            name: api.name,
            description: api.description,
            features: api.features,
            pricing: PlanPricingPeriods {
                monthly: PlanPricing {
                    amount: api.pricing.monthly,
                    currency: "USD".to_string(),
                    price_id: None,
                },
                yearly: PlanPricing {
                    amount: api.pricing.yearly,
                    currency: "USD".to_string(),
                    price_id: None,
                },
            },
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloud API Client
// ─────────────────────────────────────────────────────────────────────────────

/// HTTP client for the Wealthfolio Connect API.
pub struct ConnectApiClient {
    client: reqwest::Client,
    base_url: String,
    auth_header: HeaderValue,
}

impl ConnectApiClient {
    /// Create a new Connect API client.
    ///
    /// # Arguments
    /// * `base_url` - The base URL of the Connect API (e.g., "https://api.wealthfolio.app")
    /// * `access_token` - The bearer token for authentication
    pub fn new(base_url: String, access_token: &str) -> Result<Self, String> {
        let auth_header = HeaderValue::from_str(&format!("Bearer {}", access_token))
            .map_err(|e| format!("Invalid access token: {}", e))?;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| format!("Failed to initialize HTTP client: {}", e))?;

        Ok(Self {
            client,
            base_url,
            auth_header,
        })
    }

    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(AUTHORIZATION, self.auth_header.clone());
        headers
    }

    fn encode_input(input: &serde_json::Value) -> String {
        let input_str = input.to_string();
        urlencoding::encode(&input_str).to_string()
    }

    /// Fetch all broker connections for the user.
    pub async fn list_connections(&self) -> Result<Vec<BrokerConnection>, String> {
        let url = format!("{}/trpc/brokerage.listConnections", self.base_url);
        debug!("Fetching connections from: {}", url);

        let input = serde_json::json!({ "json": serde_json::json!({}) });
        let full_url = format!("{}?input={}", url, Self::encode_input(&input));

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch connections: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error fetching connections: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Fetch all broker accounts for the user.
    pub async fn list_accounts(&self) -> Result<Vec<BrokerAccount>, String> {
        let url = format!("{}/trpc/brokerage.listAccounts", self.base_url);
        debug!("Fetching accounts from: {}", url);

        let input = serde_json::json!({ "json": serde_json::json!({}) });
        let full_url = format!("{}?input={}", url, Self::encode_input(&input));

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch accounts: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error fetching accounts: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Fetch paginated activities for a broker account.
    pub async fn get_activities(
        &self,
        account_id: &str,
        start_date: Option<&str>,
    ) -> Result<PaginatedUniversalActivity, String> {
        let url = format!("{}/trpc/brokerage.getActivities", self.base_url);

        let mut params = serde_json::json!({ "accountId": account_id });
        if let Some(date) = start_date {
            params["startDate"] = serde_json::Value::String(date.to_string());
        }

        let input = serde_json::json!({ "json": params });
        let full_url = format!("{}?input={}", url, Self::encode_input(&input));

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch activities: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error fetching activities: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Get the connect portal URL for linking a broker.
    pub async fn get_connect_portal(
        &self,
        request: &ConnectPortalRequest,
    ) -> Result<ConnectPortalResponse, String> {
        let url = format!("{}/trpc/brokerage.getConnectPortal", self.base_url);

        let body = serde_json::json!({ "json": request });

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Failed to get connect portal: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error getting connect portal: {} - {}", status, body));
        }

        parse_trpc_response(response).await
    }

    /// Fetch subscription plans.
    pub async fn get_subscription_plans(&self) -> Result<PlansResponse, String> {
        let url = format!("{}/trpc/subscription.plans", self.base_url);
        debug!("Fetching subscription plans from: {}", url);

        let input = serde_json::json!({ "json": serde_json::json!({}) });
        let full_url = format!("{}?input={}", url, Self::encode_input(&input));

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch subscription plans: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!(
                "API error fetching subscription plans: {} - {}",
                status, body
            ));
        }

        // Parse the API response (plans as object) and convert to frontend format (plans as array)
        let api_response: ApiPlansResponse = parse_trpc_response(response).await?;

        let mut plans = Vec::new();
        if let Some(essentials) = api_response.plans.essentials {
            plans.push(SubscriptionPlan::from(essentials));
        }
        if let Some(duo) = api_response.plans.duo {
            plans.push(SubscriptionPlan::from(duo));
        }
        if let Some(plus) = api_response.plans.plus {
            plans.push(SubscriptionPlan::from(plus));
        }

        Ok(PlansResponse { plans })
    }

    /// Fetch current user info.
    pub async fn get_user_info(&self) -> Result<UserInfo, String> {
        let url = format!("{}/trpc/user.me", self.base_url);
        debug!("Fetching user info from: {}", url);

        let input = serde_json::json!({ "json": serde_json::json!({}) });
        let full_url = format!("{}?input={}", url, Self::encode_input(&input));

        let response = self
            .client
            .get(&full_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to fetch user info: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("API error fetching user info: {} - {}", status, body));
        }

        // Parse response manually to handle the tRPC SuperJSON response format
        let body = response
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {}", e))?;

        let json: serde_json::Value =
            serde_json::from_str(&body).map_err(|e| format!("Failed to parse JSON: {}", e))?;

        // Extract user data from the nested structure
        // Format: {"result":{"data":{"json":{...user data...}}}}
        let user_data = json
            .pointer("/result/data/json")
            .or_else(|| json.pointer("/result/data"))
            .ok_or_else(|| format!("Missing result.data in response: {}", body))?;

        serde_json::from_value(user_data.clone())
            .map_err(|e| format!("Failed to parse user info: {} - data: {}", e, user_data))
    }
}
