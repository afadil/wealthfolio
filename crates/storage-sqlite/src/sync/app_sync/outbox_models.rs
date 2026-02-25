//! Centralized sync-entity mappings for projected outbox models.

use crate::accounts::AccountDB;
use crate::activities::{ActivityDB, ImportMappingDB};
use crate::ai_chat::{AiMessageDB, AiThreadDB, AiThreadTagDB};
use crate::assets::AssetDB;
use crate::goals::{GoalDB, GoalsAllocationDB};
use crate::limits::ContributionLimitDB;
use crate::market_data::QuoteDB;
use crate::portfolio::snapshot::AccountStateSnapshotDB;
use crate::sync::platform::PlatformDB;
use crate::sync::SyncOutboxModel;
use crate::sync::{
    should_sync_outbox_for_account_create, should_sync_outbox_for_activity,
    should_sync_outbox_for_platform, should_sync_outbox_for_snapshot_source,
};
use crate::taxonomies::AssetTaxonomyAssignmentDB;
use uuid::Uuid;
use wealthfolio_core::portfolio::snapshot::SnapshotSource;
use wealthfolio_core::sync::SyncEntity;
use wealthfolio_core::sync::SyncOperation;

impl SyncOutboxModel for AccountDB {
    const ENTITY: SyncEntity = SyncEntity::Account;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }

    fn should_sync_outbox(&self, op: SyncOperation) -> bool {
        match op {
            SyncOperation::Create => {
                should_sync_outbox_for_account_create(self.provider_account_id.as_deref())
            }
            _ => true,
        }
    }
}

impl SyncOutboxModel for AssetDB {
    const ENTITY: SyncEntity = SyncEntity::Asset;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }
}

impl SyncOutboxModel for QuoteDB {
    const ENTITY: SyncEntity = SyncEntity::Quote;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }

    fn should_sync_outbox(&self, _op: SyncOperation) -> bool {
        self.source.eq_ignore_ascii_case("MANUAL") && Uuid::parse_str(&self.id).is_ok()
    }
}

impl SyncOutboxModel for ActivityDB {
    const ENTITY: SyncEntity = SyncEntity::Activity;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }

    fn should_sync_outbox(&self, op: SyncOperation) -> bool {
        match op {
            SyncOperation::Create | SyncOperation::Update => should_sync_outbox_for_activity(
                self.source_system.as_deref(),
                self.is_user_modified != 0,
                self.import_run_id.as_deref(),
                self.source_record_id.as_deref(),
            ),
            SyncOperation::Delete => true,
        }
    }
}

impl SyncOutboxModel for ImportMappingDB {
    const ENTITY: SyncEntity = SyncEntity::ActivityImportProfile;

    fn sync_entity_id(&self) -> &str {
        &self.account_id
    }

    fn delete_payload(entity_id: &str) -> serde_json::Value {
        serde_json::json!({ "accountId": entity_id })
    }
}

impl SyncOutboxModel for GoalDB {
    const ENTITY: SyncEntity = SyncEntity::Goal;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }
}

impl SyncOutboxModel for GoalsAllocationDB {
    const ENTITY: SyncEntity = SyncEntity::GoalsAllocation;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }
}

impl SyncOutboxModel for AiThreadDB {
    const ENTITY: SyncEntity = SyncEntity::AiThread;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }
}

impl SyncOutboxModel for AiMessageDB {
    const ENTITY: SyncEntity = SyncEntity::AiMessage;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }
}

impl SyncOutboxModel for AiThreadTagDB {
    const ENTITY: SyncEntity = SyncEntity::AiThreadTag;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }
}

impl SyncOutboxModel for ContributionLimitDB {
    const ENTITY: SyncEntity = SyncEntity::ContributionLimit;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }
}

impl SyncOutboxModel for AssetTaxonomyAssignmentDB {
    const ENTITY: SyncEntity = SyncEntity::AssetTaxonomyAssignment;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }
}

impl SyncOutboxModel for PlatformDB {
    const ENTITY: SyncEntity = SyncEntity::Platform;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }

    fn should_sync_outbox(&self, _op: SyncOperation) -> bool {
        should_sync_outbox_for_platform(&self.id, self.external_id.as_deref())
    }
}

impl SyncOutboxModel for AccountStateSnapshotDB {
    const ENTITY: SyncEntity = SyncEntity::Snapshot;

    fn sync_entity_id(&self) -> &str {
        &self.id
    }

    fn should_sync_outbox(&self, _op: SyncOperation) -> bool {
        let source = match self.source.as_str() {
            "MANUAL_ENTRY" => SnapshotSource::ManualEntry,
            "SYNTHETIC" => SnapshotSource::Synthetic,
            "CSV_IMPORT" => SnapshotSource::CsvImport,
            "BROKER_IMPORTED" => SnapshotSource::BrokerImported,
            _ => SnapshotSource::Calculated,
        };
        should_sync_outbox_for_snapshot_source(source) && Uuid::parse_str(&self.id).is_ok()
    }
}
