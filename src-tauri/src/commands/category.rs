use std::collections::HashMap;
use std::sync::Arc;

use crate::context::ServiceContext;
use log::{debug, error};
use tauri::State;

use wealthfolio_core::categories::{Category, CategoryWithChildren};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCategoryInput {
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_income: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategoryInput {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
}

#[tauri::command]
pub async fn get_categories(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<Category>, String> {
    debug!("Fetching all categories...");
    state
        .category_service()
        .get_all_categories()
        .map_err(|e| {
            error!("Failed to fetch categories: {}", e);
            format!("Failed to fetch categories: {}", e)
        })
}

#[tauri::command]
pub async fn get_categories_hierarchical(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<CategoryWithChildren>, String> {
    debug!("Fetching hierarchical categories...");
    state
        .category_service()
        .get_categories_hierarchical()
        .map_err(|e| {
            error!("Failed to fetch hierarchical categories: {}", e);
            format!("Failed to fetch hierarchical categories: {}", e)
        })
}

#[tauri::command]
pub async fn get_expense_categories(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<CategoryWithChildren>, String> {
    debug!("Fetching expense categories...");
    state
        .category_service()
        .get_expense_categories()
        .map_err(|e| {
            error!("Failed to fetch expense categories: {}", e);
            format!("Failed to fetch expense categories: {}", e)
        })
}

#[tauri::command]
pub async fn get_income_categories(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Vec<CategoryWithChildren>, String> {
    debug!("Fetching income categories...");
    state
        .category_service()
        .get_income_categories()
        .map_err(|e| {
            error!("Failed to fetch income categories: {}", e);
            format!("Failed to fetch income categories: {}", e)
        })
}

#[tauri::command]
pub async fn create_category(
    category: CreateCategoryInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Category, String> {
    debug!("Creating category: {:?}", category.name);
    state
        .category_service()
        .create_category(
            category.name,
            category.parent_id,
            category.color,
            category.icon,
            category.is_income,
        )
        .await
        .map_err(|e| {
            error!("Failed to create category: {}", e);
            format!("Failed to create category: {}", e)
        })
}

#[tauri::command]
pub async fn update_category(
    id: String,
    update: UpdateCategoryInput,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<Category, String> {
    debug!("Updating category: {}", id);
    state
        .category_service()
        .update_category(
            &id,
            update.name,
            update.color,
            update.icon,
            update.sort_order,
        )
        .await
        .map_err(|e| {
            error!("Failed to update category: {}", e);
            format!("Failed to update category: {}", e)
        })
}

#[tauri::command]
pub async fn delete_category(
    category_id: String,
    state: State<'_, Arc<ServiceContext>>,
) -> Result<(), String> {
    debug!("Deleting category: {}", category_id);
    state
        .category_service()
        .delete_category(&category_id)
        .await
        .map_err(|e| {
            error!("Failed to delete category: {}", e);
            format!("Failed to delete category: {}", e)
        })?;
    Ok(())
}

#[tauri::command]
pub async fn get_category_activity_counts(
    state: State<'_, Arc<ServiceContext>>,
) -> Result<HashMap<String, i64>, String> {
    debug!("Fetching category activity counts...");
    state
        .category_service()
        .get_activity_counts()
        .map_err(|e| {
            error!("Failed to fetch category activity counts: {}", e);
            format!("Failed to fetch category activity counts: {}", e)
        })
}
