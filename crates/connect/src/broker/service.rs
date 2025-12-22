//! Service for synchronizing broker data to the local database.

use async_trait::async_trait;
use log::{debug, info, warn};
use std::sync::Arc;

use super::brokers_sync_state_repository::BrokersSyncStateRepository;
use super::broker_models::{AccountUniversalActivity, BrokerAccount, BrokerConnection, SyncAccountsResponse, SyncConnectionsResponse};
use super::platform_repository::{Platform, PlatformRepository};
use super::sync_traits::SyncServiceTrait;
use crate::accounts::{Account, AccountRepositoryTrait, NewAccount};
use crate::errors::Result;
use crate::{activities::activities_model::NewActivity, assets::assets_model::AssetDB, db::WriteHandle, schema};
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use std::collections::HashSet;

const DEFAULT_BROKERAGE_PROVIDER: &str = "snaptrade";

/// Service for syncing broker data to the local database
pub struct SyncService {
    account_repository: Arc<dyn AccountRepositoryTrait>,
    platform_repository: Arc<PlatformRepository>,
    brokers_sync_state_repository: Arc<BrokersSyncStateRepository>,
    writer: WriteHandle,
}

impl SyncService {
    pub fn new(
        account_repository: Arc<dyn AccountRepositoryTrait>,
        platform_repository: Arc<PlatformRepository>,
        pool: std::sync::Arc<crate::db::DbPool>,
        writer: WriteHandle,
    ) -> Self {
        Self {
            account_repository,
            platform_repository,
            brokers_sync_state_repository: Arc::new(BrokersSyncStateRepository::new(
                pool,
                writer.clone(),
            )),
            writer,
        }
    }
}

#[async_trait]
impl SyncServiceTrait for SyncService {
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
                    warn!("Skipping connection with no brokerage slug or id: {:?}", connection.id);
                    continue;
                }

                // Check if platform already exists
                let existing = self.platform_repository.get_by_id(&platform_id)?;

                let platform = Platform {
                    id: platform_id.clone(),
                    name: brokerage.display_name.clone().or(brokerage.name.clone()),
                    url: format!("https://{}.com", platform_id.to_lowercase().replace('_', "")),
                    external_id: brokerage.id.clone(),
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

        // Get all existing accounts with external_id to check for updates
        let existing_accounts = self.account_repository.list(None, None)?;
        let external_id_map: std::collections::HashMap<String, Account> = existing_accounts
            .into_iter()
            .filter_map(|a| a.external_id.clone().map(|ext_id| (ext_id, a)))
            .collect();

        for broker_account in &broker_accounts {
            // Skip paper/demo accounts
            if broker_account.is_paper {
                debug!("Skipping paper account: {}", broker_account.id);
                skipped += 1;
                continue;
            }

            // Check if account already exists by external_id
            if let Some(_existing) = external_id_map.get(&broker_account.id) {
                // Account exists - for now we skip updates to preserve user customizations
                // In the future, we might want to update certain fields selectively
                debug!(
                    "Account already synced, skipping: {} ({})",
                    broker_account.display_name(),
                    broker_account.id
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
                account_type: broker_account.account_type(),
                group: None,
                currency: broker_account.currency(),
                is_default: false,
                is_active: broker_account.status.as_deref() != Some("closed"),
                platform_id,
                external_id: Some(broker_account.id.clone()),
                account_number: Some(broker_account.account_number.clone()),
                meta: broker_account.to_meta_json(),
            };

            // Create the account in a transaction
            let repo = self.account_repository.clone();
            self.writer
                .exec(move |conn| repo.create_in_transaction(new_account, conn))
                .await?;

            created += 1;
            info!(
                "Created account: {} ({}) -> {}",
                broker_account.display_name(),
                broker_account.id,
                broker_account.account_type()
            );
        }

        Ok(SyncAccountsResponse {
            synced: broker_accounts.len(),
            created,
            updated,
            skipped,
        })
    }

    /// Get all synced accounts (accounts with external_id set)
    fn get_synced_accounts(&self) -> Result<Vec<Account>> {
        let all_accounts = self.account_repository.list(None, None)?;
        Ok(all_accounts
            .into_iter()
            .filter(|a| a.external_id.is_some())
            .collect())
    }

    /// Get all platforms
    fn get_platforms(&self) -> Result<Vec<Platform>> {
        self.platform_repository.list()
    }

    fn get_activity_sync_state(
        &self,
        account_id: &str,
    ) -> Result<Option<super::BrokersSyncState>> {
        self.brokers_sync_state_repository.get_by_account_id(account_id)
    }

    async fn mark_activity_sync_attempt(&self, account_id: String) -> Result<()> {
        self.brokers_sync_state_repository
            .upsert_attempt(account_id, DEFAULT_BROKERAGE_PROVIDER.to_string())
            .await
    }

    async fn upsert_account_activities(
        &self,
        account_id: String,
        activities: Vec<AccountUniversalActivity>,
    ) -> Result<(usize, usize)> {
        use diesel::prelude::*;

        if activities.is_empty() {
            return Ok((0, 0));
        }

        let now_rfc3339 = chrono::Utc::now().to_rfc3339();
        let now_naive = chrono::Utc::now().naive_utc();

        let mut asset_rows: Vec<AssetDB> = Vec::new();
        let mut seen_assets: HashSet<String> = HashSet::new();

        let mut activity_rows: Vec<crate::activities::activities_model::ActivityDB> = Vec::new();
        let mut seen_activity_ids: HashSet<String> = HashSet::new();

        for activity in activities {
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

            let raw_type = activity
                .activity_type
                .clone()
                .unwrap_or_else(|| "UNKNOWN".to_string());
            let Some(mapped_type) = map_broker_activity_type(&raw_type, activity.amount, activity.units) else {
                warn!(
                    "Skipping unmapped broker activity {} (type='{}') for account {}",
                    activity_id, raw_type, account_id
                );
                continue;
            };

            let is_cash_like = matches!(
                mapped_type.as_str(),
                crate::activities::ACTIVITY_TYPE_DEPOSIT
                    | crate::activities::ACTIVITY_TYPE_WITHDRAWAL
                    | crate::activities::ACTIVITY_TYPE_DIVIDEND
                    | crate::activities::ACTIVITY_TYPE_INTEREST
                    | crate::activities::ACTIVITY_TYPE_FEE
                    | crate::activities::ACTIVITY_TYPE_TAX
                    | crate::activities::ACTIVITY_TYPE_TRANSFER_IN
                    | crate::activities::ACTIVITY_TYPE_TRANSFER_OUT
            );

            let asset_id = activity
                .option_symbol
                .as_ref()
                .and_then(|s| s.ticker.clone())
                .or_else(|| activity.symbol.as_ref().and_then(|s| s.symbol.clone()))
                .filter(|s| !s.trim().is_empty())
                .or_else(|| {
                    if is_cash_like {
                        Some(format!("$CASH-{}", currency_code))
                    } else {
                        None
                    }
                });

            let Some(asset_id) = asset_id else {
                warn!(
                    "Skipping broker activity {} (type='{}'): missing symbol/option symbol",
                    activity_id, mapped_type
                );
                continue;
            };

            if seen_assets.insert(asset_id.clone()) {
                let asset_db = if asset_id.starts_with("$CASH-") {
                    let new_asset = crate::assets::NewAsset::new_cash_asset(&currency_code);
                    let mut db: AssetDB = new_asset.into();
                    db.created_at = now_naive;
                    db.updated_at = now_naive;
                    db
                } else {
                    let symbol_type_label = activity
                        .symbol
                        .as_ref()
                        .and_then(|s| s.symbol_type.as_ref())
                        .and_then(|t| broker_symbol_type_label(t.code.as_deref(), t.description.as_deref()));

                    AssetDB {
                        id: asset_id.clone(),
                        symbol: asset_id.clone(),
                        name: activity
                            .symbol
                            .as_ref()
                            .and_then(|s| s.description.clone())
                            .filter(|d| !d.trim().is_empty()),
                        asset_type: symbol_type_label.clone(),
                        asset_class: symbol_type_label,
                        currency: currency_code.clone(),
                        data_source: crate::market_data::market_data_model::DataSource::Yahoo
                            .as_str()
                            .to_string(),
                        created_at: now_naive,
                        updated_at: now_naive,
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

            let new_activity = NewActivity {
                id: Some(activity_id),
                account_id: account_id.clone(),
                asset_id,
                asset_data_source: None,
                activity_type: mapped_type,
                activity_date,
                quantity: Some(quantity),
                unit_price: Some(unit_price),
                currency: currency_code,
                fee: Some(fee),
                amount,
                is_draft: true, // Synced activities need user review
                comment: activity
                    .description
                    .clone()
                    .filter(|d| !d.trim().is_empty())
                    .or(activity.external_reference_id.clone()),
                fx_rate,
                provider_type: activity
                    .provider_type
                    .clone()
                    .filter(|t| !t.trim().is_empty()),
                external_provider_id: Some(activity.id.clone().unwrap_or_default())
                    .filter(|id| !id.trim().is_empty()),
                external_broker_id: activity
                    .external_reference_id
                    .clone()
                    .filter(|id| !id.trim().is_empty()),
            };

            activity_rows.push(new_activity.into());
        }

        let writer = self.writer.clone();
        let account_id_for_log = account_id.clone();
        let activities_count = activity_rows.len();

        let (activities_upserted, assets_inserted) = writer
            .exec(move |conn| {
                use diesel::upsert::excluded;

                let mut assets_inserted: usize = 0;
                for asset_db in asset_rows {
                    let asset_id = asset_db.id.clone();
                    let asset_type = asset_db.asset_type.clone();
                    let asset_class = asset_db.asset_class.clone();

                    assets_inserted += diesel::insert_into(schema::assets::table)
                        .values(&asset_db)
                        .on_conflict(schema::assets::id)
                        .do_nothing()
                        .execute(conn)?;

                    if let Some(asset_type) = asset_type {
                        diesel::update(
                            schema::assets::table
                                .filter(schema::assets::id.eq(&asset_id))
                                .filter(schema::assets::asset_type.is_null()),
                        )
                        .set(schema::assets::asset_type.eq(asset_type))
                        .execute(conn)?;
                    }
                    if let Some(asset_class) = asset_class {
                        diesel::update(
                            schema::assets::table
                                .filter(schema::assets::id.eq(&asset_id))
                                .filter(schema::assets::asset_class.is_null()),
                        )
                        .set(schema::assets::asset_class.eq(asset_class))
                        .execute(conn)?;
                    }
                }

                let mut activities_upserted: usize = 0;
                for activity_db in activity_rows {
                    let now_update = chrono::Utc::now().to_rfc3339();
                    activities_upserted += diesel::insert_into(schema::activities::table)
                        .values(&activity_db)
                        .on_conflict(schema::activities::id)
                        .do_update()
                        .set((
                            schema::activities::account_id.eq(excluded(schema::activities::account_id)),
                            schema::activities::asset_id.eq(excluded(schema::activities::asset_id)),
                            schema::activities::activity_type.eq(excluded(schema::activities::activity_type)),
                            schema::activities::activity_date.eq(excluded(schema::activities::activity_date)),
                            schema::activities::quantity.eq(excluded(schema::activities::quantity)),
                            schema::activities::unit_price.eq(excluded(schema::activities::unit_price)),
                            schema::activities::currency.eq(excluded(schema::activities::currency)),
                            schema::activities::fee.eq(excluded(schema::activities::fee)),
                            schema::activities::amount.eq(excluded(schema::activities::amount)),
                            schema::activities::is_draft.eq(excluded(schema::activities::is_draft)),
                            schema::activities::comment.eq(excluded(schema::activities::comment)),
                            schema::activities::fx_rate.eq(excluded(schema::activities::fx_rate)),
                            schema::activities::provider_type
                                .eq(excluded(schema::activities::provider_type)),
                            schema::activities::external_provider_id
                                .eq(excluded(schema::activities::external_provider_id)),
                            schema::activities::external_broker_id
                                .eq(excluded(schema::activities::external_broker_id)),
                            schema::activities::updated_at.eq(now_update),
                        ))
                        .execute(conn)?;
                }

                Ok((activities_upserted, assets_inserted))
            })
            .await?;

        debug!(
            "Upserted {} activities for account {} ({} assets inserted)",
            activities_count, account_id_for_log, assets_inserted
        );

        Ok((activities_upserted, assets_inserted))
    }

    async fn finalize_activity_sync_success(
        &self,
        account_id: String,
        last_synced_date: String,
    ) -> Result<()> {
        self.brokers_sync_state_repository
            .upsert_success(account_id, DEFAULT_BROKERAGE_PROVIDER.to_string(), last_synced_date)
            .await
    }

    async fn finalize_activity_sync_failure(&self, account_id: String, error: String) -> Result<()> {
        self.brokers_sync_state_repository
            .upsert_failure(account_id, DEFAULT_BROKERAGE_PROVIDER.to_string(), error)
            .await
    }
}

impl SyncService {
    /// Find the platform ID for a broker account based on its institution name
    fn find_platform_for_account(&self, broker_account: &BrokerAccount) -> Result<Option<String>> {
        // First, try to find platform by matching institution name
        let platforms = self.platform_repository.list()?;

        // Normalize institution name for matching
        let institution_normalized = broker_account
            .institution_name
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
            broker_account.institution_name
        );
        Ok(None)
    }
}

fn map_broker_activity_type(
    raw_type: &str,
    amount: Option<f64>,
    units: Option<f64>,
) -> Option<String> {
    let t = raw_type.trim().to_uppercase();
    if t.is_empty() {
        return None;
    }

    let is_finite = |v: f64| v.is_finite();
    let is_nonzero = |v: f64| is_finite(v) && v != 0.0;

    let infer_direction = || {
        if let Some(a) = amount.filter(|a| is_nonzero(*a)) {
            return Some(if a > 0.0 { "IN" } else { "OUT" });
        }
        if let Some(u) = units.filter(|u| is_nonzero(*u)) {
            return Some(if u > 0.0 { "IN" } else { "OUT" });
        }
        None
    };

    let wealthfolio_passthrough = matches!(
        t.as_str(),
        crate::activities::ACTIVITY_TYPE_BUY
            | crate::activities::ACTIVITY_TYPE_SELL
            | crate::activities::ACTIVITY_TYPE_DIVIDEND
            | crate::activities::ACTIVITY_TYPE_INTEREST
            | crate::activities::ACTIVITY_TYPE_DEPOSIT
            | crate::activities::ACTIVITY_TYPE_WITHDRAWAL
            | crate::activities::ACTIVITY_TYPE_ADD_HOLDING
            | crate::activities::ACTIVITY_TYPE_REMOVE_HOLDING
            | crate::activities::ACTIVITY_TYPE_TRANSFER_IN
            | crate::activities::ACTIVITY_TYPE_TRANSFER_OUT
            | crate::activities::ACTIVITY_TYPE_FEE
            | crate::activities::ACTIVITY_TYPE_TAX
            | crate::activities::ACTIVITY_TYPE_SPLIT
    );
    if wealthfolio_passthrough {
        return Some(t);
    }

    match t.as_str() {
        "BUY" => Some(crate::activities::ACTIVITY_TYPE_BUY.to_string()),
        "SELL" => Some(crate::activities::ACTIVITY_TYPE_SELL.to_string()),
        "DIVIDEND" => Some(crate::activities::ACTIVITY_TYPE_DIVIDEND.to_string()),
        "INTEREST" | "CRYPTO_STAKING_REWARD" => Some(crate::activities::ACTIVITY_TYPE_INTEREST.to_string()),
        "CONTRIBUTION" | "DEPOSIT" => Some(crate::activities::ACTIVITY_TYPE_DEPOSIT.to_string()),
        "WITHDRAWAL" => Some(crate::activities::ACTIVITY_TYPE_WITHDRAWAL.to_string()),
        "REI" => Some(crate::activities::ACTIVITY_TYPE_BUY.to_string()),
        "STOCK_DIVIDEND" => Some(crate::activities::ACTIVITY_TYPE_ADD_HOLDING.to_string()),
        "FEE" => Some(crate::activities::ACTIVITY_TYPE_FEE.to_string()),
        "TAX" => Some(crate::activities::ACTIVITY_TYPE_TAX.to_string()),
        "SPLIT" => Some(crate::activities::ACTIVITY_TYPE_SPLIT.to_string()),
        "EXTERNAL_ASSET_TRANSFER_IN" => Some(crate::activities::ACTIVITY_TYPE_ADD_HOLDING.to_string()),
        "EXTERNAL_ASSET_TRANSFER_OUT" => Some(crate::activities::ACTIVITY_TYPE_REMOVE_HOLDING.to_string()),
        "TRANSFER" => match infer_direction() {
            Some("IN") => Some(crate::activities::ACTIVITY_TYPE_TRANSFER_IN.to_string()),
            Some("OUT") => Some(crate::activities::ACTIVITY_TYPE_TRANSFER_OUT.to_string()),
            _ => None,
        },
        "ADJUSTMENT" => match infer_direction() {
            Some("IN") => match amount.filter(|a| is_nonzero(*a)) {
                Some(_) => Some(crate::activities::ACTIVITY_TYPE_DEPOSIT.to_string()),
                None => Some(crate::activities::ACTIVITY_TYPE_ADD_HOLDING.to_string()),
            },
            Some("OUT") => match amount.filter(|a| is_nonzero(*a)) {
                Some(_) => Some(crate::activities::ACTIVITY_TYPE_WITHDRAWAL.to_string()),
                None => Some(crate::activities::ACTIVITY_TYPE_REMOVE_HOLDING.to_string()),
            },
            _ => None,
        },
        "OPTIONEXERCISE" | "OPTIONASSIGNMENT" => match infer_direction() {
            Some("IN") => match amount.filter(|a| is_nonzero(*a)) {
                Some(_) => Some(crate::activities::ACTIVITY_TYPE_SELL.to_string()),
                None => Some(crate::activities::ACTIVITY_TYPE_BUY.to_string()),
            },
            Some("OUT") => match amount.filter(|a| is_nonzero(*a)) {
                Some(_) => Some(crate::activities::ACTIVITY_TYPE_BUY.to_string()),
                None => Some(crate::activities::ACTIVITY_TYPE_SELL.to_string()),
            },
            _ => None,
        },
        "OPTIONEXPIRATION" => match units.filter(|u| is_nonzero(*u)) {
            Some(u) if u < 0.0 => Some(crate::activities::ACTIVITY_TYPE_REMOVE_HOLDING.to_string()),
            Some(_) => Some(crate::activities::ACTIVITY_TYPE_ADD_HOLDING.to_string()),
            None => Some(crate::activities::ACTIVITY_TYPE_REMOVE_HOLDING.to_string()),
        },
        _ => None,
    }
}

fn broker_symbol_type_label(code: Option<&str>, description: Option<&str>) -> Option<String> {
    let label = description
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(str::to_string);
    if label.is_some() {
        return label;
    }

    let code = code.map(str::trim).filter(|c| !c.is_empty())?;
    let words = code
        .split(|c: char| c == '_' || c == '-' || c.is_whitespace())
        .filter(|w| !w.is_empty());

    let mut out = String::new();
    for (idx, word) in words.enumerate() {
        if idx > 0 {
            out.push(' ');
        }
        out.push_str(&capitalize_word(word));
    }
    if out.is_empty() { None } else { Some(out) }
}

fn capitalize_word(word: &str) -> String {
    let mut chars = word.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    let mut out = String::new();
    out.extend(first.to_uppercase());
    out.push_str(&chars.as_str().to_lowercase());
    out
}
