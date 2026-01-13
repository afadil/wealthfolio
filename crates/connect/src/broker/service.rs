//! Service for synchronizing broker data to the local database.

use async_trait::async_trait;
use log::{debug, error, info, warn};
use serde_json::json;
use std::sync::Arc;

use super::mapping;
use super::models::{
    AccountUniversalActivity, BrokerAccount, BrokerConnection, SyncAccountsResponse,
    SyncConnectionsResponse,
};
use super::traits::BrokerSyncServiceTrait;
use crate::platform::{Platform, PlatformRepository};
use crate::state::BrokerSyncState;
use crate::state::BrokerSyncStateRepository;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use std::collections::HashSet;
use wealthfolio_core::accounts::{Account, AccountServiceTrait, NewAccount};
use wealthfolio_core::activities::{self, NewActivity};
use wealthfolio_core::assets::{canonical_asset_id, AssetKind, NewAsset};
use wealthfolio_core::errors::Result;
use wealthfolio_core::quotes::DataSource;
use wealthfolio_core::sync::ImportRun;
use wealthfolio_storage_sqlite::activities::ActivityDB;
use wealthfolio_storage_sqlite::assets::AssetDB;
use wealthfolio_storage_sqlite::db::{DbPool, WriteHandle};
use wealthfolio_storage_sqlite::errors::StorageError;
use wealthfolio_storage_sqlite::schema;
use wealthfolio_storage_sqlite::sync::ImportRunRepository;

const DEFAULT_BROKERAGE_PROVIDER: &str = "snaptrade";

/// Service for syncing broker data to the local database
pub struct BrokerSyncService {
    account_service: Arc<dyn AccountServiceTrait>,
    platform_repository: Arc<PlatformRepository>,
    brokers_sync_state_repository: Arc<BrokerSyncStateRepository>,
    import_run_repository: Arc<ImportRunRepository>,
    writer: WriteHandle,
}

impl BrokerSyncService {
    pub fn new(
        account_service: Arc<dyn AccountServiceTrait>,
        platform_repository: Arc<PlatformRepository>,
        pool: Arc<DbPool>,
        writer: WriteHandle,
    ) -> Self {
        Self {
            account_service,
            platform_repository,
            brokers_sync_state_repository: Arc::new(BrokerSyncStateRepository::new(
                pool.clone(),
                writer.clone(),
            )),
            import_run_repository: Arc::new(ImportRunRepository::new(pool, writer.clone())),
            writer,
        }
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

            // Create new account
            let new_account = NewAccount {
                id: None, // Let the repository generate a UUID
                name: broker_account.display_name(),
                account_type: broker_account.get_account_type(),
                group: None,
                currency: broker_account.get_currency(),
                is_default: false,
                is_active: broker_account.status.as_deref() != Some("closed"),
                platform_id,
                account_number: broker_account.account_number.clone(),
                meta: broker_account.to_meta_json(),
                provider: Some("SNAPTRADE".to_string()),
                provider_account_id: Some(provider_account_id.clone()),
            };

            // Create the account via AccountService (handles FX rate registration)
            let account = self.account_service.create_account(new_account).await?;
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
        activities_data: Vec<AccountUniversalActivity>,
    ) -> Result<(usize, usize, Vec<String>)> {
        use diesel::prelude::*;

        if activities_data.is_empty() {
            return Ok((0, 0, Vec::new()));
        }

        let now_rfc3339 = chrono::Utc::now().to_rfc3339();

        let mut asset_rows: Vec<AssetDB> = Vec::new();
        let mut seen_assets: HashSet<String> = HashSet::new();

        let mut activity_rows: Vec<ActivityDB> = Vec::new();
        let mut seen_activity_ids: HashSet<String> = HashSet::new();

        for activity in activities_data {
            let activity_id = match activity.id.clone().filter(|v| !v.trim().is_empty()) {
                Some(v) => v,
                None => continue,
            };
            if !seen_activity_ids.insert(activity_id.clone()) {
                continue;
            }

            let currency_code = activity
                .currency
                .as_ref()
                .and_then(|c| c.code.clone())
                .filter(|c| !c.trim().is_empty())
                .unwrap_or_else(|| "USD".to_string());

            // Get activity type from API (should be mapped to canonical type on API side)
            let activity_type = activity
                .activity_type
                .clone()
                .map(|t| t.trim().to_uppercase())
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| "UNKNOWN".to_string());

            // Use subtype directly from the API (API does the mapping now)
            let subtype = activity.subtype.clone();

            // Calculate needs_review flag using mapping module
            let needs_review = mapping::needs_review(&activity);

            // Build metadata JSON with flow info, confidence, reasons, and raw_type
            let metadata = mapping::build_activity_metadata(&activity);

            let is_cash_like = matches!(
                activity_type.as_str(),
                activities::ACTIVITY_TYPE_DEPOSIT
                    | activities::ACTIVITY_TYPE_WITHDRAWAL
                    | activities::ACTIVITY_TYPE_DIVIDEND
                    | activities::ACTIVITY_TYPE_INTEREST
                    | activities::ACTIVITY_TYPE_FEE
                    | activities::ACTIVITY_TYPE_TAX
                    | activities::ACTIVITY_TYPE_TRANSFER_IN
                    | activities::ACTIVITY_TYPE_TRANSFER_OUT
                    | activities::ACTIVITY_TYPE_CREDIT
            );

            // Extract symbol reference for convenience
            let symbol_ref = activity.symbol.as_ref();
            let symbol_type_ref = symbol_ref.and_then(|s| s.symbol_type.as_ref());

            // Determine asset kind from broker symbol type
            let symbol_type_code = symbol_type_ref.and_then(|t| t.code.as_deref());
            let asset_kind = broker_symbol_type_to_kind(symbol_type_code);

            // Extract exchange MIC from broker data (prefer mic_code over code)
            let exchange_mic = symbol_ref
                .and_then(|s| s.exchange.as_ref())
                .and_then(|e| {
                    e.mic_code
                        .clone()
                        .filter(|c| !c.trim().is_empty())
                        .or_else(|| e.code.clone().filter(|c| !c.trim().is_empty()))
                });

            // Get the symbol's currency
            let symbol_currency = symbol_ref
                .and_then(|s| s.currency.as_ref())
                .and_then(|c| c.code.clone())
                .filter(|c| !c.trim().is_empty());

            // Determine the display symbol based on asset type
            // For crypto: we want the base symbol (e.g., "SOL" not "SOL-USD")
            // For securities: use raw_symbol if available, else broker symbol
            let display_symbol: Option<String> = match asset_kind {
                AssetKind::Crypto => {
                    // For crypto: raw_symbol > extract base from symbol field
                    symbol_ref
                        .and_then(|s| s.raw_symbol.clone())
                        .filter(|r| !r.trim().is_empty())
                        .or_else(|| {
                            // Try to extract base from symbol field (e.g., "SOL-CAD" -> "SOL")
                            symbol_ref
                                .and_then(|s| s.symbol.clone())
                                .filter(|sym| !sym.trim().is_empty())
                                .map(|sym| {
                                    sym.split('-')
                                        .next()
                                        .unwrap_or(&sym)
                                        .to_string()
                                })
                        })
                }
                _ => {
                    // For securities/other: raw_symbol > symbol (without exchange suffix)
                    symbol_ref
                        .and_then(|s| s.raw_symbol.clone())
                        .filter(|r| !r.trim().is_empty())
                        .or_else(|| {
                            symbol_ref
                                .and_then(|s| s.symbol.clone())
                                .filter(|sym| !sym.trim().is_empty())
                                .map(|sym| {
                                    // Remove exchange suffix like ".TO" for canonical ID
                                    // The exchange is stored separately in exchange_mic
                                    sym.split('.')
                                        .next()
                                        .unwrap_or(&sym)
                                        .to_string()
                                })
                        })
                }
            };

            // Also get option symbol if present
            let option_symbol = activity
                .option_symbol
                .as_ref()
                .and_then(|s| s.ticker.clone())
                .filter(|t| !t.trim().is_empty());

            // Determine asset currency for canonical ID
            let asset_currency = symbol_currency
                .clone()
                .unwrap_or_else(|| currency_code.clone());

            // Generate canonical asset_id using the new format
            let asset_id = if is_cash_like && display_symbol.is_none() && option_symbol.is_none() {
                // Cash activity without symbol - generate CASH:{currency}
                canonical_asset_id(&AssetKind::Cash, &asset_currency, None, &asset_currency)
            } else if let Some(ref opt_sym) = option_symbol {
                // Option symbol takes priority
                canonical_asset_id(&asset_kind, opt_sym, exchange_mic.as_deref(), &asset_currency)
            } else if let Some(ref sym) = display_symbol {
                // Regular symbol
                canonical_asset_id(&asset_kind, sym, exchange_mic.as_deref(), &asset_currency)
            } else {
                // No symbol available - generate UNKNOWN placeholder
                format!("SEC:UNKNOWN:{}", currency_code)
            };

            if seen_assets.insert(asset_id.clone()) {
                let asset_db = if asset_id.starts_with("CASH:") {
                    // Cash asset
                    let new_asset = NewAsset::new_cash_asset(&asset_currency);
                    let mut db: AssetDB = new_asset.into();
                    db.created_at = now_rfc3339.clone();
                    db.updated_at = now_rfc3339.clone();
                    db
                } else if asset_id.contains(":UNKNOWN:") {
                    // Unknown placeholder - use SECURITY kind with NONE pricing
                    AssetDB {
                        id: asset_id.clone(),
                        symbol: "UNKNOWN".to_string(),
                        name: Some("Unknown Asset".to_string()),
                        currency: currency_code.clone(),
                        kind: "SECURITY".to_string(),
                        pricing_mode: "NONE".to_string(),
                        is_active: 1,
                        created_at: now_rfc3339.clone(),
                        updated_at: now_rfc3339.clone(),
                        ..Default::default()
                    }
                } else {
                    // Build metadata with broker info (raw_symbol, exchange, option details)
                    let metadata = build_asset_metadata(&activity);

                    // Use display_symbol for the symbol field, fallback to extracting from asset_id
                    let symbol = option_symbol
                        .clone()
                        .or(display_symbol.clone())
                        .unwrap_or_else(|| {
                            // Extract symbol from canonical ID (e.g., "SEC:AAPL:XNAS" -> "AAPL")
                            asset_id
                                .split(':')
                                .nth(1)
                                .unwrap_or(&asset_id)
                                .to_string()
                        });

                    AssetDB {
                        id: asset_id.clone(),
                        symbol,
                        name: symbol_ref
                            .and_then(|s| s.description.clone())
                            .filter(|d| !d.trim().is_empty()),
                        exchange_mic: exchange_mic.clone(),
                        currency: asset_currency.clone(),
                        kind: asset_kind_to_string(&asset_kind),
                        pricing_mode: "MARKET".to_string(),
                        preferred_provider: Some(DataSource::Yahoo.as_str().to_string()),
                        metadata,
                        created_at: now_rfc3339.clone(),
                        updated_at: now_rfc3339.clone(),
                        ..Default::default()
                    }
                };
                asset_rows.push(asset_db);
            }

            let activity_date = activity
                .trade_date
                .clone()
                .or(activity.settlement_date.clone())
                .unwrap_or_else(|| now_rfc3339.clone());

            let quantity = activity
                .units
                .and_then(Decimal::from_f64)
                .map(|d| d.abs())
                .unwrap_or(Decimal::ZERO);
            let unit_price = activity
                .price
                .and_then(Decimal::from_f64)
                .map(|d| d.abs())
                .unwrap_or(Decimal::ZERO);
            let fee = activity
                .fee
                .and_then(Decimal::from_f64)
                .map(|d| d.abs())
                .unwrap_or(Decimal::ZERO);
            let amount = activity.amount.and_then(Decimal::from_f64).map(|d| d.abs());
            let fx_rate = activity.fx_rate.and_then(Decimal::from_f64);

            // Determine status: needs_review -> Draft, otherwise Draft (synced activities start as Draft)
            let status = if needs_review {
                wealthfolio_core::activities::ActivityStatus::Draft
            } else {
                wealthfolio_core::activities::ActivityStatus::Draft // All synced activities start as Draft
            };

            let new_activity = NewActivity {
                id: Some(activity_id),
                account_id: account_id.clone(),
                // Broker sync provides asset_id directly (already resolved by mapping)
                asset_id: Some(asset_id), // Now Option<String>
                symbol: None, // Not using new symbol-based resolution for broker sync
                exchange_mic: None,
                asset_kind: None,
                pricing_mode: None,
                asset_metadata: None, // Broker sync uses enrichment events instead
                activity_type,
                subtype,
                activity_date,
                quantity: Some(quantity),
                unit_price: Some(unit_price),
                currency: currency_code,
                fee: Some(fee),
                amount,
                status: Some(status),
                notes: activity
                    .description
                    .clone()
                    .filter(|d| !d.trim().is_empty())
                    .or(activity.external_reference_id.clone()),
                fx_rate,
                metadata,
                needs_review: Some(needs_review),
                source_system: activity
                    .source_system
                    .clone()
                    .or(Some("SNAPTRADE".to_string())),
                source_record_id: activity.source_record_id.clone().or(activity.id.clone()),
                source_group_id: activity.source_group_id.clone(),
            };

            activity_rows.push(new_activity.into());
        }

        let writer = self.writer.clone();
        let account_id_for_log = account_id.clone();
        let activities_count = activity_rows.len();
        let assets_count = asset_rows.len();

        // Collect new asset IDs before the closure moves asset_rows
        // Filter out cash and unknown placeholders - they don't need enrichment
        let new_asset_ids: Vec<String> = asset_rows
            .iter()
            .map(|a| a.id.clone())
            .filter(|id| !id.starts_with("CASH:") && !id.contains(":UNKNOWN:"))
            .collect();

        debug!(
            "Preparing to upsert {} activities and {} assets for account {}",
            activities_count, assets_count, account_id_for_log
        );

        // Log first activity for debugging if available
        if let Some(first_activity) = activity_rows.first() {
            debug!(
                "First activity: id={}, type={}, date={}, asset_id={:?}, status={}",
                first_activity.id,
                first_activity.activity_type,
                first_activity.activity_date,
                first_activity.asset_id,
                first_activity.status
            );
        }

        let (activities_upserted, assets_inserted) = writer
            .exec(move |conn| {
                use diesel::upsert::excluded;

                debug!("Starting asset inserts...");
                let mut assets_inserted: usize = 0;
                for asset_db in asset_rows {
                    assets_inserted += diesel::insert_into(schema::assets::table)
                        .values(&asset_db)
                        .on_conflict(schema::assets::id)
                        .do_nothing()
                        .execute(conn)
                        .map_err(StorageError::from)?;
                }

                debug!(
                    "Starting activity inserts ({} activities)...",
                    activity_rows.len()
                );
                let mut activities_upserted: usize = 0;
                for (idx, activity_db) in activity_rows.into_iter().enumerate() {
                    let now_update = chrono::Utc::now().to_rfc3339();
                    let activity_id = activity_db.id.clone();
                    let activity_type = activity_db.activity_type.clone();

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

                debug!("Successfully upserted {} activities", activities_upserted);
                Ok((activities_upserted, assets_inserted))
            })
            .await?;

        debug!(
            "Upserted {} activities for account {} ({} assets inserted, {} new asset IDs)",
            activities_count, account_id_for_log, assets_inserted, new_asset_ids.len()
        );

        Ok((activities_upserted, assets_inserted, new_asset_ids))
    }

    async fn finalize_activity_sync_success(
        &self,
        account_id: String,
        last_synced_date: String,
    ) -> Result<()> {
        self.brokers_sync_state_repository
            .upsert_success(
                account_id,
                DEFAULT_BROKERAGE_PROVIDER.to_string(),
                last_synced_date,
            )
            .await
    }

    async fn finalize_activity_sync_failure(
        &self,
        account_id: String,
        error: String,
    ) -> Result<()> {
        self.brokers_sync_state_repository
            .upsert_failure(account_id, DEFAULT_BROKERAGE_PROVIDER.to_string(), error)
            .await
    }

    fn get_all_sync_states(&self) -> Result<Vec<BrokerSyncState>> {
        self.brokers_sync_state_repository.get_all()
    }

    fn get_import_runs(&self, run_type: Option<&str>, limit: i64) -> Result<Vec<ImportRun>> {
        match run_type {
            Some(rt) => self.import_run_repository.get_by_run_type(rt, limit),
            None => self.import_run_repository.get_all(limit),
        }
    }
}

impl BrokerSyncService {
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
            .replace(' ', "_")
            .replace('-', "_");

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
                let name_normalized = name.to_uppercase().replace(' ', "_").replace('-', "_");
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

/// Map broker symbol type code to AssetKind.
/// Returns None for unknown types (will default to Security).
fn broker_symbol_type_to_kind(code: Option<&str>) -> AssetKind {
    let code = match code {
        Some(c) => c.to_uppercase(),
        None => return AssetKind::Security,
    };

    match code.as_str() {
        // Crypto
        "CRYPTOCURRENCY" | "CRYPTO" => AssetKind::Crypto,
        // Options
        "EQUITY_OPTION" | "OPTION" | "OPTIONS" => AssetKind::Option,
        // Commodities
        "COMMODITY" | "COMMODITIES" => AssetKind::Commodity,
        // Everything else is a security (stocks, ETFs, bonds, funds, etc.)
        _ => AssetKind::Security,
    }
}

/// Convert AssetKind to database string representation.
fn asset_kind_to_string(kind: &AssetKind) -> String {
    kind.as_db_str().to_string()
}

/// Build asset metadata JSON from broker activity data.
/// Stores raw_symbol, exchange details, and option information.
fn build_asset_metadata(activity: &AccountUniversalActivity) -> Option<String> {
    let mut metadata = serde_json::Map::new();

    // Store raw_symbol if different from symbol
    if let Some(ref sym) = activity.symbol {
        if let Some(ref raw) = sym.raw_symbol {
            if sym.symbol.as_ref() != Some(raw) && !raw.trim().is_empty() {
                metadata.insert("raw_symbol".to_string(), json!(raw));
            }
        }

        // Store exchange details (name is useful for display)
        if let Some(ref exchange) = sym.exchange {
            if exchange.name.is_some() {
                metadata.insert(
                    "exchange".to_string(),
                    json!({
                        "code": exchange.code,
                        "name": exchange.name
                    }),
                );
            }
        }
    }

    // Store option details if present
    if let Some(ref opt) = activity.option_symbol {
        let mut option_data = serde_json::Map::new();

        if let Some(ref t) = opt.option_type {
            option_data.insert("type".to_string(), json!(t));
        }
        if let Some(p) = opt.strike_price {
            option_data.insert("strike_price".to_string(), json!(p));
        }
        if let Some(ref e) = opt.expiration_date {
            option_data.insert("expiration_date".to_string(), json!(e));
        }
        if let Some(m) = opt.is_mini_option {
            option_data.insert("is_mini_option".to_string(), json!(m));
        }

        if let Some(ref underlying) = opt.underlying_symbol {
            option_data.insert(
                "underlying".to_string(),
                json!({
                    "symbol": underlying.symbol,
                    "description": underlying.description
                }),
            );
        }

        if !option_data.is_empty() {
            metadata.insert("option".to_string(), json!(option_data));
        }
    }

    if metadata.is_empty() {
        None
    } else {
        serde_json::to_string(&serde_json::Value::Object(metadata)).ok()
    }
}
