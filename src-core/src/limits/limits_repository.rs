use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;

use super::limits_model::{ContributionLimit, NewContributionLimit};

pub struct ContributionLimitRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl ContributionLimitRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        ContributionLimitRepository { pool }
    }

    pub fn get_contribution_limit(
        &self,
        id: &str,
    ) -> Result<ContributionLimit, diesel::result::Error> {
        use crate::schema::contribution_limits;
        let mut conn = self.pool.get().unwrap();
        contribution_limits::table.find(id).first(&mut conn)
    }

    pub fn get_contribution_limits(
        &self,
    ) -> Result<Vec<ContributionLimit>, diesel::result::Error> {
        use crate::schema::contribution_limits;
        let mut conn = self.pool.get().unwrap();
        contribution_limits::table.load(&mut conn)
    }

    pub fn create_contribution_limit(
        &self,
        new_limit: NewContributionLimit,
    ) -> Result<ContributionLimit, diesel::result::Error> {
        use crate::schema::contribution_limits;
        let mut conn = self.pool.get().unwrap();

        diesel::insert_into(contribution_limits::table)
            .values((
                contribution_limits::id.eq(Uuid::new_v4().to_string()),
                contribution_limits::group_name.eq(new_limit.group_name),
                contribution_limits::contribution_year.eq(new_limit.contribution_year),
                contribution_limits::limit_amount.eq(new_limit.limit_amount),
                contribution_limits::account_ids.eq(new_limit.account_ids),
                contribution_limits::start_date.eq(new_limit.start_date),
                contribution_limits::end_date.eq(new_limit.end_date),
                contribution_limits::created_at.eq(chrono::Utc::now().naive_utc()),
                contribution_limits::updated_at.eq(chrono::Utc::now().naive_utc()),
            ))
            .get_result(&mut conn)
    }

    pub fn update_contribution_limit(
        &self,
        id: &str,
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit, diesel::result::Error> {
        use crate::schema::contribution_limits;
        let mut conn = self.pool.get().unwrap();
        let target = contribution_limits::table.find(id);

        diesel::update(target)
            .set((
                contribution_limits::group_name.eq(updated_limit.group_name),
                contribution_limits::contribution_year.eq(updated_limit.contribution_year),
                contribution_limits::limit_amount.eq(updated_limit.limit_amount),
                contribution_limits::account_ids.eq(updated_limit.account_ids),
                contribution_limits::start_date.eq(updated_limit.start_date),
                contribution_limits::end_date.eq(updated_limit.end_date),
                contribution_limits::updated_at.eq(chrono::Utc::now().naive_utc()),
            ))
            .execute(&mut conn)?;

        contribution_limits::table.find(id).first(&mut conn)
    }

    pub fn delete_contribution_limit(
        &self,
        id: &str,
    ) -> Result<(), diesel::result::Error> {
        use crate::schema::contribution_limits;
        let mut conn = self.pool.get().unwrap();
        diesel::delete(contribution_limits::table.find(id)).execute(&mut conn)?;
        Ok(())
    }
}
