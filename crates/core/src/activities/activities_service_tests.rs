#[cfg(test)]
mod tests {
    use crate::accounts::{Account, AccountServiceTrait, AccountUpdate, NewAccount};
    use crate::activities::activities_model::*;
    use crate::activities::{ActivityRepositoryTrait, ActivityService, ActivityServiceTrait};
    use crate::assets::{Asset, AssetServiceTrait, UpdateAssetProfile};
    use crate::errors::Result;
    use crate::fx::{ExchangeRate, FxServiceTrait, NewExchangeRate};
    use async_trait::async_trait;
    use chrono::{DateTime, NaiveDate, Utc};
    use rust_decimal::Decimal;
    use rust_decimal_macros::dec;
    use std::collections::HashSet;
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

        fn load_cash_assets(&self, _base_currency: &str) -> Result<Vec<Asset>> {
            unimplemented!()
        }

        async fn create_cash_asset(&self, _currency: &str) -> Result<Asset> {
            unimplemented!()
        }

        async fn update_pricing_mode(
            &self,
            _asset_id: &str,
            _pricing_mode: &str,
        ) -> Result<Asset> {
            // Return a dummy asset
            Ok(Asset::default())
        }

        async fn get_assets_by_symbols(&self, _symbols: &[String]) -> Result<Vec<Asset>> {
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
        ) -> Result<Asset> {
            self.get_asset_by_id(asset_id)
        }

        async fn enrich_asset_profile(&self, _asset_id: &str) -> Result<Asset> {
            unimplemented!()
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

        fn get_deposit_activities(
            &self,
            _account_ids: &[String],
            _start_date: chrono::NaiveDateTime,
            _end_date: chrono::NaiveDateTime,
        ) -> Result<Vec<(String, Decimal, Decimal, String, Option<Decimal>)>> {
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
        ) -> Result<ActivitySearchResponse> {
            unimplemented!()
        }

        async fn create_activity(&self, new_activity: NewActivity) -> Result<Activity> {
            use crate::activities::ActivityStatus;
            let activity = Activity {
                id: new_activity.id.unwrap_or_else(|| "test-id".to_string()),
                account_id: new_activity.account_id,
                asset_id: new_activity.asset_id,
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
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service.clone(),
        );

        // Create activity with USD currency (same as account) but for EUR asset
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: Some("NESN".to_string()),
            symbol: None,
            exchange_mic: None,
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        // Should have registered USD/EUR for the asset's currency
        assert!(
            registered_pairs.contains(&("USD".to_string(), "EUR".to_string())),
            "Expected FX pair USD/EUR to be registered for asset currency. Registered pairs: {:?}",
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
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service.clone(),
        );

        // Create activity with EUR currency (different from account USD)
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: Some("NESN".to_string()),
            symbol: None,
            exchange_mic: None,
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        assert!(
            registered_pairs.contains(&("USD".to_string(), "EUR".to_string())),
            "Expected FX pair USD/EUR to be registered. Registered pairs: {:?}",
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
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service.clone(),
        );

        // Create activity with USD currency (same as account and asset)
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: Some("AAPL".to_string()),
            symbol: None,
            exchange_mic: None,
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None, // No asset_id provided
            symbol: Some("AAPL".to_string()),
            exchange_mic: Some("XNAS".to_string()),
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None,
            symbol: Some("TSLA".to_string()),
            exchange_mic: None, // No exchange provided
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: Some("IGNORED".to_string()), // Should be ignored when symbol is provided
            symbol: Some("AAPL".to_string()),
            exchange_mic: Some("XNAS".to_string()),
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None,
            symbol: None,
            exchange_mic: None,
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None,
            symbol: None,
            exchange_mic: None,
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None,
            symbol: None, // No symbol
            exchange_mic: None,
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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
        assert!(result.is_err(), "BUY without symbol or asset_id should fail");
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

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None,
            symbol: Some("BTC".to_string()),
            exchange_mic: None, // No exchange - should infer crypto
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        // Add crypto asset with pattern-based ID
        let asset = create_test_asset("CRYPTO:BTC-USD:USD", "USD");
        asset_service.add_asset(asset);

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None,
            symbol: Some("BTC-USD".to_string()), // Crypto pattern
            exchange_mic: None,
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None,
            symbol: Some("BTC".to_string()),
            exchange_mic: Some("XNAS".to_string()),
            asset_kind: Some("SECURITY".to_string()), // Explicit hint
            pricing_mode: None,
            asset_metadata: None,
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

        let activity_service = ActivityService::new(
            activity_repository.clone(),
            account_service,
            asset_service,
            fx_service,
        );

        // ETH would be inferred as crypto, but exchange_mic forces security
        let new_activity = NewActivity {
            id: Some("activity-1".to_string()),
            account_id: "acc-1".to_string(),
            asset_id: None,
            symbol: Some("ETH".to_string()),
            exchange_mic: Some("XTSE".to_string()), // Has exchange = security
            asset_kind: None,
            pricing_mode: None,
            asset_metadata: None,
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

            let activity_service = ActivityService::new(
                activity_repository.clone(),
                account_service,
                asset_service,
                fx_service,
            );

            let new_activity = NewActivity {
                id: Some(format!("activity-{}", activity_type)),
                account_id: "acc-1".to_string(),
                asset_id: None,
                symbol: None,
                exchange_mic: None,
                asset_kind: None,
                pricing_mode: None,
                asset_metadata: None,
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
        let activity_service = ActivityService::new(
            activity_repository,
            account_service,
            asset_service,
            fx_service.clone(),
        );

        // Create bulk mutation request
        let request = ActivityBulkMutationRequest {
            creates: vec![NewActivity {
                id: Some("activity-1".to_string()),
                account_id: "acc-1".to_string(),
                asset_id: Some("NESN".to_string()),
                symbol: None,
                exchange_mic: None,
                asset_kind: None,
                pricing_mode: None,
                asset_metadata: None,
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

        assert!(
            registered_pairs.contains(&("USD".to_string(), "CHF".to_string())),
            "Expected FX pair USD/CHF to be registered. Registered pairs: {:?}",
            registered_pairs
        );
    }
}
