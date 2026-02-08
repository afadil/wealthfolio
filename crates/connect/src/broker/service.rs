//! Service for synchronizing broker data to the local database.

use async_trait::async_trait;
use log::{debug, error, info, warn};
use std::sync::Arc;

use super::mapping;
use super::models::{
    AccountUniversalActivity, BrokerAccount, BrokerConnection, HoldingsBalance, HoldingsPosition,
    NewAccountInfo, SyncAccountsResponse, SyncConnectionsResponse,
};
use super::traits::BrokerSyncServiceTrait;
use crate::platform::{Platform, PlatformRepository};
use crate::state::BrokerSyncState;
use crate::state::BrokerSyncStateRepository;
use chrono::{DateTime, Months, Utc};
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use std::collections::HashSet;
use wealthfolio_core::accounts::{Account, AccountServiceTrait, NewAccount, TrackingMode};
use wealthfolio_core::activities::{
    compute_idempotency_key, ActivityServiceTrait, NewActivity, SymbolInput,
};
use wealthfolio_core::assets::{AssetKind, AssetServiceTrait, AssetSpec};
use wealthfolio_core::errors::Result;
use wealthfolio_core::events::{DomainEvent, DomainEventSink, NoOpDomainEventSink};
use wealthfolio_core::portfolio::snapshot::{
    AccountStateSnapshot, Position, SnapshotRepositoryTrait, SnapshotServiceTrait, SnapshotSource,
};
use wealthfolio_core::sync::{
    ImportRun, ImportRunMode, ImportRunStatus, ImportRunSummary, ImportRunType, ReviewMode,
};
use wealthfolio_core::utils::time_utils::valuation_date_today;
use wealthfolio_storage_sqlite::activities::{ActivityDB, ActivityRepository};
use wealthfolio_storage_sqlite::db::{DbPool, WriteHandle};
use wealthfolio_storage_sqlite::errors::StorageError;
use wealthfolio_storage_sqlite::portfolio::snapshot::AccountStateSnapshotDB;
use wealthfolio_storage_sqlite::schema;
use wealthfolio_storage_sqlite::sync::ImportRunRepository;

const DEFAULT_BROKERAGE_PROVIDER: &str = "snaptrade";

/// Service for syncing broker data to the local database
pub struct BrokerSyncService {
    account_service: Arc<dyn AccountServiceTrait>,
    asset_service: Arc<dyn AssetServiceTrait>,
    activity_service: Arc<dyn ActivityServiceTrait>,
    activity_repository: Arc<ActivityRepository>,
    platform_repository: Arc<PlatformRepository>,
    brokers_sync_state_repository: Arc<BrokerSyncStateRepository>,
    import_run_repository: Arc<ImportRunRepository>,
    snapshot_repository: Arc<wealthfolio_storage_sqlite::portfolio::snapshot::SnapshotRepository>,
    snapshot_service: Option<Arc<dyn SnapshotServiceTrait>>,
    event_sink: Arc<dyn DomainEventSink>,
    writer: WriteHandle,
}

impl BrokerSyncService {
    pub fn new(
        account_service: Arc<dyn AccountServiceTrait>,
        asset_service: Arc<dyn AssetServiceTrait>,
        activity_service: Arc<dyn ActivityServiceTrait>,
        platform_repository: Arc<PlatformRepository>,
        pool: Arc<DbPool>,
        writer: WriteHandle,
    ) -> Self {
        Self {
            account_service,
            asset_service,
            activity_service,
            activity_repository: Arc::new(ActivityRepository::new(
                pool.clone(),
                writer.clone(),
            )),
            platform_repository,
            brokers_sync_state_repository: Arc::new(BrokerSyncStateRepository::new(
                pool.clone(),
                writer.clone(),
            )),
            import_run_repository: Arc::new(ImportRunRepository::new(pool.clone(), writer.clone())),
            snapshot_repository: Arc::new(
                wealthfolio_storage_sqlite::portfolio::snapshot::SnapshotRepository::new(
                    pool,
                    writer.clone(),
                ),
            ),
            snapshot_service: None,
            event_sink: Arc::new(NoOpDomainEventSink),
            writer,
        }
    }

    /// Sets the snapshot service for emitting HoldingsChanged events during broker sync.
    pub fn with_snapshot_service(
        mut self,
        snapshot_service: Arc<dyn SnapshotServiceTrait>,
    ) -> Self {
        self.snapshot_service = Some(snapshot_service);
        self
    }

    /// Sets the domain event sink for emitting events during broker sync.
    pub fn with_event_sink(mut self, event_sink: Arc<dyn DomainEventSink>) -> Self {
        self.event_sink = event_sink;
        self
    }
}

#[async_trait]
impl BrokerSyncServiceTrait for BrokerSyncService {
    /// Sync connections from the broker API to local platforms table
    async fn sync_connections(
        &self,
        connections: Vec<BrokerConnection>,
    ) -> Result<SyncConnectionsResponse> {
        let mut platforms_created = 0;
        let mut platforms_updated = 0;

        for connection in &connections {
            if let Some(brokerage) = &connection.brokerage {
                // Use slug as the platform ID, fall back to UUID if no slug
                let platform_id = brokerage
                    .slug
                    .clone()
                    .unwrap_or_else(|| brokerage.id.clone().unwrap_or_default());

                if platform_id.is_empty() {
                    warn!(
                        "Skipping connection with no brokerage slug or id: {:?}",
                        connection.id
                    );
                    continue;
                }

                // Check if platform already exists
                let existing = self.platform_repository.get_by_id(&platform_id)?;

                let platform = Platform {
                    id: platform_id.clone(),
                    name: brokerage.display_name.clone().or(brokerage.name.clone()),
                    url: format!(
                        "https://{}.com",
                        platform_id.to_lowercase().replace('_', "")
                    ),
                    external_id: brokerage.id.clone(),
                    kind: "BROKERAGE".to_string(),
                    website_url: None,
                    logo_url: brokerage
                        .aws_s3_square_logo_url
                        .clone()
                        .or(brokerage.aws_s3_logo_url.clone()),
                };

                self.platform_repository.upsert(platform).await?;

                if existing.is_some() {
                    platforms_updated += 1;
                    debug!("Updated platform: {}", platform_id);
                } else {
                    platforms_created += 1;
                    info!("Created platform: {}", platform_id);
                }
            }
        }

        Ok(SyncConnectionsResponse {
            synced: connections.len(),
            platforms_created,
            platforms_updated,
        })
    }

    /// Sync accounts from the broker API to local accounts table
    async fn sync_accounts(
        &self,
        broker_accounts: Vec<BrokerAccount>,
    ) -> Result<SyncAccountsResponse> {
        let mut created = 0;
        let updated = 0; // Reserved for future use when we implement account updates
        let mut skipped = 0;
        let mut created_accounts: Vec<(String, String)> = Vec::new();
        let mut new_accounts_info: Vec<NewAccountInfo> = Vec::new();
        let base_currency = self.account_service.get_base_currency();

        // Get all existing accounts with provider_account_id to check for updates
        let existing_accounts = self.account_service.get_all_accounts()?;
        let provider_account_id_map: std::collections::HashMap<String, Account> = existing_accounts
            .into_iter()
            .filter_map(|a| a.provider_account_id.clone().map(|id| (id, a)))
            .collect();

        for broker_account in &broker_accounts {
            // Get the provider account ID - skip if missing
            let provider_account_id = match &broker_account.id {
                Some(id) if !id.is_empty() => id.clone(),
                _ => {
                    debug!(
                        "Skipping account with no provider ID: {}",
                        broker_account.display_name()
                    );
                    skipped += 1;
                    continue;
                }
            };

            // Check if account already exists by provider_account_id
            if let Some(_existing) = provider_account_id_map.get(&provider_account_id) {
                // Account exists - for now we skip updates to preserve user customizations
                // In the future, we might want to update certain fields selectively
                debug!(
                    "Account already synced, skipping: {} ({})",
                    broker_account.display_name(),
                    provider_account_id
                );
                skipped += 1;
                continue;
            }

            // Determine platform_id from institution_name
            // We need to find the platform that matches this broker account's connection
            let platform_id = self.find_platform_for_account(broker_account)?;

            // Create new account with trackingMode=NOT_SET (requires user to choose before sync)
            let new_account = NewAccount {
                id: None, // Let the repository generate a UUID
                name: broker_account.display_name(),
                account_type: broker_account.get_account_type(),
                group: None,
                currency: broker_account.get_currency(base_currency.as_deref()),
                is_default: false,
                is_active: broker_account.status.as_deref() != Some("closed"),
                platform_id,
                account_number: broker_account.account_number.clone(),
                meta: broker_account.to_meta_json(),
                provider: Some("SNAPTRADE".to_string()),
                provider_account_id: Some(provider_account_id.clone()),
                is_archived: false,
                tracking_mode: TrackingMode::NotSet,
            };

            // Create the account via AccountService (handles FX rate registration)
            let account = self.account_service.create_account(new_account).await?;

            // Collect info for NewAccountInfo
            new_accounts_info.push(NewAccountInfo {
                local_account_id: account.id.clone(),
                provider_account_id: provider_account_id.clone(),
                default_name: broker_account.display_name(),
                currency: account.currency.clone(),
                institution_name: broker_account.institution_name.clone(),
            });

            created_accounts.push((account.id.clone(), account.currency.clone()));

            created += 1;
            info!(
                "Created account: {} ({}) -> {}",
                broker_account.display_name(),
                provider_account_id,
                broker_account.get_account_type()
            );
        }

        Ok(SyncAccountsResponse {
            synced: broker_accounts.len(),
            created,
            updated,
            skipped,
            created_accounts,
            new_accounts_info,
        })
    }

    /// Get all synced accounts (accounts with provider_account_id set)
    fn get_synced_accounts(&self) -> Result<Vec<Account>> {
        let all_accounts = self.account_service.get_all_accounts()?;
        Ok(all_accounts
            .into_iter()
            .filter(|a| a.provider_account_id.is_some())
            .collect())
    }

    /// Get all platforms
    fn get_platforms(&self) -> Result<Vec<Platform>> {
        self.platform_repository.list()
    }

    fn get_activity_sync_state(&self, account_id: &str) -> Result<Option<BrokerSyncState>> {
        self.brokers_sync_state_repository
            .get_by_account_id(account_id)
    }

    async fn mark_activity_sync_attempt(&self, account_id: String) -> Result<()> {
        self.brokers_sync_state_repository
            .upsert_attempt(account_id, DEFAULT_BROKERAGE_PROVIDER.to_string())
            .await
    }

    async fn upsert_account_activities(
        &self,
        account_id: String,
        import_run_id: Option<String>,
        activities_data: Vec<AccountUniversalActivity>,
    ) -> Result<(usize, usize, Vec<String>, usize)> {
        use diesel::prelude::*;

        if activities_data.is_empty() {
            return Ok((0, 0, Vec::new(), 0));
        }

        let account = self.account_service.get_account(&account_id)?;
        let base_currency = self
            .account_service
            .get_base_currency()
            .filter(|c| !c.trim().is_empty());
        let account_currency = if !account.currency.is_empty() {
            Some(account.currency.clone())
        } else {
            base_currency.clone()
        };

        // 1. Map broker data → NewActivity (dedup by activity ID)
        let mut seen_activity_ids: HashSet<String> = HashSet::new();
        let mut new_activities: Vec<NewActivity> = Vec::new();

        for activity in &activities_data {
            if let Some(new_act) = mapping::map_broker_activity(
                activity,
                &account_id,
                account_currency.as_deref(),
                base_currency.as_deref(),
            ) {
                let activity_id = new_act.id.as_deref().unwrap_or("").to_string();
                if seen_activity_ids.insert(activity_id) {
                    new_activities.push(new_act);
                }
            }
        }

        if new_activities.is_empty() {
            return Ok((0, 0, Vec::new(), 0));
        }

        // 2. Use prepare_activities for asset creation + FX registration
        let prepare_result = self
            .activity_service
            .prepare_activities(new_activities, &account)
            .await?;

        let new_asset_ids: Vec<String> = if prepare_result.assets_created > 0 {
            // Collect asset IDs that were created (from prepared activities)
            prepare_result
                .prepared
                .iter()
                .filter_map(|p| p.resolved_asset_id.clone())
                .collect::<HashSet<_>>()
                .into_iter()
                .collect()
        } else {
            Vec::new()
        };

        let assets_created = prepare_result.assets_created as usize;

        // Count needs_review activities
        let needs_review_count = prepare_result
            .prepared
            .iter()
            .filter(|p| p.activity.needs_review.unwrap_or(false))
            .count();

        // 3. Convert prepared activities → ActivityDB for broker-specific upsert
        let mut activity_rows: Vec<ActivityDB> = Vec::new();
        let mut activity_asset_ids: HashSet<String> = HashSet::new();
        let mut activity_currencies: HashSet<String> = HashSet::new();

        for prepared in prepare_result.prepared {
            let act = &prepared.activity;
            let asset_id = prepared.resolved_asset_id.clone();

            if let Some(ref id) = asset_id {
                activity_asset_ids.insert(id.clone());
            }
            activity_currencies.insert(act.currency.clone());

            // Parse activity date for idempotency key computation
            let activity_datetime: DateTime<Utc> =
                DateTime::parse_from_rfc3339(&act.activity_date)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

            // Compute idempotency key for content-based deduplication
            let idempotency_key = compute_idempotency_key(
                &account_id,
                &act.activity_type,
                &activity_datetime,
                asset_id.as_deref(),
                act.quantity,
                act.unit_price,
                act.amount,
                &act.currency,
                act.source_record_id.as_deref(),
                act.notes.as_deref(),
            );

            // Build NewActivity with resolved asset_id for DB conversion
            let resolved_activity = NewActivity {
                symbol: asset_id.as_ref().map(|id| SymbolInput {
                    id: Some(id.clone()),
                    ..Default::default()
                }),
                ..prepared.activity
            };

            let mut activity_db: ActivityDB = resolved_activity.into();
            activity_db.idempotency_key = Some(idempotency_key);
            activity_db.import_run_id = import_run_id.clone();

            activity_rows.push(activity_db);
        }

        // 4. Broker-specific activity upsert (idempotency + user-modified check)
        let writer = self.writer.clone();
        let account_id_for_log = account_id.clone();
        let activities_count = activity_rows.len();

        debug!(
            "Preparing to upsert {} activities and {} assets for account {}",
            activities_count, assets_created, account_id_for_log
        );

        let activities_upserted = writer
            .exec(move |conn| {
                use diesel::upsert::excluded;

                // Collect all activity IDs and idempotency keys for batch lookup
                let activity_ids: Vec<String> =
                    activity_rows.iter().map(|a| a.id.clone()).collect();
                let idempotency_keys: Vec<String> = activity_rows
                    .iter()
                    .filter_map(|a| a.idempotency_key.clone())
                    .collect();

                // Fetch existing activities by ID or idempotency_key in one query
                let existing_activities: Vec<(String, Option<String>, i32)> =
                    schema::activities::table
                        .filter(
                            schema::activities::id
                                .eq_any(&activity_ids)
                                .or(schema::activities::idempotency_key
                                    .eq_any(&idempotency_keys)),
                        )
                        .select((
                            schema::activities::id,
                            schema::activities::idempotency_key,
                            schema::activities::is_user_modified,
                        ))
                        .load::<(String, Option<String>, i32)>(conn)
                        .map_err(StorageError::from)?;

                // Build lookup maps
                let mut existing_by_id: std::collections::HashMap<String, i32> =
                    std::collections::HashMap::new();
                let mut existing_by_idemp: std::collections::HashMap<String, (String, i32)> =
                    std::collections::HashMap::new();

                for (id, idemp_key, is_modified) in existing_activities {
                    existing_by_id.insert(id.clone(), is_modified);
                    if let Some(key) = idemp_key {
                        existing_by_idemp.insert(key, (id, is_modified));
                    }
                }

                let mut activities_upserted: usize = 0;
                let mut activities_skipped: usize = 0;

                for (idx, mut activity_db) in activity_rows.into_iter().enumerate() {
                    let now_update = chrono::Utc::now().to_rfc3339();
                    let activity_id = activity_db.id.clone();
                    let activity_type = activity_db.activity_type.clone();
                    let idempotency_key = activity_db.idempotency_key.clone();

                    // Check if this activity exists and is user-modified (by ID)
                    if let Some(&is_modified) = existing_by_id.get(&activity_id) {
                        if is_modified != 0 {
                            debug!(
                                "Skipping user-modified activity {} (type={})",
                                activity_id, activity_type
                            );
                            activities_skipped += 1;
                            continue;
                        }
                    }

                    // If not found by ID, check by idempotency_key
                    if !existing_by_id.contains_key(&activity_id) {
                        if let Some(ref key) = idempotency_key {
                            if let Some((existing_id, is_modified)) = existing_by_idemp.get(key) {
                                if *is_modified != 0 {
                                    debug!(
                                        "Skipping update for user-modified activity (matched by idempotency_key: {} -> {})",
                                        activity_id, existing_id
                                    );
                                    activities_skipped += 1;
                                    continue;
                                }
                                debug!(
                                    "Activity {} matched existing {} by idempotency_key, updating existing",
                                    activity_id, existing_id
                                );
                                activity_db.id = existing_id.clone();
                            }
                        }
                    }

                    match diesel::insert_into(schema::activities::table)
                        .values(&activity_db)
                        .on_conflict(schema::activities::id)
                        .do_update()
                        .set((
                            schema::activities::account_id
                                .eq(excluded(schema::activities::account_id)),
                            schema::activities::asset_id.eq(excluded(schema::activities::asset_id)),
                            schema::activities::activity_type
                                .eq(excluded(schema::activities::activity_type)),
                            schema::activities::subtype.eq(excluded(schema::activities::subtype)),
                            schema::activities::activity_date
                                .eq(excluded(schema::activities::activity_date)),
                            schema::activities::quantity.eq(excluded(schema::activities::quantity)),
                            schema::activities::unit_price
                                .eq(excluded(schema::activities::unit_price)),
                            schema::activities::currency.eq(excluded(schema::activities::currency)),
                            schema::activities::fee.eq(excluded(schema::activities::fee)),
                            schema::activities::amount.eq(excluded(schema::activities::amount)),
                            schema::activities::status.eq(excluded(schema::activities::status)),
                            schema::activities::notes.eq(excluded(schema::activities::notes)),
                            schema::activities::fx_rate.eq(excluded(schema::activities::fx_rate)),
                            schema::activities::metadata.eq(excluded(schema::activities::metadata)),
                            schema::activities::source_system
                                .eq(excluded(schema::activities::source_system)),
                            schema::activities::source_record_id
                                .eq(excluded(schema::activities::source_record_id)),
                            schema::activities::source_group_id
                                .eq(excluded(schema::activities::source_group_id)),
                            schema::activities::needs_review
                                .eq(excluded(schema::activities::needs_review)),
                            schema::activities::idempotency_key
                                .eq(excluded(schema::activities::idempotency_key)),
                            schema::activities::import_run_id
                                .eq(excluded(schema::activities::import_run_id)),
                            schema::activities::updated_at.eq(now_update),
                        ))
                        .execute(conn)
                    {
                        Ok(count) => activities_upserted += count,
                        Err(e) => {
                            error!(
                                "Failed to upsert activity {} (idx={}, type={}): {:?}",
                                activity_id, idx, activity_type, e
                            );
                            return Err(StorageError::from(e).into());
                        }
                    }
                }

                if activities_skipped > 0 {
                    info!(
                        "Skipped {} user-modified activities during sync",
                        activities_skipped
                    );
                }

                debug!("Successfully upserted {} activities", activities_upserted);
                Ok(activities_upserted)
            })
            .await?;

        debug!(
            "Upserted {} activities for account {} ({} assets created, {} new asset IDs, {} need review)",
            activities_count, account_id_for_log, assets_created, new_asset_ids.len(), needs_review_count
        );

        // Emit domain events for activities
        if activities_upserted > 0 {
            let asset_ids: Vec<String> = activity_asset_ids.into_iter().collect();
            let currencies: Vec<String> = activity_currencies.into_iter().collect();
            self.event_sink.emit(DomainEvent::ActivitiesChanged {
                account_ids: vec![account_id_for_log.clone()],
                asset_ids,
                currencies,
            });
        }

        Ok((
            activities_upserted,
            assets_created,
            new_asset_ids,
            needs_review_count,
        ))
    }

    async fn finalize_activity_sync_success(
        &self,
        account_id: String,
        last_synced_date: String,
        import_run_id: Option<String>,
    ) -> Result<()> {
        self.brokers_sync_state_repository
            .upsert_success(
                account_id,
                DEFAULT_BROKERAGE_PROVIDER.to_string(),
                last_synced_date,
                import_run_id,
            )
            .await
    }

    async fn finalize_activity_sync_failure(
        &self,
        account_id: String,
        error: String,
        import_run_id: Option<String>,
    ) -> Result<()> {
        self.brokers_sync_state_repository
            .upsert_failure(
                account_id,
                DEFAULT_BROKERAGE_PROVIDER.to_string(),
                error,
                import_run_id,
            )
            .await
    }

    fn get_all_sync_states(&self) -> Result<Vec<BrokerSyncState>> {
        self.brokers_sync_state_repository.get_all()
    }

    fn get_import_runs(
        &self,
        run_type: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ImportRun>> {
        match run_type {
            Some(rt) => self
                .import_run_repository
                .get_by_run_type(rt, limit, offset),
            None => self.import_run_repository.get_all(limit, offset),
        }
    }

    async fn create_import_run(&self, account_id: &str, mode: ImportRunMode) -> Result<ImportRun> {
        let import_run = ImportRun::new(
            account_id.to_string(),
            DEFAULT_BROKERAGE_PROVIDER.to_string(),
            ImportRunType::Sync,
            mode,
            ReviewMode::Never,
        );

        self.import_run_repository.create(import_run).await
    }

    async fn finalize_import_run(
        &self,
        run_id: &str,
        summary: ImportRunSummary,
        status: ImportRunStatus,
        error: Option<String>,
    ) -> Result<()> {
        // Get the existing run
        let run = self.import_run_repository.get_by_id(run_id)?;
        if let Some(mut import_run) = run {
            import_run.summary = Some(summary);
            import_run.status = status.clone();
            import_run.finished_at = Some(Utc::now());
            import_run.updated_at = Utc::now();

            if let Some(err) = error {
                import_run.error = Some(err);
            }

            if status == ImportRunStatus::Applied {
                import_run.applied_at = Some(Utc::now());
            }

            self.import_run_repository.update(import_run).await?;
        } else {
            warn!("Import run not found: {}", run_id);
        }

        Ok(())
    }

    async fn save_broker_holdings(
        &self,
        account_id: String,
        balances: Vec<HoldingsBalance>,
        positions: Vec<HoldingsPosition>,
    ) -> Result<(usize, usize, Vec<String>)> {
        use std::collections::{HashMap, VecDeque};
        use wealthfolio_core::assets::InstrumentType;

        // Get the account to determine its currency
        let account = self.account_service.get_account(&account_id)?;
        let account_currency = account.currency.clone();

        let today = valuation_date_today();
        let now = chrono::Utc::now();

        // Build cash balances HashMap
        let mut cash_balances: HashMap<String, Decimal> = HashMap::new();
        for balance in &balances {
            if let (Some(currency), Some(cash)) = (
                balance.currency.as_ref().and_then(|c| c.code.clone()),
                balance.cash,
            ) {
                let cash_decimal = Decimal::from_f64(cash).unwrap_or(Decimal::ZERO);
                *cash_balances.entry(currency).or_insert(Decimal::ZERO) += cash_decimal;
            }
        }

        // 1. Build AssetSpecs and position data from broker positions
        let mut asset_specs: Vec<AssetSpec> = Vec::new();
        // Keyed by (symbol, currency) → index into asset_specs
        let mut spec_key_to_idx: HashMap<String, usize> = HashMap::new();
        // Position data: (spec_key, quantity, price, avg_cost)
        let mut position_data: Vec<(String, Decimal, Decimal, Decimal, String)> = Vec::new();

        for pos in &positions {
            let symbol_info = pos.symbol.as_ref().and_then(|s| s.symbol.as_ref());
            let symbol = symbol_info
                .and_then(|s| s.symbol.clone())
                .or_else(|| symbol_info.and_then(|s| s.raw_symbol.clone()));

            let symbol = match symbol {
                Some(s) if !s.is_empty() => s,
                _ => {
                    debug!("Skipping position without symbol");
                    continue;
                }
            };

            let units = pos.units.unwrap_or(0.0);
            if units == 0.0 {
                debug!("Skipping position {} with zero units", symbol);
                continue;
            }

            let currency = pos
                .currency
                .as_ref()
                .and_then(|c| c.code.clone())
                .unwrap_or_else(|| account_currency.clone());

            let symbol_type_code = symbol_info
                .and_then(|s| s.symbol_type.as_ref())
                .and_then(|t| t.code.clone());
            let is_crypto_asset = mapping::is_broker_crypto(symbol_type_code.as_deref());
            let instrument_type = if is_crypto_asset {
                InstrumentType::Crypto
            } else {
                InstrumentType::Equity
            };

            let asset_name =
                symbol_info.and_then(|s| s.name.clone().or(s.description.clone()));

            let spec_key = format!("{}:{}", symbol.to_uppercase(), currency);
            if !spec_key_to_idx.contains_key(&spec_key) {
                let idx = asset_specs.len();
                asset_specs.push(AssetSpec {
                    id: None, // Let ensure_assets resolve via instrument_key
                    display_code: Some(symbol.clone()),
                    instrument_symbol: Some(symbol.clone()),
                    instrument_exchange_mic: None,
                    instrument_type: Some(instrument_type),
                    quote_ccy: currency.clone(),
                    kind: AssetKind::Investment,
                    quote_mode: None,
                    name: asset_name,
                });
                spec_key_to_idx.insert(spec_key.clone(), idx);
            }

            let quantity = Decimal::from_f64(units).unwrap_or(Decimal::ZERO);
            let price = Decimal::from_f64(pos.price.unwrap_or(0.0)).unwrap_or(Decimal::ZERO);
            let avg_cost =
                Decimal::from_f64(pos.average_purchase_price.unwrap_or(0.0)).unwrap_or(price);

            position_data.push((spec_key, quantity, price, avg_cost, currency));
        }

        // 2. Ensure assets exist via service layer (dedup by instrument_key)
        let ensure_result = self
            .asset_service
            .ensure_assets(asset_specs.clone(), self.activity_repository.as_ref())
            .await?;

        let assets_created = ensure_result.created_ids.len();
        let new_asset_ids = ensure_result.created_ids.clone();

        // Build instrument_key → asset_id lookup
        let mut key_to_asset_id: HashMap<String, String> = HashMap::new();
        for asset in ensure_result.assets.values() {
            if let Some(ref key) = asset.instrument_key {
                key_to_asset_id.insert(key.clone(), asset.id.clone());
            }
        }

        // Also map by direct asset id
        for (id, _asset) in &ensure_result.assets {
            key_to_asset_id.insert(id.clone(), id.clone());
        }

        // 3. Build spec_key → asset_id mapping
        let mut spec_key_to_asset_id: HashMap<String, String> = HashMap::new();
        for (spec_key, idx) in &spec_key_to_idx {
            let spec = &asset_specs[*idx];
            // Try instrument_key first
            if let Some(ikey) = spec.instrument_key() {
                if let Some(asset_id) = key_to_asset_id.get(&ikey) {
                    spec_key_to_asset_id.insert(spec_key.clone(), asset_id.clone());
                    continue;
                }
            }
            // Fall back to ID if provided
            if let Some(ref id) = spec.id {
                if let Some(asset_id) = key_to_asset_id.get(id) {
                    spec_key_to_asset_id.insert(spec_key.clone(), asset_id.clone());
                }
            }
        }

        // 4. Build positions_map using resolved asset IDs
        let mut positions_map: HashMap<String, Position> = HashMap::new();
        let mut total_cost_basis = Decimal::ZERO;

        for (spec_key, quantity, _price, avg_cost, currency) in &position_data {
            let asset_id = match spec_key_to_asset_id.get(spec_key) {
                Some(id) => id.clone(),
                None => {
                    warn!("Could not resolve asset for position key '{}'", spec_key);
                    continue;
                }
            };

            let position_cost_basis = *quantity * *avg_cost;
            total_cost_basis += position_cost_basis;

            let position = Position {
                id: format!("{}_{}", account_id, asset_id),
                account_id: account_id.clone(),
                asset_id: asset_id.clone(),
                quantity: *quantity,
                average_cost: *avg_cost,
                total_cost_basis: position_cost_basis,
                currency: currency.clone(),
                inception_date: now,
                lots: VecDeque::new(),
                created_at: now,
                last_updated: now,
                is_alternative: false,
            };
            positions_map.insert(asset_id, position);
        }

        // Calculate cash totals
        let cash_total = cash_balances
            .get(&account_currency)
            .copied()
            .unwrap_or(Decimal::ZERO);

        // Build the snapshot
        let snapshot = AccountStateSnapshot {
            id: format!("{}_{}", account_id, today.format("%Y-%m-%d")),
            account_id: account_id.clone(),
            snapshot_date: today,
            currency: account_currency,
            positions: positions_map.clone(),
            cash_balances,
            cost_basis: total_cost_basis,
            net_contribution: Decimal::ZERO,
            net_contribution_base: Decimal::ZERO,
            cash_total_account_currency: cash_total,
            cash_total_base_currency: Decimal::ZERO,
            calculated_at: now.naive_utc(),
            source: SnapshotSource::BrokerImported,
        };

        let positions_count = positions_map.len();

        // Check if content is unchanged from latest snapshot (skip if identical)
        let tomorrow = today + chrono::Days::new(1);
        let latest = self
            .snapshot_repository
            .get_latest_snapshot_before_date(&account_id, tomorrow)?;

        if let Some(existing) = latest {
            if existing.is_content_equal(&snapshot) {
                debug!(
                    "Broker holdings unchanged for account {}, skipping save",
                    account_id
                );
                return Ok((positions_count, 0, vec![]));
            }
        }

        // Save snapshot via SnapshotService if available (it emits HoldingsChanged internally)
        // Otherwise fall back to raw SQL and emit events manually
        if let Some(ref snapshot_service) = self.snapshot_service {
            snapshot_service
                .save_manual_snapshot(&account_id, snapshot)
                .await?;
        } else {
            let snapshot_db: AccountStateSnapshotDB = snapshot.into();
            let writer = self.writer.clone();
            writer
                .exec(move |conn| {
                    use diesel::prelude::*;
                    diesel::insert_into(schema::holdings_snapshots::table)
                        .values(&snapshot_db)
                        .on_conflict(schema::holdings_snapshots::id)
                        .do_update()
                        .set((
                            schema::holdings_snapshots::positions.eq(&snapshot_db.positions),
                            schema::holdings_snapshots::cash_balances.eq(&snapshot_db.cash_balances),
                            schema::holdings_snapshots::cost_basis.eq(&snapshot_db.cost_basis),
                            schema::holdings_snapshots::net_contribution
                                .eq(&snapshot_db.net_contribution),
                            schema::holdings_snapshots::net_contribution_base
                                .eq(&snapshot_db.net_contribution_base),
                            schema::holdings_snapshots::cash_total_account_currency
                                .eq(&snapshot_db.cash_total_account_currency),
                            schema::holdings_snapshots::cash_total_base_currency
                                .eq(&snapshot_db.cash_total_base_currency),
                            schema::holdings_snapshots::calculated_at.eq(&snapshot_db.calculated_at),
                            schema::holdings_snapshots::source.eq(&snapshot_db.source),
                        ))
                        .execute(conn)
                        .map_err(StorageError::from)?;
                    Ok::<_, wealthfolio_core::errors::Error>(())
                })
                .await?;

            self.event_sink.emit(DomainEvent::HoldingsChanged {
                account_ids: vec![account_id.clone()],
                asset_ids: new_asset_ids.clone(),
            });

            self.ensure_holdings_history(&account_id).await?;
        }

        info!(
            "Saved broker holdings for account {}: {} positions, {} assets created, {} new asset IDs",
            account_id, positions_count, assets_created, new_asset_ids.len()
        );

        Ok((positions_count, assets_created, new_asset_ids))
    }
}

impl BrokerSyncService {
    /// Ensures HOLDINGS mode accounts have at least 2 snapshots for proper history.
    /// If only 1 non-calculated snapshot exists, creates a synthetic snapshot 3 months prior.
    async fn ensure_holdings_history(&self, account_id: &str) -> Result<()> {
        // Get count of non-calculated snapshots
        let count = self
            .snapshot_repository
            .get_non_calculated_snapshot_count(account_id)?;

        if count >= 2 {
            debug!(
                "Account {} already has {} non-calculated snapshots, no synthetic needed",
                account_id, count
            );
            return Ok(());
        }

        if count == 0 {
            debug!(
                "Account {} has no non-calculated snapshots, nothing to backfill from",
                account_id
            );
            return Ok(());
        }

        // count == 1: Create synthetic snapshot 3 months before the earliest
        let earliest = self
            .snapshot_repository
            .get_earliest_non_calculated_snapshot(account_id)?;

        let earliest = match earliest {
            Some(s) => s,
            None => {
                debug!("No earliest snapshot found for account {}", account_id);
                return Ok(());
            }
        };

        // Calculate synthetic date: 3 months before earliest
        let synthetic_date = earliest
            .snapshot_date
            .checked_sub_months(Months::new(3))
            .unwrap_or(earliest.snapshot_date);

        // Don't create if synthetic date equals earliest (edge case)
        if synthetic_date == earliest.snapshot_date {
            debug!(
                "Synthetic date equals earliest date for account {}, skipping",
                account_id
            );
            return Ok(());
        }

        // Clone the earliest snapshot with new date and source
        let synthetic = AccountStateSnapshot {
            id: format!("{}_{}", account_id, synthetic_date.format("%Y-%m-%d")),
            account_id: account_id.to_string(),
            snapshot_date: synthetic_date,
            source: SnapshotSource::Synthetic,
            calculated_at: chrono::Utc::now().naive_utc(),
            // Clone all holdings data from earliest
            currency: earliest.currency,
            positions: earliest.positions,
            cash_balances: earliest.cash_balances,
            cost_basis: earliest.cost_basis,
            net_contribution: earliest.net_contribution,
            net_contribution_base: earliest.net_contribution_base,
            cash_total_account_currency: earliest.cash_total_account_currency,
            cash_total_base_currency: earliest.cash_total_base_currency,
        };

        self.snapshot_repository
            .save_or_update_snapshot(&synthetic)
            .await?;

        info!(
            "Created synthetic snapshot for account {} at {} (3 months before {})",
            account_id, synthetic_date, earliest.snapshot_date
        );

        Ok(())
    }

    /// Find the platform ID for a broker account based on its institution name
    fn find_platform_for_account(&self, broker_account: &BrokerAccount) -> Result<Option<String>> {
        // First, try to find platform by matching institution name
        let platforms = self.platform_repository.list()?;

        // Get institution name, returning None if not available
        let institution_name = match &broker_account.institution_name {
            Some(name) if !name.is_empty() => name,
            _ => {
                warn!("No institution name for broker account, cannot find platform");
                return Ok(None);
            }
        };

        // Normalize institution name for matching
        let institution_normalized = institution_name
            .to_uppercase()
            .replace([' ', '-'], "_");

        // Try exact match first
        for platform in &platforms {
            if platform.id.to_uppercase() == institution_normalized {
                return Ok(Some(platform.id.clone()));
            }
        }

        // Try partial match
        for platform in &platforms {
            let platform_normalized = platform.id.to_uppercase();
            if institution_normalized.contains(&platform_normalized)
                || platform_normalized.contains(&institution_normalized)
            {
                return Ok(Some(platform.id.clone()));
            }
        }

        // Try matching by platform name
        for platform in &platforms {
            if let Some(name) = &platform.name {
                let name_normalized = name.to_uppercase().replace([' ', '-'], "_");
                if name_normalized == institution_normalized
                    || institution_normalized.contains(&name_normalized)
                    || name_normalized.contains(&institution_normalized)
                {
                    return Ok(Some(platform.id.clone()));
                }
            }
        }

        // No match found - create a new platform entry
        // This ensures we always have a platform for the account
        warn!(
            "No existing platform found for institution: {}",
            institution_name
        );
        Ok(None)
    }
}

