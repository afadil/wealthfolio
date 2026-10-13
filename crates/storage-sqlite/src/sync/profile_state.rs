use super::broker_activity_patch::BrokerActivityPatchQueue;

/// In-memory sync state owned by one profile/database, not by an open writer.
/// Retain the same instance across locks, profile switches and writer recreation.
#[derive(Default)]
pub struct ProfileSyncState {
    pub(crate) broker_activity_patches: BrokerActivityPatchQueue,
}

/// Original database state held while a replacement is opened. This cannot be
/// attached to a writer; consume it only when rolling back to that database.
pub struct SavedProfileSyncState {
    broker_activity_patches: BrokerActivityPatchQueue,
}

impl ProfileSyncState {
    /// Discard retained state when deleting the profile or replacing its database.
    /// Call only after the profile's writer and sync workers have stopped.
    pub fn clear(&self) {
        self.broker_activity_patches.clear();
    }

    /// Leave empty state for the replacement database while retaining the old
    /// state for rollback. Call only after the writer and sync workers stop.
    pub fn take_for_database_replacement(&self) -> SavedProfileSyncState {
        SavedProfileSyncState {
            broker_activity_patches: self.broker_activity_patches.take(),
        }
    }

    /// Restore state before restarting the original database's writer.
    pub fn restore_after_database_rollback(&self, saved: SavedProfileSyncState) {
        self.broker_activity_patches
            .restore(saved.broker_activity_patches);
    }
}
