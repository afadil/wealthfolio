use std::collections::HashMap;
use std::sync::Arc;

use chrono::NaiveDateTime;
use diesel::r2d2::{ConnectionManager, Pool};
use diesel::sqlite::SqliteConnection;
use log::error;
use rust_decimal::Decimal;

use crate::activities::ActivityRepository;
use crate::fx::fx_service::FxService;

use super::limits_model::{AccountDeposit, ContributionLimit, DepositsCalculation, NewContributionLimit};
use super::limits_repository::ContributionLimitRepository;

pub struct ContributionLimitService {
    fx_service: FxService,
    limit_repository: ContributionLimitRepository,
    activity_repository: ActivityRepository,
}

impl ContributionLimitService {
    pub fn new(pool: Arc<Pool<ConnectionManager<SqliteConnection>>>) -> Self {
        ContributionLimitService {
            fx_service: FxService::new(pool.clone()),
            limit_repository: ContributionLimitRepository::new(pool.clone()),
            activity_repository: ActivityRepository::new(pool),
        }
    }

    pub fn get_contribution_limits(
        &self,
    ) -> Result<Vec<ContributionLimit>, diesel::result::Error> {
        self.limit_repository.get_contribution_limits()
    }

    pub fn create_contribution_limit(
        &self,
        new_limit: NewContributionLimit,
    ) -> Result<ContributionLimit, diesel::result::Error> {
        self.limit_repository.create_contribution_limit(new_limit)
    }

    pub fn update_contribution_limit(
        &self,
        id: &str,
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit, diesel::result::Error> {
        self.limit_repository.update_contribution_limit(id, updated_limit)
    }

    pub fn delete_contribution_limit(
        &self,
        id: &str,
    ) -> Result<(), diesel::result::Error> {
        self.limit_repository.delete_contribution_limit(id)
    }

    fn calculate_deposits_by_period(
        &self,
        account_ids: &[String],
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
        base_currency: &str,
    ) -> Result<DepositsCalculation, diesel::result::Error> {
        if account_ids.is_empty() {
            return Ok(DepositsCalculation {
                total: Decimal::ZERO,
                base_currency: base_currency.to_string(),
                by_account: HashMap::new(),
            });
        }

        // Get deposit activities for the period
        let deposit_activities = self.activity_repository
            .get_deposit_activities(account_ids, start_date, end_date)?;

        // Calculate total deposits
        let mut total_deposits = Decimal::ZERO;
        let mut deposits_by_account: HashMap<String, AccountDeposit> = HashMap::new();

        for (account_id, _quantity, _unit_price, currency, amount_opt) in deposit_activities {
            // For DEPOSIT activities, amount is always available
            let amount = amount_opt.expect("Amount should be available for DEPOSIT activities");

            let converted_amount = self
                .fx_service
                .convert_currency(amount, &currency, base_currency)
                .unwrap_or_else(|e| {
                    error!("Currency conversion error: {:?}", e);
                    amount // Use original amount if conversion fails
                });

            total_deposits += &converted_amount;
            deposits_by_account
                .entry(account_id)
                .and_modify(|e| {
                    e.converted_amount += &converted_amount;
                })
                .or_insert(AccountDeposit {
                    amount,
                    currency,
                    converted_amount,
                });
        }

        Ok(DepositsCalculation {
            total: total_deposits,
            base_currency: base_currency.to_string(),
            by_account: deposits_by_account,
        })
    }

    pub fn calculate_deposits_for_contribution_limit(
        &self,
        limit_id: &str,
        base_currency: &str,
    ) -> Result<DepositsCalculation, diesel::result::Error> {

        // Get the contribution limit
        let limit = self.limit_repository.get_contribution_limit(limit_id)?;

        // Parse account IDs from the limit
        let account_ids = match limit.account_ids {
            Some(ids_str) => {
                let ids: Vec<String> = ids_str
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .collect();
                if ids.is_empty() {
                    return Ok(DepositsCalculation {
                        total: Decimal::ZERO,
                        base_currency: base_currency.to_string(),
                        by_account: HashMap::new(),
                    });
                }
                ids
            }
            None => {
                return Ok(DepositsCalculation {
                    total: Decimal::ZERO,
                    base_currency: base_currency.to_string(),
                    by_account: HashMap::new(),
                });
            }
        };

        // If start and end dates are specified, use those
        if let (Some(start_str), Some(end_str)) = (limit.start_date, limit.end_date) {
            let start = NaiveDateTime::parse_from_str(&start_str, "%Y-%m-%dT%H:%M:%S%.3fZ")
                .map_err(|_| diesel::result::Error::NotFound)?;
            let end = NaiveDateTime::parse_from_str(&end_str, "%Y-%m-%dT%H:%M:%S%.3fZ")
                .map_err(|_| diesel::result::Error::NotFound)?;
            self.calculate_deposits_by_period(&account_ids, start, end, base_currency)
        } else {
            // Use calendar year
            let year = limit.contribution_year;
            let start = NaiveDateTime::new(
                chrono::NaiveDate::from_ymd_opt(year, 1, 1).unwrap(),
                chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
            );
            let end = NaiveDateTime::new(
                chrono::NaiveDate::from_ymd_opt(year, 12, 31).unwrap(),
                chrono::NaiveTime::from_hms_opt(23, 59, 59).unwrap(),
            );
            self.calculate_deposits_by_period(&account_ids, start, end, base_currency)
        }
    }
}
