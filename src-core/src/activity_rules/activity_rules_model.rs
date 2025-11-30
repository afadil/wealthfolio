use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for activity rules
#[derive(
    Queryable,
    Identifiable,
    AsChangeset,
    Selectable,
    PartialEq,
    Serialize,
    Deserialize,
    Debug,
    Clone,
)]
#[diesel(table_name = crate::schema::activity_rules)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct ActivityRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub match_type: String,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub activity_type: Option<String>,
    pub priority: i32,
    pub is_global: Option<i32>,
    pub account_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for creating a new activity rule
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::activity_rules)]
#[serde(rename_all = "camelCase")]
pub struct NewActivityRule {
    pub id: Option<String>,
    pub name: String,
    pub pattern: String,
    pub match_type: String,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub activity_type: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<i32>,
    pub account_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for updating an activity rule
#[derive(AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::activity_rules)]
#[serde(rename_all = "camelCase")]
pub struct UpdateActivityRule {
    pub name: Option<String>,
    pub pattern: Option<String>,
    pub match_type: Option<String>,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub activity_type: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<i32>,
    pub account_id: Option<String>,
    pub updated_at: String,
}

/// Result of an activity rule match
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRuleMatch {
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub activity_type: Option<String>,
    pub rule_id: String,
    pub rule_name: String,
}

/// Activity rule with resolved category names (for display)
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRuleWithNames {
    #[serde(flatten)]
    pub rule: ActivityRule,
    pub category_name: Option<String>,
    pub sub_category_name: Option<String>,
}

/// Match types supported by activity rules
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum MatchType {
    Contains,
    StartsWith,
    Exact,
}

impl MatchType {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "starts_with" => MatchType::StartsWith,
            "exact" => MatchType::Exact,
            _ => MatchType::Contains,
        }
    }
}

impl ActivityRule {
    /// Check if this rule matches the given transaction name
    pub fn matches(&self, transaction_name: &str) -> bool {
        let match_type = MatchType::from_str(&self.match_type);
        let normalized_text = transaction_name.to_lowercase().trim().to_string();
        let normalized_pattern = self.pattern.to_lowercase().trim().to_string();

        match match_type {
            MatchType::Contains => normalized_text.contains(&normalized_pattern),
            MatchType::StartsWith => normalized_text.starts_with(&normalized_pattern),
            MatchType::Exact => normalized_text == normalized_pattern,
        }
    }

    /// Check if this rule applies to the given account
    pub fn applies_to_account(&self, account_id: Option<&str>) -> bool {
        if self.is_global == Some(1) {
            return true;
        }

        match (&self.account_id, account_id) {
            (Some(rule_account), Some(target_account)) => rule_account == target_account,
            _ => false,
        }
    }

    /// Convert this rule to an ActivityRuleMatch
    pub fn to_match(&self) -> ActivityRuleMatch {
        ActivityRuleMatch {
            category_id: self.category_id.clone(),
            sub_category_id: self.sub_category_id.clone(),
            activity_type: self.activity_type.clone(),
            rule_id: self.id.clone(),
            rule_name: self.name.clone(),
        }
    }
}
