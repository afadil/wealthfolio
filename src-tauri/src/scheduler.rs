//! Foreground-triggered sync for broker data.
//!
//! This module provides sync functionality that:
//! - Is triggered when the app comes to the foreground (desktop: window focus, mobile: app lifecycle)
//! - Has throttling to prevent excessive API calls (minimum 1 hour between syncs)
//! - Only syncs for users with active subscriptions
//! - Emits events to the frontend for sync status notifications

use std::sync::Arc;

use chrono::{DateTime, Utc};
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::commands::brokers_sync::{has_active_subscription, perform_broker_sync};
use crate::context::ServiceContext;
use crate::events::{emit_broker_sync_complete, emit_broker_sync_start, BrokerSyncEventPayload};

/// Minimum interval between syncs: 1 hour
pub const MIN_SYNC_INTERVAL_SECS: i64 = 60 * 60;

/// Pure function to calculate throttle status based on last sync time.
/// Returns `None` if sync should proceed, or `Some(seconds_remaining)` if throttled.
pub fn calculate_throttle(last_successful_at: Option<DateTime<Utc>>, now: DateTime<Utc>) -> Option<i64> {
    match last_successful_at {
        Some(last_sync_time) => {
            let elapsed_secs = (now - last_sync_time).num_seconds();
            if elapsed_secs < MIN_SYNC_INTERVAL_SECS {
                Some(MIN_SYNC_INTERVAL_SECS - elapsed_secs)
            } else {
                None
            }
        }
        None => None, // No previous sync, allow sync
    }
}

/// Result from a foreground sync trigger
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForegroundSyncResult {
    /// Whether sync was actually performed
    pub synced: bool,
    /// Reason if sync was skipped (e.g., "throttled", "not_authenticated", "no_synced_accounts")
    pub reason: Option<String>,
    /// Seconds until next sync is available (only if throttled)
    pub next_sync_available_in: Option<i64>,
    /// The sync result if sync was performed
    pub sync_result: Option<crate::commands::brokers_sync::SyncResult>,
}

/// Checks if sync should run based on throttle (using last_successful_at from DB).
///
/// Returns `Ok(None)` if sync should proceed, or `Ok(Some(seconds_remaining))` if throttled.
pub fn check_throttle(context: &Arc<ServiceContext>) -> Result<Option<i64>, String> {
    // Get all sync states and find the most recent successful sync
    let sync_states = context
        .sync_service()
        .get_all_sync_states()
        .map_err(|e| format!("Failed to get sync states: {}", e))?;

    // Find the most recent last_successful_at across all accounts
    let last_successful: Option<DateTime<Utc>> = sync_states
        .iter()
        .filter_map(|s| s.last_successful_at)
        .max();

    let now = Utc::now();
    let result = calculate_throttle(last_successful, now);

    // Log the result
    match (&last_successful, &result) {
        (Some(last_sync_time), Some(remaining)) => {
            let elapsed_secs = (now - *last_sync_time).num_seconds();
            debug!(
                "Sync throttled: last sync was {} seconds ago, {} seconds remaining",
                elapsed_secs, remaining
            );
        }
        (Some(last_sync_time), None) => {
            let elapsed_secs = (now - *last_sync_time).num_seconds();
            debug!(
                "Sync allowed: last sync was {} seconds ago (threshold: {})",
                elapsed_secs, MIN_SYNC_INTERVAL_SECS
            );
        }
        (None, _) => {
            debug!("No previous sync found, allowing sync to proceed");
        }
    }

    Ok(result)
}

/// Triggers a foreground sync if not throttled and user has active subscription.
///
/// This function:
/// - Checks if user has an active subscription
/// - Checks if enough time has passed since last sync
/// - If throttled, returns early with throttle info
/// - If not throttled, runs sync and returns result
pub async fn trigger_foreground_sync(
    handle: &AppHandle,
    context: &Arc<ServiceContext>,
) -> Result<ForegroundSyncResult, String> {
    info!("Foreground sync triggered...");

    // Check subscription status first
    match has_active_subscription().await {
        Ok(true) => {
            // User has active subscription, proceed
        }
        Ok(false) => {
            info!("Foreground sync skipped: no active subscription");
            return Ok(ForegroundSyncResult {
                synced: false,
                reason: Some("no_active_subscription".to_string()),
                next_sync_available_in: None,
                sync_result: None,
            });
        }
        Err(e) => {
            // If we can't check subscription (no token, network error, etc.), skip silently
            debug!("Foreground sync skipped: could not verify subscription ({})", e);
            return Ok(ForegroundSyncResult {
                synced: false,
                reason: Some("not_authenticated".to_string()),
                next_sync_available_in: None,
                sync_result: None,
            });
        }
    }

    // Check throttle
    match check_throttle(context)? {
        Some(remaining_secs) => {
            info!(
                "Foreground sync skipped: throttled, {} seconds remaining",
                remaining_secs
            );
            return Ok(ForegroundSyncResult {
                synced: false,
                reason: Some("throttled".to_string()),
                next_sync_available_in: Some(remaining_secs),
                sync_result: None,
            });
        }
        None => {
            // Proceed with sync
        }
    }

    // Run the sync
    run_sync(handle, context).await
}

/// Runs a single sync operation.
///
/// This function:
/// - Emits sync start event
/// - Performs the sync
/// - Emits sync complete event with result (for toast notifications)
/// - Returns the sync result
pub async fn run_sync(
    handle: &AppHandle,
    context: &Arc<ServiceContext>,
) -> Result<ForegroundSyncResult, String> {
    info!("Running broker sync...");

    // Emit start event
    emit_broker_sync_start(handle);

    // Perform sync (FX rates registered automatically via AccountService)
    match perform_broker_sync(context).await {
        Ok(result) => {
            info!(
                "Broker sync completed: success={}, message={}",
                result.success, result.message
            );

            // Emit completion event for frontend toast
            let payload = BrokerSyncEventPayload::new(result.success, &result.message, true);
            emit_broker_sync_complete(handle, payload);

            // Trigger portfolio update if sync was successful and activities were synced
            if result.success {
                if let Some(ref activities) = result.activities_synced {
                    if activities.activities_upserted > 0 {
                        info!(
                            "Triggering portfolio update after sync ({} activities synced)",
                            activities.activities_upserted
                        );
                        crate::events::emit_portfolio_trigger_update(
                            handle,
                            crate::events::PortfolioRequestPayload::builder()
                                .refetch_all_market_data(false)
                                .build(),
                        );
                    }
                }
            }

            Ok(ForegroundSyncResult {
                synced: true,
                reason: None,
                next_sync_available_in: None,
                sync_result: Some(result),
            })
        }
        Err(e) => {
            // Check if this is an auth error (user not logged in)
            if e.contains("No access token") || e.contains("not authenticated") {
                info!("Sync skipped: user not authenticated");
                // Don't emit error event for auth issues - user knows they're not logged in
                Ok(ForegroundSyncResult {
                    synced: false,
                    reason: Some("not_authenticated".to_string()),
                    next_sync_available_in: None,
                    sync_result: None,
                })
            } else {
                warn!("Broker sync failed: {}", e);
                // Emit error event for frontend toast
                let payload = BrokerSyncEventPayload::new(false, &e, true);
                emit_broker_sync_complete(handle, payload);
                Err(e)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Duration;

    #[test]
    fn test_calculate_throttle_no_previous_sync() {
        let now = Utc::now();
        let result = calculate_throttle(None, now);
        assert_eq!(result, None, "Should allow sync when no previous sync exists");
    }

    #[test]
    fn test_calculate_throttle_recent_sync_should_throttle() {
        let now = Utc::now();
        let last_sync = now - Duration::minutes(30); // 30 minutes ago

        let result = calculate_throttle(Some(last_sync), now);

        assert!(result.is_some(), "Should throttle when last sync was less than 1 hour ago");
        let remaining = result.unwrap();
        // Should be approximately 30 minutes remaining (1800 seconds)
        assert!(remaining > 1700 && remaining <= 1800, "Remaining time should be ~30 minutes, got {}", remaining);
    }

    #[test]
    fn test_calculate_throttle_old_sync_should_allow() {
        let now = Utc::now();
        let last_sync = now - Duration::hours(2); // 2 hours ago

        let result = calculate_throttle(Some(last_sync), now);

        assert_eq!(result, None, "Should allow sync when last sync was more than 1 hour ago");
    }

    #[test]
    fn test_calculate_throttle_exactly_one_hour_should_allow() {
        let now = Utc::now();
        let last_sync = now - Duration::hours(1); // Exactly 1 hour ago

        let result = calculate_throttle(Some(last_sync), now);

        assert_eq!(result, None, "Should allow sync when last sync was exactly 1 hour ago");
    }

    #[test]
    fn test_calculate_throttle_just_under_one_hour_should_throttle() {
        let now = Utc::now();
        let last_sync = now - Duration::minutes(59); // 59 minutes ago

        let result = calculate_throttle(Some(last_sync), now);

        assert!(result.is_some(), "Should throttle when last sync was 59 minutes ago");
        let remaining = result.unwrap();
        // Should be approximately 1 minute remaining (60 seconds)
        assert!(remaining > 50 && remaining <= 60, "Remaining time should be ~1 minute, got {}", remaining);
    }

    #[test]
    fn test_min_sync_interval_is_one_hour() {
        assert_eq!(MIN_SYNC_INTERVAL_SECS, 3600, "Minimum sync interval should be 1 hour (3600 seconds)");
    }
}
