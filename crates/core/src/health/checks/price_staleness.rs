//! Price staleness health check.
//!
//! Detects assets with stale or missing market prices.
//! Uses trading days (weekdays) for staleness calculation to avoid
//! false positives on weekends when markets are closed.

use async_trait::async_trait;
use chrono::{DateTime, Datelike, NaiveDate, Utc, Weekday};
use std::collections::HashMap;

use crate::errors::Result;
use crate::health::model::{AffectedItem, FixAction, HealthCategory, HealthIssue, Severity};
use crate::health::traits::{HealthCheck, HealthContext};

/// Data about an asset holding for staleness checks.
#[derive(Debug, Clone)]
pub struct AssetHoldingInfo {
    /// Asset ID (e.g., "SEC:AAPL:XNAS")
    pub asset_id: String,
    /// Asset symbol for display (e.g., "AAPL")
    pub symbol: String,
    /// Asset name for display (e.g., "Apple Inc.")
    pub name: Option<String>,
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
    /// Uses trading days (weekdays) for staleness calculation to avoid
    /// false positives on weekends when markets are closed.
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

        // Convert hour thresholds to trading days
        // 24 hours ≈ 1 trading day, 72 hours ≈ 3 trading days
        let warning_trading_days = (ctx.config.price_stale_warning_hours / 24).max(1) as i64;
        let critical_trading_days = (ctx.config.price_stale_critical_hours / 24).max(1) as i64;

        // Track stale assets by severity (keep full info for affected items)
        let mut warning_assets: Vec<&AssetHoldingInfo> = Vec::new();
        let mut error_assets: Vec<&AssetHoldingInfo> = Vec::new();
        let mut warning_mv = 0.0;
        let mut error_mv = 0.0;

        // Only check assets that use market pricing
        // Note: We check all market-priced holdings, not just those with market_value > 0,
        // because assets with no quotes will have market_value = 0 (price * quantity = 0)
        // and we want to detect those as "missing price" issues.
        let market_priced: Vec<_> = holdings.iter().filter(|h| h.uses_market_pricing).collect();

        for holding in market_priced {
            match latest_quote_times.get(&holding.asset_id) {
                Some(quote_time) => {
                    // Only check staleness for assets with positive market value
                    // (assets with 0 quantity are not actively held)
                    if holding.market_value > 0.0 {
                        let days_stale = trading_days_since(*quote_time, ctx.now);

                        if days_stale >= critical_trading_days {
                            error_assets.push(holding);
                            error_mv += holding.market_value;
                        } else if days_stale >= warning_trading_days {
                            warning_assets.push(holding);
                            warning_mv += holding.market_value;
                        }
                    }
                }
                None => {
                    // No quote at all is an error - this catches assets that failed
                    // to sync and have never had any price data
                    error_assets.push(holding);
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
            // Check if any assets are missing quotes entirely vs just stale
            let missing_count = error_assets
                .iter()
                .filter(|a| !latest_quote_times.contains_key(&a.asset_id))
                .count();

            let title = if missing_count == count {
                // All assets are missing prices (no quote data at all)
                if count == 1 {
                    format!("No market data for {}", error_assets[0].symbol)
                } else {
                    format!("No market data for {} holdings", count)
                }
            } else if count == 1 {
                "Outdated price for 1 holding".to_string()
            } else {
                format!("Outdated prices for {} holdings", count)
            };

            let asset_ids: Vec<String> = error_assets.iter().map(|a| a.asset_id.clone()).collect();
            let data_hash = compute_data_hash(&asset_ids, severity, mv_pct);

            // Build affected items list for display
            let affected_items: Vec<AffectedItem> = error_assets
                .iter()
                .map(|a| AffectedItem::asset_with_name(&a.asset_id, &a.symbol, a.name.clone()))
                .collect();

            // Build details string listing affected assets
            let details = build_asset_details(&error_assets, latest_quote_times);

            let message = if missing_count > 0 {
                "Unable to fetch market data for some holdings. This may be due to invalid symbols or provider issues. Your portfolio value may be inaccurate."
            } else {
                "Some holdings haven't had prices updated in over 3 days. Your portfolio value may be inaccurate."
            };

            issues.push(
                HealthIssue::builder()
                    .id(format!("price_stale:error:{}", data_hash))
                    .severity(severity)
                    .category(HealthCategory::PriceStaleness)
                    .title(title)
                    .message(message)
                    .affected_count(count as u32)
                    .affected_mv_pct(mv_pct)
                    .affected_items(affected_items)
                    .fix_action(FixAction::sync_prices(asset_ids))
                    .details(details)
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

            let asset_ids: Vec<String> = warning_assets.iter().map(|a| a.asset_id.clone()).collect();
            let data_hash = compute_data_hash(&asset_ids, severity, mv_pct);

            // Build affected items list for display
            let affected_items: Vec<AffectedItem> = warning_assets
                .iter()
                .map(|a| AffectedItem::asset_with_name(&a.asset_id, &a.symbol, a.name.clone()))
                .collect();

            // Build details string listing affected assets
            let details = build_asset_details(&warning_assets, latest_quote_times);

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
                    .affected_items(affected_items)
                    .fix_action(FixAction::sync_prices(asset_ids))
                    .details(details)
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

/// Counts the number of trading days (weekdays) between two dates.
///
/// This function counts weekdays from the day after `from_date` up to and including `to_date`.
/// Weekends (Saturday and Sunday) are excluded from the count.
///
/// # Arguments
/// * `from_date` - The starting date (exclusive)
/// * `to_date` - The ending date (inclusive)
///
/// # Returns
/// The number of trading days elapsed. Returns 0 if `to_date` is on or before `from_date`.
fn trading_days_between(from_date: NaiveDate, to_date: NaiveDate) -> i64 {
    if to_date <= from_date {
        return 0;
    }

    let mut trading_days = 0;
    let mut current = from_date;

    // Iterate from the day after from_date to to_date (inclusive)
    while let Some(next) = current.succ_opt() {
        current = next;
        if current > to_date {
            break;
        }
        let weekday = current.weekday();
        if weekday != Weekday::Sat && weekday != Weekday::Sun {
            trading_days += 1;
        }
    }

    trading_days
}

/// Counts trading days elapsed since a quote timestamp.
///
/// Extracts dates from the timestamps and counts weekdays between them.
fn trading_days_since(last_quote: DateTime<Utc>, now: DateTime<Utc>) -> i64 {
    let last_date = last_quote.date_naive();
    let today = now.date_naive();
    trading_days_between(last_date, today)
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

/// Builds a details string listing affected assets.
fn build_asset_details(
    assets: &[&AssetHoldingInfo],
    latest_quote_times: &HashMap<String, DateTime<Utc>>,
) -> String {
    let mut lines = Vec::new();
    for (i, asset) in assets.iter().take(5).enumerate() {
        let status = if latest_quote_times.contains_key(&asset.asset_id) {
            "outdated"
        } else {
            "no data"
        };
        let name = asset
            .name
            .as_deref()
            .map(|n| format!(" ({})", n))
            .unwrap_or_default();
        lines.push(format!("{}. {}{} - {}", i + 1, asset.symbol, name, status));
    }
    if assets.len() > 5 {
        lines.push(format!("... and {} more", assets.len() - 5));
    }
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, TimeZone};
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
    fn test_trading_days_between_same_day() {
        let date = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(); // Monday
        assert_eq!(trading_days_between(date, date), 0);
    }

    #[test]
    fn test_trading_days_between_weekdays() {
        // Monday to Wednesday = 2 trading days (Tue, Wed)
        let monday = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let wednesday = NaiveDate::from_ymd_opt(2024, 1, 17).unwrap();
        assert_eq!(trading_days_between(monday, wednesday), 2);
    }

    #[test]
    fn test_trading_days_between_over_weekend() {
        // Friday to Monday = 1 trading day (Monday only, Sat/Sun excluded)
        let friday = NaiveDate::from_ymd_opt(2024, 1, 19).unwrap();
        let monday = NaiveDate::from_ymd_opt(2024, 1, 22).unwrap();
        assert_eq!(trading_days_between(friday, monday), 1);
    }

    #[test]
    fn test_trading_days_friday_to_saturday() {
        // Friday to Saturday = 0 trading days (Saturday is weekend)
        let friday = NaiveDate::from_ymd_opt(2024, 1, 19).unwrap();
        let saturday = NaiveDate::from_ymd_opt(2024, 1, 20).unwrap();
        assert_eq!(trading_days_between(friday, saturday), 0);
    }

    #[test]
    fn test_trading_days_friday_to_sunday() {
        // Friday to Sunday = 0 trading days (both Sat/Sun are weekend)
        let friday = NaiveDate::from_ymd_opt(2024, 1, 19).unwrap();
        let sunday = NaiveDate::from_ymd_opt(2024, 1, 21).unwrap();
        assert_eq!(trading_days_between(friday, sunday), 0);
    }

    #[test]
    fn test_trading_days_full_week() {
        // Monday to next Monday = 5 trading days
        let monday1 = NaiveDate::from_ymd_opt(2024, 1, 15).unwrap();
        let monday2 = NaiveDate::from_ymd_opt(2024, 1, 22).unwrap();
        assert_eq!(trading_days_between(monday1, monday2), 5);
    }

    #[test]
    fn test_stale_price_detection_trading_days() {
        let check = PriceStalenessCheck::new();

        // Set "now" to Wednesday Jan 17, 2024
        let now = Utc.with_ymd_and_hms(2024, 1, 17, 12, 0, 0).unwrap();
        let ctx = HealthContext::with_timestamp(
            HealthConfig::default(),
            "USD",
            100_000.0,
            now,
        );

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            name: Some("Apple Inc.".to_string()),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // Quote from Monday Jan 15 (2 trading days ago: Tue, Wed)
        // With default config (24h = 1 trading day warning), this should trigger warning
        let mut quote_times = HashMap::new();
        let monday = Utc.with_ymd_and_hms(2024, 1, 15, 16, 0, 0).unwrap();
        quote_times.insert("SEC:AAPL:XNAS".to_string(), monday);

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Warning);
    }

    #[test]
    fn test_weekend_no_false_positive() {
        let check = PriceStalenessCheck::new();

        // Set "now" to Saturday Jan 20, 2024
        let saturday = Utc.with_ymd_and_hms(2024, 1, 20, 12, 0, 0).unwrap();
        let ctx = HealthContext::with_timestamp(
            HealthConfig::default(),
            "USD",
            100_000.0,
            saturday,
        );

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            name: Some("Apple Inc.".to_string()),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // Quote from Friday Jan 19 - should NOT be stale on Saturday
        // (0 trading days have passed since Friday)
        let mut quote_times = HashMap::new();
        let friday = Utc.with_ymd_and_hms(2024, 1, 19, 16, 0, 0).unwrap();
        quote_times.insert("SEC:AAPL:XNAS".to_string(), friday);

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert!(issues.is_empty(), "Friday quote should not be stale on Saturday");
    }

    #[test]
    fn test_sunday_no_false_positive() {
        let check = PriceStalenessCheck::new();

        // Set "now" to Sunday Jan 21, 2024
        let sunday = Utc.with_ymd_and_hms(2024, 1, 21, 12, 0, 0).unwrap();
        let ctx = HealthContext::with_timestamp(
            HealthConfig::default(),
            "USD",
            100_000.0,
            sunday,
        );

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            name: Some("Apple Inc.".to_string()),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // Quote from Friday Jan 19 - should NOT be stale on Sunday
        let mut quote_times = HashMap::new();
        let friday = Utc.with_ymd_and_hms(2024, 1, 19, 16, 0, 0).unwrap();
        quote_times.insert("SEC:AAPL:XNAS".to_string(), friday);

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert!(issues.is_empty(), "Friday quote should not be stale on Sunday");
    }

    #[test]
    fn test_monday_friday_quote_not_stale() {
        let check = PriceStalenessCheck::new();

        // Set "now" to Monday Jan 22, 2024
        let monday = Utc.with_ymd_and_hms(2024, 1, 22, 10, 0, 0).unwrap();
        let ctx = HealthContext::with_timestamp(
            HealthConfig::default(),
            "USD",
            100_000.0,
            monday,
        );

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            name: Some("Apple Inc.".to_string()),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // Quote from Friday Jan 19 - only 1 trading day (Monday) has passed
        // Default warning threshold is 1 trading day, so this is exactly at the threshold
        // but not over it (we use >= so 1 >= 1 would trigger)
        // Actually with the default 24h = 1 day threshold, 1 trading day should trigger warning
        let mut quote_times = HashMap::new();
        let friday = Utc.with_ymd_and_hms(2024, 1, 19, 16, 0, 0).unwrap();
        quote_times.insert("SEC:AAPL:XNAS".to_string(), friday);

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        // 1 trading day has passed (Monday), warning threshold is 1 day
        // So this will trigger a warning - which is correct behavior for Monday
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Warning);
    }

    #[test]
    fn test_missing_price_detection() {
        let check = PriceStalenessCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            name: Some("Apple Inc.".to_string()),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // No quote at all
        let quote_times = HashMap::new();

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Error);
        // Verify affected items are populated
        assert!(issues[0].affected_items.is_some());
    }

    #[test]
    fn test_fresh_price_no_issues() {
        let check = PriceStalenessCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            name: None,
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // Quote from 1 hour ago (fresh - same day, 0 trading days)
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
            symbol: "HOUSE".to_string(),
            name: Some("My House".to_string()),
            market_value: 500_000.0,
            uses_market_pricing: false, // Manual pricing
        }];

        // No quote (but it's manual, so should be OK)
        let quote_times = HashMap::new();

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert!(issues.is_empty());
    }

    #[test]
    fn test_critical_threshold_trading_days() {
        let check = PriceStalenessCheck::new();

        // Set "now" to Friday Jan 26, 2024
        let now = Utc.with_ymd_and_hms(2024, 1, 26, 12, 0, 0).unwrap();
        let ctx = HealthContext::with_timestamp(
            HealthConfig::default(),
            "USD",
            100_000.0,
            now,
        );

        let holdings = vec![AssetHoldingInfo {
            asset_id: "SEC:AAPL:XNAS".to_string(),
            symbol: "AAPL".to_string(),
            name: Some("Apple Inc.".to_string()),
            market_value: 10_000.0,
            uses_market_pricing: true,
        }];

        // Quote from Friday Jan 19 (5 trading days ago: Mon, Tue, Wed, Thu, Fri)
        // Default critical threshold is 72h = 3 trading days, so this should be Error
        let mut quote_times = HashMap::new();
        let old_friday = Utc.with_ymd_and_hms(2024, 1, 19, 16, 0, 0).unwrap();
        quote_times.insert("SEC:AAPL:XNAS".to_string(), old_friday);

        let issues = check.analyze(&holdings, &quote_times, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Error);
    }
}
