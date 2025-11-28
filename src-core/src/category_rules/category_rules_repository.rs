use crate::category_rules::category_rules_model::{CategoryRule, NewCategoryRule, UpdateCategoryRule};
use crate::category_rules::category_rules_traits::CategoryRuleRepositoryTrait;
use crate::db::{get_connection, WriteHandle};
use crate::errors::Result;
use crate::schema::category_rules;
use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

pub struct CategoryRuleRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl CategoryRuleRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        CategoryRuleRepository { pool, writer }
    }
}

#[async_trait]
impl CategoryRuleRepositoryTrait for CategoryRuleRepository {
    fn get_all_rules(&self) -> Result<Vec<CategoryRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(category_rules::table
            .order(category_rules::priority.desc())
            .load::<CategoryRule>(&mut conn)?)
    }

    fn get_rule_by_id(&self, id: &str) -> Result<Option<CategoryRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(category_rules::table
            .find(id)
            .first::<CategoryRule>(&mut conn)
            .optional()?)
    }

    fn get_global_rules(&self) -> Result<Vec<CategoryRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(category_rules::table
            .filter(category_rules::is_global.eq(1))
            .order(category_rules::priority.desc())
            .load::<CategoryRule>(&mut conn)?)
    }

    fn get_rules_by_account(&self, account_id: &str) -> Result<Vec<CategoryRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(category_rules::table
            .filter(
                category_rules::is_global.eq(1)
                    .or(category_rules::account_id.eq(account_id))
            )
            .order(category_rules::priority.desc())
            .load::<CategoryRule>(&mut conn)?)
    }

    fn get_rules_by_category(&self, category_id: &str) -> Result<Vec<CategoryRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(category_rules::table
            .filter(category_rules::category_id.eq(category_id))
            .order(category_rules::priority.desc())
            .load::<CategoryRule>(&mut conn)?)
    }

    async fn create_rule(&self, new_rule: NewCategoryRule) -> Result<CategoryRule> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<CategoryRule> {
                let mut rule = new_rule;
                if rule.id.is_none() {
                    rule.id = Some(format!(
                        "rule_{}",
                        Uuid::new_v4().to_string().replace("-", "")[..12].to_string()
                    ));
                }

                // Set defaults
                if rule.priority.is_none() {
                    rule.priority = Some(0);
                }
                if rule.is_global.is_none() {
                    rule.is_global = Some(1);
                }

                diesel::insert_into(category_rules::table)
                    .values(&rule)
                    .execute(conn)?;

                Ok(category_rules::table
                    .find(rule.id.unwrap())
                    .first::<CategoryRule>(conn)?)
            })
            .await
    }

    async fn update_rule(&self, id: &str, update: UpdateCategoryRule) -> Result<CategoryRule> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<CategoryRule> {
                diesel::update(category_rules::table.find(&id_owned))
                    .set(&update)
                    .execute(conn)?;

                Ok(category_rules::table
                    .find(&id_owned)
                    .first::<CategoryRule>(conn)?)
            })
            .await
    }

    async fn delete_rule(&self, id: &str) -> Result<usize> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(category_rules::table.find(&id_owned)).execute(conn)?)
            })
            .await
    }

    fn get_max_priority(&self) -> Result<i32> {
        let mut conn = get_connection(&self.pool)?;
        let max: Option<i32> = category_rules::table
            .select(diesel::dsl::max(category_rules::priority))
            .first(&mut conn)?;
        Ok(max.unwrap_or(0))
    }
}
