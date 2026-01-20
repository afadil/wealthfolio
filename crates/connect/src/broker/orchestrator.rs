//! Centralized broker sync orchestrator.
//!
//! This module provides a unified sync implementation that can be used
//! by both Tauri (desktop) and Axum (web) platforms.

use std::collections::HashSet;
use std::sync::Arc;

use log::{debug, error, info};

use super::models::{SyncActivitiesResponse, SyncResult};
use super::progress::{SyncProgressPayload, SyncProgressReporter, SyncStatus};
use super::traits::{BrokerApiClient, BrokerSyncServiceTrait};
use wealthfolio_core::sync::{ImportRunMode, ImportRunStatus, ImportRunSummary};

/// Configuration for sync operations.
#[derive(Debug, Clone)]
pub struct SyncConfig {
    /// Number of activities to fetch per page.
    pub page_limit: i64,
    /// Maximum number of pages to fetch per account (safety limit).
    pub max_pages: usize,
}

impl Default for SyncConfig {
    fn default() -> Self {
        Self {
            page_limit: 1000,
            max_pages: 10_000,
        }
    }
}

/// Orchestrates broker data synchronization.
///
/// This struct encapsulates the sync logic previously duplicated in
/// Tauri commands and Axum handlers. It handles:
/// - Connection syncing
/// - Account syncing (with sync_enabled filtering)
/// - Activity syncing with full pagination support
/// - Progress reporting via a pluggable reporter trait
///
/// # Example
///
/// ```ignore
/// let reporter = Arc::new(TauriProgressReporter::new(app_handle));
/// let orchestrator = SyncOrchestrator::new(sync_service, reporter, SyncConfig::default());
/// let result = orchestrator.sync_all(&api_client).await?;
/// ```
pub struct SyncOrchestrator<P: SyncProgressReporter> {
    sync_service: Arc<dyn BrokerSyncServiceTrait>,
    progress_reporter: Arc<P>,
    config: SyncConfig,
}

impl<P: SyncProgressReporter> SyncOrchestrator<P> {
    /// Create a new sync orchestrator.
    pub fn new(
        sync_service: Arc<dyn BrokerSyncServiceTrait>,
        progress_reporter: Arc<P>,
        config: SyncConfig,
    ) -> Self {
        Self {
            sync_service,
            progress_reporter,
            config,
        }
    }

    /// Perform a full sync: connections -> accounts -> activities.
    ///
    /// This is the main entry point for broker synchronization.
    /// Always emits sync-start and sync-complete/error events.
    pub async fn sync_all(&self, api_client: &dyn BrokerApiClient) -> Result<SyncResult, String> {
        info!("Starting broker data sync...");
        self.progress_reporter.report_sync_start();

        // Run the sync and ensure we always emit completion event
        let result = self.sync_all_internal(api_client).await;

        match &result {
            Ok(sync_result) => {
                self.progress_reporter.report_sync_complete(sync_result);
            }
            Err(err) => {
                // Create a failed result to emit the error event
                let failed_result = SyncResult {
                    success: false,
                    message: err.clone(),
                    connections_synced: None,
                    accounts_synced: None,
                    activities_synced: None,
                };
                self.progress_reporter.report_sync_complete(&failed_result);
            }
        }

        result
    }

    /// Internal sync logic that may fail at any step.
    async fn sync_all_internal(&self, api_client: &dyn BrokerApiClient) -> Result<SyncResult, String> {
        // Step 1: Sync connections (platforms)
        info!("Fetching broker connections...");
        let connections = api_client
            .list_connections()
            .await
            .map_err(|e| e.to_string())?;
        info!("Found {} broker connections", connections.len());

        let connections_result = self
            .sync_service
            .sync_connections(connections.clone())
            .await
            .map_err(|e| format!("Failed to sync connections: {}", e))?;

        info!(
            "Connections synced: {} created, {} updated",
            connections_result.platforms_created, connections_result.platforms_updated
        );

        // Step 2: Sync accounts (filter by sync_enabled)
        info!("Fetching broker accounts...");
        let authorization_ids: Vec<String> = connections.iter().map(|c| c.id.clone()).collect();
        let all_accounts = api_client
            .list_accounts(if authorization_ids.is_empty() {
                None
            } else {
                Some(authorization_ids)
            })
            .await
            .map_err(|e| e.to_string())?;

        info!("Fetched {} total broker accounts from API", all_accounts.len());
        for acc in &all_accounts {
            debug!(
                "  Account '{}' (id={:?}): sync_enabled={}, shared_with_household={}",
                acc.name.as_deref().unwrap_or("unnamed"),
                acc.id,
                acc.sync_enabled,
                acc.shared_with_household
            );
        }

        // Filter to sync-enabled accounts and track their broker IDs
        let sync_enabled_broker_ids: HashSet<String> = all_accounts
            .iter()
            .filter(|a| a.sync_enabled)
            .filter_map(|a| a.id.clone())
            .collect();

        let accounts: Vec<_> = all_accounts
            .into_iter()
            .filter(|a| a.sync_enabled)
            .collect();

        info!(
            "Filtered to {} broker accounts with sync_enabled=true",
            accounts.len()
        );

        let accounts_result = self
            .sync_service
            .sync_accounts(accounts)
            .await
            .map_err(|e| format!("Failed to sync accounts: {}", e))?;

        info!(
            "Accounts synced: {} created, {} updated, {} skipped",
            accounts_result.created, accounts_result.updated, accounts_result.skipped
        );

        // Step 3: Sync activities for all synced accounts
        let activities_result = self
            .sync_activities(api_client, &sync_enabled_broker_ids)
            .await?;

        let result = SyncResult {
            success: activities_result.accounts_failed == 0,
            message: format!(
                "Sync completed. {} accounts created, {} activities synced{}",
                accounts_result.created,
                activities_result.activities_upserted,
                if activities_result.accounts_failed == 0 {
                    ".".to_string()
                } else {
                    format!(" ({} failed).", activities_result.accounts_failed)
                }
            ),
            connections_synced: Some(connections_result),
            accounts_synced: Some(accounts_result),
            activities_synced: Some(activities_result),
        };

        Ok(result)
    }

    /// Sync activities for all synced accounts.
    async fn sync_activities(
        &self,
        api_client: &dyn BrokerApiClient,
        sync_enabled_broker_ids: &HashSet<String>,
    ) -> Result<SyncActivitiesResponse, String> {
        let end_date = chrono::Utc::now().date_naive();

        let synced_accounts = self
            .sync_service
            .get_synced_accounts()
            .map_err(|e| format!("Failed to get synced accounts: {}", e))?;

        let mut activities_summary = SyncActivitiesResponse::default();
        let mut activity_errors: Vec<String> = Vec::new();

        for account in synced_accounts {
            let Some(broker_account_id) = account.provider_account_id.clone() else {
                continue;
            };

            // Skip accounts that are not sync-enabled
            if !sync_enabled_broker_ids.contains(&broker_account_id) {
                info!(
                    "Skipping activity sync for account '{}' (sync disabled)",
                    account.name
                );
                continue;
            }

            let account_id = account.id.clone();
            let account_name = account.name.clone();

            // Mark sync attempt
            if let Err(err) = self
                .sync_service
                .mark_activity_sync_attempt(account_id.clone())
                .await
                .map_err(|e| format!("Failed to mark activity sync attempt: {}", e))
            {
                activity_errors.push(format!("{}: {}", account_name, err));
                continue;
            }

            // Compute query window
            let (start_date, end_date_filter) =
                self.compute_activity_query_window(&account_id, end_date)?;

            // Determine import run mode
            let import_mode = if start_date.is_none() {
                ImportRunMode::Initial
            } else {
                ImportRunMode::Incremental
            };

            // Create import run
            let import_run = match self
                .sync_service
                .create_import_run(&account_id, import_mode)
                .await
            {
                Ok(run) => {
                    debug!("Created import run {} for account '{}'", run.id, account_name);
                    Some(run)
                }
                Err(e) => {
                    error!("Failed to create import run for '{}': {}", account_name, e);
                    None
                }
            };
            let import_run_id = import_run.as_ref().map(|r| r.id.clone());

            let window_label = match (&start_date, &end_date_filter) {
                (Some(s), Some(e)) => format!("{} -> {}", s, e),
                _ => "ALL".to_string(),
            };
            info!(
                "Syncing activities for account '{}' ({}): {}",
                account_name, broker_account_id, window_label
            );

            // Emit sync start event
            self.progress_reporter.report_progress(
                SyncProgressPayload::new(&account_id, &account_name, SyncStatus::Syncing)
                    .with_message(format!("Starting sync: {}", window_label)),
            );

            // Sync activities with pagination
            match self
                .sync_account_activities(
                    api_client,
                    &account_id,
                    &account_name,
                    &broker_account_id,
                    start_date.as_deref(),
                    end_date_filter.as_deref(),
                    import_run_id.clone(),
                )
                .await
            {
                Ok((fetched, inserted, assets_created, needs_review, new_asset_ids)) => {
                    // Build import run summary first (needed for both success and failure paths)
                    let summary = ImportRunSummary {
                        fetched,
                        inserted,
                        updated: 0,
                        skipped: 0,
                        warnings: needs_review,
                        errors: 0,
                        removed: 0,
                        assets_created,
                    };

                    // Finalize sync success (updates broker_sync_state table)
                    let last_synced_date = end_date.format("%Y-%m-%d").to_string();
                    let sync_state_failed = self
                        .sync_service
                        .finalize_activity_sync_success(
                            account_id.clone(),
                            last_synced_date,
                            import_run_id.clone(),
                        )
                        .await
                        .is_err();

                    if sync_state_failed {
                        error!("Failed to update sync state for '{}', but activities were synced", account_name);
                    }

                    // Always finalize import run (even if sync state update failed)
                    if let Some(ref run_id) = import_run_id {
                        let status = if needs_review > 0 {
                            info!(
                                "Import run {} has {} activities needing review",
                                run_id, needs_review
                            );
                            ImportRunStatus::NeedsReview
                        } else {
                            ImportRunStatus::Applied
                        };

                        let _ = self
                            .sync_service
                            .finalize_import_run(run_id, summary, status, None)
                            .await;
                    }

                    // Emit completion event
                    let status = if needs_review > 0 {
                        SyncStatus::NeedsReview
                    } else {
                        SyncStatus::Complete
                    };
                    self.progress_reporter.report_progress(
                        SyncProgressPayload::new(&account_id, &account_name, status)
                            .with_activities_fetched(fetched as usize)
                            .with_message(format!(
                                "Synced {} activities ({} need review)",
                                inserted, needs_review
                            )),
                    );

                    activities_summary.accounts_synced += 1;
                    activities_summary.activities_upserted += inserted as usize;
                    activities_summary.assets_inserted += assets_created as usize;
                    activities_summary.new_asset_ids.extend(new_asset_ids);
                }
                Err(err) => {
                    error!("Failed to sync activities for '{}': {}", account_name, err);

                    // Finalize sync failure
                    let _ = self
                        .sync_service
                        .finalize_activity_sync_failure(
                            account_id.clone(),
                            err.clone(),
                            import_run_id.clone(),
                        )
                        .await;

                    // Finalize import run as failed
                    if let Some(ref run_id) = import_run_id {
                        let summary = ImportRunSummary::default();
                        let _ = self
                            .sync_service
                            .finalize_import_run(run_id, summary, ImportRunStatus::Failed, Some(err.clone()))
                            .await;
                    }

                    // Emit failure event
                    self.progress_reporter.report_progress(
                        SyncProgressPayload::new(&account_id, &account_name, SyncStatus::Failed)
                            .with_message(err.clone()),
                    );

                    activity_errors.push(format!("{}: {}", account_name, err));
                    activities_summary.accounts_failed += 1;
                }
            }
        }

        Ok(activities_summary)
    }

    /// Sync activities for a single account with full pagination.
    ///
    /// Returns (fetched, inserted, assets_created, needs_review, new_asset_ids).
    async fn sync_account_activities(
        &self,
        api_client: &dyn BrokerApiClient,
        account_id: &str,
        account_name: &str,
        broker_account_id: &str,
        start_date: Option<&str>,
        end_date: Option<&str>,
        import_run_id: Option<String>,
    ) -> Result<(u32, u32, u32, u32, Vec<String>), String> {
        let mut offset: i64 = 0;
        let limit = self.config.page_limit;
        let mut pages_fetched: usize = 0;
        let mut last_page_first_id: Option<String> = None;

        let mut total_fetched: u32 = 0;
        let mut total_inserted: u32 = 0;
        let mut total_assets_created: u32 = 0;
        let mut total_needs_review: u32 = 0;
        let mut all_new_asset_ids: Vec<String> = Vec::new();

        loop {
            // Check max pages limit
            if pages_fetched >= self.config.max_pages {
                return Err(format!(
                    "Pagination exceeded max pages ({}). Aborting.",
                    self.config.max_pages
                ));
            }

            // Fetch page
            let page = api_client
                .get_account_activities(broker_account_id, start_date, end_date, Some(offset), Some(limit))
                .await
                .map_err(|e| e.to_string())?;

            let data = page.data;
            pages_fetched += 1;
            total_fetched += data.len() as u32;

            let page_total = page.pagination.as_ref().and_then(|p| p.total);

            // Emit progress event
            self.progress_reporter.report_progress(
                SyncProgressPayload::new(account_id, account_name, SyncStatus::Syncing)
                    .with_page(pages_fetched)
                    .with_activities_fetched(total_fetched as usize)
                    .with_message(format!(
                        "Fetched {} activities (total: {:?})",
                        total_fetched, page_total
                    )),
            );

            info!(
                "Fetched {} activities for '{}' (offset {}, total {:?})",
                data.len(),
                account_name,
                offset,
                page_total
            );

            if !data.is_empty() {
                // Check for stuck pagination
                if let Some(first_id) = data.first().and_then(|a| a.id.clone()) {
                    if offset > 0 {
                        if let Some(prev) = &last_page_first_id {
                            if prev == &first_id {
                                return Err(
                                    "Pagination appears stuck (same first activity id returned for multiple pages)."
                                        .to_string(),
                                );
                            }
                        }
                    }
                    last_page_first_id = Some(first_id);
                }

                // Upsert activities
                debug!(
                    "Upserting {} activities for account '{}'...",
                    data.len(),
                    account_name
                );

                let (upserted, assets, new_asset_ids, needs_review) = self
                    .sync_service
                    .upsert_account_activities(account_id.to_string(), import_run_id.clone(), data.clone())
                    .await
                    .map_err(|e| format!("Failed to upsert activities: {}", e))?;

                info!(
                    "Upserted {} activities, {} assets for '{}' ({} need review)",
                    upserted, assets, account_name, needs_review
                );

                total_inserted += upserted as u32;
                total_assets_created += assets as u32;
                total_needs_review += needs_review as u32;
                all_new_asset_ids.extend(new_asset_ids);
            }

            // Check if there are more pages
            let has_more = page
                .pagination
                .as_ref()
                .map(|p| p.has_more)
                .unwrap_or(false);

            // Advance offset by number of items received
            offset += data.len() as i64;

            if !has_more {
                break;
            }
        }

        Ok((total_fetched, total_inserted, total_assets_created, total_needs_review, all_new_asset_ids))
    }

    /// Compute the activity query window for incremental sync.
    fn compute_activity_query_window(
        &self,
        account_id: &str,
        end_date: chrono::NaiveDate,
    ) -> Result<(Option<String>, Option<String>), String> {
        let sync_state = self
            .sync_service
            .get_activity_sync_state(account_id)
            .map_err(|e| format!("Failed to read activity sync state: {}", e))?;

        let from_state = sync_state
            .and_then(|s| s.last_successful_at)
            .map(|dt| dt.date_naive())
            .map(|d| (d - chrono::Days::new(1)).min(end_date));

        if let Some(d) = from_state {
            return Ok((
                Some(d.format("%Y-%m-%d").to_string()),
                Some(end_date.format("%Y-%m-%d").to_string()),
            ));
        }

        Ok((None, None))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_config_default() {
        let config = SyncConfig::default();
        assert_eq!(config.page_limit, 1000);
        assert_eq!(config.max_pages, 10_000);
    }
}
