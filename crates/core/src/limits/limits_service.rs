use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::NaiveDateTime;
use rust_decimal::Decimal;

use crate::activities::ActivityRepositoryTrait;
use crate::errors::{Error, Result, ValidationError};
use crate::fx::FxServiceTrait;

use super::limits_model::{
    AccountDeposit, ContributionActivity, ContributionLimit, DepositsCalculation,
    NewContributionLimit,
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

    /// Checks if an activity has metadata.flow.is_external = true
    fn is_external(activity: &ContributionActivity) -> bool {
        activity
            .metadata
            .as_ref()
            .and_then(|m| serde_json::from_str::<serde_json::Value>(m).ok())
            .and_then(|v| v.get("flow")?.get("is_external")?.as_bool())
            .unwrap_or(false)
    }

    fn calculate_contributions_by_period(
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

        let activities = self.activity_repository.get_contribution_activities(
            account_ids,
            start_date,
            end_date,
        )?;

        // Build set of limit account_ids for O(1) lookup
        let limit_accounts: HashSet<&str> = account_ids.iter().map(|s| s.as_str()).collect();

        // Build map: source_group_id → account_id for TRANSFER_OUT activities
        // Used to detect internal transfers (both IN and OUT in same limit)
        let transfer_out_accounts: HashMap<&str, &str> = activities
            .iter()
            .filter(|a| a.activity_type == "TRANSFER_OUT")
            .filter_map(|a| {
                a.source_group_id
                    .as_deref()
                    .map(|gid| (gid, a.account_id.as_str()))
            })
            .collect();

        let mut total = Decimal::ZERO;
        let mut by_account: HashMap<String, AccountDeposit> = HashMap::new();

        for activity in &activities {
            // Determine if this activity counts as a contribution
            let should_count = match activity.activity_type.as_str() {
                "DEPOSIT" => true,
                "TRANSFER_IN" => {
                    // Must be external AND not an internal transfer within this limit
                    if !Self::is_external(activity) {
                        false
                    } else if let Some(group_id) = &activity.source_group_id {
                        // Check if linked TRANSFER_OUT is also in this limit's accounts
                        // If so, it's an internal transfer - don't count
                        !transfer_out_accounts
                            .get(group_id.as_str())
                            .map(|out_account| limit_accounts.contains(out_account))
                            .unwrap_or(false)
                    } else {
                        // External with no link - count it
                        true
                    }
                }
                "CREDIT" => Self::is_external(activity),
                _ => false, // TRANSFER_OUT and others don't count
            };

            if !should_count {
                continue;
            }

            let amount = activity.amount.ok_or_else(|| {
                Error::Validation(ValidationError::MissingField(format!(
                    "Amount missing in {} activity",
                    activity.activity_type
                )))
            })?;

            // Convert using the exchange rate on the activity date
            let converted_amount = self.fx_service.convert_currency_for_date(
                amount,
                &activity.currency,
                base_currency,
                activity.activity_date,
            )?;

            total += converted_amount;

            let entry = by_account
                .entry(activity.account_id.clone())
                .or_insert_with(|| AccountDeposit {
                    amount: Decimal::ZERO,
                    currency: activity.currency.clone(),
                    converted_amount: Decimal::ZERO,
                });

            entry.amount += amount;
            entry.converted_amount += converted_amount;
            entry.currency = activity.currency.clone();
        }

        Ok(DepositsCalculation {
            total,
            base_currency: base_currency.to_string(),
            by_account,
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
            self.calculate_contributions_by_period(&account_ids, start, end, base_currency)
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
            self.calculate_contributions_by_period(&account_ids, start, end, base_currency)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::activities::{
        Activity, ActivityBulkMutationResult, ActivityRepositoryTrait, ActivitySearchResponse,
        ActivityUpdate, ActivityUpsert, BulkUpsertResult, ImportMapping, IncomeData, NewActivity,
        Sort,
    };
    use crate::fx::{ExchangeRate, FxServiceTrait, NewExchangeRate};
    use chrono::{DateTime, NaiveDate, Utc};
    use rust_decimal_macros::dec;
    use std::sync::RwLock;

    // ============== Mock Repositories ==============

    struct MockActivityRepository {
        activities: RwLock<Vec<ContributionActivity>>,
    }

    impl MockActivityRepository {
        fn new(activities: Vec<ContributionActivity>) -> Self {
            Self {
                activities: RwLock::new(activities),
            }
        }
    }

    #[async_trait]
    impl ActivityRepositoryTrait for MockActivityRepository {
        fn get_contribution_activities(
            &self,
            account_ids: &[String],
            _start_date: NaiveDateTime,
            _end_date: NaiveDateTime,
        ) -> Result<Vec<ContributionActivity>> {
            let account_set: HashSet<&str> = account_ids.iter().map(|s| s.as_str()).collect();
            Ok(self
                .activities
                .read()
                .unwrap()
                .iter()
                .filter(|a| account_set.contains(a.account_id.as_str()))
                .cloned()
                .collect())
        }

        // Stub implementations for other trait methods
        fn get_activity(&self, _: &str) -> Result<Activity> {
            unimplemented!()
        }
        fn get_activities(&self) -> Result<Vec<Activity>> {
            unimplemented!()
        }
        fn get_activities_by_account_id(&self, _: &str) -> Result<Vec<Activity>> {
            unimplemented!()
        }
        fn get_activities_by_account_ids(&self, _: &[String]) -> Result<Vec<Activity>> {
            unimplemented!()
        }
        fn get_trading_activities(&self) -> Result<Vec<Activity>> {
            unimplemented!()
        }
        fn get_income_activities(&self) -> Result<Vec<Activity>> {
            unimplemented!()
        }
        fn search_activities(
            &self,
            _: i64,
            _: i64,
            _: Option<Vec<String>>,
            _: Option<Vec<String>>,
            _: Option<String>,
            _: Option<Sort>,
            _: Option<bool>,
            _: Option<NaiveDate>,
            _: Option<NaiveDate>,
        ) -> Result<ActivitySearchResponse> {
            unimplemented!()
        }
        async fn create_activity(&self, _: NewActivity) -> Result<Activity> {
            unimplemented!()
        }
        async fn update_activity(&self, _: ActivityUpdate) -> Result<Activity> {
            unimplemented!()
        }
        async fn delete_activity(&self, _: String) -> Result<Activity> {
            unimplemented!()
        }
        async fn bulk_mutate_activities(
            &self,
            _: Vec<NewActivity>,
            _: Vec<ActivityUpdate>,
            _: Vec<String>,
        ) -> Result<ActivityBulkMutationResult> {
            unimplemented!()
        }
        async fn create_activities(&self, _: Vec<NewActivity>) -> Result<usize> {
            unimplemented!()
        }
        fn get_first_activity_date(&self, _: Option<&[String]>) -> Result<Option<DateTime<Utc>>> {
            unimplemented!()
        }
        fn get_import_mapping(&self, _: &str) -> Result<Option<ImportMapping>> {
            unimplemented!()
        }
        async fn save_import_mapping(&self, _: &ImportMapping) -> Result<()> {
            unimplemented!()
        }
        fn calculate_average_cost(&self, _: &str, _: &str) -> Result<Decimal> {
            unimplemented!()
        }
        fn get_income_activities_data(&self) -> Result<Vec<IncomeData>> {
            unimplemented!()
        }
        fn get_first_activity_date_overall(&self) -> Result<DateTime<Utc>> {
            unimplemented!()
        }
        fn get_activity_bounds_for_assets(
            &self,
            _: &[String],
        ) -> Result<HashMap<String, (Option<NaiveDate>, Option<NaiveDate>)>> {
            unimplemented!()
        }
        fn check_existing_duplicates(&self, _: &[String]) -> Result<HashMap<String, String>> {
            unimplemented!()
        }
        async fn bulk_upsert(&self, _: Vec<ActivityUpsert>) -> Result<BulkUpsertResult> {
            unimplemented!()
        }

        async fn reassign_asset(&self, _old_asset_id: &str, _new_asset_id: &str) -> Result<u32> {
            Ok(0)
        }

        async fn get_activity_accounts_and_currencies_by_asset_id(
            &self,
            _asset_id: &str,
        ) -> Result<(Vec<String>, Vec<String>)> {
            Ok((Vec::new(), Vec::new()))
        }
    }

    struct MockFxService;

    #[async_trait]
    impl FxServiceTrait for MockFxService {
        fn initialize(&self) -> Result<()> {
            Ok(())
        }

        fn get_historical_rates(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _days: i64,
        ) -> Result<Vec<ExchangeRate>> {
            unimplemented!()
        }

        fn get_latest_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<Decimal> {
            unimplemented!()
        }

        fn get_exchange_rate_for_date(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _date: NaiveDate,
        ) -> Result<Decimal> {
            unimplemented!()
        }

        fn convert_currency(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
        ) -> Result<Decimal> {
            // Simple mock: 1 CAD = 0.75 USD, 1 EUR = 1.1 USD
            if from_currency == to_currency {
                return Ok(amount);
            }
            let rate = match (from_currency, to_currency) {
                ("CAD", "USD") => dec!(0.75),
                ("USD", "CAD") => dec!(1.33),
                ("EUR", "USD") => dec!(1.1),
                ("USD", "EUR") => dec!(0.91),
                _ => dec!(1.0),
            };
            Ok(amount * rate)
        }

        fn convert_currency_for_date(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
            _date: NaiveDate,
        ) -> Result<Decimal> {
            self.convert_currency(amount, from_currency, to_currency)
        }

        fn get_latest_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
            unimplemented!()
        }

        async fn add_exchange_rate(&self, _new_rate: NewExchangeRate) -> Result<ExchangeRate> {
            unimplemented!()
        }

        async fn update_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _rate: Decimal,
        ) -> Result<ExchangeRate> {
            unimplemented!()
        }

        async fn delete_exchange_rate(&self, _rate_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn register_currency_pair(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn register_currency_pair_manual(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn ensure_fx_pairs(&self, _pairs: Vec<(String, String)>) -> Result<()> {
            Ok(())
        }
    }

    struct MockLimitRepository;

    #[async_trait]
    impl ContributionLimitRepositoryTrait for MockLimitRepository {
        fn get_contribution_limits(&self) -> Result<Vec<ContributionLimit>> {
            unimplemented!()
        }
        fn get_contribution_limit(&self, _: &str) -> Result<ContributionLimit> {
            unimplemented!()
        }
        async fn create_contribution_limit(
            &self,
            _: NewContributionLimit,
        ) -> Result<ContributionLimit> {
            unimplemented!()
        }
        async fn update_contribution_limit(
            &self,
            _: &str,
            _: NewContributionLimit,
        ) -> Result<ContributionLimit> {
            unimplemented!()
        }
        async fn delete_contribution_limit(&self, _: &str) -> Result<()> {
            unimplemented!()
        }
    }

    // ============== Helper Functions ==============

    fn external_metadata() -> Option<String> {
        Some(r#"{"flow":{"is_external":true}}"#.to_string())
    }

    fn internal_metadata() -> Option<String> {
        Some(r#"{"flow":{"is_external":false}}"#.to_string())
    }

    /// Default activity date for tests (2025-06-15)
    fn default_date() -> NaiveDate {
        NaiveDate::from_ymd_opt(2025, 6, 15).unwrap()
    }

    fn make_service(activities: Vec<ContributionActivity>) -> ContributionLimitService {
        ContributionLimitService::new(
            Arc::new(MockFxService),
            Arc::new(MockLimitRepository),
            Arc::new(MockActivityRepository::new(activities)),
        )
    }

    fn dates() -> (NaiveDateTime, NaiveDateTime) {
        let start = NaiveDateTime::new(
            NaiveDate::from_ymd_opt(2025, 1, 1).unwrap(),
            chrono::NaiveTime::from_hms_opt(0, 0, 0).unwrap(),
        );
        let end = NaiveDateTime::new(
            NaiveDate::from_ymd_opt(2025, 12, 31).unwrap(),
            chrono::NaiveTime::from_hms_opt(23, 59, 59).unwrap(),
        );
        (start, end)
    }

    // ============== Tests ==============

    #[test]
    fn test_empty_accounts_returns_zero() {
        let service = make_service(vec![]);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&[], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, Decimal::ZERO);
        assert!(result.by_account.is_empty());
    }

    #[test]
    fn test_no_activities_returns_zero() {
        let service = make_service(vec![]);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, Decimal::ZERO);
        assert!(result.by_account.is_empty());
    }

    #[test]
    fn test_deposit_always_counts() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "DEPOSIT".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(1000)),
            currency: "USD".to_string(),
            metadata: None,
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, dec!(1000));
        assert_eq!(result.by_account.get("acc1").unwrap().amount, dec!(1000));
    }

    #[test]
    fn test_multiple_deposits_sum_correctly() {
        let activities = vec![
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "DEPOSIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(500)),
                currency: "USD".to_string(),
                metadata: None,
                source_group_id: None,
            },
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "DEPOSIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(300)),
                currency: "USD".to_string(),
                metadata: None,
                source_group_id: None,
            },
        ];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, dec!(800));
    }

    #[test]
    fn test_transfer_in_without_external_flag_not_counted() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "TRANSFER_IN".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(1000)),
            currency: "USD".to_string(),
            metadata: None, // No metadata = internal
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, Decimal::ZERO);
    }

    #[test]
    fn test_transfer_in_with_external_false_not_counted() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "TRANSFER_IN".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(1000)),
            currency: "USD".to_string(),
            metadata: internal_metadata(),
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, Decimal::ZERO);
    }

    #[test]
    fn test_transfer_in_external_no_link_counts() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "TRANSFER_IN".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(1000)),
            currency: "USD".to_string(),
            metadata: external_metadata(),
            source_group_id: None, // From outside Wealthfolio
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, dec!(1000));
    }

    #[test]
    fn test_transfer_in_external_with_link_to_same_limit_not_counted() {
        // Both accounts in same limit - internal transfer within the limit
        let activities = vec![
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "TRANSFER_OUT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(1000)),
                currency: "USD".to_string(),
                metadata: external_metadata(),
                source_group_id: Some("group1".to_string()),
            },
            ContributionActivity {
                account_id: "acc2".to_string(),
                activity_type: "TRANSFER_IN".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(1000)),
                currency: "USD".to_string(),
                metadata: external_metadata(),
                source_group_id: Some("group1".to_string()),
            },
        ];
        let service = make_service(activities);
        let (start, end) = dates();

        // Both acc1 and acc2 are in the limit
        let result = service
            .calculate_contributions_by_period(
                &["acc1".to_string(), "acc2".to_string()],
                start,
                end,
                "USD",
            )
            .unwrap();

        // Should not count - it's internal to the limit
        assert_eq!(result.total, Decimal::ZERO);
    }

    #[test]
    fn test_transfer_in_external_with_link_to_outside_limit_counts() {
        // TRANSFER_OUT from account outside the limit
        let activities = vec![
            ContributionActivity {
                account_id: "acc_outside".to_string(),
                activity_type: "TRANSFER_OUT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(1000)),
                currency: "USD".to_string(),
                metadata: external_metadata(),
                source_group_id: Some("group1".to_string()),
            },
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "TRANSFER_IN".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(1000)),
                currency: "USD".to_string(),
                metadata: external_metadata(),
                source_group_id: Some("group1".to_string()),
            },
        ];
        let service = make_service(activities);
        let (start, end) = dates();

        // Only acc1 is in the limit (acc_outside is not)
        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        // Should count - source is outside this limit
        assert_eq!(result.total, dec!(1000));
    }

    #[test]
    fn test_credit_without_external_flag_not_counted() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "CREDIT".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(100)),
            currency: "USD".to_string(),
            metadata: None,
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, Decimal::ZERO);
    }

    #[test]
    fn test_credit_with_external_true_counts() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "CREDIT".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(100)),
            currency: "USD".to_string(),
            metadata: external_metadata(),
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, dec!(100));
    }

    #[test]
    fn test_credit_with_external_false_not_counted() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "CREDIT".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(100)),
            currency: "USD".to_string(),
            metadata: internal_metadata(),
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, Decimal::ZERO);
    }

    #[test]
    fn test_transfer_out_never_counts() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "TRANSFER_OUT".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(1000)),
            currency: "USD".to_string(),
            metadata: external_metadata(),
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        assert_eq!(result.total, Decimal::ZERO);
    }

    #[test]
    fn test_currency_conversion() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "DEPOSIT".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(1000)),
            currency: "CAD".to_string(),
            metadata: None,
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        // 1000 CAD * 0.75 = 750 USD
        assert_eq!(result.total, dec!(750));
        assert_eq!(result.by_account.get("acc1").unwrap().amount, dec!(1000));
        assert_eq!(
            result.by_account.get("acc1").unwrap().converted_amount,
            dec!(750)
        );
    }

    #[test]
    fn test_multiple_accounts_tracked_separately() {
        let activities = vec![
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "DEPOSIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(1000)),
                currency: "USD".to_string(),
                metadata: None,
                source_group_id: None,
            },
            ContributionActivity {
                account_id: "acc2".to_string(),
                activity_type: "DEPOSIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(500)),
                currency: "USD".to_string(),
                metadata: None,
                source_group_id: None,
            },
        ];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(
                &["acc1".to_string(), "acc2".to_string()],
                start,
                end,
                "USD",
            )
            .unwrap();

        assert_eq!(result.total, dec!(1500));
        assert_eq!(result.by_account.get("acc1").unwrap().amount, dec!(1000));
        assert_eq!(result.by_account.get("acc2").unwrap().amount, dec!(500));
    }

    #[test]
    fn test_mixed_activity_types() {
        let activities = vec![
            // Counts: deposit
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "DEPOSIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(1000)),
                currency: "USD".to_string(),
                metadata: None,
                source_group_id: None,
            },
            // Counts: external transfer in
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "TRANSFER_IN".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(500)),
                currency: "USD".to_string(),
                metadata: external_metadata(),
                source_group_id: None,
            },
            // Counts: external credit
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "CREDIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(100)),
                currency: "USD".to_string(),
                metadata: external_metadata(),
                source_group_id: None,
            },
            // Does NOT count: internal transfer in
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "TRANSFER_IN".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(200)),
                currency: "USD".to_string(),
                metadata: None,
                source_group_id: None,
            },
            // Does NOT count: internal credit
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "CREDIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(50)),
                currency: "USD".to_string(),
                metadata: None,
                source_group_id: None,
            },
            // Does NOT count: transfer out
            ContributionActivity {
                account_id: "acc1".to_string(),
                activity_type: "TRANSFER_OUT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(300)),
                currency: "USD".to_string(),
                metadata: external_metadata(),
                source_group_id: None,
            },
        ];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        // 1000 (deposit) + 500 (external transfer) + 100 (external credit) = 1600
        assert_eq!(result.total, dec!(1600));
    }

    #[test]
    fn test_missing_amount_returns_error() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "DEPOSIT".to_string(),
            activity_date: default_date(),
            amount: None, // Missing amount
            currency: "USD".to_string(),
            metadata: None,
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result =
            service.calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD");

        assert!(result.is_err());
    }

    #[test]
    fn test_malformed_metadata_treated_as_internal() {
        let activities = vec![ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "TRANSFER_IN".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(1000)),
            currency: "USD".to_string(),
            metadata: Some("invalid json".to_string()),
            source_group_id: None,
        }];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(&["acc1".to_string()], start, end, "USD")
            .unwrap();

        // Malformed metadata = is_external defaults to false = not counted
        assert_eq!(result.total, Decimal::ZERO);
    }

    #[test]
    fn test_is_external_helper() {
        // Test the is_external helper directly
        let external = ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "TRANSFER_IN".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(100)),
            currency: "USD".to_string(),
            metadata: external_metadata(),
            source_group_id: None,
        };
        assert!(ContributionLimitService::is_external(&external));

        let internal = ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "TRANSFER_IN".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(100)),
            currency: "USD".to_string(),
            metadata: internal_metadata(),
            source_group_id: None,
        };
        assert!(!ContributionLimitService::is_external(&internal));

        let no_metadata = ContributionActivity {
            account_id: "acc1".to_string(),
            activity_type: "TRANSFER_IN".to_string(),
            activity_date: default_date(),
            amount: Some(dec!(100)),
            currency: "USD".to_string(),
            metadata: None,
            source_group_id: None,
        };
        assert!(!ContributionLimitService::is_external(&no_metadata));
    }

    #[test]
    fn test_complex_scenario_tfsa_contribution_room() {
        // Simulates a TFSA with 2 accounts
        // - acc1: TFSA Savings
        // - acc2: TFSA Investment
        //
        // Activities:
        // 1. Deposit $5000 to acc1 (counts)
        // 2. Transfer $3000 from acc1 to acc2 internally (does NOT count)
        // 3. External transfer $2000 from non-TFSA to acc2 (counts)
        // 4. Credit/rebate $50 to acc1 (internal, does NOT count)
        // 5. Bonus credit $100 to acc1 (external, counts)
        let activities = vec![
            // 1. Deposit
            ContributionActivity {
                account_id: "tfsa_savings".to_string(),
                activity_type: "DEPOSIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(5000)),
                currency: "CAD".to_string(),
                metadata: None,
                source_group_id: None,
            },
            // 2. Internal transfer OUT
            ContributionActivity {
                account_id: "tfsa_savings".to_string(),
                activity_type: "TRANSFER_OUT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(3000)),
                currency: "CAD".to_string(),
                metadata: external_metadata(), // Even if marked external
                source_group_id: Some("internal_transfer_1".to_string()),
            },
            // 2. Internal transfer IN
            ContributionActivity {
                account_id: "tfsa_invest".to_string(),
                activity_type: "TRANSFER_IN".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(3000)),
                currency: "CAD".to_string(),
                metadata: external_metadata(), // Even if marked external
                source_group_id: Some("internal_transfer_1".to_string()),
            },
            // 3. External transfer from non-TFSA (not in limit accounts)
            ContributionActivity {
                account_id: "tfsa_invest".to_string(),
                activity_type: "TRANSFER_IN".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(2000)),
                currency: "CAD".to_string(),
                metadata: external_metadata(),
                source_group_id: Some("external_transfer_1".to_string()),
            },
            // The corresponding TRANSFER_OUT from non-TFSA account (not in our limit)
            // This won't be fetched because non_tfsa is not in account_ids
            // 4. Internal credit/rebate
            ContributionActivity {
                account_id: "tfsa_savings".to_string(),
                activity_type: "CREDIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(50)),
                currency: "CAD".to_string(),
                metadata: None, // Internal
                source_group_id: None,
            },
            // 5. External bonus
            ContributionActivity {
                account_id: "tfsa_savings".to_string(),
                activity_type: "CREDIT".to_string(),
                activity_date: default_date(),
                amount: Some(dec!(100)),
                currency: "CAD".to_string(),
                metadata: external_metadata(),
                source_group_id: None,
            },
        ];
        let service = make_service(activities);
        let (start, end) = dates();

        let result = service
            .calculate_contributions_by_period(
                &["tfsa_savings".to_string(), "tfsa_invest".to_string()],
                start,
                end,
                "CAD",
            )
            .unwrap();

        // Expected: 5000 (deposit) + 2000 (external transfer) + 100 (external credit) = 7100
        assert_eq!(result.total, dec!(7100));
        assert_eq!(
            result.by_account.get("tfsa_savings").unwrap().amount,
            dec!(5100)
        ); // 5000 + 100
        assert_eq!(
            result.by_account.get("tfsa_invest").unwrap().amount,
            dec!(2000)
        );
    }
}
