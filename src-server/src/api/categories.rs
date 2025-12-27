use std::collections::HashMap;
use std::sync::Arc;

use crate::{error::ApiResult, main_lib::AppState};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use wealthfolio_core::categories::{Category, categories_model::CategoryWithChildren};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCategoryRequest {
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_income: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategoryRequest {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
}

/// Get all categories (flat list)
async fn get_all_categories(State(state): State<Arc<AppState>>) -> ApiResult<Json<Vec<Category>>> {
    let categories = state.category_service.get_all_categories()?;
    Ok(Json(categories))
}

/// Get categories organized hierarchically
async fn get_categories_hierarchical(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<CategoryWithChildren>>> {
    let categories = state.category_service.get_categories_hierarchical()?;
    Ok(Json(categories))
}

/// Get expense categories with children
async fn get_expense_categories(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<CategoryWithChildren>>> {
    let categories = state.category_service.get_expense_categories()?;
    Ok(Json(categories))
}

/// Get income categories with children
async fn get_income_categories(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Vec<CategoryWithChildren>>> {
    let categories = state.category_service.get_income_categories()?;
    Ok(Json(categories))
}

/// Get a single category by ID
async fn get_category(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<Option<Category>>> {
    let category = state.category_service.get_category(&id)?;
    Ok(Json(category))
}

/// Create a new category
async fn create_category(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateCategoryRequest>,
) -> ApiResult<Json<Category>> {
    let category = state
        .category_service
        .create_category(req.name, req.parent_id, req.color, req.icon, req.is_income)
        .await?;
    Ok(Json(category))
}

/// Update a category
async fn update_category(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateCategoryRequest>,
) -> ApiResult<Json<Category>> {
    let category = state
        .category_service
        .update_category(&id, req.name, req.color, req.icon, req.sort_order)
        .await?;
    Ok(Json(category))
}

/// Delete a category
async fn delete_category(
    Path(id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> ApiResult<StatusCode> {
    let _ = state.category_service.delete_category(&id).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Get activity counts for all categories
async fn get_activity_counts(
    State(state): State<Arc<AppState>>,
) -> ApiResult<Json<HashMap<String, i64>>> {
    let counts = state.category_service.get_activity_counts()?;
    Ok(Json(counts))
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/categories", get(get_all_categories).post(create_category))
        .route("/categories/hierarchical", get(get_categories_hierarchical))
        .route("/categories/expense", get(get_expense_categories))
        .route("/categories/income", get(get_income_categories))
        .route("/categories/activity-counts", get(get_activity_counts))
        .route(
            "/categories/{id}",
            get(get_category).put(update_category).delete(delete_category),
        )
}
