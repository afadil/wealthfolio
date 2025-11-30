use std::sync::Arc;

use crate::context::ServiceContext;
use chrono::Utc;
use log::{debug, error};
use tauri::State;

use wealthfolio_core::activity_rules::{
    ActivityRule, ActivityRuleMatch, ActivityRuleWithNames, NewActivityRule, UpdateActivityRule,
};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionInput {
    pub name: String,
    pub account_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateActivityRuleInput {
    pub name: String,
    pub pattern: String,
    pub match_type: String,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub activity_type: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<bool>,
    pub account_id: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateActivityRuleInput {
    pub name: Option<String>,
    pub pattern: Option<String>,
    pub match_type: Option<String>,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub activity_type: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<bool>,
    pub account_id: Option<String>,
}

#[tauri::command]
pub async fn get_activity_rules(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ActivityRule>, String> {
    debug!("Fetching all activity rules...");
    state
        .activity_rule_service()
        .get_all_rules()
        .map_err(|e| {
            error!("Failed to fetch activity rules: {}", e);
            format!("Failed to fetch activity rules: {}", e)
        })
}

#[tauri::command]
pub async fn get_activity_rules_with_names(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<ActivityRuleWithNames>, String> {
    debug!("Fetching activity rules with names...");
    state
        .activity_rule_service()
        .get_all_rules_with_names()
        .map_err(|e| {
            error!("Failed to fetch activity rules with names: {}", e);
            format!("Failed to fetch activity rules with names: {}", e)
        })
}

#[tauri::command]
pub async fn create_activity_rule(
    rule: CreateActivityRuleInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ActivityRule, String> {
    debug!("Creating activity rule: {:?}", rule.name);
    let now = Utc::now().to_rfc3339();
    let new_rule = NewActivityRule {
        id: None,
        name: rule.name,
        pattern: rule.pattern,
        match_type: rule.match_type,
        category_id: rule.category_id,
        sub_category_id: rule.sub_category_id,
        activity_type: rule.activity_type,
        priority: rule.priority,
        is_global: rule.is_global.map(|b| if b { 1 } else { 0 }),
        account_id: rule.account_id,
        created_at: now.clone(),
        updated_at: now,
    };
    state
        .activity_rule_service()
        .create_rule(new_rule)
        .await
        .map_err(|e| {
            error!("Failed to create activity rule: {}", e);
            format!("Failed to create activity rule: {}", e)
        })
}

#[tauri::command]
pub async fn update_activity_rule(
    id: String,
    update: UpdateActivityRuleInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<ActivityRule, String> {
    debug!("Updating activity rule: {}", id);
    let update_rule = UpdateActivityRule {
        name: update.name,
        pattern: update.pattern,
        match_type: update.match_type,
        category_id: update.category_id,
        sub_category_id: update.sub_category_id,
        activity_type: update.activity_type,
        priority: update.priority,
        is_global: update.is_global.map(|b| if b { 1 } else { 0 }),
        account_id: update.account_id,
        updated_at: Utc::now().to_rfc3339(),
    };
    state
        .activity_rule_service()
        .update_rule(&id, update_rule)
        .await
        .map_err(|e| {
            error!("Failed to update activity rule: {}", e);
            format!("Failed to update activity rule: {}", e)
        })
}

#[tauri::command]
pub async fn delete_activity_rule(
    rule_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Deleting activity rule: {}", rule_id);
    state
        .activity_rule_service()
        .delete_rule(&rule_id)
        .await
        .map_err(|e| {
            error!("Failed to delete activity rule: {}", e);
            format!("Failed to delete activity rule: {}", e)
        })
}

#[tauri::command]
pub async fn apply_activity_rules(
    transaction_name: String,
    account_id: Option<String>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Option<ActivityRuleMatch>, String> {
    debug!("Applying activity rules to: {}", transaction_name);
    state
        .activity_rule_service()
        .apply_rules(&transaction_name, account_id.as_deref())
        .map_err(|e| {
            error!("Failed to apply activity rules: {}", e);
            format!("Failed to apply activity rules: {}", e)
        })
}

#[tauri::command]
pub async fn bulk_apply_activity_rules(
    transactions: Vec<TransactionInput>,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Option<ActivityRuleMatch>>, String> {
    debug!("Bulk applying activity rules to {} transactions", transactions.len());
    let transaction_tuples: Vec<(String, Option<String>)> = transactions
        .into_iter()
        .map(|t| (t.name, t.account_id))
        .collect();

    state
        .activity_rule_service()
        .bulk_apply_rules(transaction_tuples)
        .map_err(|e| {
            error!("Failed to bulk apply activity rules: {}", e);
            format!("Failed to bulk apply activity rules: {}", e)
        })
}

#[tauri::command]
pub async fn test_activity_rule_pattern(
    pattern: String,
    match_type: String,
    test_text: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<bool, String> {
    debug!("Testing pattern '{}' against '{}'", pattern, test_text);
    state
        .activity_rule_service()
        .test_pattern(&pattern, &match_type, &test_text)
        .map_err(|e| {
            error!("Failed to test pattern: {}", e);
            format!("Failed to test pattern: {}", e)
        })
}
