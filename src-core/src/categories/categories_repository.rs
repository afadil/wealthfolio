use crate::categories::categories_model::{Category, NewCategory, UpdateCategory};
use crate::categories::categories_traits::CategoryRepositoryTrait;
use crate::db::{get_connection, WriteHandle};
use crate::errors::{Result, ValidationError};
use crate::schema::{activities, categories};
use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

pub struct CategoryRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl CategoryRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        CategoryRepository { pool, writer }
    }
}

#[async_trait]
impl CategoryRepositoryTrait for CategoryRepository {
    fn get_all_categories(&self) -> Result<Vec<Category>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(categories::table
            .order((categories::is_income.asc(), categories::sort_order.asc(), categories::name.asc()))
            .load::<Category>(&mut conn)?)
    }

    fn get_category_by_id(&self, id: &str) -> Result<Option<Category>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(categories::table
            .find(id)
            .first::<Category>(&mut conn)
            .optional()?)
    }

    fn get_parent_categories(&self) -> Result<Vec<Category>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(categories::table
            .filter(categories::parent_id.is_null())
            .order((categories::is_income.asc(), categories::sort_order.asc()))
            .load::<Category>(&mut conn)?)
    }

    fn get_children(&self, parent_id: &str) -> Result<Vec<Category>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(categories::table
            .filter(categories::parent_id.eq(parent_id))
            .order(categories::sort_order.asc())
            .load::<Category>(&mut conn)?)
    }

    async fn create_category(&self, new_category: NewCategory) -> Result<Category> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Category> {
                let mut category = new_category;
                if category.id.is_none() {
                    category.id = Some(format!("cat_{}", Uuid::new_v4().to_string().replace("-", "")[..12].to_string()));
                }

                diesel::insert_into(categories::table)
                    .values(&category)
                    .execute(conn)?;

                Ok(categories::table
                    .find(category.id.unwrap())
                    .first::<Category>(conn)?)
            })
            .await
    }

    async fn update_category(&self, id: &str, update: UpdateCategory) -> Result<Category> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<Category> {
                diesel::update(categories::table.find(&id_owned))
                    .set(&update)
                    .execute(conn)?;

                Ok(categories::table
                    .find(&id_owned)
                    .first::<Category>(conn)?)
            })
            .await
    }

    async fn delete_category(&self, id: &str) -> Result<usize> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                // Check if any activities reference this category
                let activity_count: i64 = activities::table
                    .filter(
                        activities::category_id.eq(&id_owned)
                            .or(activities::sub_category_id.eq(&id_owned))
                    )
                    .count()
                    .get_result(conn)?;

                if activity_count > 0 {
                    return Err(crate::errors::Error::Validation(
                        ValidationError::InvalidInput(format!(
                            "Cannot delete category: {} activities are assigned to it",
                            activity_count
                        ))
                    ));
                }

                // Also delete any child categories
                let deleted = diesel::delete(
                    categories::table.filter(
                        categories::id.eq(&id_owned)
                            .or(categories::parent_id.eq(&id_owned))
                    )
                ).execute(conn)?;

                Ok(deleted)
            })
            .await
    }

    fn has_activities(&self, category_id: &str) -> Result<bool> {
        let mut conn = get_connection(&self.pool)?;
        let count: i64 = activities::table
            .filter(
                activities::category_id.eq(category_id)
                    .or(activities::sub_category_id.eq(category_id))
            )
            .count()
            .get_result(&mut conn)?;
        Ok(count > 0)
    }

    fn get_expense_categories(&self) -> Result<Vec<Category>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(categories::table
            .filter(categories::is_income.eq(0))
            .order(categories::sort_order.asc())
            .load::<Category>(&mut conn)?)
    }

    fn get_income_categories(&self) -> Result<Vec<Category>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(categories::table
            .filter(categories::is_income.eq(1))
            .order(categories::sort_order.asc())
            .load::<Category>(&mut conn)?)
    }

    fn get_activity_counts(&self) -> Result<HashMap<String, i64>> {
        use diesel::dsl::sql;
        use diesel::sql_types::BigInt;

        let mut conn = get_connection(&self.pool)?;

        let category_counts: Vec<(String, i64)> = activities::table
            .filter(activities::category_id.is_not_null())
            .select((
                activities::category_id.assume_not_null(),
                sql::<BigInt>("COUNT(*)"),
            ))
            .group_by(activities::category_id)
            .load::<(String, i64)>(&mut conn)?;

        let sub_category_counts: Vec<(String, i64)> = activities::table
            .filter(activities::sub_category_id.is_not_null())
            .select((
                activities::sub_category_id.assume_not_null(),
                sql::<BigInt>("COUNT(*)"),
            ))
            .group_by(activities::sub_category_id)
            .load::<(String, i64)>(&mut conn)?;

        let mut counts: HashMap<String, i64> = category_counts.into_iter().collect();
        for (id, count) in sub_category_counts {
            *counts.entry(id).or_insert(0) += count;
        }

        Ok(counts)
    }
}
