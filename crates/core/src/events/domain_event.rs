//! Domain event types.

use serde::{Deserialize, Serialize};

use crate::accounts::TrackingMode;

/// Domain events emitted by core services after successful mutations.
///
/// These events represent facts about domain data changes. Runtime adapters
/// translate them into platform-specific actions (portfolio recalculation,
/// asset enrichment, broker sync, etc.).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DomainEvent {
    /// Activities were created, updated, or deleted.
    ActivitiesChanged {
        account_ids: Vec<String>,
        asset_ids: Vec<String>,
        /// Currencies observed in affected activities (for FX sync planning)
        currencies: Vec<String>,
    },

    /// Holdings snapshots were created or updated.
    HoldingsChanged {
        account_ids: Vec<String>,
        asset_ids: Vec<String>,
    },

    /// Accounts were created, updated, or deleted.
    AccountsChanged {
        account_ids: Vec<String>,
        /// Currency changes for FX asset sync planning
        currency_changes: Vec<CurrencyChange>,
    },

    /// New assets were created (not updates).
    AssetsCreated { asset_ids: Vec<String> },

    /// Account tracking mode was changed.
    TrackingModeChanged {
        account_id: String,
        old_mode: TrackingMode,
        new_mode: TrackingMode,
        /// Whether this is a connected (broker-linked) account
        is_connected: bool,
    },

    /// Manual snapshot was saved (manual entry, CSV import, broker import).
    /// Triggers portfolio recalculation for the affected account.
    ManualSnapshotSaved { account_id: String },
}

/// Represents a currency change on an account for FX sync planning.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CurrencyChange {
    pub account_id: String,
    pub old_currency: Option<String>,
    pub new_currency: String,
}

impl DomainEvent {
    /// Creates an ActivitiesChanged event.
    pub fn activities_changed(
        account_ids: Vec<String>,
        asset_ids: Vec<String>,
        currencies: Vec<String>,
    ) -> Self {
        Self::ActivitiesChanged {
            account_ids,
            asset_ids,
            currencies,
        }
    }

    /// Creates a HoldingsChanged event.
    pub fn holdings_changed(account_ids: Vec<String>, asset_ids: Vec<String>) -> Self {
        Self::HoldingsChanged {
            account_ids,
            asset_ids,
        }
    }

    /// Creates an AccountsChanged event.
    pub fn accounts_changed(
        account_ids: Vec<String>,
        currency_changes: Vec<CurrencyChange>,
    ) -> Self {
        Self::AccountsChanged {
            account_ids,
            currency_changes,
        }
    }

    /// Creates an AssetsCreated event.
    pub fn assets_created(asset_ids: Vec<String>) -> Self {
        Self::AssetsCreated { asset_ids }
    }

    /// Creates a TrackingModeChanged event.
    pub fn tracking_mode_changed(
        account_id: String,
        old_mode: TrackingMode,
        new_mode: TrackingMode,
        is_connected: bool,
    ) -> Self {
        Self::TrackingModeChanged {
            account_id,
            old_mode,
            new_mode,
            is_connected,
        }
    }

    /// Creates a ManualSnapshotSaved event.
    pub fn manual_snapshot_saved(account_id: String) -> Self {
        Self::ManualSnapshotSaved { account_id }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_domain_event_serialization() {
        let event = DomainEvent::activities_changed(
            vec!["acc1".to_string()],
            vec!["AAPL".to_string()],
            vec!["USD".to_string()],
        );

        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("activities_changed"));

        let deserialized: DomainEvent = serde_json::from_str(&json).unwrap();
        match deserialized {
            DomainEvent::ActivitiesChanged {
                account_ids,
                asset_ids,
                currencies,
            } => {
                assert_eq!(account_ids, vec!["acc1"]);
                assert_eq!(asset_ids, vec!["AAPL"]);
                assert_eq!(currencies, vec!["USD"]);
            }
            _ => panic!("Expected ActivitiesChanged"),
        }
    }

    #[test]
    fn test_tracking_mode_changed_serialization() {
        let event = DomainEvent::tracking_mode_changed(
            "acc1".to_string(),
            TrackingMode::NotSet,
            TrackingMode::Transactions,
            true,
        );

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: DomainEvent = serde_json::from_str(&json).unwrap();

        match deserialized {
            DomainEvent::TrackingModeChanged {
                account_id,
                old_mode,
                new_mode,
                is_connected,
            } => {
                assert_eq!(account_id, "acc1");
                assert_eq!(old_mode, TrackingMode::NotSet);
                assert_eq!(new_mode, TrackingMode::Transactions);
                assert!(is_connected);
            }
            _ => panic!("Expected TrackingModeChanged"),
        }
    }
}
