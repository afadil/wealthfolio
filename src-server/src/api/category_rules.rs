use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use wealthfolio_core::category_rules::{
    CategoryMatch, CategoryRule, CategoryRuleWithNames, NewCategoryRule, UpdateCategoryRule,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRuleRequest {
    pub name: String,
    pub pattern: String,
    pub match_type: String,
    pub category_id: String,
    pub sub_category_id: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<bool>,
    pub account_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRuleRequest {
    pub name: Option<String>,
    pub pattern: Option<String>,
    pub match_type: Option<String>,
    pub category_id: Option<String>,
    pub sub_category_id: Option<String>,
    pub priority: Option<i32>,
    pub is_global: Option<bool>,
    pub account_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyRulesRequest {
    pub transaction_name: String,
    pub account_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulkApplyRulesRequest {
    pub transactions: Vec<TransactionInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransactionInput {
    pub name: String,
    pub account_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestPatternRequest {
    pub pattern: String,
    pub match_type: String,
    pub test_text: String,
}

/// Get all category rules
async fn get_all_rules(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<CategoryRule>>> {
    let rules = state.category_rule_service.get_all_rules()?;
    Ok(Json(rules))
}

/// Get all category rules with resolved category names
async fn get_all_rules_with_names(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<CategoryRuleWithNames>>> {
    let rules = state.category_rule_service.get_all_rules_with_names()?;
    Ok(Json(rules))
}

/// Get a single rule by ID
async fn get_rule(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<CategoryRule>> {
    let rule = state.category_rule_service.get_rule_by_id(&id)?;
    Ok(Json(rule))
}

/// Create a new category rule
async fn create_rule(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateRuleRequest>,
) -> ApiResult<Json<CategoryRule>> {
    let now = Utc::now().to_rfc3339();
    let new_rule = NewCategoryRule {
        id: None,
        name: req.name,
        pattern: req.pattern,
        match_type: req.match_type,
        category_id: req.category_id,
        sub_category_id: req.sub_category_id,
        priority: req.priority,
        is_global: req.is_global.map(|b| if b { 1 } else { 0 }),
        account_id: req.account_id,
        created_at: now.clone(),
        updated_at: now,
    };

    let rule = state.category_rule_service.create_rule(new_rule).await?;
    Ok(Json(rule))
}

/// Update a category rule
async fn update_rule(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateRuleRequest>,
) -> ApiResult<Json<CategoryRule>> {
    let update = UpdateCategoryRule {
        name: req.name,
        pattern: req.pattern,
        match_type: req.match_type,
        category_id: req.category_id,
        sub_category_id: req.sub_category_id,
        priority: req.priority,
        is_global: req.is_global.map(|b| if b { 1 } else { 0 }),
        account_id: req.account_id,
        updated_at: Utc::now().to_rfc3339(),
    };

    let rule = state.category_rule_service.update_rule(&id, update).await?;
    Ok(Json(rule))
}

/// Delete a category rule
async fn delete_rule(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    state.category_rule_service.delete_rule(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Apply rules to a single transaction name
async fn apply_rules(
    State(state): State<Arc<AppState>>,
    Json(req): Json<ApplyRulesRequest>,
) -> ApiResult<Json<Option<CategoryMatch>>> {
    let result = state
        .category_rule_service
        .apply_rules(&req.transaction_name, req.account_id.as_deref())?;
    Ok(Json(result))
}

/// Apply rules to multiple transactions
async fn bulk_apply_rules(
    State(state): State<Arc<AppState>>,
    Json(req): Json<BulkApplyRulesRequest>,
) -> ApiResult<Json<Vec<Option<CategoryMatch>>>> {
    let transactions: Vec<(String, Option<String>)> = req
        .transactions
        .into_iter()
        .map(|t| (t.name, t.account_id))
        .collect();

    let results = state.category_rule_service.bulk_apply_rules(transactions)?;
    Ok(Json(results))
}

/// Test a pattern against sample text
async fn test_pattern(
    State(state): State<Arc<AppState>>,
    Json(req): Json<TestPatternRequest>,
) -> ApiResult<Json<bool>> {
    let result = state
        .category_rule_service
        .test_pattern(&req.pattern, &req.match_type, &req.test_text)?;
    Ok(Json(result))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/category-rules", get(get_all_rules).post(create_rule))
        .route("/category-rules/with-names", get(get_all_rules_with_names))
        .route("/category-rules/apply", axum::routing::post(apply_rules))
        .route("/category-rules/bulk-apply", axum::routing::post(bulk_apply_rules))
        .route("/category-rules/test-pattern", axum::routing::post(test_pattern))
        .route(
            "/category-rules/{id}",
            get(get_rule).put(update_rule).delete(delete_rule),
        )
}
