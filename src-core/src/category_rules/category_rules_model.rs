use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for category rules
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
#[diesel(table_name = crate::schema::category_rules)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct CategoryRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub match_type: String, // "contains", "starts_with", "exact", "regex"
    pub category_id: String,
    pub sub_category_id: Option<String>,
    pub priority: i32,
    pub is_global: Option<i32>,
    pub account_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for creating a new category rule
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::category_rules)]
#[serde(rename_all = "camelCase")]
pub struct NewCategoryRule {
    pub id: Option<String>,
    pub name: String,
    pub pattern: String,
    pub match_type: String,
    pub category_id: String,
    pub sub_category_id: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<i32>,
    pub account_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for updating a category rule
#[derive(AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::category_rules)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategoryRule {
    pub name: Option<String>,
    pub pattern: Option<String>,
    pub match_type: Option<String>,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<i32>,
    pub account_id: Option<String>,
    pub updated_at: String,
}

/// Result of a category match
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategoryMatch {
    pub category_id: String,
    pub sub_category_id: Option<String>,
    pub rule_id: String,
    pub rule_name: String,
}

/// Category rule with resolved category names (for display)
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategoryRuleWithNames {
    #[serde(flatten)]
    pub rule: CategoryRule,
    pub category_name: String,
    pub sub_category_name: Option<String>,
}

/// Match types supported by category rules
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
            _ => MatchType::Contains, // default
        }
    }
}

impl CategoryRule {
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
        // Global rules apply to all accounts
        if self.is_global == Some(1) {
            return true;
        }

        // Account-specific rules only apply to their account
        match (&self.account_id, account_id) {
            (Some(rule_account), Some(target_account)) => rule_account == target_account,
            _ => false,
        }
    }

    /// Convert this rule to a CategoryMatch if it matches
    pub fn to_match(&self) -> CategoryMatch {
        CategoryMatch {
            category_id: self.category_id.clone(),
            sub_category_id: self.sub_category_id.clone(),
            rule_id: self.id.clone(),
            rule_name: self.name.clone(),
        }
    }
}
