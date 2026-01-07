use crate::categories::categories_model::{Category, CategoryWithChildren, NewCategory, UpdateCategory};
use crate::errors::Result;
use async_trait::async_trait;

/// Trait for category repository operations
#[async_trait]
pub trait CategoryRepositoryTrait: Send + Sync {
    /// Get all categories
    fn get_all_categories(&self) -> Result<Vec<Category>>;

    /// Get a category by ID
    fn get_category_by_id(&self, id: &str) -> Result<Option<Category>>;

    /// Get all parent categories (those with no parent_id)
    fn get_parent_categories(&self) -> Result<Vec<Category>>;

    /// Get children of a parent category
    fn get_children(&self, parent_id: &str) -> Result<Vec<Category>>;

    /// Create a new category
    async fn create_category(&self, new_category: NewCategory) -> Result<Category>;

    /// Update a category
    async fn update_category(&self, id: &str, update: UpdateCategory) -> Result<Category>;

    /// Delete a category (only if no activities reference it)
    async fn delete_category(&self, id: &str) -> Result<usize>;

    /// Check if a category has any activities assigned
    fn has_activities(&self, category_id: &str) -> Result<bool>;

    /// Get expense categories (is_income = 0)
    fn get_expense_categories(&self) -> Result<Vec<Category>>;

    /// Get income categories (is_income = 1)
    fn get_income_categories(&self) -> Result<Vec<Category>>;

    /// Get activity counts grouped by category ID
    /// Returns a HashMap where keys are category IDs and values are activity counts
    fn get_activity_counts(&self) -> Result<std::collections::HashMap<String, i64>>;
}

/// Trait for category service operations
#[async_trait]
pub trait CategoryServiceTrait: Send + Sync {
    /// Get all categories organized hierarchically
    fn get_categories_hierarchical(&self) -> Result<Vec<CategoryWithChildren>>;

    /// Get all categories flat list
    fn get_all_categories(&self) -> Result<Vec<Category>>;

    /// Get a category by ID
    fn get_category(&self, id: &str) -> Result<Option<Category>>;

    /// Create a new category
    async fn create_category(&self, name: String, parent_id: Option<String>, color: Option<String>, icon: Option<String>, is_income: bool) -> Result<Category>;

    /// Update a category
    async fn update_category(&self, id: &str, name: Option<String>, color: Option<String>, icon: Option<String>, sort_order: Option<i32>) -> Result<Category>;

    /// Delete a category (fails if activities are assigned)
    async fn delete_category(&self, id: &str) -> Result<usize>;

    /// Get expense categories with their children
    fn get_expense_categories(&self) -> Result<Vec<CategoryWithChildren>>;

    /// Get income categories with their children
    fn get_income_categories(&self) -> Result<Vec<CategoryWithChildren>>;

    /// Get activity counts grouped by category ID
    fn get_activity_counts(&self) -> Result<std::collections::HashMap<String, i64>>;
}
