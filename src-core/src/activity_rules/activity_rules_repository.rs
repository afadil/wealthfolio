use crate::activity_rules::activity_rules_model::{ActivityRule, NewActivityRule, UpdateActivityRule};
use crate::activity_rules::activity_rules_traits::ActivityRuleRepositoryTrait;
use crate::db::{get_connection, WriteHandle};
use crate::errors::Result;
use crate::schema::activity_rules;
use async_trait::async_trait;
use diesel::prelude::*;
use diesel::r2d2::{self, Pool};
use diesel::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

pub struct ActivityRuleRepository {
    pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl ActivityRuleRepository {
    pub fn new(
        pool: Arc<Pool<r2d2::ConnectionManager<SqliteConnection>>>,
        writer: WriteHandle,
    ) -> Self {
        ActivityRuleRepository { pool, writer }
    }
}

#[async_trait]
impl ActivityRuleRepositoryTrait for ActivityRuleRepository {
    fn get_all_rules(&self) -> Result<Vec<ActivityRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(activity_rules::table
            .order(activity_rules::priority.desc())
            .load::<ActivityRule>(&mut conn)?)
    }

    fn get_rule_by_id(&self, id: &str) -> Result<Option<ActivityRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(activity_rules::table
            .find(id)
            .first::<ActivityRule>(&mut conn)
            .optional()?)
    }

    fn get_global_rules(&self) -> Result<Vec<ActivityRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(activity_rules::table
            .filter(activity_rules::is_global.eq(1))
            .order(activity_rules::priority.desc())
            .load::<ActivityRule>(&mut conn)?)
    }

    fn get_rules_by_account(&self, account_id: &str) -> Result<Vec<ActivityRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(activity_rules::table
            .filter(
                activity_rules::is_global.eq(1)
                    .or(activity_rules::account_id.eq(account_id))
            )
            .order(activity_rules::priority.desc())
            .load::<ActivityRule>(&mut conn)?)
    }

    fn get_rules_by_category(&self, category_id: &str) -> Result<Vec<ActivityRule>> {
        let mut conn = get_connection(&self.pool)?;
        Ok(activity_rules::table
            .filter(activity_rules::category_id.eq(category_id))
            .order(activity_rules::priority.desc())
            .load::<ActivityRule>(&mut conn)?)
    }

    async fn create_rule(&self, new_rule: NewActivityRule) -> Result<ActivityRule> {
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<ActivityRule> {
                let mut rule = new_rule;
                if rule.id.is_none() {
                    rule.id = Some(format!(
                        "rule_{}",
                        Uuid::new_v4().to_string().replace("-", "")[..12].to_string()
                    ));
                }

                if rule.priority.is_none() {
                    rule.priority = Some(0);
                }
                if rule.is_global.is_none() {
                    rule.is_global = Some(1);
                }

                diesel::insert_into(activity_rules::table)
                    .values(&rule)
                    .execute(conn)?;

                Ok(activity_rules::table
                    .find(rule.id.unwrap())
                    .first::<ActivityRule>(conn)?)
            })
            .await
    }

    async fn update_rule(&self, id: &str, update: UpdateActivityRule) -> Result<ActivityRule> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<ActivityRule> {
                diesel::update(activity_rules::table.find(&id_owned))
                    .set(&update)
                    .execute(conn)?;

                Ok(activity_rules::table
                    .find(&id_owned)
                    .first::<ActivityRule>(conn)?)
            })
            .await
    }

    async fn delete_rule(&self, id: &str) -> Result<usize> {
        let id_owned = id.to_string();
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<usize> {
                Ok(diesel::delete(activity_rules::table.find(&id_owned)).execute(conn)?)
            })
            .await
    }

    fn get_max_priority(&self) -> Result<i32> {
        let mut conn = get_connection(&self.pool)?;
        let max: Option<i32> = activity_rules::table
            .select(diesel::dsl::max(activity_rules::priority))
            .first(&mut conn)?;
        Ok(max.unwrap_or(0))
    }
}
