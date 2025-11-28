use crate::categories::categories_model::{Category, CategoryWithChildren, NewCategory, UpdateCategory};
use crate::categories::categories_traits::{CategoryRepositoryTrait, CategoryServiceTrait};
use crate::errors::Result;
use async_trait::async_trait;
use chrono::Utc;
use std::sync::Arc;

pub struct CategoryService<T: CategoryRepositoryTrait> {
    category_repo: Arc<T>,
}

impl<T: CategoryRepositoryTrait> CategoryService<T> {
    pub fn new(category_repo: Arc<T>) -> Self {
        CategoryService { category_repo }
    }

    /// Helper to organize categories into hierarchical structure
    fn organize_hierarchically(&self, categories: Vec<Category>) -> Vec<CategoryWithChildren> {
        let parents: Vec<Category> = categories
            .iter()
            .filter(|c| c.parent_id.is_none())
            .cloned()
            .collect();

        parents
            .into_iter()
            .map(|parent| {
                let children: Vec<Category> = categories
                    .iter()
                    .filter(|c| c.parent_id.as_ref() == Some(&parent.id))
                    .cloned()
                    .collect();

                CategoryWithChildren {
                    category: parent,
                    children,
                }
            })
            .collect()
    }
}

#[async_trait]
impl<T: CategoryRepositoryTrait + Send + Sync> CategoryServiceTrait for CategoryService<T> {
    fn get_categories_hierarchical(&self) -> Result<Vec<CategoryWithChildren>> {
        let all_categories = self.category_repo.get_all_categories()?;
        Ok(self.organize_hierarchically(all_categories))
    }

    fn get_all_categories(&self) -> Result<Vec<Category>> {
        self.category_repo.get_all_categories()
    }

    fn get_category(&self, id: &str) -> Result<Option<Category>> {
        self.category_repo.get_category_by_id(id)
    }

    async fn create_category(
        &self,
        name: String,
        parent_id: Option<String>,
        color: Option<String>,
        icon: Option<String>,
        is_income: bool,
    ) -> Result<Category> {
        let now = Utc::now().to_rfc3339();

        let sort_order = if let Some(ref pid) = parent_id {
            let children = self.category_repo.get_children(pid)?;
            children.len() as i32 + 1
        } else {
            let parents = self.category_repo.get_parent_categories()?;
            let same_type_count = parents.iter().filter(|c| c.is_income == is_income as i32).count();
            same_type_count as i32 + 1
        };

        let new_category = NewCategory {
            id: None,
            name,
            parent_id,
            color,
            icon,
            is_income: if is_income { 1 } else { 0 },
            sort_order,
            created_at: now.clone(),
            updated_at: now,
        };

        self.category_repo.create_category(new_category).await
    }

    async fn update_category(
        &self,
        id: &str,
        name: Option<String>,
        color: Option<String>,
        icon: Option<String>,
        sort_order: Option<i32>,
    ) -> Result<Category> {
        let update = UpdateCategory {
            name,
            color,
            icon,
            sort_order,
            updated_at: Utc::now().to_rfc3339(),
        };

        self.category_repo.update_category(id, update).await
    }

    async fn delete_category(&self, id: &str) -> Result<usize> {
        self.category_repo.delete_category(id).await
    }

    fn get_expense_categories(&self) -> Result<Vec<CategoryWithChildren>> {
        let expense_cats = self.category_repo.get_expense_categories()?;
        Ok(self.organize_hierarchically(expense_cats))
    }

    fn get_income_categories(&self) -> Result<Vec<CategoryWithChildren>> {
        let income_cats = self.category_repo.get_income_categories()?;
        Ok(self.organize_hierarchically(income_cats))
    }
}
