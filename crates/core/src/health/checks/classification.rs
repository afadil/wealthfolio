//! Classification completeness health check.
//!
//! Detects assets lacking taxonomy assignments (e.g., Asset Class).

use async_trait::async_trait;

use crate::errors::Result;
use crate::health::model::{HealthCategory, HealthIssue, NavigateAction, Severity};
use crate::health::traits::{HealthCheck, HealthContext};

/// Data about an unclassified asset.
#[derive(Debug, Clone)]
pub struct UnclassifiedAssetInfo {
    /// Asset ID
    pub asset_id: String,
    /// Asset symbol for display
    pub symbol: String,
    /// Market value in base currency
    pub market_value: f64,
    /// Which taxonomy is missing (e.g., "asset_class")
    pub missing_taxonomy: String,
}

/// Health check that detects missing asset classifications.
pub struct ClassificationCheck;

impl ClassificationCheck {
    /// Creates a new classification check.
    pub fn new() -> Self {
        Self
    }

    /// Analyzes assets for missing classifications.
    pub fn analyze(
        &self,
        unclassified: &[UnclassifiedAssetInfo],
        ctx: &HealthContext,
    ) -> Vec<HealthIssue> {
        let mut issues = Vec::new();

        if unclassified.is_empty() {
            return issues;
        }

        // Group by missing taxonomy type
        let mut by_taxonomy: std::collections::HashMap<String, Vec<&UnclassifiedAssetInfo>> =
            std::collections::HashMap::new();

        for asset in unclassified {
            by_taxonomy
                .entry(asset.missing_taxonomy.clone())
                .or_default()
                .push(asset);
        }

        // Emit issue for each taxonomy type
        for (taxonomy, assets) in by_taxonomy {
            let total_mv: f64 = assets.iter().map(|a| a.market_value).sum();
            let mv_pct = if ctx.total_portfolio_value > 0.0 {
                total_mv / ctx.total_portfolio_value
            } else {
                0.0
            };

            // Determine severity based on MV%
            // 5% → Error, 30% → Critical (per requirements)
            let severity = if mv_pct > ctx.config.mv_escalation_threshold {
                Severity::Critical
            } else if mv_pct > ctx.config.classification_warn_threshold {
                Severity::Error
            } else {
                Severity::Warning
            };

            let count = assets.len();
            let title = if count == 1 {
                "1 holding needs a category".to_string()
            } else {
                format!("{} holdings need categories", count)
            };

            let taxonomy_label = match taxonomy.as_str() {
                "asset_class" => "asset class",
                "sector" => "sector",
                "country" => "country",
                _ => "classification",
            };

            let message = format!(
                "Some holdings don't have an {} assigned. This affects your allocation charts and analytics.",
                taxonomy_label
            );

            let asset_ids: Vec<String> = assets.iter().map(|a| a.asset_id.clone()).collect();
            let data_hash = compute_data_hash(&asset_ids, severity, mv_pct);

            issues.push(
                HealthIssue::builder()
                    .id(format!("classification:{}:{}", taxonomy, data_hash))
                    .severity(severity)
                    .category(HealthCategory::Classification)
                    .title(title)
                    .message(message)
                    .affected_count(count as u32)
                    .affected_mv_pct(mv_pct)
                    .navigate_action(NavigateAction::to_holdings(Some("unclassified")))
                    .data_hash(data_hash)
                    .build(),
            );
        }

        issues
    }
}

impl Default for ClassificationCheck {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HealthCheck for ClassificationCheck {
    fn id(&self) -> &'static str {
        "classification"
    }

    fn category(&self) -> HealthCategory {
        HealthCategory::Classification
    }

    async fn run(&self, _ctx: &HealthContext) -> Result<Vec<HealthIssue>> {
        // The service will call analyze() directly with classification data
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
    fn test_unclassified_warning() {
        let check = ClassificationCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let unclassified = vec![UnclassifiedAssetInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            market_value: 1_000.0, // 1% of portfolio
            missing_taxonomy: "asset_class".to_string(),
        }];

        let issues = check.analyze(&unclassified, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Warning);
    }

    #[test]
    fn test_unclassified_error_threshold() {
        let check = ClassificationCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let unclassified = vec![UnclassifiedAssetInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            market_value: 10_000.0, // 10% of portfolio (> 5% threshold)
            missing_taxonomy: "asset_class".to_string(),
        }];

        let issues = check.analyze(&unclassified, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Error);
    }

    #[test]
    fn test_unclassified_critical_threshold() {
        let check = ClassificationCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let unclassified = vec![UnclassifiedAssetInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            market_value: 35_000.0, // 35% of portfolio (> 30% threshold)
            missing_taxonomy: "asset_class".to_string(),
        }];

        let issues = check.analyze(&unclassified, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Critical);
    }

    #[test]
    fn test_no_unclassified() {
        let check = ClassificationCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues = check.analyze(&[], &ctx);
        assert!(issues.is_empty());
    }
}
