//! Health Center domain models.
//!
//! This module contains the core data structures for the health diagnostic system:
//! - Severity levels and categories for health issues
//! - Health issue representation with resolution actions
//! - Aggregated health status
//! - Configuration for check thresholds

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::hash::Hash;

// =============================================================================
// Severity
// =============================================================================

/// Severity levels for health issues.
///
/// Ordered from lowest to highest: Info < Warning < Error < Critical.
/// This ordering is used to determine the overall health status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[derive(Default)]
pub enum Severity {
    #[default]
    Info,
    Warning,
    Error,
    Critical,
}

impl Severity {
    /// Returns the string representation of this severity.
    pub fn as_str(&self) -> &'static str {
        match self {
            Severity::Info => "INFO",
            Severity::Warning => "WARNING",
            Severity::Error => "ERROR",
            Severity::Critical => "CRITICAL",
        }
    }
}


impl std::fmt::Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// =============================================================================
// Health Category
// =============================================================================

/// Categories of health checks.
///
/// Each category groups related health issues together for filtering
/// and organization in the UI.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum HealthCategory {
    /// Issues related to stale or missing asset prices
    PriceStaleness,
    /// Issues related to missing or stale FX rates
    FxIntegrity,
    /// Issues related to missing asset classifications
    Classification,
    /// Issues related to data inconsistencies (orphan records, invariant violations)
    DataConsistency,
    /// Issues related to account configuration (tracking mode, etc.)
    AccountConfiguration,
}

impl HealthCategory {
    /// Returns the string representation of this category.
    pub fn as_str(&self) -> &'static str {
        match self {
            HealthCategory::PriceStaleness => "PRICE_STALENESS",
            HealthCategory::FxIntegrity => "FX_INTEGRITY",
            HealthCategory::Classification => "CLASSIFICATION",
            HealthCategory::DataConsistency => "DATA_CONSISTENCY",
            HealthCategory::AccountConfiguration => "ACCOUNT_CONFIGURATION",
        }
    }

    /// Returns a human-friendly label for this category.
    pub fn label(&self) -> &'static str {
        match self {
            HealthCategory::PriceStaleness => "Price Updates",
            HealthCategory::FxIntegrity => "Exchange Rates",
            HealthCategory::Classification => "Classifications",
            HealthCategory::DataConsistency => "Data Consistency",
            HealthCategory::AccountConfiguration => "Account Setup",
        }
    }
}

impl std::fmt::Display for HealthCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.label())
    }
}

// =============================================================================
// Fix Action
// =============================================================================

/// An action that can automatically fix a health issue.
///
/// Fix actions are safe, automated operations like refreshing stale data.
/// The backend handles executing these actions when triggered by the user.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FixAction {
    /// Unique identifier for the action type (e.g., "sync_prices", "fetch_fx")
    pub id: String,
    /// Human-readable button label (e.g., "Sync Prices")
    pub label: String,
    /// JSON payload containing data needed to execute the action
    pub payload: Value,
}

impl FixAction {
    /// Creates a new fix action for syncing prices.
    pub fn sync_prices(asset_ids: Vec<String>) -> Self {
        Self {
            id: "sync_prices".to_string(),
            label: "Sync Prices".to_string(),
            payload: serde_json::json!(asset_ids),
        }
    }

    /// Creates a new fix action for fetching FX rates.
    pub fn fetch_fx(currency_pairs: Vec<String>) -> Self {
        Self {
            id: "fetch_fx".to_string(),
            label: "Fetch Exchange Rates".to_string(),
            payload: serde_json::json!(currency_pairs),
        }
    }

    /// Creates a new fix action for migrating legacy classifications.
    pub fn migrate_classifications(asset_ids: Vec<String>) -> Self {
        Self {
            id: "migrate_classifications".to_string(),
            label: "Migrate Classifications".to_string(),
            payload: serde_json::json!(asset_ids),
        }
    }

    /// Creates a new fix action for migrating all legacy classifications.
    pub fn migrate_legacy_classifications() -> Self {
        Self {
            id: "migrate_legacy_classifications".to_string(),
            label: "Start Migration".to_string(),
            payload: serde_json::json!(null),
        }
    }

    /// Creates a new fix action for retrying sync on failed assets.
    pub fn retry_sync(asset_ids: Vec<String>) -> Self {
        Self {
            id: "retry_sync".to_string(),
            label: "Retry Sync".to_string(),
            payload: serde_json::json!(asset_ids),
        }
    }
}

// =============================================================================
// Navigate Action
// =============================================================================

/// A navigation target for manual issue resolution.
///
/// Navigate actions guide users to the appropriate page where they
/// can manually resolve an issue (e.g., assigning classifications).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NavigateAction {
    /// The route path to navigate to (e.g., "/holdings")
    pub route: String,
    /// Optional query parameters for the route
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<Value>,
    /// Human-readable button label (e.g., "View Holdings")
    pub label: String,
}

// =============================================================================
// Affected Item
// =============================================================================

/// An item affected by a health issue.
///
/// Provides identifying information for display in the UI with optional
/// navigation route to the item's detail page.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AffectedItem {
    /// Unique identifier for the item (e.g., asset ID)
    pub id: String,
    /// Display name (e.g., "Apple Inc.")
    pub name: String,
    /// Symbol/ticker for badge display (e.g., "AAPL")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub symbol: Option<String>,
    /// Optional route to navigate to the item's detail page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub route: Option<String>,
}

impl AffectedItem {
    /// Creates a new affected item for an asset with name and symbol.
    pub fn asset_with_name(
        id: impl Into<String>,
        symbol: impl Into<String>,
        name: Option<String>,
    ) -> Self {
        let id_str = id.into();
        let symbol_str = symbol.into();
        Self {
            route: Some(format!("/holdings/{}", urlencoding::encode(&id_str))),
            id: id_str,
            name: name.unwrap_or_else(|| symbol_str.clone()),
            symbol: Some(symbol_str),
        }
    }

    /// Creates a new affected item for an asset (symbol only).
    pub fn asset(id: impl Into<String>, symbol: impl Into<String>) -> Self {
        let id_str = id.into();
        let symbol_str = symbol.into();
        Self {
            route: Some(format!("/holdings/{}", urlencoding::encode(&id_str))),
            id: id_str,
            name: symbol_str.clone(),
            symbol: Some(symbol_str),
        }
    }

    /// Creates a new affected item for an asset with market data issues.
    /// Links to the asset page with the market-data tab.
    pub fn asset_market_data(id: impl Into<String>, symbol: impl Into<String>) -> Self {
        let id_str = id.into();
        let symbol_str = symbol.into();
        Self {
            route: Some(format!(
                "/holdings/{}?tab=market-data",
                urlencoding::encode(&id_str)
            )),
            id: id_str,
            name: symbol_str.clone(),
            symbol: Some(symbol_str),
        }
    }

    /// Creates a new affected item without a route.
    pub fn simple(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            symbol: None,
            route: None,
        }
    }

    /// Creates a new affected item for an account.
    pub fn account(id: impl Into<String>, name: impl Into<String>) -> Self {
        let id_str = id.into();
        Self {
            route: Some(format!("/accounts/{}", urlencoding::encode(&id_str))),
            id: id_str,
            name: name.into(),
            symbol: None,
        }
    }
}

impl NavigateAction {
    /// Creates a navigate action to the holdings page with an optional filter.
    pub fn to_holdings(filter: Option<&str>) -> Self {
        Self {
            route: "/holdings".to_string(),
            query: filter.map(|f| serde_json::json!({ "filter": f })),
            label: "View Holdings".to_string(),
        }
    }

    /// Creates a navigate action to the activities page.
    pub fn to_activities(filter: Option<&str>) -> Self {
        Self {
            route: "/activities".to_string(),
            query: filter.map(|f| serde_json::json!({ "filter": f })),
            label: "View Activities".to_string(),
        }
    }

    /// Creates a navigate action to the accounts page.
    pub fn to_accounts() -> Self {
        Self {
            route: "/settings/accounts".to_string(),
            query: None,
            label: "View Accounts".to_string(),
        }
    }

    /// Creates a navigate action to the taxonomies settings page.
    pub fn to_taxonomies() -> Self {
        Self {
            route: "/settings/taxonomies".to_string(),
            query: None,
            label: "View Classifications".to_string(),
        }
    }

    /// Creates a navigate action to the market data settings page.
    pub fn to_market_data() -> Self {
        Self {
            route: "/settings/market-data".to_string(),
            query: None,
            label: "View Market Data".to_string(),
        }
    }

    /// Creates a navigate action to the connect page.
    pub fn to_connect() -> Self {
        Self {
            route: "/connect".to_string(),
            query: None,
            label: "Configure Accounts".to_string(),
        }
    }
}

// =============================================================================
// Health Issue
// =============================================================================

/// A health issue detected by a diagnostic check.
///
/// Health issues are structured diagnostic results that provide:
/// - Clear identification of the problem
/// - Impact assessment (affected count, % of portfolio)
/// - Resolution path (fix action or navigation)
/// - Data hash for change detection (to restore dismissed issues when data changes)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HealthIssue {
    /// Stable unique identifier for this issue type and affected items.
    /// Format varies by category (e.g., "price_stale:AAPL", "fx_missing:EUR:USD")
    pub id: String,

    /// Severity level of the issue
    pub severity: Severity,

    /// Category this issue belongs to
    pub category: HealthCategory,

    /// Short, user-friendly title (max 40 chars)
    /// Example: "Outdated prices for 5 holdings"
    pub title: String,

    /// Longer explanation of the issue and its impact (max 150 chars)
    /// Example: "Your holdings haven't had prices updated recently."
    pub message: String,

    /// Number of items affected by this issue
    pub affected_count: u32,

    /// Percentage of total portfolio market value affected (0.0 to 1.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affected_mv_pct: Option<f64>,

    /// Optional automated fix action
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fix_action: Option<FixAction>,

    /// Optional navigation action for manual resolution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub navigate_action: Option<NavigateAction>,

    /// Additional details for the issue drawer (can be longer text)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,

    /// List of affected items (e.g., assets, accounts) for display in detail view
    #[serde(skip_serializing_if = "Option::is_none")]
    pub affected_items: Option<Vec<AffectedItem>>,

    /// Hash of the underlying data that caused this issue.
    /// Used to detect when data changes after dismissal.
    pub data_hash: String,

    /// When this issue was detected
    pub timestamp: DateTime<Utc>,
}

impl HealthIssue {
    /// Creates a new health issue builder.
    pub fn builder() -> HealthIssueBuilder {
        HealthIssueBuilder::default()
    }
}

/// Builder for constructing HealthIssue instances.
#[derive(Debug, Default)]
pub struct HealthIssueBuilder {
    id: Option<String>,
    severity: Severity,
    category: Option<HealthCategory>,
    title: Option<String>,
    message: Option<String>,
    affected_count: u32,
    affected_mv_pct: Option<f64>,
    fix_action: Option<FixAction>,
    navigate_action: Option<NavigateAction>,
    details: Option<String>,
    affected_items: Option<Vec<AffectedItem>>,
    data_hash: Option<String>,
}

impl HealthIssueBuilder {
    pub fn id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }

    pub fn severity(mut self, severity: Severity) -> Self {
        self.severity = severity;
        self
    }

    pub fn category(mut self, category: HealthCategory) -> Self {
        self.category = Some(category);
        self
    }

    pub fn title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    pub fn message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }

    pub fn affected_count(mut self, count: u32) -> Self {
        self.affected_count = count;
        self
    }

    pub fn affected_mv_pct(mut self, pct: f64) -> Self {
        self.affected_mv_pct = Some(pct);
        self
    }

    pub fn fix_action(mut self, action: FixAction) -> Self {
        self.fix_action = Some(action);
        self
    }

    pub fn navigate_action(mut self, action: NavigateAction) -> Self {
        self.navigate_action = Some(action);
        self
    }

    pub fn details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }

    pub fn affected_items(mut self, items: Vec<AffectedItem>) -> Self {
        self.affected_items = Some(items);
        self
    }

    pub fn data_hash(mut self, hash: impl Into<String>) -> Self {
        self.data_hash = Some(hash.into());
        self
    }

    /// Builds the HealthIssue.
    ///
    /// # Panics
    ///
    /// Panics if required fields (id, category, title, message, data_hash) are not set.
    pub fn build(self) -> HealthIssue {
        HealthIssue {
            id: self.id.expect("id is required"),
            severity: self.severity,
            category: self.category.expect("category is required"),
            title: self.title.expect("title is required"),
            message: self.message.expect("message is required"),
            affected_count: self.affected_count,
            affected_mv_pct: self.affected_mv_pct,
            fix_action: self.fix_action,
            navigate_action: self.navigate_action,
            details: self.details,
            affected_items: self.affected_items,
            data_hash: self.data_hash.expect("data_hash is required"),
            timestamp: Utc::now(),
        }
    }
}

// =============================================================================
// Health Status
// =============================================================================

/// Aggregated health status for the portfolio.
///
/// This is the top-level structure returned by health checks,
/// containing the overall severity, counts, and list of issues.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    /// The highest severity level across all issues
    pub overall_severity: Severity,

    /// Count of issues at each severity level
    pub issue_counts: HashMap<Severity, u32>,

    /// All detected issues
    pub issues: Vec<HealthIssue>,

    /// When the checks were last run
    pub checked_at: DateTime<Utc>,

    /// True if the cached results are older than 5 minutes
    pub is_stale: bool,
}

impl HealthStatus {
    /// Creates an empty health status (no issues).
    pub fn healthy() -> Self {
        Self {
            overall_severity: Severity::Info,
            issue_counts: HashMap::new(),
            issues: Vec::new(),
            checked_at: Utc::now(),
            is_stale: false,
        }
    }

    /// Creates a health status from a list of issues.
    pub fn from_issues(issues: Vec<HealthIssue>) -> Self {
        let mut issue_counts: HashMap<Severity, u32> = HashMap::new();
        let mut overall_severity = Severity::Info;

        for issue in &issues {
            *issue_counts.entry(issue.severity).or_insert(0) += 1;
            if issue.severity > overall_severity {
                overall_severity = issue.severity;
            }
        }

        Self {
            overall_severity,
            issue_counts,
            issues,
            checked_at: Utc::now(),
            is_stale: false,
        }
    }

    /// Returns the total number of issues.
    pub fn total_count(&self) -> u32 {
        self.issues.len() as u32
    }

    /// Returns issues filtered by severity.
    pub fn issues_by_severity(&self, severity: Severity) -> Vec<&HealthIssue> {
        self.issues
            .iter()
            .filter(|i| i.severity == severity)
            .collect()
    }

    /// Returns issues filtered by category.
    pub fn issues_by_category(&self, category: HealthCategory) -> Vec<&HealthIssue> {
        self.issues
            .iter()
            .filter(|i| i.category == category)
            .collect()
    }

    /// Marks the status as stale.
    pub fn mark_stale(&mut self) {
        self.is_stale = true;
    }
}

impl Default for HealthStatus {
    fn default() -> Self {
        Self::healthy()
    }
}

// =============================================================================
// Health Config
// =============================================================================

/// Configuration for health check thresholds.
///
/// These settings control when issues are raised and at what severity.
/// All thresholds are configurable to allow users to adjust sensitivity.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HealthConfig {
    /// Hours after which a stale price triggers a Warning (default: 24)
    pub price_stale_warning_hours: u32,

    /// Hours after which a stale price triggers an Error (default: 72)
    pub price_stale_critical_hours: u32,

    /// Hours after which a stale FX rate triggers a Warning (default: 24)
    pub fx_stale_warning_hours: u32,

    /// Hours after which a stale FX rate triggers an Error (default: 72)
    pub fx_stale_critical_hours: u32,

    /// MV percentage threshold for escalating to Critical (default: 0.30 = 30%)
    pub mv_escalation_threshold: f64,

    /// MV percentage threshold for classification Warning → Error (default: 0.05 = 5%)
    pub classification_warn_threshold: f64,
}

impl Default for HealthConfig {
    fn default() -> Self {
        Self {
            price_stale_warning_hours: 24,
            price_stale_critical_hours: 72,
            fx_stale_warning_hours: 24,
            fx_stale_critical_hours: 72,
            mv_escalation_threshold: 0.30,
            classification_warn_threshold: 0.05,
        }
    }
}

// =============================================================================
// Issue Dismissal
// =============================================================================

/// Record of a dismissed health issue.
///
/// Stores the data_hash at dismissal time to detect when underlying
/// data changes (which should restore the issue to active status).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IssueDismissal {
    /// The issue ID that was dismissed
    pub issue_id: String,

    /// When the issue was dismissed
    pub dismissed_at: DateTime<Utc>,

    /// The data_hash of the issue at dismissal time
    pub data_hash: String,
}

impl IssueDismissal {
    /// Creates a new dismissal record.
    pub fn new(issue_id: impl Into<String>, data_hash: impl Into<String>) -> Self {
        Self {
            issue_id: issue_id.into(),
            dismissed_at: Utc::now(),
            data_hash: data_hash.into(),
        }
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_severity_ordering() {
        assert!(Severity::Info < Severity::Warning);
        assert!(Severity::Warning < Severity::Error);
        assert!(Severity::Error < Severity::Critical);

        // Max of severities should return Critical
        let severities = vec![Severity::Warning, Severity::Critical, Severity::Error];
        let max = severities.into_iter().max().unwrap();
        assert_eq!(max, Severity::Critical);
    }

    #[test]
    fn test_severity_serialization() {
        assert_eq!(
            serde_json::to_string(&Severity::Warning).unwrap(),
            "\"WARNING\""
        );
        assert_eq!(
            serde_json::from_str::<Severity>("\"CRITICAL\"").unwrap(),
            Severity::Critical
        );
    }

    #[test]
    fn test_category_serialization() {
        assert_eq!(
            serde_json::to_string(&HealthCategory::PriceStaleness).unwrap(),
            "\"PRICE_STALENESS\""
        );
        assert_eq!(
            serde_json::from_str::<HealthCategory>("\"FX_INTEGRITY\"").unwrap(),
            HealthCategory::FxIntegrity
        );
    }

    #[test]
    fn test_health_status_from_issues() {
        let issues = vec![
            HealthIssue::builder()
                .id("test1")
                .severity(Severity::Warning)
                .category(HealthCategory::PriceStaleness)
                .title("Test 1")
                .message("Message 1")
                .data_hash("hash1")
                .build(),
            HealthIssue::builder()
                .id("test2")
                .severity(Severity::Error)
                .category(HealthCategory::FxIntegrity)
                .title("Test 2")
                .message("Message 2")
                .data_hash("hash2")
                .build(),
            HealthIssue::builder()
                .id("test3")
                .severity(Severity::Warning)
                .category(HealthCategory::Classification)
                .title("Test 3")
                .message("Message 3")
                .data_hash("hash3")
                .build(),
        ];

        let status = HealthStatus::from_issues(issues);

        assert_eq!(status.overall_severity, Severity::Error);
        assert_eq!(status.issue_counts.get(&Severity::Warning), Some(&2));
        assert_eq!(status.issue_counts.get(&Severity::Error), Some(&1));
        assert_eq!(status.issue_counts.get(&Severity::Critical), None);
        assert_eq!(status.total_count(), 3);
    }

    #[test]
    fn test_health_status_healthy() {
        let status = HealthStatus::healthy();
        assert_eq!(status.overall_severity, Severity::Info);
        assert_eq!(status.total_count(), 0);
        assert!(!status.is_stale);
    }

    #[test]
    fn test_fix_action_constructors() {
        let sync = FixAction::sync_prices(vec!["AAPL".to_string()]);
        assert_eq!(sync.id, "sync_prices");
        assert_eq!(sync.label, "Sync Prices");

        let fx = FixAction::fetch_fx(vec!["EUR:USD".to_string()]);
        assert_eq!(fx.id, "fetch_fx");
    }

    #[test]
    fn test_navigate_action_constructors() {
        let holdings = NavigateAction::to_holdings(Some("unclassified"));
        assert_eq!(holdings.route, "/holdings");
        assert!(holdings.query.is_some());

        let accounts = NavigateAction::to_accounts();
        assert_eq!(accounts.route, "/settings/accounts");
        assert!(accounts.query.is_none());
    }

    #[test]
    fn test_health_config_defaults() {
        let config = HealthConfig::default();
        assert_eq!(config.price_stale_warning_hours, 24);
        assert_eq!(config.price_stale_critical_hours, 72);
        assert_eq!(config.mv_escalation_threshold, 0.30);
    }

    #[test]
    fn test_issue_dismissal() {
        let dismissal = IssueDismissal::new("price_stale:AAPL", "abc123");
        assert_eq!(dismissal.issue_id, "price_stale:AAPL");
        assert_eq!(dismissal.data_hash, "abc123");
    }

    #[test]
    fn test_health_issue_json_roundtrip() {
        let issue = HealthIssue::builder()
            .id("test_issue")
            .severity(Severity::Warning)
            .category(HealthCategory::PriceStaleness)
            .title("Test Issue")
            .message("This is a test")
            .affected_count(5)
            .affected_mv_pct(0.15)
            .fix_action(FixAction::sync_prices(vec!["AAPL".to_string()]))
            .data_hash("testhash")
            .build();

        let json = serde_json::to_string(&issue).unwrap();
        let parsed: HealthIssue = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.id, issue.id);
        assert_eq!(parsed.severity, issue.severity);
        assert_eq!(parsed.category, issue.category);
        assert_eq!(parsed.affected_count, 5);
        assert_eq!(parsed.affected_mv_pct, Some(0.15));
    }
}
