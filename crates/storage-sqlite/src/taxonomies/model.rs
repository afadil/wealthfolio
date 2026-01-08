//! Database models for taxonomies.

use chrono::NaiveDateTime;
use diesel::prelude::*;
use serde::{Deserialize, Serialize};

/// Database model for taxonomies
#[derive(
    Queryable, Identifiable, AsChangeset, Selectable, PartialEq, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::taxonomies)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct TaxonomyDB {
    pub id: String,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub is_system: bool,
    pub is_single_select: bool,
    pub sort_order: i32,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Database model for creating a new taxonomy
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::taxonomies)]
#[serde(rename_all = "camelCase")]
pub struct NewTaxonomyDB {
    pub id: Option<String>,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub is_system: bool,
    pub is_single_select: bool,
    pub sort_order: i32,
}

/// Database model for taxonomy categories
#[derive(
    Queryable, Identifiable, AsChangeset, Selectable, PartialEq, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::taxonomy_categories)]
#[diesel(primary_key(taxonomy_id, id))]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct CategoryDB {
    pub id: String,
    pub taxonomy_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub key: String,
    pub color: String,
    pub description: Option<String>,
    pub sort_order: i32,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Database model for creating a new category
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::taxonomy_categories)]
#[serde(rename_all = "camelCase")]
pub struct NewCategoryDB {
    pub id: Option<String>,
    pub taxonomy_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub key: String,
    pub color: String,
    pub description: Option<String>,
    pub sort_order: i32,
}

/// Database model for asset taxonomy assignments
#[derive(
    Queryable, Identifiable, AsChangeset, Selectable, PartialEq, Serialize, Deserialize, Debug, Clone,
)]
#[diesel(table_name = crate::schema::asset_taxonomy_assignments)]
#[diesel(check_for_backend(diesel::sqlite::Sqlite))]
#[serde(rename_all = "camelCase")]
pub struct AssetTaxonomyAssignmentDB {
    pub id: String,
    pub asset_id: String,
    pub taxonomy_id: String,
    pub category_id: String,
    pub weight: i32,  // basis points: 10000 = 100%
    pub source: String,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

/// Database model for creating a new assignment
#[derive(Insertable, Serialize, Deserialize, Debug, Clone)]
#[diesel(table_name = crate::schema::asset_taxonomy_assignments)]
#[serde(rename_all = "camelCase")]
pub struct NewAssetTaxonomyAssignmentDB {
    pub id: Option<String>,
    pub asset_id: String,
    pub taxonomy_id: String,
    pub category_id: String,
    pub weight: i32,  // basis points: 10000 = 100%
    pub source: String,
}

// Conversion to domain models
impl From<TaxonomyDB> for wealthfolio_core::taxonomies::Taxonomy {
    fn from(db: TaxonomyDB) -> Self {
        Self {
            id: db.id,
            name: db.name,
            color: db.color,
            description: db.description,
            is_system: db.is_system,
            is_single_select: db.is_single_select,
            sort_order: db.sort_order,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<CategoryDB> for wealthfolio_core::taxonomies::Category {
    fn from(db: CategoryDB) -> Self {
        Self {
            id: db.id,
            taxonomy_id: db.taxonomy_id,
            parent_id: db.parent_id,
            name: db.name,
            key: db.key,
            color: db.color,
            description: db.description,
            sort_order: db.sort_order,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

impl From<AssetTaxonomyAssignmentDB> for wealthfolio_core::taxonomies::AssetTaxonomyAssignment {
    fn from(db: AssetTaxonomyAssignmentDB) -> Self {
        Self {
            id: db.id,
            asset_id: db.asset_id,
            taxonomy_id: db.taxonomy_id,
            category_id: db.category_id,
            weight: db.weight,
            source: db.source,
            created_at: db.created_at,
            updated_at: db.updated_at,
        }
    }
}

// Conversion from domain models
impl From<wealthfolio_core::taxonomies::NewTaxonomy> for NewTaxonomyDB {
    fn from(domain: wealthfolio_core::taxonomies::NewTaxonomy) -> Self {
        Self {
            id: domain.id,
            name: domain.name,
            color: domain.color,
            description: domain.description,
            is_system: domain.is_system,
            is_single_select: domain.is_single_select,
            sort_order: domain.sort_order,
        }
    }
}

impl From<wealthfolio_core::taxonomies::NewCategory> for NewCategoryDB {
    fn from(domain: wealthfolio_core::taxonomies::NewCategory) -> Self {
        Self {
            id: domain.id,
            taxonomy_id: domain.taxonomy_id,
            parent_id: domain.parent_id,
            name: domain.name,
            key: domain.key,
            color: domain.color,
            description: domain.description,
            sort_order: domain.sort_order,
        }
    }
}

impl From<wealthfolio_core::taxonomies::NewAssetTaxonomyAssignment> for NewAssetTaxonomyAssignmentDB {
    fn from(domain: wealthfolio_core::taxonomies::NewAssetTaxonomyAssignment) -> Self {
        Self {
            id: domain.id,
            asset_id: domain.asset_id,
            taxonomy_id: domain.taxonomy_id,
            category_id: domain.category_id,
            weight: domain.weight,
            source: domain.source,
        }
    }
}
