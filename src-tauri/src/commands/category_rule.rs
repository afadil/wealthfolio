use std::sync::Arc;

use crate::context::ServiceContext;
use chrono::Utc;
use log::{debug, error};
use tauri::State;

use wealthfolio_core::category_rules::{
    CategoryMatch, CategoryRule, CategoryRuleWithNames, NewCategoryRule, UpdateCategoryRule,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionInput {
    pub name: String,
    pub account_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCategoryRuleInput {
    pub name: String,
    pub pattern: String,
    pub match_type: String,
    pub category_id: String,
    pub sub_category_id: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<bool>,
    pub account_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategoryRuleInput {
    pub name: Option<String>,
    pub pattern: Option<String>,
    pub match_type: Option<String>,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<bool>,
    pub account_id: Option<String>,
}

#[tauri::command]
pub async fn get_category_rules(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<CategoryRule>, String> {
    debug!("Fetching all category rules...");
    state
        .category_rule_service()
        .get_all_rules()
        .map_err(|e| {
            error!("Failed to fetch category rules: {}", e);
            format!("Failed to fetch category rules: {}", e)
        })
}

#[tauri::command]
pub async fn get_category_rules_with_names(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<CategoryRuleWithNames>, String> {
    debug!("Fetching category rules with names...");
    state
        .category_rule_service()
        .get_all_rules_with_names()
        .map_err(|e| {
            error!("Failed to fetch category rules with names: {}", e);
            format!("Failed to fetch category rules with names: {}", e)
        })
}

#[tauri::command]
pub async fn create_category_rule(
    rule: CreateCategoryRuleInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<CategoryRule, String> {
    debug!("Creating category rule: {:?}", rule.name);
    let now = Utc::now().to_rfc3339();
    let new_rule = NewCategoryRule {
        id: None,
        name: rule.name,
        pattern: rule.pattern,
        match_type: rule.match_type,
        category_id: rule.category_id,
        sub_category_id: rule.sub_category_id,
        priority: rule.priority,
        is_global: rule.is_global.map(|b| if b { 1 } else { 0 }),
        account_id: rule.account_id,
        created_at: now.clone(),
        updated_at: now,
    };
    state
        .category_rule_service()
        .create_rule(new_rule)
        .await
        .map_err(|e| {
            error!("Failed to create category rule: {}", e);
            format!("Failed to create category rule: {}", e)
        })
}

#[tauri::command]
pub async fn update_category_rule(
    id: String,
    update: UpdateCategoryRuleInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<CategoryRule, String> {
    debug!("Updating category rule: {}", id);
    let update_rule = UpdateCategoryRule {
        name: update.name,
        pattern: update.pattern,
        match_type: update.match_type,
        category_id: update.category_id,
        sub_category_id: update.sub_category_id,
        priority: update.priority,
        is_global: update.is_global.map(|b| if b { 1 } else { 0 }),
        account_id: update.account_id,
        updated_at: Utc::now().to_rfc3339(),
    };
    state
        .category_rule_service()
        .update_rule(&id, update_rule)
        .await
        .map_err(|e| {
            error!("Failed to update category rule: {}", e);
            format!("Failed to update category rule: {}", e)
        })
}

#[tauri::command]
pub async fn delete_category_rule(
    rule_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Deleting category rule: {}", rule_id);
    state
        .category_rule_service()
        .delete_rule(&rule_id)
        .await
        .map_err(|e| {
            error!("Failed to delete category rule: {}", e);
            format!("Failed to delete category rule: {}", e)
        })
}

#[tauri::command]
pub async fn apply_category_rules(
    transaction_name: String,
    account_id: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<CategoryMatch>, String> {
    debug!("Applying category rules to: {}", transaction_name);
    state
        .category_rule_service()
        .apply_rules(&transaction_name, account_id.as_deref())
        .map_err(|e| {
            error!("Failed to apply category rules: {}", e);
            format!("Failed to apply category rules: {}", e)
        })
}

#[tauri::command]
pub async fn bulk_apply_category_rules(
    transactions: Vec<TransactionInput>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Option<CategoryMatch>>, String> {
    debug!("Bulk applying category rules to {} transactions", transactions.len());
    let transaction_tuples: Vec<(String, Option<String>)> = transactions
        .into_iter()
        .map(|t| (t.name, t.account_id))
        .collect();

    state
        .category_rule_service()
        .bulk_apply_rules(transaction_tuples)
        .map_err(|e| {
            error!("Failed to bulk apply category rules: {}", e);
            format!("Failed to bulk apply category rules: {}", e)
        })
}

#[tauri::command]
pub async fn test_category_rule_pattern(
    pattern: String,
    match_type: String,
    test_text: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<bool, String> {
    debug!("Testing pattern '{}' against '{}'", pattern, test_text);
    state
        .category_rule_service()
        .test_pattern(&pattern, &match_type, &test_text)
        .map_err(|e| {
            error!("Failed to test pattern: {}", e);
            format!("Failed to test pattern: {}", e)
        })
}
