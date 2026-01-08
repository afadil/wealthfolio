//! Repository implementation for taxonomies.

use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

use wealthfolio_core::taxonomies::{
    AssetTaxonomyAssignment, Category, NewAssetTaxonomyAssignment, NewCategory, NewTaxonomy,
    Taxonomy, TaxonomyRepositoryTrait, TaxonomyWithCategories,
};
use wealthfolio_core::Result;

use super::model::{
    AssetTaxonomyAssignmentDB, CategoryDB, NewAssetTaxonomyAssignmentDB, NewCategoryDB,
    NewTaxonomyDB, TaxonomyDB,
};
use crate::db::{get_connection, WriteHandle};
use crate::errors::StorageError;
use crate::schema::{asset_taxonomy_assignments, taxonomies, taxonomy_categories};

pub struct TaxonomyRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl TaxonomyRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        Self { pool, writer }
    }
}

#[async_trait]
impl TaxonomyRepositoryTrait for TaxonomyRepository {
    fn get_taxonomies(&self) -> Result<Vec<Taxonomy>> {
        let mut conn = get_connection(&self.pool)?;
        let results = taxonomies::table
            .order(taxonomies::sort_order.asc())
            .load::<TaxonomyDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(results.into_iter().map(Taxonomy::from).collect())
    }

    fn get_taxonomy(&self, id: &str) -> Result<Option<Taxonomy>> {
        let mut conn = get_connection(&self.pool)?;
        let result = taxonomies::table
            .find(id)
            .first::<TaxonomyDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;
        Ok(result.map(Taxonomy::from))
    }

    async fn create_taxonomy(&self, taxonomy: NewTaxonomy) -> Result<Taxonomy> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Taxonomy> {
                let mut db: NewTaxonomyDB = taxonomy.into();
                db.id = Some(db.id.unwrap_or_else(|| Uuid::new_v4().to_string()));

                let result = diesel::insert_into(taxonomies::table)
                    .values(&db)
                    .returning(TaxonomyDB::as_returning())
                    .get_result(conn)
                    .map_err(StorageError::from)?;

                Ok(Taxonomy::from(result))
            })
            .await
    }

    async fn update_taxonomy(&self, taxonomy: Taxonomy) -> Result<Taxonomy> {
        let id = taxonomy.id.clone();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Taxonomy> {
                let db = TaxonomyDB {
                    id: taxonomy.id,
                    name: taxonomy.name,
                    color: taxonomy.color,
                    description: taxonomy.description,
                    is_system: taxonomy.is_system,
                    is_single_select: taxonomy.is_single_select,
                    sort_order: taxonomy.sort_order,
                    created_at: taxonomy.created_at,
                    updated_at: chrono::Utc::now().naive_utc(),
                };

                diesel::update(taxonomies::table.find(&id))
                    .set(&db)
                    .execute(conn)
                    .map_err(StorageError::from)?;

                let result = taxonomies::table
                    .find(&id)
                    .first::<TaxonomyDB>(conn)
                    .map_err(StorageError::from)?;

                Ok(Taxonomy::from(result))
            })
            .await
    }

    async fn delete_taxonomy(&self, id: &str) -> Result<usize> {
        let id = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(taxonomies::table.find(&id))
                    .execute(conn)
                    .map_err(StorageError::from)?)
            })
            .await
    }

    fn get_categories(&self, taxonomy_id: &str) -> Result<Vec<Category>> {
        let mut conn = get_connection(&self.pool)?;
        let results = taxonomy_categories::table
            .filter(taxonomy_categories::taxonomy_id.eq(taxonomy_id))
            .order(taxonomy_categories::sort_order.asc())
            .load::<CategoryDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(results.into_iter().map(Category::from).collect())
    }

    fn get_category(&self, taxonomy_id: &str, category_id: &str) -> Result<Option<Category>> {
        let mut conn = get_connection(&self.pool)?;
        let result = taxonomy_categories::table
            .filter(taxonomy_categories::taxonomy_id.eq(taxonomy_id))
            .filter(taxonomy_categories::id.eq(category_id))
            .first::<CategoryDB>(&mut conn)
            .optional()
            .map_err(StorageError::from)?;
        Ok(result.map(Category::from))
    }

    async fn create_category(&self, category: NewCategory) -> Result<Category> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Category> {
                let mut db: NewCategoryDB = category.into();
                db.id = Some(db.id.unwrap_or_else(|| Uuid::new_v4().to_string()));

                let result = diesel::insert_into(taxonomy_categories::table)
                    .values(&db)
                    .returning(CategoryDB::as_returning())
                    .get_result(conn)
                    .map_err(StorageError::from)?;

                Ok(Category::from(result))
            })
            .await
    }

    async fn update_category(&self, category: Category) -> Result<Category> {
        let taxonomy_id = category.taxonomy_id.clone();
        let id = category.id.clone();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Category> {
                let db = CategoryDB {
                    id: category.id,
                    taxonomy_id: category.taxonomy_id,
                    parent_id: category.parent_id,
                    name: category.name,
                    key: category.key,
                    color: category.color,
                    description: category.description,
                    sort_order: category.sort_order,
                    created_at: category.created_at,
                    updated_at: chrono::Utc::now().naive_utc(),
                };

                diesel::update(
                    taxonomy_categories::table
                        .filter(taxonomy_categories::taxonomy_id.eq(&taxonomy_id))
                        .filter(taxonomy_categories::id.eq(&id)),
                )
                .set(&db)
                .execute(conn)
                .map_err(StorageError::from)?;

                let result = taxonomy_categories::table
                    .filter(taxonomy_categories::taxonomy_id.eq(&taxonomy_id))
                    .filter(taxonomy_categories::id.eq(&id))
                    .first::<CategoryDB>(conn)
                    .map_err(StorageError::from)?;

                Ok(Category::from(result))
            })
            .await
    }

    async fn delete_category(&self, taxonomy_id: &str, category_id: &str) -> Result<usize> {
        let taxonomy_id = taxonomy_id.to_string();
        let category_id = category_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(
                    taxonomy_categories::table
                        .filter(taxonomy_categories::taxonomy_id.eq(&taxonomy_id))
                        .filter(taxonomy_categories::id.eq(&category_id)),
                )
                .execute(conn)
                .map_err(StorageError::from)?)
            })
            .await
    }

    async fn bulk_create_categories(&self, categories: Vec<NewCategory>) -> Result<usize> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                let mut count = 0;
                for cat in categories {
                    let mut db: NewCategoryDB = cat.into();
                    db.id = Some(db.id.unwrap_or_else(|| Uuid::new_v4().to_string()));

                    diesel::insert_into(taxonomy_categories::table)
                        .values(&db)
                        .execute(conn)
                        .map_err(StorageError::from)?;
                    count += 1;
                }
                Ok(count)
            })
            .await
    }

    fn get_asset_assignments(&self, asset_id: &str) -> Result<Vec<AssetTaxonomyAssignment>> {
        let mut conn = get_connection(&self.pool)?;
        let results = asset_taxonomy_assignments::table
            .filter(asset_taxonomy_assignments::asset_id.eq(asset_id))
            .load::<AssetTaxonomyAssignmentDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(results
            .into_iter()
            .map(AssetTaxonomyAssignment::from)
            .collect())
    }

    fn get_category_assignments(
        &self,
        taxonomy_id: &str,
        category_id: &str,
    ) -> Result<Vec<AssetTaxonomyAssignment>> {
        let mut conn = get_connection(&self.pool)?;
        let results = asset_taxonomy_assignments::table
            .filter(asset_taxonomy_assignments::taxonomy_id.eq(taxonomy_id))
            .filter(asset_taxonomy_assignments::category_id.eq(category_id))
            .load::<AssetTaxonomyAssignmentDB>(&mut conn)
            .map_err(StorageError::from)?;
        Ok(results
            .into_iter()
            .map(AssetTaxonomyAssignment::from)
            .collect())
    }

    async fn upsert_assignment(
        &self,
        assignment: NewAssetTaxonomyAssignment,
    ) -> Result<AssetTaxonomyAssignment> {
        self.writer
            .exec(
                move |conn: &mut SqliteConnection| -> Result<AssetTaxonomyAssignment> {
                    let mut db: NewAssetTaxonomyAssignmentDB = assignment.into();
                    db.id = Some(db.id.unwrap_or_else(|| Uuid::new_v4().to_string()));

                    let result = diesel::insert_into(asset_taxonomy_assignments::table)
                        .values(&db)
                        .on_conflict((
                            asset_taxonomy_assignments::asset_id,
                            asset_taxonomy_assignments::taxonomy_id,
                            asset_taxonomy_assignments::category_id,
                        ))
                        .do_update()
                        .set((
                            asset_taxonomy_assignments::weight.eq(&db.weight),
                            asset_taxonomy_assignments::source.eq(&db.source),
                        ))
                        .returning(AssetTaxonomyAssignmentDB::as_returning())
                        .get_result(conn)
                        .map_err(StorageError::from)?;

                    Ok(AssetTaxonomyAssignment::from(result))
                },
            )
            .await
    }

    async fn delete_assignment(&self, id: &str) -> Result<usize> {
        let id = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(
                    diesel::delete(asset_taxonomy_assignments::table.find(&id))
                        .execute(conn)
                        .map_err(StorageError::from)?,
                )
            })
            .await
    }

    async fn delete_asset_assignments(&self, asset_id: &str, taxonomy_id: &str) -> Result<usize> {
        let asset_id = asset_id.to_string();
        let taxonomy_id = taxonomy_id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(
                    asset_taxonomy_assignments::table
                        .filter(asset_taxonomy_assignments::asset_id.eq(&asset_id))
                        .filter(asset_taxonomy_assignments::taxonomy_id.eq(&taxonomy_id)),
                )
                .execute(conn)
                .map_err(StorageError::from)?)
            })
            .await
    }

    fn get_taxonomy_with_categories(&self, id: &str) -> Result<Option<TaxonomyWithCategories>> {
        let taxonomy = self.get_taxonomy(id)?;
        match taxonomy {
            Some(t) => {
                let categories = self.get_categories(id)?;
                Ok(Some(TaxonomyWithCategories {
                    taxonomy: t,
                    categories,
                }))
            }
            None => Ok(None),
        }
    }

    fn get_all_taxonomies_with_categories(&self) -> Result<Vec<TaxonomyWithCategories>> {
        let taxonomies = self.get_taxonomies()?;
        let mut results = Vec::new();
        for t in taxonomies {
            let categories = self.get_categories(&t.id)?;
            results.push(TaxonomyWithCategories {
                taxonomy: t,
                categories,
            });
        }
        Ok(results)
    }
}
