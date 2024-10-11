use crate::schema::activities;
use bigdecimal::{BigDecimal, FromPrimitive};
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::sqlite::SqliteConnection;
use uuid::Uuid;

use crate::fx::fx_service::CurrencyExchangeService;
use crate::models::{ContributionLimit, NewContributionLimit};
use crate::schema::contribution_limits;

pub struct ContributionLimitService;

impl ContributionLimitService {
    pub fn new() -> Self {
        ContributionLimitService
    }

    pub fn get_contribution_limits(
        &self,
        conn: &mut SqliteConnection,
    ) -> Result<Vec<ContributionLimit>, diesel::result::Error> {
        contribution_limits::table.load::<ContributionLimit>(conn)
    }

    pub fn create_contribution_limit(
        &self,
        conn: &mut SqliteConnection,
        new_limit: NewContributionLimit,
    ) -> Result<ContributionLimit, diesel::result::Error> {
        let id = Uuid::new_v4().to_string();
        let new_limit = ContributionLimit {
            id,
            group_name: new_limit.group_name,
            contribution_year: new_limit.contribution_year,
            limit_amount: new_limit.limit_amount,
            account_ids: new_limit.account_ids,
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
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit, diesel::result::Error> {
        let target = contribution_limits::table.find(id);

        diesel::update(target)
            .set((
                contribution_limits::group_name.eq(updated_limit.group_name),
                contribution_limits::contribution_year.eq(updated_limit.contribution_year),
                contribution_limits::limit_amount.eq(updated_limit.limit_amount),
                contribution_limits::account_ids.eq(updated_limit.account_ids),
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

    // pub fn get_accounts_for_limit(
    //     &self,
    //     conn: &mut SqliteConnection,
    //     limit_id: &str,
    // ) -> Result<Vec<Account>, diesel::result::Error> {
    //     use crate::schema::accounts::dsl::*;

    //     let limit: ContributionLimit = contribution_limits::table.find(limit_id).first(conn)?;

    //     if let Some(account_ids_str) = limit.account_ids {
    //         let account_id_vec: Vec<&str> = account_ids_str.split(',').collect();
    //         accounts
    //             .filter(id.eq_any(account_id_vec))
    //             .load::<Account>(conn)
    //     } else {
    //         Ok(vec![])
    //     }
    // }

    pub fn calculate_contribution_progress(
        &self,
        conn: &mut SqliteConnection,
        limit_id: &str,
        year: i32,
        base_currency: &str,
    ) -> Result<(BigDecimal, String), diesel::result::Error> {
        let limit: ContributionLimit = contribution_limits::table.find(limit_id).first(conn)?;

        let account_ids: Vec<&str> = limit
            .account_ids
            .as_ref()
            .map(|ids| ids.split(',').collect())
            .unwrap_or_default();

        let start_date =
            NaiveDateTime::parse_from_str(&format!("{}-01-01 00:00:00", year), "%Y-%m-%d %H:%M:%S")
                .unwrap();
        let end_date =
            NaiveDateTime::parse_from_str(&format!("{}-12-31 23:59:59", year), "%Y-%m-%d %H:%M:%S")
                .unwrap();

        let fx_service = CurrencyExchangeService::new();
        fx_service
            .initialize(conn)
            .map_err(|_e| diesel::result::Error::RollbackTransaction)?;

        let total_deposits: BigDecimal = activities::table
            .filter(activities::account_id.eq_any(account_ids))
            .filter(activities::activity_type.eq("DEPOSIT"))
            .filter(activities::activity_date.between(start_date, end_date))
            .select((
                activities::quantity,
                activities::unit_price,
                activities::currency,
            ))
            .load::<(f64, f64, String)>(conn)?
            .into_iter()
            .map(|(quantity, unit_price, currency)| {
                let converted_amount = fx_service
                    .convert_currency(quantity * unit_price, &currency, base_currency)
                    .unwrap_or(0.0);
                BigDecimal::from_f64(converted_amount).unwrap()
            })
            .sum();

        Ok((total_deposits, base_currency.to_string()))
    }
}
