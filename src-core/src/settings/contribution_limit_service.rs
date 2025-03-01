use crate::schema::{accounts, activities};
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::r2d2::{Pool, ConnectionManager};
use diesel::sqlite::SqliteConnection;
use log::error;
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

use crate::fx::fx_service::FxService;
use crate::models::{AccountDeposit, ContributionLimit, DepositsCalculation, NewContributionLimit};
use crate::schema::contribution_limits;

pub struct ContributionLimitService {
    fx_service: FxService,
}

impl ContributionLimitService {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        ContributionLimitService {
            fx_service: FxService::new(pool),
        }
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

    pub fn calculate_deposits_for_accounts(
        &self,
        conn: &mut SqliteConnection,
        account_ids: &[String],
        year: i32,
        base_currency: &str,
    ) -> Result<DepositsCalculation, diesel::result::Error> {
        let start_date =
            NaiveDateTime::parse_from_str(&format!("{}-01-01 00:00:00", year), "%Y-%m-%d %H:%M:%S")
                .unwrap();
        let end_date =
            NaiveDateTime::parse_from_str(&format!("{}-12-31 23:59:59", year), "%Y-%m-%d %H:%M:%S")
                .unwrap();

        // Initialize FX service before using it
        if let Err(e) = self.fx_service.initialize() {
            error!("Failed to initialize FX service: {:?}", e);
            // Continue execution as the FX service might still work with cached rates
        }

        let deposits: Vec<(String, f64, f64, String)> = activities::table
            .inner_join(accounts::table)
            .filter(accounts::id.eq_any(account_ids))
            .filter(accounts::is_active.eq(true))
            .filter(activities::activity_type.eq("DEPOSIT"))
            .filter(activities::activity_date.between(start_date, end_date))
            .select((
                activities::account_id,
                activities::quantity,
                activities::unit_price,
                activities::currency,
            ))
            .load::<(String, f64, f64, String)>(conn)?;

        let mut total_deposits = 0.0;
        let mut deposits_by_account: HashMap<String, AccountDeposit> = HashMap::new();

        for (account_id, quantity, unit_price, currency) in deposits {
            let amount = quantity * unit_price;
            let converted_amount = self.fx_service
                .convert_currency(amount, &currency, base_currency)
                .unwrap_or_else(|e| {
                    error!("Currency conversion error: {:?}", e);
                    amount // Use original amount if conversion fails
                });

            total_deposits += converted_amount;
            deposits_by_account
                .entry(account_id.clone())
                .and_modify(|e| {
                    e.amount += amount;
                    e.converted_amount += converted_amount;
                })
                .or_insert(AccountDeposit {
                    amount,
                    currency: currency.clone(),
                    converted_amount,
                });
        }

        Ok(DepositsCalculation {
            total: total_deposits,
            base_currency: base_currency.to_string(),
            by_account: deposits_by_account,
        })
    }
}
