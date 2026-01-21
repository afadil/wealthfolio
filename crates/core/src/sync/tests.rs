//! Tests for sync domain models.

use super::*;
use chrono::NaiveDate;

// ============================================================================
// ImportRun Tests
// ============================================================================

mod import_run_tests {
    use super::*;

    #[test]
    fn test_new_import_run() {
        let run = ImportRun::new(
            "account-123".to_string(),
            "snaptrade".to_string(),
            ImportRunType::Sync,
            ImportRunMode::Initial,
            ReviewMode::Never,
        );

        assert!(!run.id.is_empty());
        assert_eq!(run.account_id, "account-123");
        assert_eq!(run.source_system, "snaptrade");
        assert_eq!(run.run_type, ImportRunType::Sync);
        assert_eq!(run.mode, ImportRunMode::Initial);
        assert_eq!(run.status, ImportRunStatus::Running);
        assert_eq!(run.review_mode, ReviewMode::Never);
        assert!(run.finished_at.is_none());
        assert!(run.applied_at.is_none());
        assert!(run.error.is_none());
        assert!(run.summary.is_some());
    }

    #[test]
    fn test_import_run_complete() {
        let mut run = ImportRun::new(
            "account-123".to_string(),
            "csv".to_string(),
            ImportRunType::Import,
            ImportRunMode::Incremental,
            ReviewMode::Never,
        );

        run.complete();

        assert_eq!(run.status, ImportRunStatus::Applied);
        assert!(run.finished_at.is_some());
        assert!(run.applied_at.is_some());
        assert!(run.error.is_none());
    }

    #[test]
    fn test_import_run_fail() {
        let mut run = ImportRun::new(
            "account-456".to_string(),
            "plaid".to_string(),
            ImportRunType::Sync,
            ImportRunMode::Incremental,
            ReviewMode::IfWarnings,
        );

        let error_msg = "Connection timeout".to_string();
        run.fail(error_msg.clone());

        assert_eq!(run.status, ImportRunStatus::Failed);
        assert!(run.finished_at.is_some());
        assert!(run.applied_at.is_none());
        assert_eq!(run.error, Some(error_msg));
    }

    #[test]
    fn test_import_run_needs_review() {
        let mut run = ImportRun::new(
            "account-789".to_string(),
            "snaptrade".to_string(),
            ImportRunType::Sync,
            ImportRunMode::Repair,
            ReviewMode::Always,
        );

        run.mark_needs_review();

        assert_eq!(run.status, ImportRunStatus::NeedsReview);
        assert!(run.finished_at.is_some());
        assert!(run.applied_at.is_none());
    }

    #[test]
    fn test_import_run_type_serialization() {
        let sync_type = ImportRunType::Sync;
        let import_type = ImportRunType::Import;

        let sync_json = serde_json::to_string(&sync_type).unwrap();
        let import_json = serde_json::to_string(&import_type).unwrap();

        assert_eq!(sync_json, "\"SYNC\"");
        assert_eq!(import_json, "\"IMPORT\"");

        let parsed_sync: ImportRunType = serde_json::from_str(&sync_json).unwrap();
        let parsed_import: ImportRunType = serde_json::from_str(&import_json).unwrap();

        assert_eq!(parsed_sync, ImportRunType::Sync);
        assert_eq!(parsed_import, ImportRunType::Import);
    }

    #[test]
    fn test_import_run_mode_serialization() {
        let modes = vec![
            (ImportRunMode::Initial, "\"INITIAL\""),
            (ImportRunMode::Incremental, "\"INCREMENTAL\""),
            (ImportRunMode::Backfill, "\"BACKFILL\""),
            (ImportRunMode::Repair, "\"REPAIR\""),
        ];

        for (mode, expected) in modes {
            let json = serde_json::to_string(&mode).unwrap();
            assert_eq!(json, expected);
            let parsed: ImportRunMode = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, mode);
        }
    }

    #[test]
    fn test_import_run_status_serialization() {
        let statuses = vec![
            (ImportRunStatus::Running, "\"RUNNING\""),
            (ImportRunStatus::Applied, "\"APPLIED\""),
            (ImportRunStatus::NeedsReview, "\"NEEDS_REVIEW\""),
            (ImportRunStatus::Failed, "\"FAILED\""),
            (ImportRunStatus::Cancelled, "\"CANCELLED\""),
        ];

        for (status, expected) in statuses {
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, expected);
            let parsed: ImportRunStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, status);
        }
    }

    #[test]
    fn test_review_mode_serialization() {
        let modes = vec![
            (ReviewMode::Never, "\"NEVER\""),
            (ReviewMode::Always, "\"ALWAYS\""),
            (ReviewMode::IfWarnings, "\"IF_WARNINGS\""),
        ];

        for (mode, expected) in modes {
            let json = serde_json::to_string(&mode).unwrap();
            assert_eq!(json, expected);
            let parsed: ReviewMode = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, mode);
        }
    }

    #[test]
    fn test_import_run_summary_default() {
        let summary = ImportRunSummary::default();

        assert_eq!(summary.fetched, 0);
        assert_eq!(summary.inserted, 0);
        assert_eq!(summary.updated, 0);
        assert_eq!(summary.skipped, 0);
        assert_eq!(summary.warnings, 0);
        assert_eq!(summary.errors, 0);
        assert_eq!(summary.removed, 0);
    }

    #[test]
    fn test_import_run_summary_serialization() {
        let summary = ImportRunSummary {
            fetched: 100,
            inserted: 50,
            updated: 30,
            skipped: 15,
            warnings: 3,
            errors: 2,
            removed: 0,
            assets_created: 0,
        };

        let json = serde_json::to_string(&summary).unwrap();
        let parsed: ImportRunSummary = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.fetched, 100);
        assert_eq!(parsed.inserted, 50);
        assert_eq!(parsed.updated, 30);
        assert_eq!(parsed.skipped, 15);
        assert_eq!(parsed.warnings, 3);
        assert_eq!(parsed.errors, 2);
        assert_eq!(parsed.removed, 0);
    }

    #[test]
    fn test_import_run_full_serialization() {
        let run = ImportRun::new(
            "acc-test".to_string(),
            "snaptrade".to_string(),
            ImportRunType::Sync,
            ImportRunMode::Incremental,
            ReviewMode::IfWarnings,
        );

        let json = serde_json::to_string(&run).unwrap();
        let parsed: ImportRun = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.id, run.id);
        assert_eq!(parsed.account_id, run.account_id);
        assert_eq!(parsed.source_system, run.source_system);
        assert_eq!(parsed.run_type, run.run_type);
        assert_eq!(parsed.mode, run.mode);
        assert_eq!(parsed.status, run.status);
    }
}

// ============================================================================
// BrokerSyncState Tests
// ============================================================================

mod broker_sync_state_tests {
    use super::*;

    #[test]
    fn test_new_broker_sync_state() {
        let state = BrokerSyncState::new("account-123".to_string(), "snaptrade".to_string());

        assert_eq!(state.account_id, "account-123");
        assert_eq!(state.provider, "snaptrade");
        assert_eq!(state.sync_status, SyncStatus::Idle);
        assert!(state.checkpoint_json.is_none());
        assert!(state.last_attempted_at.is_none());
        assert!(state.last_successful_at.is_none());
        assert!(state.last_error.is_none());
        assert!(state.last_run_id.is_none());
    }

    #[test]
    fn test_broker_sync_state_start_sync() {
        let mut state = BrokerSyncState::new("account-456".to_string(), "plaid".to_string());
        let run_id = "run-123".to_string();

        state.start_sync(run_id.clone());

        assert_eq!(state.sync_status, SyncStatus::Running);
        assert!(state.last_attempted_at.is_some());
        assert_eq!(state.last_run_id, Some(run_id));
        assert!(state.last_error.is_none());
    }

    #[test]
    fn test_broker_sync_state_complete_sync() {
        let mut state = BrokerSyncState::new("account-789".to_string(), "snaptrade".to_string());
        state.start_sync("run-456".to_string());

        state.complete_sync();

        assert_eq!(state.sync_status, SyncStatus::Idle);
        assert!(state.last_successful_at.is_some());
    }

    #[test]
    fn test_broker_sync_state_fail_sync() {
        let mut state = BrokerSyncState::new("account-abc".to_string(), "plaid".to_string());
        state.start_sync("run-789".to_string());

        let error_msg = "API rate limit exceeded".to_string();
        state.fail_sync(error_msg.clone());

        assert_eq!(state.sync_status, SyncStatus::Failed);
        assert_eq!(state.last_error, Some(error_msg));
    }

    #[test]
    fn test_sync_status_serialization() {
        let statuses = vec![
            (SyncStatus::Idle, "\"IDLE\""),
            (SyncStatus::Running, "\"RUNNING\""),
            (SyncStatus::NeedsReview, "\"NEEDS_REVIEW\""),
            (SyncStatus::Failed, "\"FAILED\""),
        ];

        for (status, expected) in statuses {
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, expected);
            let parsed: SyncStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(parsed, status);
        }
    }

    #[test]
    fn test_broker_sync_state_full_serialization() {
        let mut state = BrokerSyncState::new("acc-ser".to_string(), "snaptrade".to_string());
        state.start_sync("run-ser".to_string());

        let json = serde_json::to_string(&state).unwrap();
        let parsed: BrokerSyncState = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.account_id, state.account_id);
        assert_eq!(parsed.provider, state.provider);
        assert_eq!(parsed.sync_status, state.sync_status);
        assert_eq!(parsed.last_run_id, state.last_run_id);
    }
}

// ============================================================================
// Checkpoint Tests
// ============================================================================

mod checkpoint_tests {
    use super::*;

    #[test]
    fn test_snaptrade_checkpoint_set_and_get() {
        let mut state = BrokerSyncState::new("acc-snap".to_string(), "snaptrade".to_string());

        let checkpoint = SnapTradeCheckpoint {
            last_synced_date: NaiveDate::from_ymd_opt(2024, 1, 15).unwrap(),
            lookback_days: 7,
        };

        state.set_checkpoint(&checkpoint).unwrap();

        let retrieved: Option<SnapTradeCheckpoint> = state.get_checkpoint();
        assert!(retrieved.is_some());

        let retrieved = retrieved.unwrap();
        assert_eq!(
            retrieved.last_synced_date,
            NaiveDate::from_ymd_opt(2024, 1, 15).unwrap()
        );
        assert_eq!(retrieved.lookback_days, 7);
    }

    #[test]
    fn test_plaid_sync_checkpoint_set_and_get() {
        let mut state = BrokerSyncState::new("acc-plaid".to_string(), "plaid".to_string());

        let checkpoint = PlaidSyncCheckpoint {
            cursor: "cursor-abc-123".to_string(),
        };

        state.set_checkpoint(&checkpoint).unwrap();

        let retrieved: Option<PlaidSyncCheckpoint> = state.get_checkpoint();
        assert!(retrieved.is_some());

        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.cursor, "cursor-abc-123");
    }

    #[test]
    fn test_plaid_investments_checkpoint_set_and_get() {
        let mut state =
            BrokerSyncState::new("acc-plaid-inv".to_string(), "plaid-investments".to_string());

        let checkpoint = PlaidInvestmentsCheckpoint {
            last_synced_date: NaiveDate::from_ymd_opt(2024, 2, 20).unwrap(),
            lookback_days: 14,
        };

        state.set_checkpoint(&checkpoint).unwrap();

        let retrieved: Option<PlaidInvestmentsCheckpoint> = state.get_checkpoint();
        assert!(retrieved.is_some());

        let retrieved = retrieved.unwrap();
        assert_eq!(
            retrieved.last_synced_date,
            NaiveDate::from_ymd_opt(2024, 2, 20).unwrap()
        );
        assert_eq!(retrieved.lookback_days, 14);
    }

    #[test]
    fn test_checkpoint_returns_none_when_empty() {
        let state = BrokerSyncState::new("acc-empty".to_string(), "test".to_string());

        let checkpoint: Option<SnapTradeCheckpoint> = state.get_checkpoint();
        assert!(checkpoint.is_none());
    }

    #[test]
    fn test_checkpoint_returns_none_for_wrong_type() {
        let mut state = BrokerSyncState::new("acc-wrong".to_string(), "snaptrade".to_string());

        let checkpoint = SnapTradeCheckpoint {
            last_synced_date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
            lookback_days: 5,
        };

        state.set_checkpoint(&checkpoint).unwrap();

        // Try to get as a different type - should return None
        let wrong_type: Option<PlaidSyncCheckpoint> = state.get_checkpoint();
        assert!(wrong_type.is_none());
    }

    #[test]
    fn test_snaptrade_checkpoint_serialization() {
        let checkpoint = SnapTradeCheckpoint {
            last_synced_date: NaiveDate::from_ymd_opt(2024, 3, 10).unwrap(),
            lookback_days: 30,
        };

        let json = serde_json::to_string(&checkpoint).unwrap();
        assert!(json.contains("lastSyncedDate"));
        assert!(json.contains("lookbackDays"));

        let parsed: SnapTradeCheckpoint = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.last_synced_date, checkpoint.last_synced_date);
        assert_eq!(parsed.lookback_days, checkpoint.lookback_days);
    }

    #[test]
    fn test_plaid_sync_checkpoint_serialization() {
        let checkpoint = PlaidSyncCheckpoint {
            cursor: "plaid-cursor-xyz".to_string(),
        };

        let json = serde_json::to_string(&checkpoint).unwrap();
        assert!(json.contains("cursor"));

        let parsed: PlaidSyncCheckpoint = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.cursor, checkpoint.cursor);
    }

    #[test]
    fn test_plaid_investments_checkpoint_serialization() {
        let checkpoint = PlaidInvestmentsCheckpoint {
            last_synced_date: NaiveDate::from_ymd_opt(2024, 4, 5).unwrap(),
            lookback_days: 60,
        };

        let json = serde_json::to_string(&checkpoint).unwrap();
        assert!(json.contains("lastSyncedDate"));
        assert!(json.contains("lookbackDays"));

        let parsed: PlaidInvestmentsCheckpoint = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.last_synced_date, checkpoint.last_synced_date);
        assert_eq!(parsed.lookback_days, checkpoint.lookback_days);
    }
}

// ============================================================================
// Integration Tests
// ============================================================================

mod integration_tests {
    use super::*;

    #[test]
    fn test_full_sync_lifecycle() {
        // 1. Create sync state
        let mut state = BrokerSyncState::new("acc-lifecycle".to_string(), "snaptrade".to_string());
        assert_eq!(state.sync_status, SyncStatus::Idle);

        // 2. Create import run
        let mut run = ImportRun::new(
            "acc-lifecycle".to_string(),
            "snaptrade".to_string(),
            ImportRunType::Sync,
            ImportRunMode::Initial,
            ReviewMode::Never,
        );

        // 3. Start sync
        state.start_sync(run.id.clone());
        assert_eq!(state.sync_status, SyncStatus::Running);
        assert_eq!(state.last_run_id, Some(run.id.clone()));

        // 4. Set checkpoint
        let checkpoint = SnapTradeCheckpoint {
            last_synced_date: NaiveDate::from_ymd_opt(2024, 5, 1).unwrap(),
            lookback_days: 7,
        };
        state.set_checkpoint(&checkpoint).unwrap();

        // 5. Complete run
        run.complete();
        assert_eq!(run.status, ImportRunStatus::Applied);
        assert!(run.applied_at.is_some());

        // 6. Complete sync
        state.complete_sync();
        assert_eq!(state.sync_status, SyncStatus::Idle);
        assert!(state.last_successful_at.is_some());

        // 7. Verify checkpoint persisted
        let retrieved: Option<SnapTradeCheckpoint> = state.get_checkpoint();
        assert!(retrieved.is_some());
    }

    #[test]
    fn test_failed_sync_lifecycle() {
        // 1. Create sync state
        let mut state = BrokerSyncState::new("acc-fail".to_string(), "plaid".to_string());

        // 2. Create import run
        let mut run = ImportRun::new(
            "acc-fail".to_string(),
            "plaid".to_string(),
            ImportRunType::Sync,
            ImportRunMode::Incremental,
            ReviewMode::Never,
        );

        // 3. Start sync
        state.start_sync(run.id.clone());

        // 4. Simulate failure
        let error = "Network timeout".to_string();
        run.fail(error.clone());
        state.fail_sync(error.clone());

        // 5. Verify states
        assert_eq!(run.status, ImportRunStatus::Failed);
        assert_eq!(run.error, Some(error.clone()));
        assert_eq!(state.sync_status, SyncStatus::Failed);
        assert_eq!(state.last_error, Some(error));
    }

    #[test]
    fn test_import_run_with_warnings() {
        let mut run = ImportRun::new(
            "acc-warn".to_string(),
            "csv".to_string(),
            ImportRunType::Import,
            ImportRunMode::Incremental,
            ReviewMode::IfWarnings,
        );

        // Add warnings
        run.warnings = Some(vec![
            "Duplicate transaction found".to_string(),
            "Unknown symbol: XYZ".to_string(),
        ]);

        // Update summary
        run.summary = Some(ImportRunSummary {
            fetched: 100,
            inserted: 95,
            updated: 0,
            skipped: 3,
            warnings: 2,
            errors: 0,
            removed: 0,
            assets_created: 0,
        });

        run.mark_needs_review();

        assert_eq!(run.status, ImportRunStatus::NeedsReview);
        assert_eq!(run.warnings.as_ref().unwrap().len(), 2);
        assert_eq!(run.summary.as_ref().unwrap().warnings, 2);
    }
}
