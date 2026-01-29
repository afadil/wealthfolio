//! Quote sync error health check.
//!
//! Detects assets that are consistently failing to sync quotes.

use async_trait::async_trait;
use std::collections::{HashMap, HashSet};

use crate::assets::{AssetServiceTrait, PricingMode};
use crate::errors::Result;
use crate::health::model::{
    AffectedItem, FixAction, HealthCategory, HealthIssue, NavigateAction, Severity,
};
use crate::health::traits::{HealthCheck, HealthContext};
use crate::quotes::QuoteServiceTrait;

/// Data about an asset with sync errors.
#[derive(Debug, Clone)]
pub struct QuoteSyncErrorInfo {
    /// Asset ID
    pub asset_id: String,
    /// Symbol for display
    pub symbol: String,
    /// Number of consecutive sync failures
    pub error_count: i32,
    /// Last error message
    pub last_error: Option<String>,
    /// Market value in base currency (if held)
    pub market_value: f64,
    /// Whether this asset has ever synced successfully (has any quotes)
    pub has_synced_before: bool,
}

/// Gathers quote sync errors from the sync state.
///
/// Returns a list of assets that have sync errors, along with their symbols and market values.
///
/// # Arguments
/// * `quote_service` - The quote service for accessing sync state
/// * `asset_service` - The asset service for looking up asset symbols
/// * `holding_market_values` - Map of asset_id -> market_value from current holdings
/// * `latest_quote_times` - Map of asset_id -> last quote timestamp (to detect never-synced assets)
pub fn gather_quote_sync_errors(
    quote_service: &dyn QuoteServiceTrait,
    asset_service: &dyn AssetServiceTrait,
    holding_market_values: &HashMap<String, f64>,
    latest_quote_times: &HashMap<String, chrono::DateTime<chrono::Utc>>,
) -> Vec<QuoteSyncErrorInfo> {
    // Get sync states with errors
    let sync_states_with_errors = match quote_service.get_sync_states_with_errors() {
        Ok(states) => states,
        Err(_) => return Vec::new(),
    };

    if sync_states_with_errors.is_empty() {
        return Vec::new();
    }

    // Get asset IDs that have errors
    let asset_ids_set: HashSet<String> = sync_states_with_errors
        .iter()
        .map(|s| s.asset_id.clone())
        .collect();

    // Get all assets and filter to those with errors
    let all_assets = match asset_service.get_assets() {
        Ok(assets) => assets,
        Err(_) => return Vec::new(),
    };

    // Build a map of asset_id -> (symbol, pricing_mode)
    let asset_map: HashMap<String, (String, PricingMode)> = all_assets
        .into_iter()
        .filter(|a| asset_ids_set.contains(&a.id))
        .map(|a| (a.id.clone(), (a.symbol.clone(), a.pricing_mode)))
        .collect();

    // Convert to QuoteSyncErrorInfo, filtering out manual pricing assets
    sync_states_with_errors
        .into_iter()
        .filter_map(|s| {
            let (symbol, pricing_mode) = asset_map
                .get(&s.asset_id)
                .cloned()
                .unwrap_or_else(|| (s.asset_id.clone(), PricingMode::Market));

            // Skip assets with manual pricing - they don't need quote syncing
            if pricing_mode == PricingMode::Manual {
                return None;
            }

            let market_value = holding_market_values
                .get(&s.asset_id)
                .copied()
                .unwrap_or(0.0);
            // Asset has synced before if it has any quotes
            let has_synced_before = latest_quote_times.contains_key(&s.asset_id);

            Some(QuoteSyncErrorInfo {
                asset_id: s.asset_id,
                symbol,
                error_count: s.error_count,
                last_error: s.last_error,
                market_value,
                has_synced_before,
            })
        })
        .collect()
}

/// Health check that detects quote sync failures.
///
/// This check identifies assets that have repeated sync errors,
/// which may indicate provider issues, invalid symbols, or network problems.
pub struct QuoteSyncCheck;

impl QuoteSyncCheck {
    /// Creates a new quote sync check.
    pub fn new() -> Self {
        Self
    }

    /// Analyzes sync states for recurring errors.
    ///
    /// This is the core logic, exposed for testing and direct use.
    pub fn analyze(
        &self,
        sync_errors: &[QuoteSyncErrorInfo],
        ctx: &HealthContext,
    ) -> Vec<HealthIssue> {
        let mut issues = Vec::new();

        if sync_errors.is_empty() {
            return issues;
        }

        // Categorize by error count severity
        // For assets that HAVE synced before (transient issues):
        //   1-2 failures: might be transient, ignore
        //   3-5 failures: warning
        //   6+ failures: error (persistent issue)
        // For assets that have NEVER synced (no data at all):
        //   1+ failures: error (user needs to know they have no data)
        let warning_threshold = 3;
        let error_threshold = 6;

        // Never-synced assets with any error are immediately errors
        let never_synced_errors: Vec<_> = sync_errors
            .iter()
            .filter(|e| !e.has_synced_before && e.error_count >= 1)
            .collect();

        let warning_errors: Vec<_> = sync_errors
            .iter()
            .filter(|e| {
                e.has_synced_before
                    && e.error_count >= warning_threshold
                    && e.error_count < error_threshold
            })
            .collect();

        let persistent_errors: Vec<_> = sync_errors
            .iter()
            .filter(|e| e.has_synced_before && e.error_count >= error_threshold)
            .collect();

        // Calculate market value impact
        let warning_mv: f64 = warning_errors.iter().map(|e| e.market_value).sum();
        let error_mv: f64 = persistent_errors.iter().map(|e| e.market_value).sum();
        let never_synced_mv: f64 = never_synced_errors.iter().map(|e| e.market_value).sum();

        // Emit error-level issue for assets that have NEVER synced (no data at all)
        if !never_synced_errors.is_empty() {
            let mv_pct = if ctx.total_portfolio_value > 0.0 {
                never_synced_mv / ctx.total_portfolio_value
            } else {
                0.0
            };

            let severity = if mv_pct > ctx.config.mv_escalation_threshold {
                Severity::Critical
            } else {
                Severity::Error
            };

            let count = never_synced_errors.len();
            let title = if count == 1 {
                format!("No market data for {}", never_synced_errors[0].symbol)
            } else {
                format!("No market data for {} assets", count)
            };

            let details = build_error_details(&never_synced_errors);
            let asset_ids: Vec<String> = never_synced_errors
                .iter()
                .map(|e| e.asset_id.clone())
                .collect();
            let affected_items: Vec<AffectedItem> = never_synced_errors
                .iter()
                .map(|e| AffectedItem::asset_market_data(&e.asset_id, &e.symbol))
                .collect();
            let data_hash = compute_data_hash(&asset_ids, severity);

            issues.push(
                HealthIssue::builder()
                    .id(format!("quote_sync:never_synced:{}", data_hash))
                    .severity(severity)
                    .category(HealthCategory::PriceStaleness)
                    .title(title)
                    .message(
                        "Unable to fetch market data for these assets. Click on an asset to edit its market data settings and configure the correct provider symbol.",
                    )
                    .affected_count(count as u32)
                    .affected_mv_pct(mv_pct)
                    .affected_items(affected_items)
                    .fix_action(FixAction::retry_sync(asset_ids))
                    .details(details)
                    .data_hash(data_hash)
                    .build(),
            );
        }

        // Emit error-level issue for persistent sync failures
        if !persistent_errors.is_empty() {
            let mv_pct = if ctx.total_portfolio_value > 0.0 {
                error_mv / ctx.total_portfolio_value
            } else {
                0.0
            };

            // Escalate to Critical if MV% exceeds threshold
            let severity = if mv_pct > ctx.config.mv_escalation_threshold {
                Severity::Critical
            } else {
                Severity::Error
            };

            let count = persistent_errors.len();
            let title = if count == 1 {
                format!("Quotes sync failing for {}", persistent_errors[0].symbol)
            } else {
                format!("Quotes sync failing for {} assets", count)
            };

            // Build details with error messages
            let details = build_error_details(&persistent_errors);
            let asset_ids: Vec<String> = persistent_errors
                .iter()
                .map(|e| e.asset_id.clone())
                .collect();
            let affected_items: Vec<AffectedItem> = persistent_errors
                .iter()
                .map(|e| AffectedItem::asset(&e.asset_id, &e.symbol))
                .collect();
            let data_hash = compute_data_hash(&asset_ids, severity);

            issues.push(
                HealthIssue::builder()
                    .id(format!("quote_sync:error:{}", data_hash))
                    .severity(severity)
                    .category(HealthCategory::PriceStaleness)
                    .title(title)
                    .message(
                        "These assets have repeatedly failed to sync prices. Check the symbols or data provider settings.",
                    )
                    .affected_count(count as u32)
                    .affected_mv_pct(mv_pct)
                    .affected_items(affected_items)
                    .fix_action(FixAction::retry_sync(asset_ids))
                    .navigate_action(NavigateAction::to_market_data())
                    .details(details)
                    .data_hash(data_hash)
                    .build(),
            );
        }

        // Emit warning-level issue for recent sync failures
        if !warning_errors.is_empty() {
            let mv_pct = if ctx.total_portfolio_value > 0.0 {
                warning_mv / ctx.total_portfolio_value
            } else {
                0.0
            };

            let count = warning_errors.len();
            let title = if count == 1 {
                format!("Sync issues for {}", warning_errors[0].symbol)
            } else {
                format!("Sync issues for {} assets", count)
            };

            let details = build_error_details(&warning_errors);
            let asset_ids: Vec<String> =
                warning_errors.iter().map(|e| e.asset_id.clone()).collect();
            let affected_items: Vec<AffectedItem> = warning_errors
                .iter()
                .map(|e| AffectedItem::asset(&e.asset_id, &e.symbol))
                .collect();
            let data_hash = compute_data_hash(&asset_ids, Severity::Warning);

            issues.push(
                HealthIssue::builder()
                    .id(format!("quote_sync:warning:{}", data_hash))
                    .severity(Severity::Warning)
                    .category(HealthCategory::PriceStaleness)
                    .title(title)
                    .message(
                        "Some assets are having trouble syncing prices. This may resolve automatically.",
                    )
                    .affected_count(count as u32)
                    .affected_mv_pct(mv_pct)
                    .affected_items(affected_items)
                    .fix_action(FixAction::retry_sync(asset_ids))
                    .details(details)
                    .data_hash(data_hash)
                    .build(),
            );
        }

        issues
    }
}

impl Default for QuoteSyncCheck {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HealthCheck for QuoteSyncCheck {
    fn id(&self) -> &'static str {
        "quote_sync"
    }

    fn category(&self) -> HealthCategory {
        HealthCategory::PriceStaleness
    }

    async fn run(&self, _ctx: &HealthContext) -> Result<Vec<HealthIssue>> {
        // The service will call analyze() directly with the data it gathers
        Ok(Vec::new())
    }
}

/// Builds a details string from error info.
fn build_error_details(errors: &[&QuoteSyncErrorInfo]) -> String {
    let mut lines = Vec::new();
    for (i, error) in errors.iter().take(5).enumerate() {
        let error_msg = error.last_error.as_deref().unwrap_or("Unknown error");
        lines.push(format!(
            "{}. {} - {} failures: {}",
            i + 1,
            error.symbol,
            error.error_count,
            truncate_error(error_msg)
        ));
    }
    if errors.len() > 5 {
        lines.push(format!("... and {} more", errors.len() - 5));
    }
    lines.join("\n")
}

/// Truncates an error message to a reasonable length.
fn truncate_error(msg: &str) -> &str {
    if msg.len() > 80 {
        &msg[..80]
    } else {
        msg
    }
}

/// Computes a data hash for issue identity and change detection.
fn compute_data_hash(asset_ids: &[String], severity: Severity) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    let mut sorted_ids = asset_ids.to_vec();
    sorted_ids.sort();
    for id in &sorted_ids {
        id.hash(&mut hasher);
    }
    severity.as_str().hash(&mut hasher);

    format!("{:x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health::model::HealthConfig;

    #[test]
    fn test_no_errors_no_issues() {
        let check = QuoteSyncCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues = check.analyze(&[], &ctx);
        assert!(issues.is_empty());
    }

    #[test]
    fn test_low_error_count_ignored() {
        let check = QuoteSyncCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        // 2 failures - below warning threshold (for assets that have synced before)
        let sync_errors = vec![QuoteSyncErrorInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            error_count: 2,
            last_error: Some("Network timeout".to_string()),
            market_value: 10_000.0,
            has_synced_before: true,
        }];

        let issues = check.analyze(&sync_errors, &ctx);
        assert!(issues.is_empty());
    }

    #[test]
    fn test_warning_threshold() {
        let check = QuoteSyncCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        // 3 failures - at warning threshold (for assets that have synced before)
        let sync_errors = vec![QuoteSyncErrorInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            error_count: 3,
            last_error: Some("Provider error".to_string()),
            market_value: 10_000.0,
            has_synced_before: true,
        }];

        let issues = check.analyze(&sync_errors, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Warning);
    }

    #[test]
    fn test_error_threshold() {
        let check = QuoteSyncCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        // 6 failures - at error threshold (for assets that have synced before)
        let sync_errors = vec![QuoteSyncErrorInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            error_count: 6,
            last_error: Some("Symbol not found".to_string()),
            market_value: 10_000.0,
            has_synced_before: true,
        }];

        let issues = check.analyze(&sync_errors, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Error);
    }

    #[test]
    fn test_never_synced_immediate_error() {
        let check = QuoteSyncCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        // 1 failure but never synced before - should be immediate error
        let sync_errors = vec![QuoteSyncErrorInfo {
            asset_id: "SEC:GOOGL:XTSE".to_string(),
            symbol: "GOOGL".to_string(),
            error_count: 1,
            last_error: Some("Symbol not found".to_string()),
            market_value: 0.0, // no market value since no price data
            has_synced_before: false,
        }];

        let issues = check.analyze(&sync_errors, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Error);
        assert!(issues[0].title.contains("No market data"));
    }

    #[test]
    fn test_multiple_severities() {
        let check = QuoteSyncCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let sync_errors = vec![
            QuoteSyncErrorInfo {
                asset_id: "SEC:AAPL:XNAS".to_string(),
                symbol: "AAPL".to_string(),
                error_count: 3, // warning (has synced before)
                last_error: Some("Network timeout".to_string()),
                market_value: 5_000.0,
                has_synced_before: true,
            },
            QuoteSyncErrorInfo {
                asset_id: "SEC:MSFT:XNAS".to_string(),
                symbol: "MSFT".to_string(),
                error_count: 10, // error (has synced before)
                last_error: Some("Symbol delisted".to_string()),
                market_value: 15_000.0,
                has_synced_before: true,
            },
        ];

        let issues = check.analyze(&sync_errors, &ctx);
        assert_eq!(issues.len(), 2);

        // Should have one warning and one error
        let has_warning = issues.iter().any(|i| i.severity == Severity::Warning);
        let has_error = issues.iter().any(|i| i.severity == Severity::Error);
        assert!(has_warning);
        assert!(has_error);
    }
}
