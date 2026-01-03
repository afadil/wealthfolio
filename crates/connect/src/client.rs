//! HTTP client for Wealthfolio Connect cloud API.
//!
//! This module provides a shared HTTP client for communicating with the
//! Wealthfolio Connect cloud service. Both Tauri and server implementations
//! should use this client to ensure consistency.

use async_trait::async_trait;
use log::{debug, info};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::de::DeserializeOwned;
use std::time::Duration;

use crate::broker::{
    BrokerAccount, BrokerBrokerage, BrokerConnection, BrokerConnectionBrokerage,
    PaginatedUniversalActivity, PlanPricing, PlanPricingPeriods, PlansResponse, SubscriptionPlan,
    UserInfo, UserTeam,
};
use wealthfolio_core::errors::{Error, Result};

use super::broker::BrokerApiClient;

/// Default timeout for API requests.
const DEFAULT_TIMEOUT_SECS: u64 = 30;

/// Default base URL for Wealthfolio Connect cloud service.
pub const DEFAULT_CLOUD_API_URL: &str = "https://api.wealthfolio.app";

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types (internal, for parsing cloud API responses)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
struct ApiConnectionsResponse {
    #[serde(default)]
    connections: Vec<ApiConnection>,
}

#[allow(dead_code)]
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
struct ApiConnection {
    id: String,
    authorization_id: Option<String>,
    brokerage_name: Option<String>,
    brokerage_slug: Option<String>,
    brokerage: Option<ApiBrokerage>,
    disabled: Option<bool>,
    updated_at: Option<String>,
    name: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
struct ApiBrokerage {
    id: Option<String>,
    name: Option<String>,
    display_name: Option<String>,
    slug: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct ApiAccountsResponse {
    #[serde(default)]
    accounts: Vec<BrokerAccount>,
}

#[derive(Debug, serde::Deserialize)]
struct ApiPlansResponse {
    plans: Vec<ApiPlan>,
}

#[allow(dead_code)]
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiPlan {
    id: String,
    name: String,
    #[serde(default)]
    tagline: Option<String>,
    description: String,
    features: Vec<String>,
    #[serde(default)]
    features_extended: Option<Vec<String>>,
    pricing: ApiPlanPricing,
    #[serde(default)]
    limits: Option<serde_json::Value>,
    #[serde(default)]
    is_available: Option<bool>,
    #[serde(default)]
    is_coming_soon: Option<bool>,
    #[serde(default)]
    badge: Option<String>,
    #[serde(default)]
    yearly_discount_percent: Option<i32>,
}

#[allow(dead_code)]
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiPlanPricing {
    monthly: f64,
    yearly: f64,
    #[serde(default)]
    yearly_per_month: Option<f64>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiUser {
    id: String,
    email: Option<String>,
    full_name: Option<String>,
    avatar_url: Option<String>,
    locale: Option<String>,
    week_starts_on_monday: Option<bool>,
    timezone: Option<String>,
    timezone_auto_sync: Option<bool>,
    time_format: Option<i32>,
    date_format: Option<String>,
    team_id: Option<String>,
    team_role: Option<String>,
    team: Option<ApiTeam>,
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiTeam {
    id: String,
    name: Option<String>,
    logo_url: Option<String>,
    plan: String,
    #[serde(default)]
    subscription_status: Option<String>,
    #[serde(default)]
    subscription_current_period_end: Option<String>,
    #[serde(default)]
    subscription_cancel_at_period_end: Option<bool>,
    #[serde(default)]
    trial_ends_at: Option<String>,
}

#[allow(dead_code)]
#[derive(Debug, serde::Deserialize)]
struct ApiErrorResponse {
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    message: Option<String>,
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect API Client
// ─────────────────────────────────────────────────────────────────────────────

/// HTTP client for the Wealthfolio Connect cloud API.
///
/// This client provides methods for:
/// - Fetching broker connections, accounts, and activities
/// - Getting subscription plans
/// - Getting user information
///
/// # Example
///
/// ```ignore
/// let client = ConnectApiClient::new("https://api.wealthfolio.app", "your-token")?;
/// let connections = client.list_connections().await?;
/// ```
#[derive(Debug, Clone)]
pub struct ConnectApiClient {
    client: reqwest::Client,
    base_url: String,
    auth_header: HeaderValue,
}

impl ConnectApiClient {
    /// Create a new Connect API client.
    ///
    /// # Arguments
    ///
    /// * `base_url` - The base URL of the cloud API (e.g., "https://api.wealthfolio.app")
    /// * `access_token` - A valid JWT access token
    ///
    /// # Errors
    ///
    /// Returns an error if the access token format is invalid or the HTTP client
    /// cannot be initialized.
    pub fn new(base_url: &str, access_token: &str) -> Result<Self> {
        let auth_header = HeaderValue::from_str(&format!("Bearer {}", access_token))
            .map_err(|e| Error::Unexpected(format!("Invalid access token format: {}", e)))?;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .build()
            .map_err(|e| Error::Unexpected(format!("Failed to initialize HTTP client: {}", e)))?;

        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            auth_header,
        })
    }

    /// Create default headers for API requests.
    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(AUTHORIZATION, self.auth_header.clone());
        headers
    }

    /// Make a GET request and parse the response.
    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        debug!("[ConnectApi] GET {}", url);

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| Error::Unexpected(format!("Request failed: {}", e)))?;

        self.parse_response(response).await
    }

    /// Parse an HTTP response, handling errors appropriately.
    async fn parse_response<T: DeserializeOwned>(&self, response: reqwest::Response) -> Result<T> {
        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| Error::Unexpected(format!("Failed to read response: {}", e)))?;

        if !status.is_success() {
            // Try to parse error response for a better message
            if let Ok(err) = serde_json::from_str::<ApiErrorResponse>(&body) {
                let msg = err
                    .message
                    .or(err.error)
                    .unwrap_or_else(|| format!("HTTP {}", status));
                return Err(Error::Unexpected(format!("API error: {}", msg)));
            }
            return Err(Error::Unexpected(format!(
                "API error {}: {}",
                status,
                body.chars().take(200).collect::<String>()
            )));
        }

        serde_json::from_str(&body)
            .map_err(|e| Error::Unexpected(format!("Failed to parse response: {} - {}", e, body)))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Brokerage Endpoints
    // ─────────────────────────────────────────────────────────────────────────

    /// Fetch account activities with pagination.
    ///
    /// # Arguments
    ///
    /// * `account_id` - The broker account ID (provider's ID)
    /// * `start_date` - Optional start date filter (YYYY-MM-DD)
    /// * `end_date` - Optional end date filter (YYYY-MM-DD)
    /// * `offset` - Pagination offset
    /// * `limit` - Maximum number of results per page
    pub async fn get_account_activities(
        &self,
        account_id: &str,
        start_date: Option<&str>,
        end_date: Option<&str>,
        offset: Option<i64>,
        limit: Option<i64>,
    ) -> Result<PaginatedUniversalActivity> {
        let mut url = format!(
            "{}/api/v1/sync/brokerage/accounts/{}/activities",
            self.base_url, account_id
        );

        // Build query parameters
        let mut params = Vec::new();
        if let Some(v) = offset {
            params.push(format!("offset={}", v));
        }
        if let Some(v) = limit {
            params.push(format!("limit={}", v));
        }
        if let Some(v) = start_date {
            params.push(format!("start_date={}", v));
        }
        if let Some(v) = end_date {
            params.push(format!("end_date={}", v));
        }
        if !params.is_empty() {
            url = format!("{}?{}", url, params.join("&"));
        }

        debug!("[ConnectApi] Fetching activities from: {}", url);

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| Error::Unexpected(format!("Failed to fetch activities: {}", e)))?;

        self.parse_response(response).await
    }

    // ─────────────────────────────────────────────────────────────────────────
    // User & Subscription Endpoints
    // ─────────────────────────────────────────────────────────────────────────

    /// Get the current user's information.
    pub async fn get_user_info(&self) -> Result<UserInfo> {
        let api_user: Option<ApiUser> = self.get("/api/v1/user/me").await?;

        let user =
            api_user.ok_or_else(|| Error::Unexpected("No user info returned".to_string()))?;

        Ok(UserInfo {
            id: user.id,
            email: user.email.unwrap_or_default(),
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            locale: user.locale,
            week_starts_on_monday: user.week_starts_on_monday,
            timezone: user.timezone,
            timezone_auto_sync: user.timezone_auto_sync,
            time_format: user.time_format,
            date_format: user.date_format,
            team_id: user.team_id,
            team_role: user.team_role,
            team: user.team.map(|t| UserTeam {
                id: t.id,
                name: t.name.unwrap_or_default(),
                logo_url: t.logo_url,
                plan: t.plan,
                subscription_status: t.subscription_status,
                subscription_current_period_end: t.subscription_current_period_end,
                subscription_cancel_at_period_end: t.subscription_cancel_at_period_end,
                trial_ends_at: t.trial_ends_at,
            }),
        })
    }

    /// Get available subscription plans.
    pub async fn get_subscription_plans(&self) -> Result<PlansResponse> {
        let api_response: ApiPlansResponse = self.get("/api/v1/subscription/plans").await?;

        let plans = api_response
            .plans
            .into_iter()
            .map(|p| SubscriptionPlan {
                id: p.id,
                name: p.name,
                description: p.description,
                features: p.features,
                pricing: PlanPricingPeriods {
                    monthly: PlanPricing {
                        amount: p.pricing.monthly,
                        currency: "USD".to_string(),
                        price_id: None,
                    },
                    yearly: PlanPricing {
                        amount: p.pricing.yearly,
                        currency: "USD".to_string(),
                        price_id: None,
                    },
                },
            })
            .collect();

        Ok(PlansResponse { plans })
    }

    /// Check if the current user has an active subscription.
    pub async fn has_active_subscription(&self) -> Result<bool> {
        let user_info = self.get_user_info().await?;

        let subscription_status = user_info.team.and_then(|t| t.subscription_status);

        match subscription_status.as_deref() {
            Some("active") => {
                debug!("[ConnectApi] User has active subscription");
                Ok(true)
            }
            status => {
                debug!(
                    "[ConnectApi] User does not have active subscription: {:?}",
                    status
                );
                Ok(false)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BrokerApiClient Trait Implementation
// ─────────────────────────────────────────────────────────────────────────────

#[async_trait]
impl BrokerApiClient for ConnectApiClient {
    /// Fetch all broker connections for the user.
    async fn list_connections(&self) -> Result<Vec<BrokerConnection>> {
        let api_response: ApiConnectionsResponse =
            self.get("/api/v1/sync/brokerage/connections").await?;

        let connections: Vec<BrokerConnection> = api_response
            .connections
            .into_iter()
            .map(|c| {
                // Use brokerage object if present, otherwise use top-level fields
                let brokerage = c.brokerage.map(|b| BrokerConnectionBrokerage {
                    id: b.id,
                    slug: b.slug,
                    name: b.name.clone(),
                    display_name: b.display_name.or(b.name),
                    aws_s3_logo_url: None,
                    aws_s3_square_logo_url: None,
                });

                let brokerage = brokerage.or_else(|| {
                    if c.brokerage_name.is_some() || c.brokerage_slug.is_some() {
                        Some(BrokerConnectionBrokerage {
                            id: None,
                            slug: c.brokerage_slug,
                            name: c.brokerage_name.clone(),
                            display_name: c.brokerage_name,
                            aws_s3_logo_url: None,
                            aws_s3_square_logo_url: None,
                        })
                    } else {
                        None
                    }
                });

                BrokerConnection {
                    id: c.authorization_id.unwrap_or(c.id),
                    brokerage,
                    connection_type: None,
                    disabled: c.disabled.unwrap_or(false),
                    disabled_date: None,
                    updated_at: c.updated_at,
                }
            })
            .collect();

        let count = connections.len();
        info!("[ConnectApi] Fetched {} broker connections", count);
        Ok(connections)
    }

    /// Fetch all broker accounts for the user.
    async fn list_accounts(
        &self,
        _authorization_ids: Option<Vec<String>>,
    ) -> Result<Vec<BrokerAccount>> {
        let api_response: ApiAccountsResponse = self.get("/api/v1/sync/brokerage/accounts").await?;

        info!(
            "[ConnectApi] Fetched {} broker accounts",
            api_response.accounts.len()
        );
        Ok(api_response.accounts)
    }

    /// Fetch all available brokerages (not implemented in REST API).
    async fn list_brokerages(&self) -> Result<Vec<BrokerBrokerage>> {
        // The REST API doesn't have a separate brokerages endpoint
        // Brokerages are embedded in connections
        Ok(vec![])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_client_creation() {
        let client = ConnectApiClient::new("https://api.wealthfolio.app", "test-token");
        assert!(client.is_ok());
    }

    #[test]
    fn test_client_url_normalization() {
        let client = ConnectApiClient::new("https://api.wealthfolio.app/", "test-token").unwrap();
        assert_eq!(client.base_url, "https://api.wealthfolio.app");
    }
}
