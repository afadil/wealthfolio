#[cfg(test)]
mod tests {
    use async_trait::async_trait;
    use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::{HashMap, HashSet, VecDeque};
    use std::sync::{Arc, RwLock};

    use crate::accounts::{Account, AccountRepositoryTrait, AccountUpdate, NewAccount};
    use crate::activities::{
        Activity, ActivityRepositoryTrait, ActivitySearchResponse, ActivityStatus, ActivityUpdate,
        ImportMapping as ActivityImportMapping, IncomeData as ActivityIncomeData, NewActivity,
        Sort as ActivitySort,
    };
    use crate::assets::{Asset, AssetKind, AssetRepositoryTrait, NewAsset, PricingMode, UpdateAssetProfile};
    use crate::constants::{DECIMAL_PRECISION, PORTFOLIO_TOTAL_ACCOUNT_ID};
    use crate::errors::{Error, Result as AppResult};
    use crate::fx::{ExchangeRate, FxServiceTrait, NewExchangeRate};
    use crate::portfolio::snapshot::{
        AccountStateSnapshot, Lot, Position, SnapshotRepositoryTrait, SnapshotService,
        SnapshotServiceTrait,
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
                    kind: AssetKind::Security,
                    name: Some("Apple Inc.".to_string()),
                    symbol: "AAPL".to_string(),
                    exchange_mic: None,
                    currency: "USD".to_string(), // USD listing
                    pricing_mode: PricingMode::Market,
                    preferred_provider: None,
                    provider_overrides: None,
                    notes: None,
                    metadata: None,
                    is_active: true,
                    created_at: chrono::Utc::now().naive_utc(),
                    updated_at: chrono::Utc::now().naive_utc(),
                },
            );

            assets.insert(
                "SHOP".to_string(),
                Asset {
                    id: "SHOP".to_string(),
                    kind: AssetKind::Security,
                    name: Some("Shopify Inc.".to_string()),
                    symbol: "SHOP".to_string(),
                    exchange_mic: None,
                    currency: "CAD".to_string(), // CAD listing
                    pricing_mode: PricingMode::Market,
                    preferred_provider: None,
                    provider_overrides: None,
                    notes: None,
                    metadata: None,
                    is_active: true,
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

        async fn update_pricing_mode(
            &self,
            _asset_id: &str,
            _pricing_mode: &str,
        ) -> AppResult<Asset> {
            unimplemented!("update_pricing_mode not implemented for MockAssetRepository")
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

        fn search_by_symbol(&self, _query: &str) -> AppResult<Vec<Asset>> {
            Ok(Vec::new())
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
        async fn create(&self, _new_account: NewAccount) -> AppResult<Account> {
            unimplemented!("MockAccountRepository::create not suitable for simple mock")
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
            account_number: None,
            meta: None,
            provider: None,
            provider_account_id: None,
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

    /// Helper to create test activities with the new Activity model
    fn create_test_activity(
        id: &str,
        account_id: &str,
        asset_id: Option<&str>,
        activity_type: &str,
        date: NaiveDate,
        quantity: Option<Decimal>,
        unit_price: Option<Decimal>,
        amount: Option<Decimal>,
        currency: &str,
    ) -> Activity {
        Activity {
            id: id.to_string(),
            account_id: account_id.to_string(),
            asset_id: asset_id.map(String::from),
            activity_type: activity_type.to_string(),
            activity_type_override: None,
            source_type: None,
            subtype: None,
            status: ActivityStatus::Posted,
            activity_date: DateTime::from_naive_utc_and_offset(
                date.and_hms_opt(0, 0, 0).unwrap(),
                Utc,
            ),
            settlement_date: None,
            quantity,
            unit_price,
            amount,
            fee: Some(Decimal::ZERO),
            currency: currency.to_string(),
            fx_rate: None,
            notes: None,
            metadata: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
            idempotency_key: None,
            import_run_id: None,
            is_user_modified: false,
            needs_review: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
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
            is_alternative: false,
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
            is_alternative: false,
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
            fx_rate_to_position: None,
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
            fx_rate_to_position: None,
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
                is_alternative: false,
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
                is_alternative: false,
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
        let act1 = create_test_activity(
            "act1",
            &acc.id,
            Some("$CASH-CAD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "CAD",
        );
        let act2 = create_test_activity(
            "act2",
            &acc.id,
            Some("$CASH-CAD"),
            "DEPOSIT",
            d2,
            None,
            None,
            Some(dec!(10000)),
            "CAD",
        );
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
        let acc = create_test_account("acc1", "CAD", "Cash-Only");
        account_repo.add_account(acc.clone());

        // two DEPOSIT activities + 1 DIVIDEND (dividend shouldn't alter net_contribution)
        let d1 = NaiveDate::from_ymd_opt(2025, 5, 8).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 6, 1).unwrap();

        let dep1 = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-CAD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "CAD",
        );
        let dividend = create_test_activity(
            "div1",
            &acc.id,
            Some("$CASH-CAD"),
            "DIVIDEND",
            d2,
            None,
            None,
            Some(dec!(100000)),
            "CAD",
        );
        let dep2 = create_test_activity(
            "dep2",
            &acc.id,
            Some("$CASH-CAD"),
            "DEPOSIT",
            d2,
            None,
            None,
            Some(dec!(10000)),
            "CAD",
        );

        let act_repo = Arc::new(MockActivityRepositoryWithData::new(vec![
            dep1, dividend, dep2,
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

        // should compile & run without type errors and save >= 1 frame
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

    // ==================== BUY ACTIVITY TESTS ====================

    #[tokio::test]
    async fn test_buy_activity_creates_position_and_updates_cash() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        // Deposit first to have cash
        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(10000)),
            "USD",
        );

        // Buy 10 shares of AAPL at $150
        let buy = create_test_activity(
            "buy1",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d1,
            Some(dec!(10)),
            Some(dec!(150)),
            Some(dec!(1500)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![deposit, buy]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let saved = svc.calculate_holdings_snapshots(None).await.unwrap();
        assert!(saved >= 1);

        let frames = snapshot_repo.get_saved_snapshots();
        assert!(!frames.is_empty());

        let frame = &frames[0];
        // Check position created
        assert!(frame.positions.contains_key("AAPL"));
        let pos = frame.positions.get("AAPL").unwrap();
        assert_eq!(pos.quantity, dec!(10));
        assert_eq!(pos.total_cost_basis, dec!(1500));
        assert_eq!(pos.average_cost, dec!(150));

        // Check cash balance reduced (10000 deposit - 1500 buy = 8500)
        assert_eq!(frame.cash_balances.get("USD"), Some(&dec!(8500)));

        // Net contribution should be 10000 (only deposit counts)
        assert_eq!(frame.net_contribution, dec!(10000));
    }

    // ==================== SELL ACTIVITY TESTS ====================

    #[tokio::test]
    async fn test_sell_activity_reduces_position_and_increases_cash() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        // Deposit and buy first
        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(10000)),
            "USD",
        );

        let buy = create_test_activity(
            "buy1",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d1,
            Some(dec!(10)),
            Some(dec!(150)),
            Some(dec!(1500)),
            "USD",
        );

        // Sell 5 shares at $180
        let sell = create_test_activity(
            "sell1",
            &acc.id,
            Some("AAPL"),
            "SELL",
            d2,
            Some(dec!(5)),
            Some(dec!(180)),
            Some(dec!(900)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![
            deposit, buy, sell,
        ]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        // Should have 2 keyframes (d1 and d2)
        assert_eq!(sorted.len(), 2);

        let frame_d2 = &sorted[1];
        assert_eq!(frame_d2.snapshot_date, d2);

        // Position should be reduced
        let pos = frame_d2.positions.get("AAPL").unwrap();
        assert_eq!(pos.quantity, dec!(5));
        // Cost basis reduced proportionally (5 shares * $150 avg = $750)
        assert_eq!(pos.total_cost_basis, dec!(750));

        // Cash should be 8500 + 900 = 9400
        assert_eq!(frame_d2.cash_balances.get("USD"), Some(&dec!(9400)));

        // Net contribution unchanged by sell
        assert_eq!(frame_d2.net_contribution, dec!(10000));
    }

    // ==================== WITHDRAWAL ACTIVITY TESTS ====================

    #[tokio::test]
    async fn test_withdrawal_reduces_cash_and_net_contribution() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(10000)),
            "USD",
        );

        let withdrawal = create_test_activity(
            "wd1",
            &acc.id,
            Some("$CASH-USD"),
            "WITHDRAWAL",
            d2,
            None,
            None,
            Some(dec!(3000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![
            deposit, withdrawal,
        ]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        let frame_d2 = &sorted[1];
        assert_eq!(frame_d2.snapshot_date, d2);

        // Cash reduced
        assert_eq!(frame_d2.cash_balances.get("USD"), Some(&dec!(7000)));

        // Net contribution reduced by withdrawal
        assert_eq!(frame_d2.net_contribution, dec!(7000));
    }

    // ==================== INCOME ACTIVITY TESTS (Dividend, Interest) ====================

    #[tokio::test]
    async fn test_dividend_increases_cash_but_not_net_contribution() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let dividend = create_test_activity(
            "div1",
            &acc.id,
            Some("AAPL"),
            "DIVIDEND",
            d2,
            None,
            None,
            Some(dec!(100)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![deposit, dividend]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        let frame_d2 = &sorted[1];

        // Cash increased by dividend
        assert_eq!(frame_d2.cash_balances.get("USD"), Some(&dec!(5100)));

        // Net contribution NOT affected by dividend
        assert_eq!(frame_d2.net_contribution, dec!(5000));
    }

    #[tokio::test]
    async fn test_interest_increases_cash_but_not_net_contribution() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let interest = create_test_activity(
            "int1",
            &acc.id,
            Some("$CASH-USD"),
            "INTEREST",
            d2,
            None,
            None,
            Some(dec!(50)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![deposit, interest]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        let frame_d2 = &sorted[1];

        // Cash increased by interest
        assert_eq!(frame_d2.cash_balances.get("USD"), Some(&dec!(5050)));

        // Net contribution NOT affected by interest
        assert_eq!(frame_d2.net_contribution, dec!(5000));
    }

    // ==================== FEE AND TAX ACTIVITY TESTS ====================

    #[tokio::test]
    async fn test_fee_reduces_cash_but_not_net_contribution() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let fee = create_test_activity(
            "fee1",
            &acc.id,
            Some("$CASH-USD"),
            "FEE",
            d2,
            None,
            None,
            Some(dec!(25)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![deposit, fee]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        let frame_d2 = &sorted[1];

        // Cash reduced by fee
        assert_eq!(frame_d2.cash_balances.get("USD"), Some(&dec!(4975)));

        // Net contribution NOT affected by fee
        assert_eq!(frame_d2.net_contribution, dec!(5000));
    }

    #[tokio::test]
    async fn test_tax_reduces_cash_but_not_net_contribution() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let tax = create_test_activity(
            "tax1",
            &acc.id,
            Some("$CASH-USD"),
            "TAX",
            d2,
            None,
            None,
            Some(dec!(100)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![deposit, tax]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        let frame_d2 = &sorted[1];

        // Cash reduced by tax
        assert_eq!(frame_d2.cash_balances.get("USD"), Some(&dec!(4900)));

        // Net contribution NOT affected by tax
        assert_eq!(frame_d2.net_contribution, dec!(5000));
    }

    // ==================== TRANSFER ACTIVITY TESTS ====================

    #[tokio::test]
    async fn test_transfer_in_asset_adds_position() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        // Transfer in 20 shares of AAPL valued at $160 each
        let transfer_in = create_test_activity(
            "tin1",
            &acc.id,
            Some("AAPL"),
            "TRANSFER_IN",
            d1,
            Some(dec!(20)),
            Some(dec!(160)),
            Some(dec!(3200)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![transfer_in]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        assert!(!frames.is_empty());

        let frame = &frames[0];
        let pos = frame.positions.get("AAPL").unwrap();
        assert_eq!(pos.quantity, dec!(20));
        assert_eq!(pos.total_cost_basis, dec!(3200));

        // Internal transfer by default - no net contribution change
        assert_eq!(frame.net_contribution, dec!(0));
    }

    #[tokio::test]
    async fn test_transfer_out_asset_removes_position() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        // Transfer in first
        let transfer_in = create_test_activity(
            "tin1",
            &acc.id,
            Some("AAPL"),
            "TRANSFER_IN",
            d1,
            Some(dec!(20)),
            Some(dec!(160)),
            Some(dec!(3200)),
            "USD",
        );

        // Transfer out 10 shares
        let transfer_out = create_test_activity(
            "tout1",
            &acc.id,
            Some("AAPL"),
            "TRANSFER_OUT",
            d2,
            Some(dec!(10)),
            Some(dec!(160)),
            Some(dec!(1600)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![
            transfer_in,
            transfer_out,
        ]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        let frame_d2 = &sorted[1];
        let pos = frame_d2.positions.get("AAPL").unwrap();
        assert_eq!(pos.quantity, dec!(10));
        assert_eq!(pos.total_cost_basis, dec!(1600));
    }

    // ==================== SPLIT ACTIVITY TESTS ====================

    #[tokio::test]
    async fn test_split_adjusts_historical_quantities() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 20).unwrap();

        // Buy 10 shares at $200
        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(10000)),
            "USD",
        );

        let buy = create_test_activity(
            "buy1",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d1,
            Some(dec!(10)),
            Some(dec!(200)),
            Some(dec!(2000)),
            "USD",
        );

        // 2:1 split (ratio = 2) - each share becomes 2 shares
        let split = create_test_activity(
            "split1",
            &acc.id,
            Some("AAPL"),
            "SPLIT",
            d2,
            None,
            None,
            Some(dec!(2)), // Split ratio
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![
            deposit, buy, split,
        ]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        // After the split, position should have 20 shares (10 * 2)
        // The buy activity was adjusted for the split
        let frame_d2 = &sorted[1];
        let pos = frame_d2.positions.get("AAPL").unwrap();
        assert_eq!(pos.quantity, dec!(20), "Position should be split-adjusted");

        // Cost basis stays the same
        assert_eq!(pos.total_cost_basis, dec!(2000));

        // Average cost should be halved (200 / 2 = 100)
        assert_eq!(pos.average_cost, dec!(100));
    }

    // ==================== FX CONVERSION TESTS ====================

    #[tokio::test]
    async fn test_cross_currency_buy_with_fx_rate() {
        let base = Arc::new(RwLock::new("CAD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "CAD", "CAD Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        // Deposit CAD
        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-CAD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(10000)),
            "CAD",
        );

        // Buy AAPL (USD asset) with CAD account - activity has fx_rate
        let mut buy = create_test_activity(
            "buy1",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d1,
            Some(dec!(10)),
            Some(dec!(150)),  // USD price
            Some(dec!(1500)), // USD amount
            "USD",
        );
        buy.fx_rate = Some(dec!(1.35)); // 1 USD = 1.35 CAD

        let mut fx = MockFxService::new();
        fx.add_bidirectional_rate("USD", "CAD", d1, dec!(1.35));

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![deposit, buy]));
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            Arc::new(fx),
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        assert!(!frames.is_empty());

        let frame = &frames[0];

        // Position created in USD (asset currency)
        let pos = frame.positions.get("AAPL").unwrap();
        assert_eq!(pos.quantity, dec!(10));
        assert_eq!(pos.currency, "USD");
        assert_eq!(pos.total_cost_basis, dec!(1500)); // USD cost basis

        // Cash is debited in activity currency (USD)
        // CAD cash unchanged by USD activity, USD cash debited
        assert_eq!(frame.cash_balances.get("CAD"), Some(&dec!(10000)));
        assert_eq!(frame.cash_balances.get("USD"), Some(&dec!(-1500)));
    }

    // ==================== MULTI-ACCOUNT TESTS ====================

    #[tokio::test]
    async fn test_multiple_accounts_calculated_independently() {
        let base = Arc::new(RwLock::new("CAD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc1 = create_test_account("acc1", "CAD", "CAD Account");
        let acc2 = create_test_account("acc2", "USD", "USD Account");
        account_repo.add_account(acc1.clone());
        account_repo.add_account(acc2.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        let dep1 = create_test_activity(
            "dep1",
            &acc1.id,
            Some("$CASH-CAD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "CAD",
        );

        let dep2 = create_test_activity(
            "dep2",
            &acc2.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(3000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep1, dep2]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        // Use get_snapshots_by_account instead of get_saved_snapshots since
        // the mock clears saved_snapshots on each save operation
        let acc1_frames = snapshot_repo
            .get_snapshots_by_account("acc1", None, None)
            .unwrap();
        let acc2_frames = snapshot_repo
            .get_snapshots_by_account("acc2", None, None)
            .unwrap();

        // Each account should have its own snapshot
        assert!(!acc1_frames.is_empty(), "acc1 should have snapshots");
        assert!(!acc2_frames.is_empty(), "acc2 should have snapshots");

        let acc1_frame = &acc1_frames[0];
        let acc2_frame = &acc2_frames[0];

        assert_eq!(acc1_frame.cash_balances.get("CAD"), Some(&dec!(5000)));
        assert_eq!(acc1_frame.currency, "CAD");

        assert_eq!(acc2_frame.cash_balances.get("USD"), Some(&dec!(3000)));
        assert_eq!(acc2_frame.currency, "USD");
    }

    // ==================== KEYFRAME TESTS ====================

    #[tokio::test]
    async fn test_keyframes_created_only_on_activity_days() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        // Activities on non-consecutive days
        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap(); // 5 days gap
        let d3 = NaiveDate::from_ymd_opt(2025, 1, 20).unwrap(); // 5 days gap

        let dep1 = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(1000)),
            "USD",
        );

        let dep2 = create_test_activity(
            "dep2",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d2,
            None,
            None,
            Some(dec!(2000)),
            "USD",
        );

        let dep3 = create_test_activity(
            "dep3",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d3,
            None,
            None,
            Some(dec!(3000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep1, dep2, dep3]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();

        // Should only have 3 keyframes (one per activity day)
        assert_eq!(frames.len(), 3);

        let dates: HashSet<NaiveDate> = frames.iter().map(|f| f.snapshot_date).collect();
        assert!(dates.contains(&d1));
        assert!(dates.contains(&d2));
        assert!(dates.contains(&d3));

        // No keyframes for days in between
        let d_between = NaiveDate::from_ymd_opt(2025, 1, 12).unwrap();
        assert!(!dates.contains(&d_between));
    }

    // ==================== GET DAILY HOLDINGS SNAPSHOTS TESTS ====================

    #[tokio::test]
    async fn test_get_daily_holdings_snapshots_fills_gaps() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let dep1 = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let dep2 = create_test_activity(
            "dep2",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d2,
            None,
            None,
            Some(dec!(2000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep1, dep2]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        // First calculate to create keyframes
        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        // Now get daily snapshots with gap filling
        let daily = svc
            .get_daily_holdings_snapshots(&acc.id, Some(d1), Some(d2))
            .unwrap();

        // Should have 6 days (Jan 10-15 inclusive)
        assert_eq!(daily.len(), 6);

        // All days should be present
        let dates: Vec<NaiveDate> = daily.iter().map(|s| s.snapshot_date).collect();
        assert_eq!(dates[0], d1);
        assert_eq!(dates[5], d2);

        // Gap days (Jan 11-14) should carry forward d1's value
        for i in 1..5 {
            assert_eq!(
                daily[i].cash_balances.get("USD"),
                Some(&dec!(5000)),
                "Day {} should carry forward",
                i
            );
        }

        // Final day should have cumulative deposits
        assert_eq!(daily[5].cash_balances.get("USD"), Some(&dec!(7000)));
    }

    // ==================== GET HOLDINGS KEYFRAMES TESTS ====================

    #[tokio::test]
    async fn test_get_holdings_keyframes_returns_only_saved() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let dep1 = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let dep2 = create_test_activity(
            "dep2",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d2,
            None,
            None,
            Some(dec!(2000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep1, dep2]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        // Get keyframes only (no gap filling)
        let keyframes = svc
            .get_holdings_keyframes(&acc.id, Some(d1), Some(d2))
            .unwrap();

        // Should have exactly 2 keyframes (activity days only)
        assert_eq!(keyframes.len(), 2);
        assert_eq!(keyframes[0].snapshot_date, d1);
        assert_eq!(keyframes[1].snapshot_date, d2);
    }

    // ==================== FORCE RECALCULATE TESTS ====================

    #[tokio::test]
    async fn test_force_recalculate_clears_and_rebuilds() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        let dep1 = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep1]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        // First calculation
        let first_count = svc.calculate_holdings_snapshots(None).await.unwrap();
        assert!(first_count >= 1);

        // Force recalculation
        let second_count = svc
            .force_recalculate_holdings_snapshots(None)
            .await
            .unwrap();
        assert!(second_count >= 1);

        // Should still have same number of keyframes
        let frames = snapshot_repo.get_saved_snapshots();
        assert!(!frames.is_empty());
        assert_eq!(frames[0].cash_balances.get("USD"), Some(&dec!(5000)));
    }

    // ==================== EDGE CASE TESTS ====================

    #[tokio::test]
    async fn test_empty_account_no_activities() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Empty Account");
        account_repo.add_account(acc.clone());

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let count = svc.calculate_holdings_snapshots(None).await.unwrap();
        assert_eq!(count, 0, "Empty account should create no keyframes");
    }

    #[tokio::test]
    async fn test_multiple_activities_same_day_processed_correctly() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        // Multiple activities on same day
        let dep = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(10000)),
            "USD",
        );

        let buy = create_test_activity(
            "buy1",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d1,
            Some(dec!(10)),
            Some(dec!(150)),
            Some(dec!(1500)),
            "USD",
        );

        let fee = create_test_activity(
            "fee1",
            &acc.id,
            Some("$CASH-USD"),
            "FEE",
            d1,
            None,
            None,
            Some(dec!(10)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep, buy, fee]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        assert_eq!(frames.len(), 1); // Single keyframe for the day

        let frame = &frames[0];
        // All activities processed: 10000 - 1500 - 10 = 8490
        assert_eq!(frame.cash_balances.get("USD"), Some(&dec!(8490)));
        assert_eq!(frame.positions.get("AAPL").unwrap().quantity, dec!(10));
        assert_eq!(frame.net_contribution, dec!(10000)); // Only deposit counts
    }

    #[tokio::test]
    async fn test_get_latest_holdings_snapshot() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let dep1 = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let dep2 = create_test_activity(
            "dep2",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d2,
            None,
            None,
            Some(dec!(3000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep1, dep2]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let latest = svc.get_latest_holdings_snapshot(&acc.id).unwrap();
        assert!(latest.is_some());

        let snapshot = latest.unwrap();
        // Should be the most recent snapshot (d2)
        assert_eq!(snapshot.snapshot_date, d2);
        assert_eq!(snapshot.cash_balances.get("USD"), Some(&dec!(8000)));
    }

    #[tokio::test]
    async fn test_no_account_returns_empty() {
        let base = Arc::new(RwLock::new("USD".to_string()));
        let account_repo = MockAccountRepository::new(); // Empty
        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let count = svc.calculate_holdings_snapshots(None).await.unwrap();
        assert_eq!(count, 0);
    }

    // ==================== CASH TOTAL CALCULATION TESTS ====================

    #[tokio::test]
    async fn test_cash_total_account_currency_calculated() {
        let base = Arc::new(RwLock::new("CAD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "CAD", "CAD Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        // Deposit in CAD (account currency)
        let dep_cad = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-CAD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "CAD",
        );

        // Deposit in USD (different from account currency)
        let dep_usd = create_test_activity(
            "dep2",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(1000)),
            "USD",
        );

        let mut fx = MockFxService::new();
        fx.add_bidirectional_rate("USD", "CAD", d1, dec!(1.35));

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep_cad, dep_usd]));
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            Arc::new(fx),
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let frame = &frames[0];

        // cash_balances should have both currencies
        assert_eq!(frame.cash_balances.get("CAD"), Some(&dec!(5000)));
        assert_eq!(frame.cash_balances.get("USD"), Some(&dec!(1000)));

        // cash_total_account_currency should be sum converted to CAD
        // 5000 CAD + 1000 USD * 1.35 = 5000 + 1350 = 6350
        assert_eq!(
            frame.cash_total_account_currency.round_dp(2),
            dec!(6350).round_dp(2)
        );
    }

    // ==================== POSITION LOT TESTS ====================

    #[tokio::test]
    async fn test_buy_creates_lot_with_correct_details() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(10000)),
            "USD",
        );

        let buy = create_test_activity(
            "buy1",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d1,
            Some(dec!(10)),
            Some(dec!(150)),
            Some(dec!(1500)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![deposit, buy]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let frame = &frames[0];
        let pos = frame.positions.get("AAPL").unwrap();

        // Should have exactly one lot
        assert_eq!(pos.lots.len(), 1);

        let lot = &pos.lots[0];
        assert_eq!(lot.quantity, dec!(10));
        assert_eq!(lot.cost_basis, dec!(1500));
        assert_eq!(lot.acquisition_price, dec!(150));
    }

    #[tokio::test]
    async fn test_multiple_buys_create_multiple_lots() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(20000)),
            "USD",
        );

        let buy1 = create_test_activity(
            "buy1",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d1,
            Some(dec!(10)),
            Some(dec!(150)),
            Some(dec!(1500)),
            "USD",
        );

        let buy2 = create_test_activity(
            "buy2",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d2,
            Some(dec!(5)),
            Some(dec!(160)),
            Some(dec!(800)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![
            deposit, buy1, buy2,
        ]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo.get_saved_snapshots();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        let frame_d2 = &sorted[1];
        let pos = frame_d2.positions.get("AAPL").unwrap();

        // Should have two lots
        assert_eq!(pos.lots.len(), 2);
        assert_eq!(pos.quantity, dec!(15));
        assert_eq!(pos.total_cost_basis, dec!(2300)); // 1500 + 800

        // Average cost: 2300 / 15 = 153.33...
        // Round both sides to same precision for comparison
        let expected_avg = (dec!(2300) / dec!(15)).round_dp(DECIMAL_PRECISION);
        assert_eq!(pos.average_cost.round_dp(DECIMAL_PRECISION), expected_avg);
    }

    // ==================== SPECIFIC ACCOUNT CALCULATION TESTS ====================

    #[tokio::test]
    async fn test_calculate_specific_accounts_only() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc1 = create_test_account("acc1", "USD", "Account 1");
        let acc2 = create_test_account("acc2", "USD", "Account 2");
        account_repo.add_account(acc1.clone());
        account_repo.add_account(acc2.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();

        let dep1 = create_test_activity(
            "dep1",
            &acc1.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(5000)),
            "USD",
        );

        let dep2 = create_test_activity(
            "dep2",
            &acc2.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(3000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![dep1, dep2]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        // Calculate only for acc1
        let _ = svc
            .calculate_holdings_snapshots(Some(&["acc1".to_string()]))
            .await
            .unwrap();

        let frames = snapshot_repo.get_saved_snapshots();

        // Should only have snapshot for acc1
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].account_id, "acc1");
        assert_eq!(frames[0].cash_balances.get("USD"), Some(&dec!(5000)));
    }

    // ==================== COST BASIS TESTS ====================

    #[tokio::test]
    async fn test_cost_basis_aggregated_correctly() {
        let base = Arc::new(RwLock::new("USD".to_string()));

        let mut account_repo = MockAccountRepository::new();
        let acc = create_test_account("acc1", "USD", "Test Account");
        account_repo.add_account(acc.clone());

        let d1 = NaiveDate::from_ymd_opt(2025, 1, 10).unwrap();
        let d2 = NaiveDate::from_ymd_opt(2025, 1, 15).unwrap();

        let deposit = create_test_activity(
            "dep1",
            &acc.id,
            Some("$CASH-USD"),
            "DEPOSIT",
            d1,
            None,
            None,
            Some(dec!(50000)),
            "USD",
        );

        // Buy first lot of AAPL
        let buy_aapl1 = create_test_activity(
            "buy1",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d1,
            Some(dec!(10)),
            Some(dec!(150)),
            Some(dec!(1500)),
            "USD",
        );

        // Buy second lot of AAPL at different price
        let buy_aapl2 = create_test_activity(
            "buy2",
            &acc.id,
            Some("AAPL"),
            "BUY",
            d2,
            Some(dec!(20)),
            Some(dec!(100)),
            Some(dec!(2000)),
            "USD",
        );

        let activity_repo = Arc::new(MockActivityRepositoryWithData::new(vec![
            deposit, buy_aapl1, buy_aapl2,
        ]));
        let fx = Arc::new(MockFxService::new());
        let snapshot_repo = Arc::new(MockSnapshotRepository::new());
        let asset_repo = Arc::new(MockAssetRepository::new());

        let svc = SnapshotService::new(
            base,
            Arc::new(account_repo),
            activity_repo,
            snapshot_repo.clone(),
            asset_repo,
            fx,
        );

        let _ = svc.calculate_holdings_snapshots(None).await.unwrap();

        let frames = snapshot_repo
            .get_snapshots_by_account("acc1", None, None)
            .unwrap();
        let mut sorted = frames.clone();
        sorted.sort_by_key(|s| s.snapshot_date);

        // Check final snapshot (d2) has correct total cost basis
        let frame_d2 = &sorted[1];

        // Total cost basis should be sum of both lots
        // 1500 (first AAPL buy) + 2000 (second AAPL buy) = 3500
        assert_eq!(frame_d2.cost_basis, dec!(3500));

        // Verify the position details
        let pos = frame_d2.positions.get("AAPL").unwrap();
        assert_eq!(pos.quantity, dec!(30)); // 10 + 20
        assert_eq!(pos.total_cost_basis, dec!(3500)); // 1500 + 2000
    }
}
