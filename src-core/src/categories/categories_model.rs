use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for categories
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
#[diesel(table_name = crate::schema::categories)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_income: i32,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for creating a new category
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::categories)]
#[serde(rename_all = "camelCase")]
pub struct NewCategory {
    pub id: Option<String>,
    pub name: String,
    pub parent_id: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub is_income: i32,
    pub sort_order: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// Model for updating a category
#[derive(AsChangeset, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::categories)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCategory {
    pub name: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub sort_order: Option<i32>,
    pub updated_at: String,
}

/// Category with its children (for hierarchical display)
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CategoryWithChildren {
    #[serde(flatten)]
    pub category: Category,
    pub children: Vec<Category>,
}

impl Category {
    pub fn is_parent(&self) -> bool {
        self.parent_id.is_none()
    }

    pub fn is_expense(&self) -> bool {
        self.is_income == 0
    }

    pub fn is_income_category(&self) -> bool {
        self.is_income == 1
    }
}
