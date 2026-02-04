#[cfg(test)]
mod tests {
    use crate::accounts::{Account, AccountServiceTrait, AccountUpdate, NewAccount};
    use crate::activities::activities_model::*;
    use crate::activities::{ActivityRepositoryTrait, ActivityService, ActivityServiceTrait};
    use crate::assets::{
        canonical_asset_id, Asset, AssetKind, AssetServiceTrait, PricingMode, ProviderProfile,
        UpdateAssetProfile,
    };
    use crate::errors::Result;
    use crate::fx::{ExchangeRate, FxServiceTrait, NewExchangeRate};
    use crate::quotes::service::ProviderInfo;
    use crate::quotes::{
        LatestQuotePair, Quote, QuoteImport, QuoteServiceTrait, QuoteSyncState, SymbolSearchResult,
        SymbolSyncPlan, SyncMode, SyncResult,
    };
    use async_trait::async_trait;
    use chrono::{DateTime, NaiveDate, Utc};
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::{HashMap, HashSet};
    use std::sync::{Arc, Mutex};

    // --- Mock AccountService ---
    #[derive(Clone)]
    struct MockAccountService {
        accounts: Arc<Mutex<Vec<Account>>>,
    }

    impl MockAccountService {
        fn new() -> Self {
            Self {
                accounts: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn add_account(&self, account: Account) {
            self.accounts.lock().unwrap().push(account);
        }
    }

    #[async_trait]
    impl AccountServiceTrait for MockAccountService {
        async fn create_account(&self, _new_account: NewAccount) -> Result<Account> {
            unimplemented!()
        }

        async fn update_account(&self, _account_update: AccountUpdate) -> Result<Account> {
            unimplemented!()
        }

        async fn delete_account(&self, _account_id: &str) -> Result<()> {
            unimplemented!()
        }

        fn get_account(&self, account_id: &str) -> Result<Account> {
            let accounts = self.accounts.lock().unwrap();
            accounts
                .iter()
                .find(|a| a.id == account_id)
                .cloned()
                .ok_or_else(|| crate::errors::Error::Unexpected("Account not found".to_string()))
        }

        fn list_accounts(
            &self,
            _active_only: Option<bool>,
            _is_archived_filter: Option<bool>,
            _account_ids: Option<&[String]>,
        ) -> Result<Vec<Account>> {
            Ok(self.accounts.lock().unwrap().clone())
        }

        fn get_all_accounts(&self) -> Result<Vec<Account>> {
            Ok(self.accounts.lock().unwrap().clone())
        }

        fn get_active_accounts(&self) -> Result<Vec<Account>> {
            Ok(self.accounts.lock().unwrap().clone())
        }

        fn get_accounts_by_ids(&self, _account_ids: &[String]) -> Result<Vec<Account>> {
            unimplemented!()
        }

        fn get_non_archived_accounts(&self) -> Result<Vec<Account>> {
            Ok(self.accounts.lock().unwrap().clone())
        }

        fn get_active_non_archived_accounts(&self) -> Result<Vec<Account>> {
            Ok(self.accounts.lock().unwrap().clone())
        }
    }

    // --- Mock AssetService ---
    #[derive(Clone)]
    struct MockAssetService {
        assets: Arc<Mutex<Vec<Asset>>>,
    }

    impl MockAssetService {
        fn new() -> Self {
            Self {
                assets: Arc::new(Mutex::new(Vec::new())),
            }
        }

        fn add_asset(&self, asset: Asset) {
            self.assets.lock().unwrap().push(asset);
        }
    }

    #[async_trait]
    impl AssetServiceTrait for MockAssetService {
        fn get_assets(&self) -> Result<Vec<Asset>> {
            Ok(self.assets.lock().unwrap().clone())
        }

        fn get_asset_by_id(&self, asset_id: &str) -> Result<Asset> {
            let assets = self.assets.lock().unwrap();
            assets
                .iter()
                .find(|a| a.id == asset_id)
                .cloned()
                .ok_or_else(|| crate::errors::Error::Unexpected("Asset not found".to_string()))
        }

        async fn delete_asset(&self, _asset_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn update_asset_profile(
            &self,
            _asset_id: &str,
            _payload: UpdateAssetProfile,
        ) -> Result<Asset> {
            unimplemented!()
        }

        async fn ensure_cash_asset(&self, currency: &str) -> Result<Asset> {
            let currency_upper = currency.to_uppercase();
            let asset_id =
                canonical_asset_id(&AssetKind::Cash, &currency_upper, None, &currency_upper);

            if let Ok(asset) = self.get_asset_by_id(&asset_id) {
                return Ok(asset);
            }

            let asset = Asset {
                id: asset_id,
                kind: AssetKind::Cash,
                symbol: currency_upper.clone(),
                currency: currency_upper,
                pricing_mode: PricingMode::None,
                is_active: true,
                ..Default::default()
            };
            self.add_asset(asset.clone());
            Ok(asset)
        }

        async fn update_pricing_mode(&self, _asset_id: &str, _pricing_mode: &str) -> Result<Asset> {
            // Return a dummy asset
            Ok(Asset::default())
        }

        async fn get_assets_by_asset_ids(&self, _asset_ids: &[String]) -> Result<Vec<Asset>> {
            unimplemented!()
        }

        async fn create_asset(&self, _new_asset: crate::assets::NewAsset) -> Result<Asset> {
            unimplemented!()
        }

        async fn get_or_create_minimal_asset(
            &self,
            asset_id: &str,
            _context_currency: Option<String>,
            _metadata: Option<crate::assets::AssetMetadata>,
            _pricing_mode_hint: Option<String>,
        ) -> Result<Asset> {
            self.get_asset_by_id(asset_id)
        }

        async fn enrich_asset_profile(&self, _asset_id: &str) -> Result<Asset> {
            unimplemented!()
        }

        async fn enrich_assets(&self, _asset_ids: Vec<String>) -> Result<(usize, usize, usize)> {
            Ok((0, 0, 0))
        }

        async fn cleanup_legacy_metadata(&self, _asset_id: &str) -> Result<()> {
            Ok(())
        }

        async fn merge_unknown_asset(
            &self,
            _resolved_asset_id: &str,
            _unknown_asset_id: &str,
            _activity_repository: &dyn crate::activities::ActivityRepositoryTrait,
        ) -> Result<u32> {
            Ok(0)
        }

        async fn ensure_assets(
            &self,
            specs: Vec<crate::assets::AssetSpec>,
            _activity_repository: &dyn crate::activities::ActivityRepositoryTrait,
        ) -> Result<crate::assets::EnsureAssetsResult> {
            let mut result = crate::assets::EnsureAssetsResult::default();
            let assets = self.assets.lock().unwrap();

            // Look up existing assets by spec ID
            for spec in specs {
                if let Some(asset) = assets.iter().find(|a| a.id == spec.id) {
                    result.assets.insert(spec.id, asset.clone());
                }
            }

            Ok(result)
        }
    }

    // --- Mock FxService ---
    #[derive(Clone, Default)]
    struct MockFxService {
        registered_pairs: Arc<Mutex<HashSet<(String, String)>>>,
    }

    impl MockFxService {
        fn new() -> Self {
            Self {
                registered_pairs: Arc::new(Mutex::new(HashSet::new())),
            }
        }

        fn get_registered_pairs(&self) -> HashSet<(String, String)> {
            self.registered_pairs.lock().unwrap().clone()
        }
    }

    #[async_trait]
    impl FxServiceTrait for MockFxService {
        fn initialize(&self) -> Result<()> {
            Ok(())
        }

        async fn add_exchange_rate(&self, _new_rate: NewExchangeRate) -> Result<ExchangeRate> {
            unimplemented!()
        }

        fn get_historical_rates(
            &self,
            _from_currency: &str,
            _to_currency: &str,
            _days: i64,
        ) -> Result<Vec<ExchangeRate>> {
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

        fn get_latest_exchange_rate(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<Decimal> {
            Ok(Decimal::ONE)
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
            _amount: Decimal,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<Decimal> {
            unimplemented!()
        }

        fn convert_currency_for_date(
            &self,
            _amount: Decimal,
            _from_currency: &str,
            _to_currency: &str,
            _date: NaiveDate,
        ) -> Result<Decimal> {
            unimplemented!()
        }

        fn get_latest_exchange_rates(&self) -> Result<Vec<ExchangeRate>> {
            unimplemented!()
        }

        async fn delete_exchange_rate(&self, _rate_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn register_currency_pair(
            &self,
            from_currency: &str,
            to_currency: &str,
        ) -> Result<()> {
            let mut pairs = self.registered_pairs.lock().unwrap();
            pairs.insert((from_currency.to_string(), to_currency.to_string()));
            Ok(())
        }

        async fn register_currency_pair_manual(
            &self,
            _from_currency: &str,
            _to_currency: &str,
        ) -> Result<()> {
            unimplemented!()
        }

        async fn ensure_fx_pairs(&self, pairs: Vec<(String, String)>) -> Result<()> {
            let mut registered = self.registered_pairs.lock().unwrap();
            for (from, to) in pairs {
                registered.insert((from, to));
            }
            Ok(())
        }
    }

    // --- Mock QuoteService ---
    #[derive(Clone, Default)]
    struct MockQuoteService;

    #[async_trait]
    impl QuoteServiceTrait for MockQuoteService {
        fn get_latest_quote(&self, _symbol: &str) -> Result<Quote> {
            unimplemented!()
        }

        fn get_latest_quotes(&self, _symbols: &[String]) -> Result<HashMap<String, Quote>> {
            unimplemented!()
        }

        fn get_latest_quotes_pair(
            &self,
            _symbols: &[String],
        ) -> Result<HashMap<String, LatestQuotePair>> {
            unimplemented!()
        }

        fn get_historical_quotes(&self, _symbol: &str) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        fn get_all_historical_quotes(&self) -> Result<HashMap<String, Vec<(NaiveDate, Quote)>>> {
            unimplemented!()
        }

        fn get_quotes_in_range(
            &self,
            _symbols: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        fn get_quotes_in_range_filled(
            &self,
            _symbols: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn get_daily_quotes(
            &self,
            _asset_ids: &HashSet<String>,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<HashMap<NaiveDate, HashMap<String, Quote>>> {
            unimplemented!()
        }

        async fn add_quote(&self, _quote: &Quote) -> Result<Quote> {
            unimplemented!()
        }

        async fn update_quote(&self, quote: Quote) -> Result<Quote> {
            Ok(quote)
        }

        async fn delete_quote(&self, _quote_id: &str) -> Result<()> {
            unimplemented!()
        }

        async fn bulk_upsert_quotes(&self, _quotes: Vec<Quote>) -> Result<usize> {
            unimplemented!()
        }

        async fn search_symbol(&self, _query: &str) -> Result<Vec<SymbolSearchResult>> {
            unimplemented!()
        }

        async fn search_symbol_with_currency(
            &self,
            _query: &str,
            _account_currency: Option<&str>,
        ) -> Result<Vec<SymbolSearchResult>> {
            unimplemented!()
        }

        async fn get_asset_profile(&self, _asset: &Asset) -> Result<ProviderProfile> {
            unimplemented!()
        }

        async fn fetch_quotes_from_provider(
            &self,
            _asset_id: &str,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn fetch_quotes_for_symbol(
            &self,
            _symbol: &str,
            _currency: &str,
            _start: NaiveDate,
            _end: NaiveDate,
        ) -> Result<Vec<Quote>> {
            unimplemented!()
        }

        async fn sync(
            &self,
            _mode: SyncMode,
            _asset_ids: Option<Vec<String>>,
        ) -> Result<SyncResult> {
            unimplemented!()
        }

        async fn resync(&self, _asset_ids: Option<Vec<String>>) -> Result<SyncResult> {
            unimplemented!()
        }

        async fn refresh_sync_state(&self) -> Result<()> {
            unimplemented!()
        }

        fn get_sync_plan(&self) -> Result<Vec<SymbolSyncPlan>> {
            unimplemented!()
        }

        async fn handle_activity_created(
            &self,
            _symbol: &str,
            _activity_date: NaiveDate,
        ) -> Result<()> {
            Ok(())
        }

        async fn handle_activity_deleted(&self, _symbol: &str) -> Result<()> {
            Ok(())
        }

        async fn delete_sync_state(&self, _symbol: &str) -> Result<()> {
            Ok(())
        }

        fn get_symbols_needing_sync(&self) -> Result<Vec<QuoteSyncState>> {
            Ok(vec![])
        }

        fn get_sync_state(&self, _symbol: &str) -> Result<Option<QuoteSyncState>> {
            Ok(None)
        }

        async fn mark_profile_enriched(&self, _symbol: &str) -> Result<()> {
            Ok(())
        }

        fn get_assets_needing_profile_enrichment(&self) -> Result<Vec<QuoteSyncState>> {
            Ok(vec![])
        }

        async fn update_position_status_from_holdings(
            &self,
            _current_holdings: &HashMap<String, Decimal>,
        ) -> Result<()> {
            Ok(())
        }

        fn get_sync_states_with_errors(&self) -> Result<Vec<QuoteSyncState>> {
            Ok(vec![])
        }

        async fn get_providers_info(&self) -> Result<Vec<ProviderInfo>> {
            Ok(vec![])
        }

        async fn update_provider_settings(
            &self,
            _provider_id: &str,
            _priority: i32,
            _enabled: bool,
        ) -> Result<()> {
            Ok(())
        }

        async fn check_quotes_import(
            &self,
            _content: &[u8],
            _has_header_row: bool,
        ) -> Result<Vec<QuoteImport>> {
            Ok(vec![])
        }

        async fn import_quotes(
            &self,
            quotes: Vec<QuoteImport>,
            _overwrite: bool,
        ) -> Result<Vec<QuoteImport>> {
            Ok(quotes)
        }
    }

    // --- Mock ActivityRepository ---
    #[derive(Clone, Default)]
    struct MockActivityRepository {
        activities: Arc<Mutex<Vec<Activity>>>,
    }

    impl MockActivityRepository {
        fn new() -> Self {
            Self {
                activities: Arc::new(Mutex::new(Vec::new())),
            }
        }
    }

    #[async_trait]
    impl ActivityRepositoryTrait for MockActivityRepository {
        fn get_activity(&self, _activity_id: &str) -> Result<Activity> {
            unimplemented!()
        }

        fn get_activities(&self) -> Result<Vec<Activity>> {
            Ok(self.activities.lock().unwrap().clone())
        }

        fn get_activities_by_account_id(&self, _account_id: &str) -> Result<Vec<Activity>> {
            unimplemented!()
        }

        fn get_activities_by_account_ids(&self, _account_ids: &[String]) -> Result<Vec<Activity>> {
            unimplemented!()
        }

        fn get_trading_activities(&self) -> Result<Vec<Activity>> {
            unimplemented!()
        }

        fn get_income_activities(&self) -> Result<Vec<Activity>> {
            unimplemented!()
        }

        fn get_contribution_activities(
            &self,
            _account_ids: &[String],
            _start_date: chrono::NaiveDateTime,
            _end_date: chrono::NaiveDateTime,
        ) -> Result<Vec<crate::limits::ContributionActivity>> {
            unimplemented!()
        }

        fn search_activities(
            &self,
            _page: i64,
            _page_size: i64,
            _account_id_filter: Option<Vec<String>>,
            _activity_type_filter: Option<Vec<String>>,
            _asset_id_keyword: Option<String>,
            _sort: Option<Sort>,
            _is_draft_filter: Option<bool>,
            _date_from: Option<chrono::NaiveDate>,
            _date_to: Option<chrono::NaiveDate>,
        ) -> Result<ActivitySearchResponse> {
            unimplemented!()
        }

        async fn create_activity(&self, new_activity: NewActivity) -> Result<Activity> {
            use crate::activities::ActivityStatus;
            // Extract asset_id before consuming other fields
            let asset_id = new_activity.get_asset_id().map(|s| s.to_string());
            let activity = Activity {
                id: new_activity.id.unwrap_or_else(|| "test-id".to_string()),
                account_id: new_activity.account_id,
                asset_id,
                activity_type: new_activity.activity_type,
                activity_type_override: None,
                source_type: None,
                subtype: None,
                status: new_activity.status.unwrap_or(ActivityStatus::Posted),
                activity_date: Utc::now(),
                settlement_date: None,
                quantity: new_activity.quantity,
                unit_price: new_activity.unit_price,
                amount: new_activity.amount,
                fee: new_activity.fee,
                currency: new_activity.currency,
                fx_rate: new_activity.fx_rate,
                notes: new_activity.notes,
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
            };
            self.activities.lock().unwrap().push(activity.clone());
            Ok(activity)
        }

        async fn update_activity(&self, _activity_update: ActivityUpdate) -> Result<Activity> {
            unimplemented!()
        }

        async fn delete_activity(&self, _activity_id: String) -> Result<Activity> {
            unimplemented!()
        }

        async fn bulk_mutate_activities(
            &self,
            creates: Vec<NewActivity>,
            _updates: Vec<ActivityUpdate>,
            _delete_ids: Vec<String>,
        ) -> Result<ActivityBulkMutationResult> {
            let mut created = Vec::new();
            for new_activity in creates {
                let activity = self.create_activity(new_activity).await?;
                created.push(activity);
            }
            Ok(ActivityBulkMutationResult {
                created,
                updated: Vec::new(),
                deleted: Vec::new(),
                created_mappings: Vec::new(),
                errors: Vec::new(),
            })
        }

        async fn create_activities(&self, _activities: Vec<NewActivity>) -> Result<usize> {
            unimplemented!()
        }

        fn get_first_activity_date(
            &self,
            _account_ids: Option<&[String]>,
        ) -> Result<Option<DateTime<Utc>>> {
            unimplemented!()
        }

        fn get_import_mapping(&self, _account_id: &str) -> Result<Option<ImportMapping>> {
            unimplemented!()
        }

        async fn save_import_mapping(&self, _mapping: &ImportMapping) -> Result<()> {
            unimplemented!()
        }

        fn calculate_average_cost(&self, _account_id: &str, _asset_id: &str) -> Result<Decimal> {
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
            _asset_ids: &[String],
        ) -> Result<
            std::collections::HashMap<
                String,
                (Option<chrono::NaiveDate>, Option<chrono::NaiveDate>),
            >,
        > {
            Ok(std::collections::HashMap::new())
        }

        fn check_existing_duplicates(
            &self,
            _idempotency_keys: &[String],
        ) -> Result<std::collections::HashMap<String, String>> {
            Ok(std::collections::HashMap::new())
        }

        async fn bulk_upsert(
            &self,
            _activities: Vec<crate::activities::ActivityUpsert>,
        ) -> Result<crate::activities::BulkUpsertResult> {
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

    // Helper to create a test account
    fn create_test_account(id: &str, currency: &str) -> Account {
        Account {
            id: id.to_string(),
            name: format!("Test Account {}", id),
            account_type: "SECURITIES".to_string(),
            currency: currency.to_string(),
            is_default: false,
            is_active: true,
            created_at: Utc::now().naive_utc(),
            updated_at: Utc::now().naive_utc(),
            platform_id: None,
            group: None,
            account_number: None,
            meta: None,
            provider: None,
            provider_account_id: None,
            is_archived: false,
            tracking_mode: crate::accounts::TrackingMode::NotSet,
        }
    }

    // Helper to create a test asset
    fn create_test_asset(id: &str, currency: &str) -> Asset {
        Asset {
            id: id.to_string(),
            symbol: id.to_string(),
            currency: currency.to_string(),
            kind: crate::assets::AssetKind::Security,
            ..Default::default()
        }
    }

    /// Test: When creating an activity where the activity currency matches the account currency,
    /// but the asset has a different currency, we should still register the FX pair for the asset currency.
    ///
    /// Scenario:
    /// - Account currency: USD
    /// - Asset currency: EUR (e.g., European stock)
    /// - Activity currency: USD (frontend sends account currency for new assets not in lookup)
    ///
    /// Expected: FX pair USD/EUR should be registered
    #[tokio::test]
    async fn test_registers_fx_pair_for_asset_currency_different_from_account() {
        // Setup
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        // Create account with USD currency
        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Create asset with EUR currency (different from account)
        let asset = create_test_asset("NESN", "EUR");
        asset_service.add_asset(asset);

        // Create the activity service
        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service.clone(),
            quote_service,
        );

        // Create activity with USD currency (same as account) but for EUR asset
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                id: Some("NESN".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(10)),
            unit_price: Some(dec!(100)),
            currency: "USD".to_string(), // Same as account currency
            fee: Some(dec!(0)),
            amount: Some(dec!(1000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        // Execute
        let result = activity_service.create_activity(new_activity).await;

        // Assert
        assert!(result.is_ok());

        // Check that FX pair was registered for asset currency
        let registered_pairs = fx_service.get_registered_pairs();

        // Should have registered EUR/USD (from=EUR asset currency, to=USD account currency)
        // This creates FX:EUR:USD for converting EUR values to account's USD
        assert!(
            registered_pairs.contains(&("EUR".to_string(), "USD".to_string())),
            "Expected FX pair EUR/USD to be registered for asset currency. Registered pairs: {:?}",
            registered_pairs
        );
    }

    /// Test: When activity currency differs from account currency, register that FX pair
    #[tokio::test]
    async fn test_registers_fx_pair_for_activity_currency_different_from_account() {
        // Setup
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        // Create account with USD currency
        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Create asset with EUR currency
        let asset = create_test_asset("NESN", "EUR");
        asset_service.add_asset(asset);

        // Create the activity service
        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service.clone(),
            quote_service,
        );

        // Create activity with EUR currency (different from account USD)
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                id: Some("NESN".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(10)),
            unit_price: Some(dec!(100)),
            currency: "EUR".to_string(), // Different from account currency
            fee: Some(dec!(0)),
            amount: Some(dec!(1000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        // Execute
        let result = activity_service.create_activity(new_activity).await;

        // Assert
        assert!(result.is_ok());

        // Check that FX pair was registered
        let registered_pairs = fx_service.get_registered_pairs();

        // Should have registered EUR/USD (from=EUR activity currency, to=USD account currency)
        // This creates FX:EUR:USD for converting EUR values to account's USD
        assert!(
            registered_pairs.contains(&("EUR".to_string(), "USD".to_string())),
            "Expected FX pair EUR/USD to be registered. Registered pairs: {:?}",
            registered_pairs
        );
    }

    /// Test: When activity currency, asset currency, and account currency are all the same,
    /// no FX pair should be registered
    #[tokio::test]
    async fn test_no_fx_pair_registered_when_all_currencies_match() {
        // Setup
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        // Create account with USD currency
        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Create asset with USD currency (same as account)
        let asset = create_test_asset("AAPL", "USD");
        asset_service.add_asset(asset);

        // Create the activity service
        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service.clone(),
            quote_service,
        );

        // Create activity with USD currency (same as account and asset)
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                id: Some("AAPL".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(10)),
            unit_price: Some(dec!(150)),
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(1500)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        // Execute
        let result = activity_service.create_activity(new_activity).await;

        // Assert
        assert!(result.is_ok());

        // Check that no FX pair was registered
        let registered_pairs = fx_service.get_registered_pairs();

        assert!(
            registered_pairs.is_empty(),
            "Expected no FX pairs to be registered. Registered pairs: {:?}",
            registered_pairs
        );
    }

    // ==========================================================================
    // resolve_asset_id() and infer_asset_kind() Tests (via create_activity)
    // ==========================================================================

    /// Test: When symbol + exchange_mic are provided, generates canonical SEC:SYMBOL:MIC
    #[tokio::test]
    async fn test_resolve_asset_id_with_symbol_and_exchange() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Add asset with canonical ID that will be generated
        let asset = create_test_asset("SEC:AAPL:XNAS", "USD");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                symbol: Some("AAPL".to_string()),
                exchange_mic: Some("XNAS".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(10)),
            unit_price: Some(dec!(150)),
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(1500)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(
            created.asset_id,
            Some("SEC:AAPL:XNAS".to_string()),
            "Should generate canonical SEC:SYMBOL:MIC format"
        );
    }

    /// Test: When symbol is provided without exchange, generates SEC:SYMBOL:UNKNOWN
    #[tokio::test]
    async fn test_resolve_asset_id_symbol_without_exchange() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Add asset with UNKNOWN exchange
        let asset = create_test_asset("SEC:TSLA:UNKNOWN", "USD");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                symbol: Some("TSLA".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(5)),
            unit_price: Some(dec!(200)),
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(1000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(
            created.asset_id,
            Some("SEC:TSLA:UNKNOWN".to_string()),
            "Should default to UNKNOWN exchange"
        );
    }

    /// Test: For NEW activities, symbol takes priority over asset_id to ensure canonical ID generation
    /// This is intentional - for new activities we always want canonical IDs
    #[tokio::test]
    async fn test_resolve_asset_id_backward_compatibility() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Asset with canonical ID format
        let asset = create_test_asset("SEC:AAPL:XNAS", "USD");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                id: Some("IGNORED".to_string()), // Should be ignored when symbol is provided
                symbol: Some("AAPL".to_string()),
                exchange_mic: Some("XNAS".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(10)),
            unit_price: Some(dec!(150)),
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(1500)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(
            created.asset_id,
            Some("SEC:AAPL:XNAS".to_string()),
            "For NEW activities, symbol + exchange_mic generates canonical ID, ignoring asset_id"
        );
    }

    /// Test: Cash activity (DEPOSIT) generates CASH:{currency} asset ID
    #[tokio::test]
    async fn test_resolve_asset_id_cash_deposit_no_asset() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Cash asset should be created
        let cash_asset = create_test_asset("CASH:USD", "USD");
        asset_service.add_asset(cash_asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: None,
            activity_type: "DEPOSIT".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: None,
            unit_price: None,
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(1000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(
            created.asset_id,
            Some("CASH:USD".to_string()),
            "DEPOSIT should generate CASH:USD asset ID"
        );
    }

    /// Test: Cash activity (WITHDRAWAL) generates CASH:{currency} asset ID
    #[tokio::test]
    async fn test_resolve_asset_id_cash_withdrawal_no_asset() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Cash asset should be created
        let cash_asset = create_test_asset("CASH:USD", "USD");
        asset_service.add_asset(cash_asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: None,
            activity_type: "WITHDRAWAL".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: None,
            unit_price: None,
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(500)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(
            created.asset_id,
            Some("CASH:USD".to_string()),
            "WITHDRAWAL should generate CASH:USD asset ID"
        );
    }

    /// Test: Non-cash activity (BUY) without symbol or asset_id fails
    #[tokio::test]
    async fn test_resolve_asset_id_buy_without_symbol_fails() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: None, // No asset info
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(10)),
            unit_price: Some(dec!(150)),
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(1500)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(
            result.is_err(),
            "BUY without symbol or asset_id should fail"
        );
    }

    /// Test: Crypto symbol (BTC) without exchange infers CRYPTO kind
    #[tokio::test]
    async fn test_infer_asset_kind_common_crypto_symbol() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Add crypto asset
        let asset = create_test_asset("CRYPTO:BTC:USD", "USD");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                symbol: Some("BTC".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(1)),
            unit_price: Some(dec!(50000)),
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(50000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(
            created.asset_id,
            Some("CRYPTO:BTC:USD".to_string()),
            "BTC should be inferred as crypto"
        );
    }

    /// Test: Crypto pattern (BTC-USD) infers CRYPTO kind
    #[tokio::test]
    async fn test_infer_asset_kind_crypto_pattern() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Add crypto asset with normalized ID (BTC-USD -> BTC with USD quote currency)
        let asset = create_test_asset("CRYPTO:BTC:USD", "USD");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                symbol: Some("BTC-USD".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(1)),
            unit_price: Some(dec!(50000)),
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(50000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok(), "Expected Ok, got {:?}", result);

        let created = result.unwrap();
        assert!(
            created
                .asset_id
                .as_ref()
                .map(|id| id.starts_with("CRYPTO:"))
                .unwrap_or(false),
            "BTC-USD pattern should be inferred as crypto"
        );
    }

    /// Test: Explicit kind hint overrides inference
    #[tokio::test]
    async fn test_infer_asset_kind_explicit_hint() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // BTC would normally be inferred as crypto, but we're forcing security
        let asset = create_test_asset("SEC:BTC:XNAS", "USD");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                symbol: Some("BTC".to_string()),
                exchange_mic: Some("XNAS".to_string()),
                kind: Some("SECURITY".to_string()), // Explicit hint
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(100)),
            unit_price: Some(dec!(50)),
            currency: "USD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(5000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(
            created.asset_id,
            Some("SEC:BTC:XNAS".to_string()),
            "Explicit SECURITY hint should override crypto inference"
        );
    }

    /// Test: Exchange MIC presence forces Security kind
    #[tokio::test]
    async fn test_infer_asset_kind_exchange_mic_forces_security() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "CAD");
        account_service.add_account(account);

        let asset = create_test_asset("SEC:ETH:XTSE", "CAD");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        // ETH would be inferred as crypto, but exchange_mic forces security
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                symbol: Some("ETH".to_string()),
                exchange_mic: Some("XTSE".to_string()), // Has exchange = security
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(100)),
            unit_price: Some(dec!(30)),
            currency: "CAD".to_string(),
            fee: Some(dec!(0)),
            amount: Some(dec!(3000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(
            created.asset_id,
            Some("SEC:ETH:XTSE".to_string()),
            "Exchange MIC should force security kind"
        );
    }

    /// Test: All cash activity types generate CASH:{currency} asset_id
    #[tokio::test]
    async fn test_all_cash_activity_types_no_asset() {
        let cash_types = [
            "DEPOSIT",
            "WITHDRAWAL",
            "INTEREST",
            "TAX",
            "FEE",
            "TRANSFER_IN",
            "TRANSFER_OUT",
        ];

        for activity_type in cash_types {
            let account_service = Arc::new(MockAccountService::new());
            let asset_service = Arc::new(MockAssetService::new());
            let fx_service = Arc::new(MockFxService::new());
            let activity_repository = Arc::new(MockActivityRepository::new());

            let account = create_test_account("acc-1", "USD");
            account_service.add_account(account);

            // Cash asset should be created
            let cash_asset = create_test_asset("CASH:USD", "USD");
            asset_service.add_asset(cash_asset);

            let quote_service = Arc::new(MockQuoteService);
            let activity_service = ActivityService::new(
                activity_repository.clone(),
                account_service,
                asset_service,
                fx_service,
                quote_service,
            );

            let new_activity = NewActivity {
                id: Some(format!("activity-{}", activity_type)),
                account_id: "acc-1".to_string(),
                asset: None,
                activity_type: activity_type.to_string(),
                subtype: None,
                activity_date: "2024-01-15".to_string(),
                quantity: None,
                unit_price: None,
                currency: "USD".to_string(),
                fee: Some(dec!(0)),
                amount: Some(dec!(100)),
                status: None,
                notes: None,
                fx_rate: None,
                metadata: None,
                needs_review: None,
                source_system: None,
                source_record_id: None,
                source_group_id: None,
            };

            let result = activity_service.create_activity(new_activity).await;
            assert!(
                result.is_ok(),
                "{} should succeed without asset_id",
                activity_type
            );

            let created = result.unwrap();
            assert_eq!(
                created.asset_id,
                Some("CASH:USD".to_string()),
                "{} should generate CASH:USD asset_id",
                activity_type
            );
        }
    }

    /// Test: Bulk mutation also registers FX pairs correctly
    #[tokio::test]
    async fn test_bulk_mutate_registers_fx_pair_for_asset_currency() {
        // Setup
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        // Create account with USD currency
        let account = create_test_account("acc-1", "USD");
        account_service.add_account(account);

        // Create asset with CHF currency
        let asset = create_test_asset("NESN", "CHF");
        asset_service.add_asset(asset);

        // Create the activity service
        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service.clone(),
            quote_service,
        );

        // Create bulk mutation request
        let request = ActivityBulkMutationRequest {
            creates: vec![NewActivity {
                id: Some("activity-1".to_string()),
                account_id: "acc-1".to_string(),
                asset: Some(AssetInput {
                    id: Some("NESN".to_string()),
                    ..Default::default()
                }),
                activity_type: "BUY".to_string(),
                subtype: None,
                activity_date: "2024-01-15".to_string(),
                quantity: Some(dec!(10)),
                unit_price: Some(dec!(100)),
                currency: "USD".to_string(), // Same as account, different from asset
                fee: Some(dec!(0)),
                amount: Some(dec!(1000)),
                status: None,
                notes: None,
                fx_rate: None,
                metadata: None,
                needs_review: None,
                source_system: None,
                source_record_id: None,
                source_group_id: None,
            }],
            updates: vec![],
            delete_ids: vec![],
        };

        // Execute
        let result = activity_service.bulk_mutate_activities(request).await;

        // Assert
        assert!(result.is_ok());

        // Check that FX pair was registered for asset currency
        let registered_pairs = fx_service.get_registered_pairs();

        // Should have registered CHF/USD (from=CHF asset currency, to=USD account currency)
        // This creates FX:CHF:USD for converting CHF values to account's USD
        assert!(
            registered_pairs.contains(&("CHF".to_string(), "USD".to_string())),
            "Expected FX pair CHF/USD to be registered. Registered pairs: {:?}",
            registered_pairs
        );
    }

    // ==========================================================================
    // Currency Normalization Tests (GBp -> GBP, etc.)
    // ==========================================================================

    /// Test: Activity with GBp currency is normalized to GBP with amount conversion
    /// When user explicitly selects GBp (pence), the backend should:
    /// 1. Convert currency GBp -> GBP
    /// 2. Multiply unit_price by 0.01 (14082 pence -> 140.82 GBP)
    /// 3. Multiply amount by 0.01
    /// 4. Multiply fee by 0.01
    #[tokio::test]
    async fn test_gbp_pence_normalization_on_create() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        // Create GBP account
        let account = create_test_account("acc-1", "GBP");
        account_service.add_account(account);

        // LSE stock with GBp currency
        let asset = create_test_asset("SEC:AZN:XLON", "GBp");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        // User submits activity in GBp (pence) - 14082 pence per share
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                id: Some("SEC:AZN:XLON".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(10)),
            unit_price: Some(dec!(14082)), // 14082 pence
            currency: "GBp".to_string(),   // Pence currency
            fee: Some(dec!(999)),          // 999 pence fee
            amount: Some(dec!(140820)),    // 140820 pence total
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok(), "Activity creation should succeed");

        let created = result.unwrap();

        // Currency should be normalized to GBP
        assert_eq!(
            created.currency, "GBP",
            "Currency should be normalized from GBp to GBP"
        );

        // Unit price should be converted: 14082 pence * 0.01 = 140.82 GBP
        assert_eq!(
            created.unit_price,
            Some(dec!(140.82)),
            "Unit price should be converted from pence to pounds"
        );

        // Fee should be converted: 999 pence * 0.01 = 9.99 GBP
        assert_eq!(
            created.fee,
            Some(dec!(9.99)),
            "Fee should be converted from pence to pounds"
        );

        // Amount should be converted: 140820 pence * 0.01 = 1408.20 GBP
        assert_eq!(
            created.amount,
            Some(dec!(1408.20)),
            "Amount should be converted from pence to pounds"
        );

        // Quantity should NOT be converted (shares, not currency)
        assert_eq!(
            created.quantity,
            Some(dec!(10)),
            "Quantity should remain unchanged"
        );
    }

    /// Test: Activity with GBX currency (alternative pence code) is also normalized
    #[tokio::test]
    async fn test_gbx_normalization_on_create() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "GBP");
        account_service.add_account(account);

        let asset = create_test_asset("SEC:VOD:XLON", "GBX");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                id: Some("SEC:VOD:XLON".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(100)),
            unit_price: Some(dec!(7500)), // 7500 pence
            currency: "GBX".to_string(),  // Alternative pence code
            fee: Some(dec!(0)),
            amount: Some(dec!(750000)), // 750000 pence
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(created.currency, "GBP", "GBX should normalize to GBP");
        assert_eq!(created.unit_price, Some(dec!(75)), "7500 pence = 75 pounds");
        assert_eq!(
            created.amount,
            Some(dec!(7500)),
            "750000 pence = 7500 pounds"
        );
    }

    /// Test: Activity with ZAc (South African cents) is normalized to ZAR
    #[tokio::test]
    async fn test_zac_normalization_on_create() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "ZAR");
        account_service.add_account(account);

        let asset = create_test_asset("SEC:NPN:XJSE", "ZAc");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                id: Some("SEC:NPN:XJSE".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(50)),
            unit_price: Some(dec!(200000)), // 200000 cents = 2000 ZAR
            currency: "ZAc".to_string(),
            fee: Some(dec!(1000)), // 1000 cents = 10 ZAR
            amount: Some(dec!(10000000)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(created.currency, "ZAR", "ZAc should normalize to ZAR");
        assert_eq!(
            created.unit_price,
            Some(dec!(2000)),
            "200000 cents = 2000 ZAR"
        );
        assert_eq!(created.fee, Some(dec!(10)), "1000 cents = 10 ZAR");
    }

    /// Test: Activity with regular GBP currency is NOT modified
    #[tokio::test]
    async fn test_regular_gbp_not_modified() {
        let account_service = Arc::new(MockAccountService::new());
        let asset_service = Arc::new(MockAssetService::new());
        let fx_service = Arc::new(MockFxService::new());
        let activity_repository = Arc::new(MockActivityRepository::new());

        let account = create_test_account("acc-1", "GBP");
        account_service.add_account(account);

        let asset = create_test_asset("SEC:LLOY:XLON", "GBP");
        asset_service.add_asset(asset);

        let quote_service = Arc::new(MockQuoteService);
        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
            quote_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset: Some(AssetInput {
                id: Some("SEC:LLOY:XLON".to_string()),
                ..Default::default()
            }),
            activity_type: "BUY".to_string(),
            subtype: None,
            activity_date: "2024-01-15".to_string(),
            quantity: Some(dec!(1000)),
            unit_price: Some(dec!(0.45)), // Already in GBP
            currency: "GBP".to_string(),  // Major currency
            fee: Some(dec!(5)),
            amount: Some(dec!(450)),
            status: None,
            notes: None,
            fx_rate: None,
            metadata: None,
            needs_review: None,
            source_system: None,
            source_record_id: None,
            source_group_id: None,
        };

        let result = activity_service.create_activity(new_activity).await;
        assert!(result.is_ok());

        let created = result.unwrap();
        assert_eq!(created.currency, "GBP", "GBP should remain GBP");
        assert_eq!(
            created.unit_price,
            Some(dec!(0.45)),
            "Unit price should not change for GBP"
        );
        assert_eq!(
            created.amount,
            Some(dec!(450)),
            "Amount should not change for GBP"
        );
        assert_eq!(created.fee, Some(dec!(5)), "Fee should not change for GBP");
    }
}
