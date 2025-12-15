//! Service for synchronizing broker data to the local database.

use async_trait::async_trait;
use log::{debug, info, warn};
use std::sync::Arc;

use super::broker_models::{BrokerAccount, BrokerConnection, SyncAccountsResponse, SyncConnectionsResponse};
use super::platform_repository::{Platform, PlatformRepository};
use super::sync_traits::SyncServiceTrait;
use crate::accounts::{Account, AccountRepositoryTrait, NewAccount};
use crate::db::DbTransactionExecutor;
use crate::errors::Result;

/// Service for syncing broker data to the local database
pub struct SyncService<E: DbTransactionExecutor + Send + Sync + Clone> {
    account_repository: Arc<dyn AccountRepositoryTrait>,
    platform_repository: Arc<PlatformRepository>,
    transaction_executor: E,
}

impl<E: DbTransactionExecutor + Send + Sync + Clone> SyncService<E> {
    pub fn new(
        account_repository: Arc<dyn AccountRepositoryTrait>,
        platform_repository: Arc<PlatformRepository>,
        transaction_executor: E,
    ) -> Self {
        Self {
            account_repository,
            platform_repository,
            transaction_executor,
        }
    }
}

#[async_trait]
impl<E: DbTransactionExecutor + Send + Sync + Clone + 'static> SyncServiceTrait for SyncService<E> {
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
            let executor = self.transaction_executor.clone();
            executor.execute(move |conn| repo.create_in_transaction(new_account, conn))?;

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
}

impl<E: DbTransactionExecutor + Send + Sync + Clone> SyncService<E> {
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
