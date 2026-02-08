//! Event planning functions for domain events.
//!
//! These functions analyze batches of domain events and determine what actions
//! to take (portfolio recalculation, broker sync, asset enrichment).

use std::collections::HashSet;

use wealthfolio_core::{accounts::TrackingMode, events::DomainEvent, quotes::MarketSyncMode};

use crate::api::shared::PortfolioJobConfig;

/// Plans a portfolio job from a batch of domain events.
///
/// Merges account_ids and asset_ids from ActivitiesChanged, HoldingsChanged,
/// and AccountsChanged events. Adds FX asset IDs for currency changes.
///
/// Returns None if no events require portfolio recalculation.
pub fn plan_portfolio_job(events: &[DomainEvent]) -> Option<PortfolioJobConfig> {
    let mut account_ids: HashSet<String> = HashSet::new();
    let mut asset_ids: HashSet<String> = HashSet::new();
    let mut has_recalc_event = false;

    for event in events {
        match event {
            DomainEvent::ActivitiesChanged {
                account_ids: acc_ids,
                asset_ids: ast_ids,
                ..
            } => {
                has_recalc_event = true;
                for id in acc_ids {
                    if !id.is_empty() {
                        account_ids.insert(id.clone());
                    }
                }
                for id in ast_ids {
                    if !id.is_empty() {
                        asset_ids.insert(id.clone());
                    }
                }
            }
            DomainEvent::HoldingsChanged {
                account_ids: acc_ids,
                asset_ids: ast_ids,
            } => {
                has_recalc_event = true;
                for id in acc_ids {
                    if !id.is_empty() {
                        account_ids.insert(id.clone());
                    }
                }
                for id in ast_ids {
                    if !id.is_empty() {
                        asset_ids.insert(id.clone());
                    }
                }
            }
            DomainEvent::AccountsChanged {
                account_ids: acc_ids,
                ..
            } => {
                has_recalc_event = true;
                for id in acc_ids {
                    if !id.is_empty() {
                        account_ids.insert(id.clone());
                    }
                }
            }
            DomainEvent::ManualSnapshotSaved { account_id } => {
                has_recalc_event = true;
                if !account_id.is_empty() {
                    account_ids.insert(account_id.clone());
                }
            }
            // AssetsCreated: include IDs for sync (e.g., FX assets), but don't trigger recalc alone
            DomainEvent::AssetsCreated { asset_ids: ids } => {
                for id in ids {
                    if !id.is_empty() {
                        asset_ids.insert(id.clone());
                    }
                }
            }
            DomainEvent::AssetsMerged { .. } | DomainEvent::TrackingModeChanged { .. } => {}
        }
    }

    if !has_recalc_event {
        return None;
    }

    Some(PortfolioJobConfig {
        account_ids: if account_ids.is_empty() {
            None
        } else {
            Some(account_ids.into_iter().collect())
        },
        market_sync_mode: MarketSyncMode::Incremental {
            asset_ids: if asset_ids.is_empty() {
                None
            } else {
                Some(asset_ids.into_iter().collect())
            },
        },
        force_full_recalculation: true,
    })
}

/// Plans broker sync for TrackingModeChanged events.
///
/// Returns account_ids that need broker sync. An account needs sync when:
/// - is_connected == true
/// - old_mode != new_mode
/// - Transition is: NOT_SET -> TRANSACTIONS/HOLDINGS or HOLDINGS -> TRANSACTIONS
pub fn plan_broker_sync(events: &[DomainEvent]) -> Vec<String> {
    let mut account_ids: Vec<String> = Vec::new();

    for event in events {
        if let DomainEvent::TrackingModeChanged {
            account_id,
            old_mode,
            new_mode,
            is_connected,
        } = event
        {
            if !is_connected {
                continue;
            }

            if old_mode == new_mode {
                continue;
            }

            // Check for eligible transitions:
            // NOT_SET -> TRANSACTIONS or HOLDINGS (initial sync)
            // HOLDINGS -> TRANSACTIONS (need transaction history)
            let needs_sync = match (old_mode, new_mode) {
                (TrackingMode::NotSet, TrackingMode::Transactions) => true,
                (TrackingMode::NotSet, TrackingMode::Holdings) => true,
                (TrackingMode::Holdings, TrackingMode::Transactions) => true,
                _ => false,
            };

            if needs_sync {
                account_ids.push(account_id.clone());
            }
        }
    }

    account_ids
}

/// Plans asset enrichment for AssetsCreated events.
///
/// Returns unique asset_ids that need enrichment.
pub fn plan_asset_enrichment(events: &[DomainEvent]) -> Vec<String> {
    let mut asset_ids: HashSet<String> = HashSet::new();

    for event in events {
        if let DomainEvent::AssetsCreated { asset_ids: ids } = event {
            for id in ids {
                if !id.is_empty() {
                    asset_ids.insert(id.clone());
                }
            }
        }
    }

    asset_ids.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plan_portfolio_job_merges_events() {
        let events = vec![
            DomainEvent::ActivitiesChanged {
                account_ids: vec!["acc1".to_string()],
                asset_ids: vec!["AAPL".to_string()],
                currencies: vec!["USD".to_string()],
            },
            DomainEvent::ActivitiesChanged {
                account_ids: vec!["acc2".to_string()],
                asset_ids: vec!["MSFT".to_string()],
                currencies: vec!["CAD".to_string()],
            },
        ];

        let config = plan_portfolio_job(&events).unwrap();
        let acc_ids = config.account_ids.unwrap();
        assert!(acc_ids.contains(&"acc1".to_string()));
        assert!(acc_ids.contains(&"acc2".to_string()));

        if let MarketSyncMode::Incremental { asset_ids } = config.market_sync_mode {
            let ids = asset_ids.unwrap();
            assert!(ids.contains(&"AAPL".to_string()));
            assert!(ids.contains(&"MSFT".to_string()));
        } else {
            panic!("Expected Incremental mode");
        }
    }

    #[test]
    fn test_plan_portfolio_job_accounts_changed_no_fake_fx_ids() {
        let events = vec![DomainEvent::AccountsChanged {
            account_ids: vec!["acc1".to_string()],
            currency_changes: vec![wealthfolio_core::events::CurrencyChange {
                account_id: "acc1".to_string(),
                old_currency: None,
                new_currency: "EUR".to_string(),
            }],
        }];

        let config = plan_portfolio_job(&events).unwrap();
        let acc_ids = config.account_ids.unwrap();
        assert!(acc_ids.contains(&"acc1".to_string()));

        // FX assets are synced via AssetsCreated events, not constructed from currencies
        if let MarketSyncMode::Incremental { asset_ids } = config.market_sync_mode {
            assert!(asset_ids.is_none());
        } else {
            panic!("Expected Incremental mode");
        }
    }

    #[test]
    fn test_plan_portfolio_job_assets_created_contributes_ids() {
        // AssetsCreated alone doesn't trigger recalc, but combined with
        // ActivitiesChanged, the created asset IDs are included for sync
        let events = vec![
            DomainEvent::ActivitiesChanged {
                account_ids: vec!["acc1".to_string()],
                asset_ids: vec!["equity-uuid".to_string()],
                currencies: vec!["USD".to_string()],
            },
            DomainEvent::AssetsCreated {
                asset_ids: vec!["fx-uuid".to_string()],
            },
        ];

        let config = plan_portfolio_job(&events).unwrap();
        if let MarketSyncMode::Incremental { asset_ids } = config.market_sync_mode {
            let ids = asset_ids.unwrap();
            assert!(ids.contains(&"equity-uuid".to_string()));
            assert!(ids.contains(&"fx-uuid".to_string()));
        } else {
            panic!("Expected Incremental mode");
        }
    }

    #[test]
    fn test_plan_portfolio_job_returns_none_for_no_recalc_events() {
        let events = vec![DomainEvent::AssetsCreated {
            asset_ids: vec!["AAPL".to_string()],
        }];

        let config = plan_portfolio_job(&events);
        assert!(config.is_none());
    }

    #[test]
    fn test_plan_broker_sync_filters_correctly() {
        let events = vec![
            // Should sync: NOT_SET -> TRANSACTIONS, connected
            DomainEvent::TrackingModeChanged {
                account_id: "acc1".to_string(),
                old_mode: TrackingMode::NotSet,
                new_mode: TrackingMode::Transactions,
                is_connected: true,
            },
            // Should NOT sync: same mode
            DomainEvent::TrackingModeChanged {
                account_id: "acc2".to_string(),
                old_mode: TrackingMode::Holdings,
                new_mode: TrackingMode::Holdings,
                is_connected: true,
            },
            // Should NOT sync: not connected
            DomainEvent::TrackingModeChanged {
                account_id: "acc3".to_string(),
                old_mode: TrackingMode::NotSet,
                new_mode: TrackingMode::Transactions,
                is_connected: false,
            },
            // Should sync: HOLDINGS -> TRANSACTIONS, connected
            DomainEvent::TrackingModeChanged {
                account_id: "acc4".to_string(),
                old_mode: TrackingMode::Holdings,
                new_mode: TrackingMode::Transactions,
                is_connected: true,
            },
            // Should NOT sync: TRANSACTIONS -> HOLDINGS (downgrade)
            DomainEvent::TrackingModeChanged {
                account_id: "acc5".to_string(),
                old_mode: TrackingMode::Transactions,
                new_mode: TrackingMode::Holdings,
                is_connected: true,
            },
        ];

        let accounts = plan_broker_sync(&events);
        assert_eq!(accounts.len(), 2);
        assert!(accounts.contains(&"acc1".to_string()));
        assert!(accounts.contains(&"acc4".to_string()));
    }

    #[test]
    fn test_plan_asset_enrichment_deduplicates() {
        let events = vec![
            DomainEvent::AssetsCreated {
                asset_ids: vec!["AAPL".to_string(), "MSFT".to_string()],
            },
            DomainEvent::AssetsCreated {
                asset_ids: vec!["AAPL".to_string(), "GOOG".to_string()],
            },
        ];

        let assets = plan_asset_enrichment(&events);
        assert_eq!(assets.len(), 3);
    }
}
