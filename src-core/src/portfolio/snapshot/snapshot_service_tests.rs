#[cfg(test)]
mod tests {
    use async_trait::async_trait;
    use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::{HashMap, VecDeque};
    use std::sync::{Arc, RwLock};

    use crate::accounts::{Account, AccountRepositoryTrait, AccountUpdate, NewAccount};
    use crate::activities::{
        activities_model::IncomeData as ActivityIncomeData, Activity, ActivityRepositoryTrait,
        ActivitySearchResponse, ActivityUpdate, ImportMapping as ActivityImportMapping,
        NewActivity, Sort as ActivitySort,
    };
    use crate::assets::{Asset, AssetRepositoryTrait, NewAsset, UpdateAssetProfile};
    use crate::constants::{DECIMAL_PRECISION, PORTFOLIO_TOTAL_ACCOUNT_ID};
    use crate::errors::{Error, Result as AppResult};
    use crate::fx::fx_model::{ExchangeRate, NewExchangeRate};
    use crate::fx::fx_traits::FxServiceTrait;
    use crate::portfolio::snapshot::{
        snapshot_repository::SnapshotRepositoryTrait, AccountStateSnapshot, Lot, Position,
        SnapshotService, SnapshotServiceTrait,
    };

    #[derive(Clone, Debug)]
    struct MockFxService {
        rates: HashMap<(String, String, NaiveDate), Decimal>,
    }

    impl MockFxService {
        fn new() -> Self {
            Self {
                rates: HashMap::new(),
            }
        }
        fn add_bidirectional_rate(&mut self, from: &str, to: &str, date: NaiveDate, rate: Decimal) {
            self.rates
                .insert((from.to_string(), to.to_string(), date), rate);
            if rate != Decimal::ZERO {
                self.rates
                    .insert((to.to_string(), from.to_string(), date), dec!(1) / rate);
            }
        }
    }

    #[async_trait]
    impl FxServiceTrait for MockFxService {
        fn initialize(&self) -> AppResult<()> {
            Ok(())
        }
        async fn add_exchange_rate(&self, _new_rate: NewExchangeRate) -> AppResult<ExchangeRate> {
            unimplemented!()
        }
        fn get_historical_rates(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _days: i64,
        ) -> AppResult<Vec<ExchangeRate>> {
            unimplemented!()
        }
        async fn update_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _rate: Decimal,
        ) -> AppResult<ExchangeRate> {
            unimplemented!()
        }
        fn get_latest_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> AppResult<Decimal> {
            unimplemented!()
        }
        fn get_exchange_rate_for_date(
            &self,
            from_currency: &str,
            to_currency: &str,
            date: NaiveDate,
        ) -> AppResult<Decimal> {
            if from_currency == to_currency {
                return Ok(Decimal::ONE);
            }
            self.rates
                .get(&(from_currency.to_string(), to_currency.to_string(), date))
                .copied()
                .ok_or_else(|| {
                    Error::Fx(crate::fx::FxError::RateNotFound(format!(
                        "Rate not found for {}->{} on {}",
                        from_currency, to_currency, date
                    )))
                })
        }
        fn convert_currency(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
        ) -> AppResult<Decimal> {
            if from_currency == to_currency {
                return Ok(amount);
            }
            let rate = self.get_latest_exchange_rate(from_currency, to_currency)?;
            Ok(amount * rate)
        }
        fn convert_currency_for_date(
            &self,
            amount: Decimal,
            from_currency: &str,
            to_currency: &str,
            date: NaiveDate,
        ) -> AppResult<Decimal> {
            if from_currency == to_currency {
                return Ok(amount);
            }
            let rate = self.get_exchange_rate_for_date(from_currency, to_currency, date)?;
            Ok(amount * rate)
        }
        fn get_latest_exchange_rates(&self) -> AppResult<Vec<ExchangeRate>> {
            unimplemented!()
        }
        async fn delete_exchange_rate(&self, _rate_id: &str) -> AppResult<()> {
            unimplemented!()
        }
        async fn register_currency_pair(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> AppResult<()> {
            Ok(())
        }
        async fn register_currency_pair_manual(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> AppResult<()> {
            Ok(())
        }
    }

    #[derive(Clone, Debug)]
    struct MockAssetRepository {
        assets: HashMap<String, Asset>,
    }

    impl MockAssetRepository {
        fn new() -> Self {
            let mut assets = HashMap::new();

            // Add predefined test assets with their listing currencies
            assets.insert(
                "AAPL".to_string(),
                Asset {
                    id: "AAPL".to_string(),
                    isin: Some("US0378331005".to_string()),
                    name: Some("Apple Inc.".to_string()),
                    asset_type: Some("STOCK".to_string()),
                    symbol: "AAPL".to_string(),
                    symbol_mapping: Some("AAPL".to_string()),
                    asset_class: Some("EQUITY".to_string()),
                    asset_sub_class: Some("LARGE_CAP".to_string()),
                    notes: None,
                    countries: Some("US".to_string()),
                    categories: Some("Technology".to_string()),
                    classes: Some("Equity".to_string()),
                    attributes: None,
                    currency: "USD".to_string(), // USD listing
                    data_source: "MANUAL".to_string(),
                    sectors: Some("Technology".to_string()),
                    url: None,
                    created_at: chrono::Utc::now().naive_utc(),
                    updated_at: chrono::Utc::now().naive_utc(),
                },
            );

            assets.insert(
                "SHOP".to_string(),
                Asset {
                    id: "SHOP".to_string(),
                    isin: Some("CA82509L1076".to_string()),
                    name: Some("Shopify Inc.".to_string()),
                    asset_type: Some("STOCK".to_string()),
                    symbol: "SHOP".to_string(),
                    symbol_mapping: Some("SHOP".to_string()),
                    asset_class: Some("EQUITY".to_string()),
                    asset_sub_class: Some("LARGE_CAP".to_string()),
                    notes: None,
                    countries: Some("CA".to_string()),
                    categories: Some("Technology".to_string()),
                    classes: Some("Equity".to_string()),
                    attributes: None,
                    currency: "CAD".to_string(), // CAD listing
                    data_source: "MANUAL".to_string(),
                    sectors: Some("Technology".to_string()),
                    url: None,
                    created_at: chrono::Utc::now().naive_utc(),
                    updated_at: chrono::Utc::now().naive_utc(),
                },
            );

            Self { assets }
        }
    }

    #[async_trait]
    impl AssetRepositoryTrait for MockAssetRepository {
        async fn create(&self, _new_asset: NewAsset) -> AppResult<Asset> {
            unimplemented!("create not implemented for MockAssetRepository")
        }

        async fn update_profile(
            &self,
            _asset_id: &str,
            _payload: UpdateAssetProfile,
        ) -> AppResult<Asset> {
            unimplemented!("update_profile not implemented for MockAssetRepository")
        }

        async fn update_data_source(
            &self,
            _asset_id: &str,
            _data_source: String,
        ) -> AppResult<Asset> {
            unimplemented!("update_data_source not implemented for MockAssetRepository")
        }

        async fn delete(&self, _asset_id: &str) -> AppResult<()> {
            Ok(())
        }

        fn get_by_id(&self, asset_id: &str) -> AppResult<Asset> {
            self.assets
                .get(asset_id)
                .cloned()
                .ok_or_else(|| Error::Asset(format!("Asset not found: {}", asset_id)))
        }

        fn list(&self) -> AppResult<Vec<Asset>> {
            Ok(self.assets.values().cloned().collect())
        }

        fn list_cash_assets(&self, _base_currency: &str) -> AppResult<Vec<Asset>> {
            Ok(vec![])
        }

        fn list_by_symbols(&self, symbols: &[String]) -> AppResult<Vec<Asset>> {
            Ok(self
                .assets
                .values()
                .filter(|asset| symbols.contains(&asset.symbol))
                .cloned()
                .collect())
        }
    }

    #[derive(Clone, Debug)]
    struct MockAccountRepository {
        accounts: Arc<RwLock<HashMap<String, Account>>>,
    }
    impl MockAccountRepository {
        fn new() -> Self {
            Self {
                accounts: Arc::new(RwLock::new(HashMap::new())),
            }
        }
        #[allow(dead_code)]
        fn add_account(&mut self, account: Account) {
            self.accounts
                .write()
                .unwrap()
                .insert(account.id.clone(), account);
        }
    }
    #[async_trait]
    impl AccountRepositoryTrait for MockAccountRepository {
        fn get_by_id(&self, id: &str) -> AppResult<Account> {
            self.accounts
                .read()
                .unwrap()
                .get(id)
                .cloned()
                .ok_or(Error::Repository(format!("Account {} not found", id)))
        }
        fn list(
            &self,
            active_only: Option<bool>,
            account_ids: Option<&[String]>,
        ) -> AppResult<Vec<Account>> {
            let mut filtered_accounts: Vec<Account> = self
                .accounts
                .read()
                .unwrap()
                .values()
                .filter(|a| active_only.is_none_or(|active| a.is_active == active))
                .cloned()
                .collect();

            if let Some(ids_filter) = account_ids {
                filtered_accounts.retain(|acc| ids_filter.contains(&acc.id));
            }
            Ok(filtered_accounts)
        }
        async fn update(&self, _account_update: AccountUpdate) -> AppResult<Account> {
            unimplemented!("MockAccountRepository::update")
        }
        async fn delete(&self, _id: &str) -> AppResult<usize> {
            unimplemented!("MockAccountRepository::delete");
        }
        fn create_in_transaction(
            &self,
            _new_account: NewAccount,
            _conn: &mut diesel::sqlite::SqliteConnection,
        ) -> AppResult<Account> {
            unimplemented!("MockAccountRepository::create_in_transaction not suitable for simple mock without DB instance")
        }
    }

    #[derive(Clone, Debug)]
    struct MockActivityRepository;
    impl MockActivityRepository {
        fn new() -> Self {
            Self
        }
    }
    #[async_trait]
    impl ActivityRepositoryTrait for MockActivityRepository {
        fn get_activity(&self, _activity_id: &str) -> AppResult<Activity> {
            unimplemented!()
        }
        fn get_activities(&self) -> AppResult<Vec<Activity>> {
            unimplemented!()
        }
        fn get_activities_by_account_id(&self, _account_id: &str) -> AppResult<Vec<Activity>> {
            unimplemented!()
        }
        fn get_activities_by_account_ids(
            &self,
            _account_ids: &[String],
        ) -> AppResult<Vec<Activity>> {
            Ok(Vec::new())
        }
        fn get_trading_activities(&self) -> AppResult<Vec<Activity>> {
            unimplemented!()
        }
        fn get_income_activities(&self) -> AppResult<Vec<Activity>> {
            unimplemented!()
        }
        fn get_deposit_activities(
            &self,
            _account_ids: &[String],
            _start_date: NaiveDateTime,
            _end_date: NaiveDateTime,
        ) -> AppResult<Vec<(String, Decimal, Decimal, String, Option<Decimal>)>> {
            unimplemented!()
        }
        fn search_activities(
            &self,
            _page: i64,
            _page_size: i64,
            _account_id_filter: Option<Vec<String>>,
            _activity_type_filter: Option<Vec<String>>,
            _asset_id_keyword: Option<String>,
            _sort: Option<ActivitySort>,
            _is_draft_filter: Option<bool>,
        ) -> AppResult<ActivitySearchResponse> {
            unimplemented!()
        }
        async fn create_activity(&self, _new_activity: NewActivity) -> AppResult<Activity> {
            unimplemented!()
        }
        async fn update_activity(&self, _activity_update: ActivityUpdate) -> AppResult<Activity> {
            unimplemented!()
        }
        async fn delete_activity(&self, _activity_id: String) -> AppResult<Activity> {
            unimplemented!()
        }
        async fn bulk_mutate_activities(
            &self,
            _creates: Vec<NewActivity>,
            _updates: Vec<ActivityUpdate>,
            _delete_ids: Vec<String>,
        ) -> AppResult<crate::activities::ActivityBulkMutationResult> {
            unimplemented!()
        }
        async fn create_activities(&self, _activities: Vec<NewActivity>) -> AppResult<usize> {
            unimplemented!()
        }
        fn get_first_activity_date(
            &self,
            _account_ids: Option<&[String]>,
        ) -> AppResult<Option<DateTime<Utc>>> {
            unimplemented!()
        }
        fn get_import_mapping(
            &self,
            _account_id: &str,
        ) -> AppResult<Option<ActivityImportMapping>> {
            unimplemented!()
        }
        async fn save_import_mapping(&self, _mapping: &ActivityImportMapping) -> AppResult<()> {
            unimplemented!()
        }
        fn calculate_average_cost(&self, _account_id: &str, _asset_id: &str) -> AppResult<Decimal> {
            unimplemented!()
        }
        fn get_income_activities_data(&self) -> AppResult<Vec<ActivityIncomeData>> {
            unimplemented!()
        }
        fn get_first_activity_date_overall(&self) -> AppResult<DateTime<Utc>> {
            unimplemented!()
        }
    }

    #[derive(Clone, Debug)]
    struct MockActivityRepositoryWithData {
        activities: Vec<Activity>,
    }
    impl MockActivityRepositoryWithData {
        fn new(activities: Vec<Activity>) -> Self {
            Self { activities }
        }
    }
    #[async_trait]
    impl ActivityRepositoryTrait for MockActivityRepositoryWithData {
        fn get_activity(&self, activity_id: &str) -> AppResult<Activity> {
            self.activities
                .iter()
                .find(|a| a.id == activity_id)
                .cloned()
                .ok_or_else(|| Error::Repository(format!("Activity {} not found", activity_id)))
        }
        fn get_activities(&self) -> AppResult<Vec<Activity>> {
            Ok(self.activities.clone())
        }
        fn get_activities_by_account_id(&self, account_id: &str) -> AppResult<Vec<Activity>> {
            Ok(self
                .activities
                .iter()
                .filter(|&a| a.account_id == account_id)
                .cloned()
                .collect())
        }
        fn get_activities_by_account_ids(
            &self,
            account_ids: &[String],
        ) -> AppResult<Vec<Activity>> {
            Ok(self
                .activities
                .iter()
                .filter(|&a| account_ids.contains(&a.account_id))
                .cloned()
                .collect())
        }
        fn get_trading_activities(&self) -> AppResult<Vec<Activity>> {
            unimplemented!()
        }
        fn get_income_activities(&self) -> AppResult<Vec<Activity>> {
            unimplemented!()
        }
        fn get_deposit_activities(
            &self,
            _ids: &[String],
            _s: NaiveDateTime,
            _e: NaiveDateTime,
        ) -> AppResult<Vec<(String, Decimal, Decimal, String, Option<Decimal>)>> {
            unimplemented!()
        }
        fn search_activities(
            &self,
            _page: i64,
            _size: i64,
            _acc: Option<Vec<String>>,
            _typ: Option<Vec<String>>,
            _kw: Option<String>,
            _sort: Option<ActivitySort>,
            _is_draft_filter: Option<bool>,
        ) -> AppResult<ActivitySearchResponse> {
            unimplemented!()
        }
        async fn create_activity(&self, _n: NewActivity) -> AppResult<Activity> {
            unimplemented!()
        }
        async fn update_activity(&self, _u: ActivityUpdate) -> AppResult<Activity> {
            unimplemented!()
        }
        async fn delete_activity(&self, _id: String) -> AppResult<Activity> {
            unimplemented!()
        }
        async fn bulk_mutate_activities(
            &self,
            _creates: Vec<NewActivity>,
            _updates: Vec<ActivityUpdate>,
            _delete_ids: Vec<String>,
        ) -> AppResult<crate::activities::ActivityBulkMutationResult> {
            unimplemented!()
        }
        async fn create_activities(&self, _a: Vec<NewActivity>) -> AppResult<usize> {
            unimplemented!()
        }
        fn get_first_activity_date(
            &self,
            _ids: Option<&[String]>,
        ) -> AppResult<Option<DateTime<Utc>>> {
            Ok(None)
        }
        fn get_import_mapping(&self, _id: &str) -> AppResult<Option<ActivityImportMapping>> {
            Ok(None)
        }
        async fn save_import_mapping(&self, _m: &ActivityImportMapping) -> AppResult<()> {
            Ok(())
        }
        fn calculate_average_cost(&self, _acc: &str, _asset: &str) -> AppResult<Decimal> {
            unimplemented!()
        }
        fn get_income_activities_data(&self) -> AppResult<Vec<ActivityIncomeData>> {
            unimplemented!()
        }
        fn get_first_activity_date_overall(&self) -> AppResult<DateTime<Utc>> {
            unimplemented!()
        }
    }

    // Mock SnapshotRepository that implements the trait
    #[derive(Clone, Debug)]
    struct MockSnapshotRepository {
        snapshots: Arc<RwLock<HashMap<String, Vec<AccountStateSnapshot>>>>, // account_id -> snapshots
        saved_snapshots: Arc<RwLock<Vec<AccountStateSnapshot>>>, // track what was saved via replace_all_snapshots
    }

    impl MockSnapshotRepository {
        fn new() -> Self {
            Self {
                snapshots: Arc::new(RwLock::new(HashMap::new())),
                saved_snapshots: Arc::new(RwLock::new(Vec::new())),
            }
        }

        fn add_snapshots(&self, snapshots: Vec<AccountStateSnapshot>) {
            let mut store = self.snapshots.write().unwrap();
            for snapshot in snapshots {
                store
                    .entry(snapshot.account_id.clone())
                    .or_default()
                    .push(snapshot);
            }
        }

        fn get_saved_snapshots(&self) -> Vec<AccountStateSnapshot> {
            self.saved_snapshots.read().unwrap().clone()
        }
    }

    #[async_trait]
    impl SnapshotRepositoryTrait for MockSnapshotRepository {
        async fn save_snapshots(
            &self,
            snapshots_to_save: &[AccountStateSnapshot],
        ) -> AppResult<()> {
            // This mock is primarily used to verify what the service saves for TOTAL.
            let mut saved_store = self.saved_snapshots.write().unwrap();
            saved_store.clear(); // Clear previous state, as test verifies the result of one operation.
            saved_store.extend(snapshots_to_save.iter().cloned());

            // Also update the main `self.snapshots` store for the saved snapshots.
            let mut main_store = self.snapshots.write().unwrap();
            for s in snapshots_to_save {
                let account_snaps = main_store.entry(s.account_id.clone()).or_default();
                // Remove existing snapshot for the same date before adding the new one
                account_snaps.retain(|existing_s| existing_s.snapshot_date != s.snapshot_date);
                account_snaps.push(s.clone());
                account_snaps.sort_by_key(|k| k.snapshot_date); // Keep them sorted
            }
            Ok(())
        }

        fn get_snapshots_by_account(
            &self,
            account_id: &str,
            start_date: Option<NaiveDate>,
            end_date: Option<NaiveDate>,
        ) -> AppResult<Vec<AccountStateSnapshot>> {
            let store = self.snapshots.read().unwrap();
            if let Some(account_snapshots) = store.get(account_id) {
                let filtered: Vec<AccountStateSnapshot> = account_snapshots
                    .iter()
                    .filter(|snap| {
                        start_date.is_none_or(|start| snap.snapshot_date >= start)
                            && end_date.is_none_or(|end| snap.snapshot_date <= end)
                    })
                    .cloned()
                    .collect();
                Ok(filtered)
            } else {
                Ok(Vec::new())
            }
        }

        fn get_latest_snapshot_before_date(
            &self,
            _account_id: &str,
            _date: NaiveDate,
        ) -> AppResult<Option<AccountStateSnapshot>> {
            // For test_calculate_total_portfolio_snapshots_aggregation, this might not be directly hit
            // but good to have a basic mock if other flows use it.
            let store = self.snapshots.read().unwrap();
            if let Some(account_snapshots) = store.get(_account_id) {
                return Ok(account_snapshots
                    .iter()
                    .filter(|s| s.snapshot_date <= _date)
                    .max_by_key(|s| s.snapshot_date)
                    .cloned());
            }
            Ok(None)
        }

        fn get_latest_snapshots_before_date(
            &self,
            _account_ids: &[String],
            _date: NaiveDate,
        ) -> AppResult<HashMap<String, AccountStateSnapshot>> {
            unimplemented!("get_latest_snapshots_before_date mock")
        }

        fn get_all_latest_snapshots(
            &self,
            _account_ids: &[String],
        ) -> AppResult<HashMap<String, AccountStateSnapshot>> {
            unimplemented!("get_all_latest_snapshots mock")
        }

        async fn delete_snapshots_by_account_ids(
            &self,
            account_ids_to_delete: &[String],
        ) -> AppResult<usize> {
            let mut store = self.snapshots.write().unwrap();
            let mut count = 0;
            for id in account_ids_to_delete {
                if let Some(removed) = store.remove(id) {
                    count += removed.len();
                }
            }
            // This method should NOT clear self.saved_snapshots, as that's used for assertions AFTER save.
            Ok(count)
        }

        async fn delete_snapshots_for_account_and_dates(
            &self,
            _account_id: &str,
            _dates_to_delete: &[NaiveDate],
        ) -> AppResult<()> {
            unimplemented!("delete_snapshots_for_account_and_dates mock")
        }

        async fn delete_snapshots_for_account_in_range(
            &self,
            _account_id: &str,
            _start_date: NaiveDate,
            _end_date: NaiveDate,
        ) -> AppResult<()> {
            // This was identified as the panic point.
            // For `test_calculate_total_portfolio_snapshots_aggregation`, this should ideally not be called.
            // If it is, the test or service logic might have changed.
            // For now, keep it unimplemented to catch if it's unexpectedly called.
            unimplemented!("delete_snapshots_for_account_in_range mock - was this expected for TOTAL calculation?")
        }

        fn get_total_portfolio_snapshots(
            &self,
            start_date: Option<NaiveDate>,
            end_date: Option<NaiveDate>,
        ) -> AppResult<Vec<AccountStateSnapshot>> {
            self.get_snapshots_by_account(PORTFOLIO_TOTAL_ACCOUNT_ID, start_date, end_date)
        }

        fn get_all_active_account_snapshots(
            &self,
            start_date: Option<NaiveDate>,
            end_date: Option<NaiveDate>,
        ) -> AppResult<Vec<AccountStateSnapshot>> {
            let store = self.snapshots.read().unwrap();
            let mut all_snapshots = Vec::new();

            for (account_id, account_snapshots) in store.iter() {
                // Skip TOTAL snapshots when getting "active account" snapshots (individual accounts only)
                if account_id == PORTFOLIO_TOTAL_ACCOUNT_ID {
                    continue;
                }

                let filtered: Vec<AccountStateSnapshot> = account_snapshots
                    .iter()
                    .filter(|snap| {
                        start_date.is_none_or(|start| snap.snapshot_date >= start)
                            && end_date.is_none_or(|end| snap.snapshot_date <= end)
                    })
                    .cloned()
                    .collect();
                all_snapshots.extend(filtered);
            }
            Ok(all_snapshots)
        }

        fn get_earliest_snapshot_date(&self, account_id: &str) -> AppResult<Option<NaiveDate>> {
            let store = self.snapshots.read().unwrap();
            if let Some(account_snapshots) = store.get(account_id) {
                return Ok(account_snapshots.iter().map(|s| s.snapshot_date).min());
            }
            Ok(None)
        }

        async fn overwrite_snapshots_for_account_in_range(
            &self,
            _account_id: &str,
            _start_date: NaiveDate,
            _end_date: NaiveDate,
            snapshots_to_save: &[AccountStateSnapshot],
        ) -> AppResult<()> {
            self.save_snapshots(snapshots_to_save).await
        }

        async fn overwrite_multiple_account_snapshot_ranges(
            &self,
            new_snaps: &[AccountStateSnapshot],
        ) -> AppResult<()> {
            self.save_snapshots(new_snaps).await
        }

        async fn overwrite_all_snapshots_for_account(
            &self,
            account_id: &str,
            snapshots_to_save: &[AccountStateSnapshot],
        ) -> AppResult<()> {
            let mut store = self.snapshots.write().unwrap();
            // Delete all existing snapshots for the account
            store.remove(account_id);
            // Insert the new snapshots if there are any
            if !snapshots_to_save.is_empty() {
                store.insert(account_id.to_string(), snapshots_to_save.to_vec());
            }

            // Also update saved_snapshots for assertion purposes.
            let mut saved_store = self.saved_snapshots.write().unwrap();
            saved_store.clear();
            saved_store.extend(snapshots_to_save.iter().cloned());
            Ok(())
        }
    }

    fn create_test_account(id: &str, currency: &str, name: &str) -> Account {
        Account {
            id: id.to_string(),
            name: name.to_string(),
            currency: currency.to_string(),
            is_active: true,
            account_type: "REGULAR".to_string(),
            group: None,
            is_default: false,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
            platform_id: None,
            external_id: None,
            account_number: None,
            meta: None,
        }
    }

    fn create_blank_snapshot(
        account_id: &str,
        currency: &str,
        date_str: &str,
    ) -> AccountStateSnapshot {
        AccountStateSnapshot {
            id: format!("{}_{}", account_id, date_str),
            account_id: account_id.to_string(),
            snapshot_date: NaiveDate::parse_from_str(date_str, "%Y-%m-%d").unwrap(),
            currency: currency.to_string(),
            calculated_at: Utc::now().naive_utc(),
            ..Default::default()
        }
    }

    #[tokio::test]
    async fn test_calculate_total_portfolio_snapshots_aggregation() {
        let base_portfolio_currency = "CAD";
        let date1_str = "2023-01-01";
        let date2_str = "2023-01-05";
        let target_date1 = NaiveDate::parse_from_str(date1_str, "%Y-%m-%d").unwrap();
        let target_date2 = NaiveDate::parse_from_str(date2_str, "%Y-%m-%d").unwrap();

        // Setup mock repositories
        let mut mock_account_repo_instance = MockAccountRepository::new();
        let acc1_cad = create_test_account("acc1", "CAD", "CAD Account");
        let acc2_usd = create_test_account("acc2", "USD", "USD Account");
        mock_account_repo_instance.add_account(acc1_cad.clone());
        mock_account_repo_instance.add_account(acc2_usd.clone());
        let mock_account_repo_arc = Arc::new(mock_account_repo_instance);

        let mock_activity_repo_arc = Arc::new(MockActivityRepository::new());

        let mut mock_fx_service_instance = MockFxService::new();
        mock_fx_service_instance.add_bidirectional_rate("USD", "CAD", target_date1, dec!(1.25));
        mock_fx_service_instance.add_bidirectional_rate("USD", "CAD", target_date2, dec!(1.30));
        let mock_fx_service_arc = Arc::new(mock_fx_service_instance);

        // Setup mock snapshot repository with test data
        let mock_snapshot_repo = MockSnapshotRepository::new();

        // Create test snapshots for individual accounts on different dates
        let mut snap1_cad = create_blank_snapshot(&acc1_cad.id, &acc1_cad.currency, date1_str);
        snap1_cad
            .cash_balances
            .insert("CAD".to_string(), dec!(1000));
        let pos1_tse = Position {
            id: format!("pos_TSE_{}", acc1_cad.id),
            account_id: acc1_cad.id.clone(),
            asset_id: "TSE.TO".to_string(),
            currency: "CAD".to_string(),
            quantity: dec!(10),
            average_cost: dec!(50),
            total_cost_basis: dec!(500),
            lots: Default::default(),
            inception_date: DateTime::from_naive_utc_and_offset(
                target_date1.and_hms_opt(0, 0, 0).unwrap(),
                Utc,
            ),
            created_at: Utc::now(),
            last_updated: Utc::now(),
        };
        snap1_cad.positions.insert("TSE.TO".to_string(), pos1_tse);
        snap1_cad.cost_basis = dec!(500);
        snap1_cad.net_contribution = dec!(1000);
        snap1_cad.net_contribution_base = dec!(1000);

        let mut snap2_usd = create_blank_snapshot(&acc2_usd.id, &acc2_usd.currency, date2_str);
        snap2_usd.cash_balances.insert("USD".to_string(), dec!(500));
        let pos2_aapl = Position {
            id: format!("pos_AAPL_{}", acc2_usd.id),
            account_id: acc2_usd.id.clone(),
            asset_id: "AAPL".to_string(),
            currency: "USD".to_string(),
            quantity: dec!(5),
            average_cost: dec!(150),
            total_cost_basis: dec!(750),
            lots: Default::default(),
            inception_date: DateTime::from_naive_utc_and_offset(
                target_date2.and_hms_opt(0, 0, 0).unwrap(),
                Utc,
            ),
            created_at: Utc::now(),
            last_updated: Utc::now(),
        };
        snap2_usd.positions.insert("AAPL".to_string(), pos2_aapl);
        snap2_usd.cost_basis = dec!(750);
        snap2_usd.net_contribution = dec!(600);
        snap2_usd.net_contribution_base = dec!(780);

        // Add the individual account snapshots to our mock repository
        mock_snapshot_repo.add_snapshots(vec![snap1_cad.clone(), snap2_usd.clone()]);

        let mock_snapshot_repo_arc = Arc::new(mock_snapshot_repo);
        let base_currency_arc = Arc::new(RwLock::new(base_portfolio_currency.to_string()));

        // Create the SnapshotService with our mock repositories
        let mock_asset_repo = Arc::new(MockAssetRepository::new());
        let snapshot_service = SnapshotService::new(
            base_currency_arc.clone(),
            mock_account_repo_arc.clone(),
            mock_activity_repo_arc,
            mock_snapshot_repo_arc.clone(),
            mock_asset_repo,
            mock_fx_service_arc.clone(),
        );

        // Call the public method under test
        let result = snapshot_service.calculate_total_portfolio_snapshots().await;

        log::info!("result: {:?}", result);

        // Verify the method succeeded
        assert!(
            result.is_ok(),
            "calculate_total_portfolio_snapshots should succeed"
        );
        let snapshots_saved = result.unwrap();
        assert_eq!(
            snapshots_saved, 2,
            "Should have saved 2 TOTAL snapshots for 2 different dates"
        );

        // Verify what was saved
        let saved_snapshots = mock_snapshot_repo_arc.get_saved_snapshots();
        assert_eq!(
            saved_snapshots.len(),
            2,
            "Should have 2 saved TOTAL snapshots"
        );

        // Sort snapshots by date for consistent testing
        let mut sorted_snapshots = saved_snapshots.clone();
        sorted_snapshots.sort_by_key(|s| s.snapshot_date);

        // Verify first date snapshot (2023-01-01) - only CAD account data
        let total_snapshot_date1 = &sorted_snapshots[0];
        assert_eq!(total_snapshot_date1.account_id, PORTFOLIO_TOTAL_ACCOUNT_ID);
        assert_eq!(total_snapshot_date1.snapshot_date, target_date1);
        assert_eq!(total_snapshot_date1.currency, base_portfolio_currency);
        assert_eq!(
            total_snapshot_date1.cash_balances.len(),
            1,
            "Date1 snapshot should have 1 cash currency"
        );
        assert_eq!(
            total_snapshot_date1.cash_balances.get("CAD"),
            Some(&dec!(1000))
        );
        assert_eq!(
            total_snapshot_date1.positions.len(),
            1,
            "Date1 snapshot should have 1 position"
        );
        let total_pos_tse = total_snapshot_date1.positions.get("TSE.TO").unwrap();
        assert_eq!(total_pos_tse.quantity, dec!(10));
        assert_eq!(total_pos_tse.total_cost_basis, dec!(500));
        assert_eq!(total_pos_tse.currency, "CAD");
        assert_eq!(total_snapshot_date1.net_contribution, dec!(1000));
        assert_eq!(total_snapshot_date1.cost_basis, dec!(500));

        // Verify second date snapshot (2023-01-05) - should have BOTH accounts' data (carry-forward logic)
        let total_snapshot_date2 = &sorted_snapshots[1];
        assert_eq!(total_snapshot_date2.account_id, PORTFOLIO_TOTAL_ACCOUNT_ID);
        assert_eq!(total_snapshot_date2.snapshot_date, target_date2);
        assert_eq!(total_snapshot_date2.currency, base_portfolio_currency);
        assert_eq!(
            total_snapshot_date2.cash_balances.len(),
            2,
            "Date2 snapshot should have 2 cash currencies"
        );
        assert_eq!(
            total_snapshot_date2.cash_balances.get("USD"),
            Some(&dec!(500))
        );
        assert_eq!(
            total_snapshot_date2.cash_balances.get("CAD"),
            Some(&dec!(1000))
        );
        assert_eq!(
            total_snapshot_date2.positions.len(),
            2,
            "Date2 snapshot should have 2 positions"
        );

        // Verify TSE position (carried forward from date1)
        let total_pos_tse_date2 = total_snapshot_date2.positions.get("TSE.TO").unwrap();
        assert_eq!(total_pos_tse_date2.quantity, dec!(10));
        assert_eq!(total_pos_tse_date2.total_cost_basis, dec!(500));
        assert_eq!(total_pos_tse_date2.currency, "CAD");

        // Verify AAPL position (from date2)
        let total_pos_aapl = total_snapshot_date2.positions.get("AAPL").unwrap();
        assert_eq!(total_pos_aapl.quantity, dec!(5));
        assert_eq!(total_pos_aapl.total_cost_basis, dec!(750));
        assert_eq!(total_pos_aapl.currency, "USD");

        // Verify currency conversions for date2 - should include both accounts
        let expected_net_contribution_date2 = dec!(1000) + (dec!(600) * dec!(1.30)); // CAD + USD converted
        assert_eq!(
            total_snapshot_date2
                .net_contribution
                .round_dp(DECIMAL_PRECISION),
            expected_net_contribution_date2.round_dp(DECIMAL_PRECISION)
        );
        let expected_cost_basis_date2 = dec!(500) + (dec!(750) * dec!(1.30)); // CAD + USD converted
        assert_eq!(
            total_snapshot_date2.cost_basis.round_dp(DECIMAL_PRECISION),
            expected_cost_basis_date2.round_dp(DECIMAL_PRECISION)
        );
    }

    #[tokio::test]
    async fn total_portfolio_snapshot_merges_lots() {
        let base_portfolio_currency = "USD";
        let target_date_str = "2023-02-01";
        let target_date = NaiveDate::parse_from_str(target_date_str, "%Y-%m-%d").unwrap();

        let mut mock_account_repo_instance = MockAccountRepository::new();
        let acc1 = create_test_account("acc1", "USD", "USD Account 1");
        let acc2 = create_test_account("acc2", "USD", "USD Account 2");
        mock_account_repo_instance.add_account(acc1.clone());
        mock_account_repo_instance.add_account(acc2.clone());
        let mock_account_repo_arc = Arc::new(mock_account_repo_instance);

        let mock_activity_repo_arc = Arc::new(MockActivityRepository::new());
        let mock_fx_service_arc = Arc::new(MockFxService::new());
        let mock_snapshot_repo = MockSnapshotRepository::new();

        let lot1 = Lot {
            id: "LOT1".to_string(),
            position_id: format!("pos_AAPL_{}", acc1.id),
            acquisition_date: DateTime::<Utc>::from_naive_utc_and_offset(
                target_date.and_hms_opt(0, 0, 0).unwrap(),
                Utc,
            ),
            quantity: dec!(3),
            cost_basis: dec!(300),
            acquisition_price: dec!(100),
            acquisition_fees: dec!(0),
        };

        let lot2 = Lot {
            id: "LOT2".to_string(),
            position_id: format!("pos_AAPL_{}", acc2.id),
            acquisition_date: DateTime::<Utc>::from_naive_utc_and_offset(
                target_date
                    .succ_opt()
                    .unwrap()
                    .and_hms_opt(0, 0, 0)
                    .unwrap(),
                Utc,
            ),
            quantity: dec!(2),
            cost_basis: dec!(220),
            acquisition_price: dec!(110),
            acquisition_fees: dec!(0),
        };

        let mut snap1 = create_blank_snapshot(&acc1.id, &acc1.currency, target_date_str);
        snap1.positions.insert(
            "AAPL".to_string(),
            Position {
                id: format!("pos_AAPL_{}", acc1.id),
                account_id: acc1.id.clone(),
                asset_id: "AAPL".to_string(),
                currency: "USD".to_string(),
                quantity: dec!(3),
                average_cost: dec!(100),
                total_cost_basis: dec!(300),
                lots: VecDeque::from(vec![lot1.clone()]),
                inception_date: lot1.acquisition_date,
                created_at: Utc::now(),
                last_updated: Utc::now(),
            },
        );

        let mut snap2 = create_blank_snapshot(&acc2.id, &acc2.currency, target_date_str);
        snap2.positions.insert(
            "AAPL".to_string(),
            Position {
                id: format!("pos_AAPL_{}", acc2.id),
                account_id: acc2.id.clone(),
                asset_id: "AAPL".to_string(),
                currency: "USD".to_string(),
                quantity: dec!(2),
                average_cost: dec!(110),
                total_cost_basis: dec!(220),
                lots: VecDeque::from(vec![lot2.clone()]),
                inception_date: lot2.acquisition_date,
                created_at: Utc::now(),
                last_updated: Utc::now(),
            },
        );

        mock_snapshot_repo.add_snapshots(vec![snap1, snap2]);
        let mock_snapshot_repo_arc = Arc::new(mock_snapshot_repo);
        let base_currency_arc = Arc::new(RwLock::new(base_portfolio_currency.to_string()));

        let mock_asset_repo = Arc::new(MockAssetRepository::new());
        let snapshot_service = SnapshotService::new(
            base_currency_arc.clone(),
            mock_account_repo_arc.clone(),
            mock_activity_repo_arc,
            mock_snapshot_repo_arc.clone(),
            mock_asset_repo,
            mock_fx_service_arc.clone(),
        );

        let result = snapshot_service.calculate_total_portfolio_snapshots().await;
        assert!(result.is_ok());

        let saved_snapshots = mock_snapshot_repo_arc.get_saved_snapshots();
        assert_eq!(saved_snapshots.len(), 1);

        let total_snapshot = &saved_snapshots[0];
        let total_pos = total_snapshot.positions.get("AAPL").unwrap();
        assert_eq!(total_pos.quantity, dec!(5));
        assert_eq!(total_pos.total_cost_basis, dec!(520));
        assert_eq!(total_pos.lots.len(), 2);
        assert_eq!(
            total_pos.inception_date,
            DateTime::<Utc>::from_naive_utc_and_offset(
                target_date.and_hms_opt(0, 0, 0).unwrap(),
                Utc
            )
        );

        let expected_position_id = format!("AAPL_{}", PORTFOLIO_TOTAL_ACCOUNT_ID);
        assert!(total_pos
            .lots
            .iter()
            .all(|lot| lot.position_id == expected_position_id));
        assert!(total_pos.lots.iter().any(|lot| lot.id == lot1.id));
        assert!(total_pos.lots.iter().any(|lot| lot.id == lot2.id));
        assert_eq!(total_pos.average_cost, dec!(104));
    }

    #[tokio::test]
    async fn test_calculate_holdings_snapshots_persists() {
        let base_currency_arc = Arc::new(RwLock::new("CAD".to_string()));

        // one CAD account
        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "CAD", "Test ACC");
        account_repo.add_account(acc.clone());
        let account_repo = Arc::new(account_repo);

        // two deposit activities
        let d1 = NaiveDate::from_ymd_opt(2025, 5, 8).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 6, 1).unwrap();
        let act1 = Activity {
            id: "act1".into(),
            account_id: acc.id.clone(),
            asset_id: "$CASH-CAD".into(),
            activity_type: "DEPOSIT".into(),
            activity_date: DateTime::from_naive_utc_and_offset(
                d1.and_hms_opt(0, 0, 0).unwrap(),
                Utc,
            ),
            quantity: Decimal::ZERO,
            unit_price: Decimal::ZERO,
            currency: "CAD".into(),
            fee: Decimal::ZERO,
            amount: Some(dec!(5000)),
            is_draft: false,
            comment: None,
            fx_rate: None,
            provider_type: None,
            external_provider_id: None,
            external_broker_id: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let act2 = Activity {
            id: "act2".into(),
            activity_date: DateTime::from_naive_utc_and_offset(
                d2.and_hms_opt(0, 0, 0).unwrap(),
                Utc,
            ),
            amount: Some(dec!(10000)),
            ..act1.clone()
        };
        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![act1, act2]));

        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base_currency_arc,
            account_repo.clone(),
            activity_repo.clone(),
            snapshot_repo.clone(),
            asset_repo,
            fx.clone(),
        );

        // should insert keyframes without error
        let saved = svc.calculate_holdings_snapshots(None).await.unwrap();
        assert!(saved >= 2, "at least two keyframes expected");
    }

    #[tokio::test]
    async fn test_calculate_holdings_snapshots_persists_keyframes() {
        let base = Arc::new(RwLock::new("CAD".to_string()));

        // one active CAD account
        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "CAD", "Cash‑Only");
        account_repo.add_account(acc.clone());

        // two DEPOSIT activities + 1 DIVIDEND (dividend shouldn't alter net_contribution)
        let d1 = NaiveDate::from_ymd_opt(2025, 5, 8).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 6, 1).unwrap();
        let ts = |d: NaiveDate| {
            DateTime::from_naive_utc_and_offset(d.and_hms_opt(0, 0, 0).unwrap(), Utc)
        };
        let deposit = |id, date, amt| Activity {
            id,
            account_id: acc.id.clone(),
            asset_id: "$CASH-CAD".into(),
            activity_type: "DEPOSIT".into(),
            activity_date: ts(date),
            quantity: Decimal::ZERO,
            unit_price: Decimal::ZERO,
            currency: "CAD".into(),
            fee: Decimal::ZERO,
            amount: Some(amt),
            is_draft: false,
            comment: None,
            fx_rate: None,
            provider_type: None,
            external_provider_id: None,
            external_broker_id: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let mut dividend = deposit("div1".into(), d2, dec!(100000));
        dividend.activity_type = "DIVIDEND".into();

        let act_repo = Arc::new(MockActivityRepositoryWithData::new(vec![
            deposit("dep1".into(), d1, dec!(5000)),
            dividend,
            deposit("dep2".into(), d2, dec!(10000)),
        ]));

        let fx = Arc::new(MockFxService::new());
        let snaps = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base.clone(),
            Arc::new(account_repo),
            act_repo,
            snaps.clone(),
            asset_repo,
            fx,
        );

        // should compile & run without type errors and save ≥ 1 frame
        let saved = svc.calculate_holdings_snapshots(None).await.unwrap();
        assert!(saved >= 1, "expected at least one keyframe saved");

        // dividend must NOT change net_contribution, but other activities (like deposits) should.
        let frames = snaps.get_saved_snapshots();
        let mut frames_sorted = frames.clone();
        frames_sorted.sort_by_key(|s| s.snapshot_date);

        assert_eq!(
            frames_sorted.len(),
            2,
            "Expected exactly two keyframes for the two activity dates."
        );

        // First keyframe from the first deposit
        let first_frame = &frames_sorted[0];
        assert_eq!(
            first_frame.net_contribution,
            dec!(5000),
            "First keyframe should only reflect the first deposit."
        );
        assert_eq!(first_frame.snapshot_date, d1);

        // Second keyframe should include the second deposit, but the dividend should have no impact on net contribution.
        let second_frame = &frames_sorted[1];
        assert_eq!(second_frame.net_contribution, dec!(15000), "Second keyframe should reflect both deposits, ignoring the dividend for net contribution calculation.");
        assert_eq!(second_frame.snapshot_date, d2);
    }
}
