use crate::activities::ActivityRepository;
use crate::fx::fx_service::FxService;
use crate::models::{AccountDeposit, ContributionLimit, DepositsCalculation, NewContributionLimit};
use crate::schema::contribution_limits;
use bigdecimal::BigDecimal;
use chrono::NaiveDateTime;
use diesel::prelude::*;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use log::error;
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use uuid::Uuid;

pub struct ContributionLimitService {
    fx_service: FxService,
    pool: Arc<Pool<ConnectionManager<SqliteConnection>>>,
}

impl ContributionLimitService {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        ContributionLimitService {
            fx_service: FxService::new(pool.clone()),
            pool,
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
            start_date: new_limit.start_date,
            end_date: new_limit.end_date,
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
                contribution_limits::start_date.eq(updated_limit.start_date),
                contribution_limits::end_date.eq(updated_limit.end_date),
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


    fn calculate_deposits_by_period(
        &self,
        conn: &mut SqliteConnection,
        account_ids: &[String],
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
        base_currency: &str,
    ) -> Result<DepositsCalculation, diesel::result::Error> {
        // Initialize FX service before using it
        if let Err(e) = self.fx_service.initialize() {
            error!("Failed to initialize FX service: {:?}", e);
            // Continue execution as the FX service might still work with cached rates
        }

        // Use the activity repository directly to get deposit activities
        let repo = ActivityRepository::new(self.pool.clone());
        let deposit_activities =
            match repo.get_deposit_activities(conn, account_ids, start_date, end_date) {
                Ok(activities) => activities,
                Err(e) => {
                    error!("Failed to get deposit activities: {:?}", e);
                    return Err(diesel::result::Error::RollbackTransaction);
                }
            };

        let mut total_deposits = BigDecimal::from(0);
        let mut deposits_by_account: HashMap<String, AccountDeposit> = HashMap::new();

        for (account_id, _quantity_str, _unit_price_str, currency, amount_opt) in deposit_activities
        {
            // For DEPOSIT activities, amount is always available
            let amount_str = amount_opt.expect("Amount should be available for DEPOSIT activities");

            // Parse amount string to f64
            let amount = match amount_str.parse::<f64>() {
                Ok(val) => val,
                Err(e) => {
                    error!("Failed to parse amount '{}': {}", amount_str, e);
                    continue;
                }
            };

            let converted_amount = self
                .fx_service
                .convert_currency(
                    BigDecimal::from_str(&amount.to_string()).unwrap(),
                    &currency,
                    base_currency,
                )
                .unwrap_or_else(|e| {
                    error!("Currency conversion error: {:?}", e);
                    BigDecimal::from_str(&amount.to_string()).unwrap() // Use original amount if conversion fails
                });

            total_deposits += &converted_amount;
            deposits_by_account
                .entry(account_id)
                .and_modify(|e| {
                    e.converted_amount += &converted_amount;
                })
                .or_insert(AccountDeposit {
                    amount: BigDecimal::from_str(&amount.to_string()).unwrap(),
                    currency,
                    converted_amount: converted_amount.clone(),
                });
        }

        Ok(DepositsCalculation {
            total: total_deposits,
            base_currency: base_currency.to_string(),
            by_account: deposits_by_account,
        })
    }

    // Wrapper method that uses the contribution limit's start and end dates if available
    pub fn calculate_deposits_for_contribution_limit(
        &self,
        conn: &mut SqliteConnection,
        limit_id: &str,
        base_currency: &str,
    ) -> Result<DepositsCalculation, diesel::result::Error> {
        // Get the contribution limit
        let limit = contribution_limits::table
            .find(limit_id)
            .first::<ContributionLimit>(conn)?;

        // Parse account IDs from the limit
        let account_ids = match limit.account_ids {
            Some(ids_str) => ids_str
                .split(',')
                .map(|s| s.trim().to_string())
                .collect::<Vec<String>>(),
            None => {
                return Ok(DepositsCalculation {
                    total: BigDecimal::from(0),
                    base_currency: base_currency.to_string(),
                    by_account: HashMap::new(),
                })
            }
        };

        // Use custom date range if specified, otherwise use the calendar year
        if let (Some(start_str), Some(end_str)) = (limit.start_date, limit.end_date) {
            // Parse string dates to NaiveDateTime
            let start = match chrono::DateTime::parse_from_rfc3339(&start_str) {
                Ok(dt) => dt.naive_utc(),
                Err(e) => {
                    error!("Failed to parse start date '{}': {}", start_str, e);
                    return Err(diesel::result::Error::RollbackTransaction);
                }
            };

            let end = match chrono::DateTime::parse_from_rfc3339(&end_str) {
                Ok(dt) => dt.naive_utc(),
                Err(e) => {
                    error!("Failed to parse end date '{}': {}", end_str, e);
                    return Err(diesel::result::Error::RollbackTransaction);
                }
            };

            self.calculate_deposits_by_period(conn, &account_ids, start, end, base_currency)
        } else {
            // Fall back to calendar year calculation
            let year = limit.contribution_year;

            // Initialize FX service before using it
            if let Err(e) = self.fx_service.initialize() {
                error!("Failed to initialize FX service: {:?}", e);
                // Continue execution as the FX service might still work with cached rates
            }

            let start_date = NaiveDateTime::parse_from_str(
                &format!("{}-01-01T00:00:00", year),
                "%Y-%m-%dT%H:%M:%S",
            )
            .unwrap();

            let end_date = NaiveDateTime::parse_from_str(
                &format!("{}-12-31T23:59:59", year),
                "%Y-%m-%dT%H:%M:%S",
            )
            .unwrap();

            // Use the activity repository directly to get deposit activities
            let repo = ActivityRepository::new(self.pool.clone());
            let deposit_activities =
                match repo.get_deposit_activities(conn, &account_ids, start_date, end_date) {
                    Ok(activities) => activities,
                    Err(e) => {
                        error!("Failed to get deposit activities: {:?}", e);
                        return Err(diesel::result::Error::RollbackTransaction);
                    }
                };

            let mut total_deposits = BigDecimal::from(0);
            let mut deposits_by_account: HashMap<String, AccountDeposit> = HashMap::new();

            for (account_id, _quantity_str, _unit_price_str, currency, amount_opt) in
                deposit_activities
            {
                // For DEPOSIT activities, amount is always available
                let amount_str =
                    amount_opt.expect("Amount should be available for DEPOSIT activities");

                // Parse amount string to f64
                let amount = match amount_str.parse::<f64>() {
                    Ok(val) => val,
                    Err(e) => {
                        error!("Failed to parse amount '{}': {}", amount_str, e);
                        continue;
                    }
                };

                let converted_amount = self
                    .fx_service
                    .convert_currency(
                        BigDecimal::from_str(&amount.to_string()).unwrap(),
                        &currency,
                        base_currency,
                    )
                    .unwrap_or_else(|e| {
                        error!("Currency conversion error: {:?}", e);
                        BigDecimal::from_str(&amount.to_string()).unwrap() // Use original amount if conversion fails
                    });

                total_deposits += &converted_amount;
                deposits_by_account
                    .entry(account_id)
                    .and_modify(|e| {
                        e.converted_amount += &converted_amount;
                    })
                    .or_insert(AccountDeposit {
                        amount: BigDecimal::from_str(&amount.to_string()).unwrap(),
                        currency,
                        converted_amount: converted_amount.clone(),
                    });
            }

            Ok(DepositsCalculation {
                total: total_deposits,
                base_currency: base_currency.to_string(),
                by_account: deposits_by_account,
            })
        }
    }
}
