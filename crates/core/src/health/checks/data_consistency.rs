//! Data consistency health check.
//!
//! Detects orphan references, negative positions, and legacy data needing migration.

use async_trait::async_trait;
use chrono::NaiveDate;
use rust_decimal::Decimal;

use crate::errors::Result;
use crate::health::model::{
    AffectedItem, FixAction, HealthCategory, HealthIssue, NavigateAction, Severity,
};
use crate::health::traits::{HealthCheck, HealthContext};

/// Types of data consistency issues.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum ConsistencyIssueType {
    /// Activity references a non-existent account
    OrphanActivityAccount,
    /// Activity references a non-existent asset
    OrphanActivityAsset,
    /// Holding has negative quantity for non-liability asset
    NegativePosition,
    /// Asset has legacy sector/country data not migrated to taxonomy
    LegacyClassification,
    /// Account has negative total portfolio value in its history
    NegativeAccountBalance,
    /// Cash account had a negative balance at some point (may be a bank overdraft)
    NegativeCashBalance,
}

/// Data about a consistency issue.
#[derive(Debug, Clone)]
pub struct ConsistencyIssueInfo {
    /// Type of consistency issue
    pub issue_type: ConsistencyIssueType,
    /// ID of the affected record (activity_id, asset_id, etc.)
    pub record_id: String,
    /// Human-readable description (used as display name for affected items)
    pub description: String,
    /// Related account ID (if applicable)
    pub account_id: Option<String>,
    /// Related asset ID (if applicable)
    pub asset_id: Option<String>,
    /// First date the balance went negative (NegativeAccountBalance only)
    pub first_negative_date: Option<NaiveDate>,
    /// Cash balance on first_negative_date, in account currency (NegativeAccountBalance only)
    pub cash_balance: Option<Decimal>,
    /// Total portfolio value on first_negative_date, in account currency (NegativeAccountBalance only)
    pub total_value_at_date: Option<Decimal>,
    /// Account currency (NegativeAccountBalance only)
    pub account_currency: Option<String>,
}

/// Health check that detects data consistency problems.
pub struct DataConsistencyCheck;

impl DataConsistencyCheck {
    /// Creates a new data consistency check.
    pub fn new() -> Self {
        Self
    }

    /// Analyzes data for consistency issues.
    pub fn analyze(
        &self,
        issues_data: &[ConsistencyIssueInfo],
        _ctx: &HealthContext,
    ) -> Vec<HealthIssue> {
        let mut health_issues = Vec::new();

        if issues_data.is_empty() {
            return health_issues;
        }

        // Group by issue type
        let mut by_type: std::collections::HashMap<
            ConsistencyIssueType,
            Vec<&ConsistencyIssueInfo>,
        > = std::collections::HashMap::new();

        for issue in issues_data {
            by_type
                .entry(issue.issue_type.clone())
                .or_default()
                .push(issue);
        }

        // Emit health issue for orphan activities (account references)
        if let Some(orphan_account_issues) =
            by_type.get(&ConsistencyIssueType::OrphanActivityAccount)
        {
            let count = orphan_account_issues.len();
            let record_ids: Vec<String> = orphan_account_issues
                .iter()
                .map(|i| i.record_id.clone())
                .collect();
            let data_hash = compute_data_hash(&record_ids);

            health_issues.push(
                HealthIssue::builder()
                    .id(format!("orphan_activity_account:{}", data_hash))
                    .severity(Severity::Error)
                    .category(HealthCategory::DataConsistency)
                    .title(if count == 1 {
                        "Transaction references missing account".to_string()
                    } else {
                        format!("{} transactions reference missing accounts", count)
                    })
                    .message(
                        "Some transactions point to accounts that no longer exist. This may cause calculation errors.",
                    )
                    .affected_count(count as u32)
                    .navigate_action(NavigateAction::to_activities(Some("orphan")))
                    .data_hash(data_hash)
                    .build(),
            );
        }

        // Emit health issue for orphan activities (asset references)
        if let Some(orphan_asset_issues) = by_type.get(&ConsistencyIssueType::OrphanActivityAsset) {
            let count = orphan_asset_issues.len();
            let record_ids: Vec<String> = orphan_asset_issues
                .iter()
                .map(|i| i.record_id.clone())
                .collect();
            let data_hash = compute_data_hash(&record_ids);

            health_issues.push(
                HealthIssue::builder()
                    .id(format!("orphan_activity_asset:{}", data_hash))
                    .severity(Severity::Error)
                    .category(HealthCategory::DataConsistency)
                    .title(if count == 1 {
                        "Transaction references missing asset".to_string()
                    } else {
                        format!("{} transactions reference missing assets", count)
                    })
                    .message(
                        "Some transactions point to assets that no longer exist. This may cause calculation errors.",
                    )
                    .affected_count(count as u32)
                    .navigate_action(NavigateAction::to_activities(Some("orphan")))
                    .data_hash(data_hash)
                    .build(),
            );
        }

        // Emit health issue for negative positions
        if let Some(negative_issues) = by_type.get(&ConsistencyIssueType::NegativePosition) {
            let count = negative_issues.len();
            let record_ids: Vec<String> = negative_issues
                .iter()
                .map(|i| i.record_id.clone())
                .collect();
            let data_hash = compute_data_hash(&record_ids);

            health_issues.push(
                HealthIssue::builder()
                    .id(format!("negative_position:{}", data_hash))
                    .severity(Severity::Warning)
                    .category(HealthCategory::DataConsistency)
                    .title(if count == 1 {
                        "Holding has negative quantity".to_string()
                    } else {
                        format!("{} holdings have negative quantities", count)
                    })
                    .message(
                        "Some holdings show negative quantities, which usually indicates missing or incorrect transactions.",
                    )
                    .affected_count(count as u32)
                    .navigate_action(NavigateAction::to_holdings(Some("negative")))
                    .data_hash(data_hash)
                    .build(),
            );
        }

        // Emit health issue for legacy classifications needing migration
        if let Some(legacy_issues) = by_type.get(&ConsistencyIssueType::LegacyClassification) {
            let count = legacy_issues.len();
            let asset_ids: Vec<String> = legacy_issues
                .iter()
                .filter_map(|i| i.asset_id.clone())
                .collect();
            let data_hash = compute_data_hash(&asset_ids);

            health_issues.push(
                HealthIssue::builder()
                    .id(format!("legacy_classification:{}", data_hash))
                    .severity(Severity::Info)
                    .category(HealthCategory::DataConsistency)
                    .title(if count == 1 {
                        "1 asset has old classification data".to_string()
                    } else {
                        format!("{} assets have old classification data", count)
                    })
                    .message(
                        "Some assets have legacy sector/country data that can be migrated to the new classification system.",
                    )
                    .affected_count(count as u32)
                    .fix_action(FixAction::migrate_classifications(asset_ids))
                    .data_hash(data_hash)
                    .build(),
            );
        }

        // Emit health issue for accounts with negative portfolio balance
        if let Some(negative_balance_issues) =
            by_type.get(&ConsistencyIssueType::NegativeAccountBalance)
        {
            let count = negative_balance_issues.len();
            let account_ids: Vec<String> = negative_balance_issues
                .iter()
                .map(|i| i.record_id.clone())
                .collect();
            let data_hash = compute_data_hash(&account_ids);
            let affected_items: Vec<AffectedItem> = negative_balance_issues
                .iter()
                .map(|i| AffectedItem::account(i.record_id.clone(), i.description.clone()))
                .collect();

            // Details: one entry per account with date, breakdown, and likely cause
            let details: String = negative_balance_issues
                .iter()
                .filter_map(|i| {
                    let ccy = i.account_currency.as_deref()?;
                    let cash = i.cash_balance?;
                    let total = i.total_value_at_date?;
                    let investments = total - cash;
                    let date_line = i
                        .first_negative_date
                        .map(|d| format!("First went negative on {}.", d.format("%Y-%m-%d")))
                        .unwrap_or_default();
                    let breakdown = format!(
                        "Cash: {} {} | Investments: {} {}",
                        cash.round_dp(2),
                        ccy,
                        investments.round_dp(2),
                        ccy,
                    );
                    let likely_cause = if cash < Decimal::ZERO && investments >= Decimal::ZERO {
                        "→ Likely missing Transfer In or deposit before a buy transaction."
                    } else if cash >= Decimal::ZERO && investments < Decimal::ZERO {
                        "→ Likely missing Buy transaction before a Sell."
                    } else {
                        "→ Multiple data issues — check activities around this date."
                    };
                    Some(format!(
                        "{}\n{}\n{}\n{}",
                        i.description, date_line, breakdown, likely_cause
                    ))
                })
                .collect::<Vec<_>>()
                .join("\n\n");

            let mut builder = HealthIssue::builder()
                .id(format!("negative_account_balance:{}", data_hash))
                .severity(Severity::Warning)
                .category(HealthCategory::DataConsistency)
                .title(if count == 1 {
                    "Account has negative portfolio balance".to_string()
                } else {
                    format!("{} accounts have negative portfolio balance", count)
                })
                .message(
                    "One or more accounts show a negative total value in their history. This is usually caused by missing buy transactions. Review your activities to fix this.",
                )
                .affected_count(count as u32)
                .affected_items(affected_items)
                .navigate_action(NavigateAction::to_activities(None))
                .data_hash(data_hash);
            if !details.is_empty() {
                builder = builder.details(details);
            }
            health_issues.push(builder.build());
        }

        // Emit info issue for cash accounts with negative balance (may be a normal overdraft)
        if let Some(cash_balance_issues) = by_type.get(&ConsistencyIssueType::NegativeCashBalance) {
            let count = cash_balance_issues.len();
            let account_ids: Vec<String> = cash_balance_issues
                .iter()
                .map(|i| i.record_id.clone())
                .collect();
            let data_hash = compute_data_hash(&account_ids);
            let affected_items: Vec<AffectedItem> = cash_balance_issues
                .iter()
                .map(|i| AffectedItem::account(i.record_id.clone(), i.description.clone()))
                .collect();
            let details: String = cash_balance_issues
                .iter()
                .filter_map(|i| {
                    let ccy = i.account_currency.as_deref()?;
                    let cash = i.cash_balance?;
                    let date_line = i
                        .first_negative_date
                        .map(|d| format!("First went negative on {}.", d.format("%Y-%m-%d")))
                        .unwrap_or_default();
                    Some(format!(
                        "{}\n{}\nCash: {} {}\n→ This may be a bank overdraft or a missing deposit entry.",
                        i.description, date_line, cash.round_dp(2), ccy,
                    ))
                })
                .collect::<Vec<_>>()
                .join("\n\n");

            let mut builder = HealthIssue::builder()
                .id(format!("negative_cash_balance:{}", data_hash))
                .severity(Severity::Info)
                .category(HealthCategory::DataConsistency)
                .title(if count == 1 {
                    "Cash account had a negative balance".to_string()
                } else {
                    format!("{} cash accounts had a negative balance", count)
                })
                .message(
                    "One or more cash accounts show a negative balance in their history. This may be a normal bank overdraft or a missing deposit entry.",
                )
                .affected_count(count as u32)
                .affected_items(affected_items)
                .navigate_action(NavigateAction::to_activities(None))
                .data_hash(data_hash);
            if !details.is_empty() {
                builder = builder.details(details);
            }
            health_issues.push(builder.build());
        }

        health_issues
    }
}

impl Default for DataConsistencyCheck {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl HealthCheck for DataConsistencyCheck {
    fn id(&self) -> &'static str {
        "data_consistency"
    }

    fn category(&self) -> HealthCategory {
        HealthCategory::DataConsistency
    }

    async fn run(&self, _ctx: &HealthContext) -> Result<Vec<HealthIssue>> {
        // The service will call analyze() directly with consistency data
        Ok(Vec::new())
    }
}

/// Computes a data hash for issue identity and change detection.
fn compute_data_hash(record_ids: &[String]) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    let mut sorted_ids = record_ids.to_vec();
    sorted_ids.sort();
    for id in &sorted_ids {
        id.hash(&mut hasher);
    }

    format!("{:x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::health::model::HealthConfig;

    #[test]
    fn test_orphan_activity_account() {
        let check = DataConsistencyCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues_data = vec![ConsistencyIssueInfo {
            issue_type: ConsistencyIssueType::OrphanActivityAccount,
            record_id: "act_123".to_string(),
            description: "Activity references deleted account".to_string(),
            account_id: Some("acc_deleted".to_string()),
            asset_id: None,
            first_negative_date: None,
            cash_balance: None,
            total_value_at_date: None,
            account_currency: None,
        }];

        let issues = check.analyze(&issues_data, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Error);
        assert_eq!(issues[0].category, HealthCategory::DataConsistency);
    }

    #[test]
    fn test_negative_position() {
        let check = DataConsistencyCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues_data = vec![ConsistencyIssueInfo {
            issue_type: ConsistencyIssueType::NegativePosition,
            record_id: "pos_123".to_string(),
            description: "Position has negative quantity".to_string(),
            account_id: Some("acc_1".to_string()),
            asset_id: Some("SEC:AAPL:XNAS".to_string()),
            first_negative_date: None,
            cash_balance: None,
            total_value_at_date: None,
            account_currency: None,
        }];

        let issues = check.analyze(&issues_data, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Warning);
    }

    #[test]
    fn test_legacy_classification() {
        let check = DataConsistencyCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues_data = vec![ConsistencyIssueInfo {
            issue_type: ConsistencyIssueType::LegacyClassification,
            record_id: "SEC:AAPL:XNAS".to_string(),
            description: "Asset has legacy sector data".to_string(),
            account_id: None,
            asset_id: Some("SEC:AAPL:XNAS".to_string()),
            first_negative_date: None,
            cash_balance: None,
            total_value_at_date: None,
            account_currency: None,
        }];

        let issues = check.analyze(&issues_data, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Info);
        assert!(issues[0].fix_action.is_some());
    }

    #[test]
    fn test_multiple_issue_types() {
        let check = DataConsistencyCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues_data = vec![
            ConsistencyIssueInfo {
                issue_type: ConsistencyIssueType::OrphanActivityAccount,
                record_id: "act_1".to_string(),
                description: "Orphan 1".to_string(),
                account_id: None,
                asset_id: None,
                first_negative_date: None,
                cash_balance: None,
                total_value_at_date: None,
                account_currency: None,
            },
            ConsistencyIssueInfo {
                issue_type: ConsistencyIssueType::OrphanActivityAccount,
                record_id: "act_2".to_string(),
                description: "Orphan 2".to_string(),
                account_id: None,
                asset_id: None,
                first_negative_date: None,
                cash_balance: None,
                total_value_at_date: None,
                account_currency: None,
            },
            ConsistencyIssueInfo {
                issue_type: ConsistencyIssueType::NegativePosition,
                record_id: "pos_1".to_string(),
                description: "Negative".to_string(),
                account_id: None,
                asset_id: None,
                first_negative_date: None,
                cash_balance: None,
                total_value_at_date: None,
                account_currency: None,
            },
        ];

        let issues = check.analyze(&issues_data, &ctx);
        // Should have 2 issues: one for orphan accounts (2 records), one for negative (1 record)
        assert_eq!(issues.len(), 2);
    }

    #[test]
    fn test_negative_account_balance() {
        let check = DataConsistencyCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues_data = vec![ConsistencyIssueInfo {
            issue_type: ConsistencyIssueType::NegativeAccountBalance,
            record_id: "acc_123".to_string(),
            description: "My Account".to_string(),
            account_id: Some("acc_123".to_string()),
            asset_id: None,
            first_negative_date: Some(chrono::NaiveDate::from_ymd_opt(2025, 1, 10).unwrap()),
            cash_balance: Some(rust_decimal_macros::dec!(-50.20)),
            total_value_at_date: Some(rust_decimal_macros::dec!(-50.20)),
            account_currency: Some("EUR".to_string()),
        }];

        let issues = check.analyze(&issues_data, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Warning);
        assert_eq!(issues[0].category, HealthCategory::DataConsistency);
        assert!(issues[0].navigate_action.is_some());
    }

    #[test]
    fn test_no_issues() {
        let check = DataConsistencyCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues = check.analyze(&[], &ctx);
        assert!(issues.is_empty());
    }
}
