use std::collections::HashMap;
use std::sync::Arc;

use chrono::NaiveDateTime;
use rust_decimal::Decimal;

use crate::activities::ActivityRepositoryTrait;
use crate::errors::{Error, Result, ValidationError};
use crate::fx::FxServiceTrait;

use super::limits_model::{
    AccountDeposit, ContributionLimit, DepositsCalculation, NewContributionLimit,
};
use super::limits_traits::{ContributionLimitRepositoryTrait, ContributionLimitServiceTrait};
use async_trait::async_trait;

pub struct ContributionLimitService {
    fx_service: Arc<dyn FxServiceTrait>,
    limit_repository: Arc<dyn ContributionLimitRepositoryTrait>,
    activity_repository: Arc<dyn ActivityRepositoryTrait>,
}

impl ContributionLimitService {
    pub fn new(
        fx_service: Arc<dyn FxServiceTrait>,
        limit_repository: Arc<dyn ContributionLimitRepositoryTrait>,
        activity_repository: Arc<dyn ActivityRepositoryTrait>,
    ) -> Self {
        ContributionLimitService {
            fx_service,
            limit_repository,
            activity_repository,
        }
    }

    fn calculate_deposits_by_period(
        &self,
        account_ids: &[String],
        start_date: NaiveDateTime,
        end_date: NaiveDateTime,
        base_currency: &str,
    ) -> Result<DepositsCalculation> {
        if account_ids.is_empty() {
            return Ok(DepositsCalculation {
                total: Decimal::ZERO,
                base_currency: base_currency.to_string(),
                by_account: HashMap::new(),
            });
        }

        let deposit_activities =
            self.activity_repository
                .get_deposit_activities(account_ids, start_date, end_date)?;

        let mut total_deposits = Decimal::ZERO;
        let mut deposits_by_account: HashMap<String, AccountDeposit> = HashMap::new();

        for (account_id, _quantity, _unit_price, currency, amount_opt) in deposit_activities {
            let amount = amount_opt.ok_or_else(|| {
                Error::Validation(ValidationError::MissingField(
                    "Amount is missing in DEPOSIT activity".to_string(),
                ))
            })?;

            let converted_amount =
                self.fx_service
                    .convert_currency(amount, &currency, base_currency)?;

            total_deposits += &converted_amount;
            let account_deposit = deposits_by_account
                .entry(account_id.clone())
                .or_insert_with(|| AccountDeposit {
                    amount: Decimal::ZERO,
                    currency: currency.clone(),
                    converted_amount: Decimal::ZERO,
                });

            account_deposit.amount += amount;
            account_deposit.converted_amount += &converted_amount;
            account_deposit.currency = currency;
        }

        Ok(DepositsCalculation {
            total: total_deposits,
            base_currency: base_currency.to_string(),
            by_account: deposits_by_account,
        })
    }
}

#[async_trait]
impl ContributionLimitServiceTrait for ContributionLimitService {
    fn get_contribution_limits(&self) -> Result<Vec<ContributionLimit>> {
        self.limit_repository.get_contribution_limits()
    }

    async fn create_contribution_limit(
        &self,
        new_limit: NewContributionLimit,
    ) -> Result<ContributionLimit> {
        self.limit_repository
            .create_contribution_limit(new_limit)
            .await
    }

    async fn update_contribution_limit(
        &self,
        id: &str,
        updated_limit: NewContributionLimit,
    ) -> Result<ContributionLimit> {
        self.limit_repository
            .update_contribution_limit(id, updated_limit)
            .await
    }

    async fn delete_contribution_limit(&self, id: &str) -> Result<()> {
        self.limit_repository.delete_contribution_limit(id).await
    }

    fn calculate_deposits_for_contribution_limit(
        &self,
        limit_id: &str,
        base_currency: &str,
    ) -> Result<DepositsCalculation> {
        let limit = self.limit_repository.get_contribution_limit(limit_id)?;

        let account_ids = match limit.account_ids {
            Some(ids_str) if !ids_str.trim().is_empty() => ids_str
                .split(',')
                .map(|s| s.trim().to_string())
                .collect::<Vec<String>>(),
            _ => {
                return Ok(DepositsCalculation {
                    total: Decimal::ZERO,
                    base_currency: base_currency.to_string(),
                    by_account: HashMap::new(),
                });
            }
        };

        if let (Some(start_str), Some(end_str)) = (limit.start_date, limit.end_date) {
            let start = NaiveDateTime::parse_from_str(&start_str, "%Y-%m-%dT%H:%M:%S%.3fZ")
                .map_err(|e| Error::Validation(ValidationError::DateTimeParse(e)))?;
            let end = NaiveDateTime::parse_from_str(&end_str, "%Y-%m-%dT%H:%M:%S%.3fZ")
                .map_err(|e| Error::Validation(ValidationError::DateTimeParse(e)))?;
            self.calculate_deposits_by_period(&account_ids, start, end, base_currency)
        } else {
            let year = limit.contribution_year;
            let start = NaiveDateTime::new(
                chrono::NaiveDate::from_ymd_opt(year, 1, 1).ok_or_else(|| {
                    Error::Validation(ValidationError::InvalidInput(
                        "Invalid start date".to_string(),
                    ))
                })?,
                chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
            );
            let end = NaiveDateTime::new(
                chrono::NaiveDate::from_ymd_opt(year, 12, 31).ok_or_else(|| {
                    Error::Validation(ValidationError::InvalidInput(
                        "Invalid start date".to_string(),
                    ))
                })?,
                chrono::NaiveTime::from_hms_opt(23, 59, 59).unwrap(),
            );
            self.calculate_deposits_by_period(&account_ids, start, end, base_currency)
        }
    }
}
