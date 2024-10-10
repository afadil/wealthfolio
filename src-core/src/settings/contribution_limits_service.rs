use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use uuid::Uuid;

use crate::models::{ContributionLimits, NewContributionLimits};
use crate::schema::contribution_limits;

pub struct ContributionLimitsService;

impl ContributionLimitsService {
    pub fn new() -> Self {
        ContributionLimitsService
    }

    pub fn get_contribution_limits(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<ContributionLimits>, diesel::result::Error> {
        contribution_limits::table.load::<ContributionLimits>(conn)
    }

    pub fn create_contribution_limit(
        &self,
        conn: &mut SqliteConnection,
        new_limit: NewContributionLimits,
    ) -> Result<ContributionLimits, diesel::result::Error> {
        let id = Uuid::new_v4().to_string();
        let new_limit = ContributionLimits {
            id,
            group_name: new_limit.group_name,
            contribution_year: new_limit.contribution_year,
            limit_amount: new_limit.limit_amount,
            created_at: chrono::Utc::now().naive_utc(),
            updated_at: chrono::Utc::now().naive_utc(),
        };

        diesel::insert_into(contribution_limits::table)
            .values(&new_limit)
            .execute(conn)?;

        Ok(new_limit)
    }

    pub fn update_contribution_limit(
        &self,
        conn: &mut SqliteConnection,
        id: &str,
        updated_limit: NewContributionLimits,
    ) -> Result<ContributionLimits, diesel::result::Error> {
        let target = contribution_limits::table.find(id);

        diesel::update(target)
            .set((
                contribution_limits::group_name.eq(updated_limit.group_name),
                contribution_limits::contribution_year.eq(updated_limit.contribution_year),
                contribution_limits::limit_amount.eq(updated_limit.limit_amount),
                contribution_limits::updated_at.eq(chrono::Utc::now().naive_utc()),
            ))
            .execute(conn)?;

        contribution_limits::table.find(id).first(conn)
    }

    pub fn delete_contribution_limit(
        &self,
        conn: &mut SqliteConnection,
        id: &str,
    ) -> Result<(), diesel::result::Error> {
        diesel::delete(contribution_limits::table.find(id)).execute(conn)?;
        Ok(())
    }
}
