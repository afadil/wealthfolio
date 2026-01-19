//! Progress reporting for broker sync operations.
//!
//! This module defines traits and types for reporting sync progress,
//! allowing both Tauri and Axum to implement platform-specific progress reporting.

use serde::{Deserialize, Serialize};

use super::models::SyncResult;

/// Status of a sync operation.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    /// Sync is starting
    Starting,
    /// Sync is in progress
    Syncing,
    /// Sync completed successfully
    Complete,
    /// Sync completed but some items need review
    NeedsReview,
    /// Sync failed
    Failed,
}

impl std::fmt::Display for SyncStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SyncStatus::Starting => write!(f, "starting"),
            SyncStatus::Syncing => write!(f, "syncing"),
            SyncStatus::Complete => write!(f, "complete"),
            SyncStatus::NeedsReview => write!(f, "needs_review"),
            SyncStatus::Failed => write!(f, "failed"),
        }
    }
}

/// Payload for sync progress events.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncProgressPayload {
    /// The local account ID being synced
    pub account_id: String,
    /// Human-readable account name
    pub account_name: String,
    /// Current sync status
    pub status: String,
    /// Current page number (0-indexed)
    pub current_page: usize,
    /// Total activities fetched so far
    pub activities_fetched: usize,
    /// Optional status message
    pub message: Option<String>,
}

impl SyncProgressPayload {
    /// Create a new progress payload.
    pub fn new(
        account_id: impl Into<String>,
        account_name: impl Into<String>,
        status: SyncStatus,
    ) -> Self {
        Self {
            account_id: account_id.into(),
            account_name: account_name.into(),
            status: status.to_string(),
            current_page: 0,
            activities_fetched: 0,
            message: None,
        }
    }

    /// Set the current page.
    pub fn with_page(mut self, page: usize) -> Self {
        self.current_page = page;
        self
    }

    /// Set the activities fetched count.
    pub fn with_activities_fetched(mut self, count: usize) -> Self {
        self.activities_fetched = count;
        self
    }

    /// Set an optional message.
    pub fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }
}

/// Trait for reporting sync progress.
///
/// Implementations can emit events to different backends (Tauri events, SSE, etc.).
pub trait SyncProgressReporter: Send + Sync {
    /// Report progress for an account sync.
    fn report_progress(&self, payload: SyncProgressPayload);

    /// Report that sync is starting.
    fn report_sync_start(&self);

    /// Report that sync completed (successfully or with errors).
    fn report_sync_complete(&self, result: &SyncResult);
}

/// A no-op progress reporter for contexts where progress reporting is not needed.
#[derive(Debug, Clone, Default)]
pub struct NoOpProgressReporter;

impl SyncProgressReporter for NoOpProgressReporter {
    fn report_progress(&self, _payload: SyncProgressPayload) {
        // No-op
    }

    fn report_sync_start(&self) {
        // No-op
    }

    fn report_sync_complete(&self, _result: &SyncResult) {
        // No-op
    }
}
