use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use std::sync::Arc;
use uuid::Uuid;
use async_trait::async_trait;

use crate::db::{get_connection, WriteHandle};
use crate::errors::{Error, Result}; 
use super::limits_model::{ContributionLimit, NewContributionLimit};
use super::limits_traits::ContributionLimitRepositoryTrait;
use crate::schema::contribution_limits; // Import the schema module directly

pub struct ContributionLimitRepository {
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
    writer: WriteHandle,
}

impl ContributionLimitRepository {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>, writer: WriteHandle) -> Self {
        ContributionLimitRepository { pool, writer }
    }

    // Read methods can remain in inherent impl if preferred, or be called by trait methods.
    fn get_contribution_limit_impl(&self, id_param: &str) -> Result<ContributionLimit> {
        let mut conn = get_connection(&self.pool)?;
        contribution_limits::table
            .find(id_param)
            .first(&mut conn)
            .map_err(Error::from)
    }

    fn get_contribution_limits_impl(&self) -> Result<Vec<ContributionLimit>> {
        let mut conn = get_connection(&self.pool)?;
        contribution_limits::table
            .load(&mut conn)
            .map_err(Error::from)
    }
}

#[async_trait]
impl ContributionLimitRepositoryTrait for ContributionLimitRepository {
    fn get_contribution_limit(&self, id_param: &str) -> Result<ContributionLimit> {
        self.get_contribution_limit_impl(id_param)
    }

    fn get_contribution_limits(&self) -> Result<Vec<ContributionLimit>> {
        self.get_contribution_limits_impl()
    }

    async fn create_contribution_limit(
        &self,
        new_limit: NewContributionLimit,
    ) -> Result<ContributionLimit> {
        let new_limit_owned = new_limit.clone(); // Explicitly clone to be safe for move

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<ContributionLimit> {
                let new_limit_record = (
                    contribution_limits::id.eq(Uuid::new_v4().to_string()),
                    contribution_limits::group_name.eq(new_limit_owned.group_name),
                    contribution_limits::contribution_year.eq(new_limit_owned.contribution_year),
                    contribution_limits::limit_amount.eq(new_limit_owned.limit_amount),
                    contribution_limits::account_ids.eq(new_limit_owned.account_ids),
                    contribution_limits::start_date.eq(new_limit_owned.start_date),
                    contribution_limits::end_date.eq(new_limit_owned.end_date),
                    contribution_limits::created_at.eq(chrono::Utc::now().naive_utc()),
                    contribution_limits::updated_at.eq(chrono::Utc::now().naive_utc()),
                );

                diesel::insert_into(contribution_limits::table)
                    .values(new_limit_record)
                    .get_result(conn)
                    .map_err(Error::from)
            })
            .await
    }

    async fn update_contribution_limit(
        &self,
        id_param: &str,
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit> {
        let id_owned = id_param.to_string(); // Own the &str
        let updated_limit_owned = updated_limit.clone(); // Explicitly clone for move

        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<ContributionLimit> {
                let target = contribution_limits::table.find(id_owned); // id_owned is moved
                diesel::update(target)
                    .set((
                        contribution_limits::group_name.eq(updated_limit_owned.group_name),
                        contribution_limits::contribution_year.eq(updated_limit_owned.contribution_year),
                        contribution_limits::limit_amount.eq(updated_limit_owned.limit_amount),
                        contribution_limits::account_ids.eq(updated_limit_owned.account_ids),
                        contribution_limits::start_date.eq(updated_limit_owned.start_date),
                        contribution_limits::end_date.eq(updated_limit_owned.end_date),
                        contribution_limits::updated_at.eq(chrono::Utc::now().naive_utc()),
                    ))
                    .get_result(conn)
                    .map_err(Error::from)
            })
            .await
    }

    async fn delete_contribution_limit(&self, id_param: &str) -> Result<()> {
        let id_owned = id_param.to_string(); // Own the &str
        self.writer
            .exec(move |conn: &mut SqliteConnection| -> Result<()> { // id_owned is moved
                diesel::delete(contribution_limits::table.find(id_owned))
                    .execute(conn)
                    .map_err(Error::from)
                    .map(|_| ())
            })
            .await
    }
}
