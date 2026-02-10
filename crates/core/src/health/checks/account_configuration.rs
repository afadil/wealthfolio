//! Account configuration health check.
//!
//! Detects accounts that need tracking mode configuration.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::health::model::{AffectedItem, HealthCategory, HealthIssue, NavigateAction, Severity};
use crate::health::traits::HealthContext;

/// Information about an account missing tracking mode configuration.
#[derive(Debug, Clone)]
pub struct UnconfiguredAccountInfo {
    /// Account ID
    pub account_id: String,
    /// Account name
    pub account_name: String,
}

/// Health check that detects accounts without tracking mode set.
pub struct AccountConfigurationCheck;

impl AccountConfigurationCheck {
    /// Creates a new account configuration check.
    pub fn new() -> Self {
        Self
    }

    /// Analyzes accounts for missing tracking mode configuration.
    pub fn analyze(
        &self,
        unconfigured_accounts: &[UnconfiguredAccountInfo],
        _ctx: &HealthContext,
    ) -> Vec<HealthIssue> {
        if unconfigured_accounts.is_empty() {
            return Vec::new();
        }

        let count = unconfigured_accounts.len();
        let account_ids: Vec<String> = unconfigured_accounts
            .iter()
            .map(|a| a.account_id.clone())
            .collect();
        let data_hash = compute_data_hash(&account_ids);

        let affected_items: Vec<AffectedItem> = unconfigured_accounts
            .iter()
            .map(|a| AffectedItem::account(&a.account_id, &a.account_name))
            .collect();

        let title = if count == 1 {
            "1 account needs setup".to_string()
        } else {
            format!("{} accounts need setup", count)
        };

        let message = if count == 1 {
            "Choose a tracking mode to start syncing data.".to_string()
        } else {
            "Choose tracking modes to start syncing data.".to_string()
        };

        vec![HealthIssue::builder()
            .id(format!("unconfigured_accounts:{}", data_hash))
            .severity(Severity::Warning)
            .category(HealthCategory::AccountConfiguration)
            .title(title)
            .message(message)
            .affected_count(count as u32)
            .navigate_action(NavigateAction::to_connect())
            .affected_items(affected_items)
            .data_hash(data_hash)
            .build()]
    }
}

impl Default for AccountConfigurationCheck {
    fn default() -> Self {
        Self::new()
    }
}

/// Computes a data hash for issue identity and change detection.
fn compute_data_hash(account_ids: &[String]) -> String {
    let mut hasher = DefaultHasher::new();
    let mut sorted_ids = account_ids.to_vec();
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
    fn test_no_unconfigured_accounts() {
        let check = AccountConfigurationCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let issues = check.analyze(&[], &ctx);
        assert!(issues.is_empty());
    }

    #[test]
    fn test_single_unconfigured_account() {
        let check = AccountConfigurationCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let accounts = vec![UnconfiguredAccountInfo {
            account_id: "acc_123".to_string(),
            account_name: "My Brokerage".to_string(),
        }];

        let issues = check.analyze(&accounts, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].severity, Severity::Warning);
        assert_eq!(issues[0].category, HealthCategory::AccountConfiguration);
        assert_eq!(issues[0].affected_count, 1);
        assert!(issues[0].title.contains("1 account"));
        assert!(issues[0].navigate_action.is_some());
        assert_eq!(
            issues[0].navigate_action.as_ref().unwrap().route,
            "/connect"
        );
    }

    #[test]
    fn test_multiple_unconfigured_accounts() {
        let check = AccountConfigurationCheck::new();
        let ctx = HealthContext::new(HealthConfig::default(), "USD", 100_000.0);

        let accounts = vec![
            UnconfiguredAccountInfo {
                account_id: "acc_1".to_string(),
                account_name: "Account 1".to_string(),
            },
            UnconfiguredAccountInfo {
                account_id: "acc_2".to_string(),
                account_name: "Account 2".to_string(),
            },
            UnconfiguredAccountInfo {
                account_id: "acc_3".to_string(),
                account_name: "Account 3".to_string(),
            },
        ];

        let issues = check.analyze(&accounts, &ctx);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].affected_count, 3);
        assert!(issues[0].title.contains("3 accounts"));
        assert!(issues[0].affected_items.is_some());
        assert_eq!(issues[0].affected_items.as_ref().unwrap().len(), 3);
    }
}
