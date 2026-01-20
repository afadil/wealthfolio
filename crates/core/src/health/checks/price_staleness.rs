//! Price staleness health check.
//!
//! Detects assets with stale or missing market prices.

use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;

use crate::errors::Result;
use crate::health::model::{FixAction, HealthCategory, HealthIssue, Severity};
use crate::health::traits::{HealthCheck, HealthContext};

/// Data about an asset holding for staleness checks.
#[derive(Debug, Clone)]
pub struct AssetHoldingInfo {
    /// Asset ID (e.g., "SEC:AAPL:XNAS")
    pub asset_id: String,
    /// Market value in base currency
    pub market_value: f64,
    /// Whether this asset uses market pricing (vs manual)
    pub uses_market_pricing: bool,
}

/// Health check that detects stale market prices.
///
/// This check identifies assets with MARKET pricing mode that have
/// quotes older than the configured thresholds.
pub struct PriceStalenessCheck;

impl PriceStalenessCheck {
    /// Creates a new price staleness check.
    pub fn new() -> Self {
        Self
    }

    /// Analyzes holdings for price staleness issues.
    ///
    /// This is the core logic, exposed for testing.
    pub fn analyze(
        &self,
        holdings: &[AssetHoldingInfo],
        latest_quote_times: &HashMap<String, DateTime<Utc>>,
        ctx: &HealthContext,
    ) -> Vec<HealthIssue> {
        let mut issues = Vec::new();

        if holdings.is_empty() {
            return issues;
        }

        // Calculate thresholds
        let warning_threshold =
            ctx.now - Duration::hours(ctx.config.price_stale_warning_hours as i64);
        let critical_threshold =
            ctx.now - Duration::hours(ctx.config.price_stale_critical_hours as i64);

        // Track stale assets by severity
        let mut warning_assets: Vec<String> = Vec::new();
        let mut error_assets: Vec<String> = Vec::new();
        let mut warning_mv = 0.0;
        let mut error_mv = 0.0;

        // Only check assets that use market pricing
        let market_priced: Vec<_> = holdings
            .iter()
            .filter(|h| h.uses_market_pricing && h.market_value > 0.0)
            .collect();

        for holding in market_priced {
            match latest_quote_times.get(&holding.asset_id) {
                Some(quote_time) => {
                    if *quote_time < critical_threshold {
                        error_assets.push(holding.asset_id.clone());
                        error_mv += holding.market_value;
                    } else if *quote_time < warning_threshold {
                        warning_assets.push(holding.asset_id.clone());
                        warning_mv += holding.market_value;
                    }
                }
                None => {
                    // No quote at all is an error
                    error_assets.push(holding.asset_id.clone());
                    error_mv += holding.market_value;
                }
            }
        }

        // Emit error-level issue for critically stale assets
        if !error_assets.is_empty() {
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

            let count = error_assets.len();
            let title = if count == 1 {
                "Missing price for 1 holding".to_string()
            } else {
                format!("Outdated prices for {} holdings", count)
            };

            let data_hash = compute_data_hash(&error_assets, severity, mv_pct);

            issues.push(
                HealthIssue::builder()
                    .id(format!("price_stale:error:{}", data_hash))
                    .severity(severity)
                    .category(HealthCategory::PriceStaleness)
                    .title(title)
                    .message(
                        "Some holdings haven't had prices updated in over 3 days. Your portfolio value may be inaccurate.",
                    )
                    .affected_count(count as u32)
                    .affected_mv_pct(mv_pct)
                    .fix_action(FixAction::sync_prices(error_assets))
                    .data_hash(data_hash)
                    .build(),
            );
        }

        // Emit warning-level issue for slightly stale assets
        if !warning_assets.is_empty() {
            let mv_pct = if ctx.total_portfolio_value > 0.0 {
                warning_mv / ctx.total_portfolio_value
            } else {
                0.0
            };

            // Escalate to Critical if MV% exceeds threshold
            let severity = if mv_pct > ctx.config.mv_escalation_threshold {
                Severity::Critical
            } else {
                Severity::Warning
            };

            let count = warning_assets.len();
            let title = if count == 1 {
                "Price update needed for 1 holding".to_string()
            } else {
                format!("Price updates needed for {} holdings", count)
            };

            let data_hash = compute_data_hash(&warning_assets, severity, mv_pct);

            issues.push(
                HealthIssue::builder()
                    .id(format!("price_stale:warning:{}", data_hash))
                    .severity(severity)
                    .category(HealthCategory::PriceStaleness)
                    .title(title)
                    .message(
                        "Some holdings haven't had prices updated recently. Consider syncing prices.",
                    )
                    .affected_count(count as u32)
                    .affected_mv_pct(mv_pct)
                    .fix_action(FixAction::sync_prices(warning_assets))
                    .data_hash(data_hash)
                    .build(),
            );
        }

        issues
    }
}

impl Default for PriceStalenessCheck {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HealthCheck for PriceStalenessCheck {
    fn id(&self) -> &'static str {
        "price_staleness"
    }

    fn category(&self) -> HealthCategory {
        HealthCategory::PriceStaleness
    }

    async fn run(&self, _ctx: &HealthContext) -> Result<Vec<HealthIssue>> {
        // The service will call analyze() directly with the data it gathers
        Ok(Vec::new())
    }
}

/// Computes a data hash for issue identity and change detection.
fn compute_data_hash(asset_ids: &[String], severity: Severity, mv_pct: f64) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    let mut sorted_ids = asset_ids.to_vec();
    sorted_ids.sort();
    for id in &sorted_ids {
        id.hash(&mut hasher);
    }
    severity.as_str().hash(&mut hasher);
    ((mv_pct * 100.0) as u32).hash(&mut hasher);

    format!("{:x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health::model::HealthConfig;

    #[test]
    fn test_data_hash_stability() {
        let hash1 =
            compute_data_hash(&["AAPL".to_string(), "MSFT".to_string()], Severity::Warning, 0.15);
        let hash2 =
            compute_data_hash(&["MSFT".to_string(), "AAPL".to_string()], Severity::Warning, 0.15);
        // Order shouldn't matter
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_data_hash_changes_with_severity() {
        let hash1 = compute_data_hash(&["AAPL".to_string()], Severity::Warning, 0.15);
        let hash2 = compute_data_hash(&["AAPL".to_string()], Severity::Error, 0.15);
        assert_ne!(hash1, hash2);
    }

    #[test]
    fn test_stale_price_detection() {
        let check = PriceStalenessCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // Quote from 48 hours ago (warning threshold is 24 hours)
        let mut quote_times = HashMap::new();
        quote_times.insert(
            "SEC:AAPL:XNAS".to_string(),
            ctx.now - Duration::hours(48),
        );

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Warning);
    }

    #[test]
    fn test_missing_price_detection() {
        let check = PriceStalenessCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // No quote at all
        let quote_times = HashMap::new();

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Error);
    }

    #[test]
    fn test_fresh_price_no_issues() {
        let check = PriceStalenessCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // Quote from 1 hour ago (fresh)
        let mut quote_times = HashMap::new();
        quote_times.insert("SEC:AAPL:XNAS".to_string(), ctx.now - Duration::hours(1));

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert!(issues.is_empty());
    }

    #[test]
    fn test_manual_pricing_skipped() {
        let check = PriceStalenessCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let holdings = vec![AssetHoldingInfo {
            asset_id: "ALT:HOUSE".to_string(),
            market_value: 500_000.0,
            uses_market_pricing: false, // Manual pricing
        }];

        // No quote (but it's manual, so should be OK)
        let quote_times = HashMap::new();

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert!(issues.is_empty());
    }
}
