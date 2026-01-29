//! Event planning functions for translating domain events into actions.
//!
//! These functions analyze batches of domain events and determine what
//! platform-specific actions need to be triggered.

use std::collections::HashSet;

use wealthfolio_core::accounts::TrackingMode;
use wealthfolio_core::events::DomainEvent;

use crate::events::PortfolioRequestPayload;

/// Plans a portfolio recalculation job from a batch of domain events.
///
/// Merges account_ids and asset_ids from:
/// - ActivitiesChanged
/// - HoldingsChanged
/// - AccountsChanged (including FX asset IDs for currency changes)
///
/// Returns `None` if no events require portfolio recalculation.
pub fn plan_portfolio_job(
    events: &[DomainEvent],
    base_currency: &str,
) -> Option<PortfolioRequestPayload> {
    let mut account_ids: HashSet<String> = HashSet::new();
    let mut asset_ids: HashSet<String> = HashSet::new();
    let mut has_recalc_events = false;

    for event in events {
        match event {
            DomainEvent::ActivitiesChanged {
                account_ids: acc_ids,
                asset_ids: a_ids,
                currencies,
            } => {
                has_recalc_events = true;
                account_ids.extend(acc_ids.iter().cloned());
                asset_ids.extend(a_ids.iter().cloned());
                for currency in currencies {
                    if !currency.is_empty() && !base_currency.is_empty() && currency != base_currency
                    {
                        asset_ids.insert(format!("FX:{}:{}", currency, base_currency));
                    }
                }
            }
            DomainEvent::HoldingsChanged {
                account_ids: acc_ids,
                asset_ids: a_ids,
            } => {
                has_recalc_events = true;
                account_ids.extend(acc_ids.iter().cloned());
                asset_ids.extend(a_ids.iter().cloned());
            }
            DomainEvent::AccountsChanged {
                account_ids: acc_ids,
                currency_changes,
            } => {
                has_recalc_events = true;
                account_ids.extend(acc_ids.iter().cloned());

                // Add FX asset IDs for currency changes
                for change in currency_changes {
                    if change.new_currency != base_currency {
                        // FX asset ID format: FX:{currency}:{base_currency}
                        let fx_asset_id = format!("FX:{}:{}", change.new_currency, base_currency);
                        asset_ids.insert(fx_asset_id);
                    }
                    // Also handle old currency if it was different
                    if let Some(ref old_currency) = change.old_currency {
                        if old_currency != base_currency && old_currency != &change.new_currency {
                            let fx_asset_id = format!("FX:{}:{}", old_currency, base_currency);
                            asset_ids.insert(fx_asset_id);
                        }
                    }
                }
            }
            // AssetsCreated and TrackingModeChanged don't trigger portfolio recalc directly
            DomainEvent::AssetsCreated { .. } | DomainEvent::TrackingModeChanged { .. } => {}
        }
    }

    if !has_recalc_events {
        return None;
    }

    // Build the payload using the builder pattern
    let mut builder = PortfolioRequestPayload::builder();

    // Set account IDs if we have specific ones, otherwise None means all
    if !account_ids.is_empty() {
        builder = builder.account_ids(Some(account_ids.into_iter().collect()));
    }

    // Use incremental sync with the collected asset IDs
    let sync_mode = if asset_ids.is_empty() {
        wealthfolio_core::quotes::MarketSyncMode::Incremental { asset_ids: None }
    } else {
        wealthfolio_core::quotes::MarketSyncMode::Incremental {
            asset_ids: Some(asset_ids.into_iter().collect()),
        }
    };
    builder = builder.market_sync_mode(sync_mode);

    Some(builder.build())
}

/// Plans broker sync for eligible tracking mode changes.
///
/// Returns account IDs that need broker sync when:
/// - is_connected == true
/// - old_mode != new_mode
/// - Transition is: NOT_SET -> TRANSACTIONS/HOLDINGS or HOLDINGS -> TRANSACTIONS
pub fn plan_broker_sync(events: &[DomainEvent]) -> Vec<String> {
    let mut account_ids = Vec::new();

    for event in events {
        if let DomainEvent::TrackingModeChanged {
            account_id,
            old_mode,
            new_mode,
            is_connected,
        } = event
        {
            // Skip if not connected or mode didn't change
            if !is_connected || old_mode == new_mode {
                continue;
            }

            // Check for eligible transitions:
            // - NOT_SET -> TRANSACTIONS
            // - NOT_SET -> HOLDINGS
            // - HOLDINGS -> TRANSACTIONS
            let eligible = matches!(
                (old_mode, new_mode),
                (TrackingMode::NotSet, TrackingMode::Transactions)
                    | (TrackingMode::NotSet, TrackingMode::Holdings)
                    | (TrackingMode::Holdings, TrackingMode::Transactions)
            );

            if eligible {
                account_ids.push(account_id.clone());
            }
        }
    }

    account_ids
}

/// Plans asset enrichment for newly created assets.
///
/// Returns asset IDs from AssetsCreated events.
pub fn plan_asset_enrichment(events: &[DomainEvent]) -> Vec<String> {
    let mut asset_ids: HashSet<String> = HashSet::new();

    for event in events {
        if let DomainEvent::AssetsCreated {
            asset_ids: a_ids, ..
        } = event
        {
            asset_ids.extend(a_ids.iter().cloned());
        }
    }

    asset_ids.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use wealthfolio_core::events::CurrencyChange;

    #[test]
    fn test_plan_portfolio_job_empty_events() {
        let events: Vec<DomainEvent> = vec![];
        let result = plan_portfolio_job(&events, "USD");
        assert!(result.is_none());
    }

    #[test]
    fn test_plan_portfolio_job_activities_changed() {
        let events = vec![DomainEvent::ActivitiesChanged {
            account_ids: vec!["acc1".to_string()],
            asset_ids: vec!["AAPL".to_string()],
            currencies: vec!["USD".to_string()],
        }];

        let result = plan_portfolio_job(&events, "USD");
        assert!(result.is_some());

        let payload = result.unwrap();
        assert!(payload.account_ids.is_some());
        let account_ids = payload.account_ids.unwrap();
        assert!(account_ids.contains(&"acc1".to_string()));
    }

    #[test]
    fn test_plan_portfolio_job_with_currency_changes() {
        let events = vec![DomainEvent::AccountsChanged {
            account_ids: vec!["acc1".to_string()],
            currency_changes: vec![CurrencyChange {
                account_id: "acc1".to_string(),
                old_currency: Some("EUR".to_string()),
                new_currency: "GBP".to_string(),
            }],
        }];

        let result = plan_portfolio_job(&events, "USD");
        assert!(result.is_some());

        let payload = result.unwrap();
        // Should have FX asset IDs for both currencies
        if let wealthfolio_core::quotes::MarketSyncMode::Incremental { asset_ids } =
            payload.market_sync_mode
        {
            let ids = asset_ids.unwrap();
            assert!(ids.contains(&"FX:GBP:USD".to_string()));
            assert!(ids.contains(&"FX:EUR:USD".to_string()));
        } else {
            panic!("Expected Incremental sync mode");
        }
    }

    #[test]
    fn test_plan_portfolio_job_assets_created_no_recalc() {
        let events = vec![DomainEvent::AssetsCreated {
            asset_ids: vec!["AAPL".to_string()],
        }];

        let result = plan_portfolio_job(&events, "USD");
        assert!(result.is_none());
    }

    #[test]
    fn test_plan_broker_sync_not_connected() {
        let events = vec![DomainEvent::TrackingModeChanged {
            account_id: "acc1".to_string(),
            old_mode: TrackingMode::NotSet,
            new_mode: TrackingMode::Transactions,
            is_connected: false, // Not connected
        }];

        let result = plan_broker_sync(&events);
        assert!(result.is_empty());
    }

    #[test]
    fn test_plan_broker_sync_eligible_transition() {
        let events = vec![DomainEvent::TrackingModeChanged {
            account_id: "acc1".to_string(),
            old_mode: TrackingMode::NotSet,
            new_mode: TrackingMode::Transactions,
            is_connected: true,
        }];

        let result = plan_broker_sync(&events);
        assert_eq!(result, vec!["acc1".to_string()]);
    }

    #[test]
    fn test_plan_broker_sync_ineligible_transition() {
        // TRANSACTIONS -> HOLDINGS is not an eligible transition
        let events = vec![DomainEvent::TrackingModeChanged {
            account_id: "acc1".to_string(),
            old_mode: TrackingMode::Transactions,
            new_mode: TrackingMode::Holdings,
            is_connected: true,
        }];

        let result = plan_broker_sync(&events);
        assert!(result.is_empty());
    }

    #[test]
    fn test_plan_asset_enrichment() {
        let events = vec![
            DomainEvent::AssetsCreated {
                asset_ids: vec!["AAPL".to_string(), "MSFT".to_string()],
            },
            DomainEvent::AssetsCreated {
                asset_ids: vec!["GOOG".to_string()],
            },
        ];

        let result = plan_asset_enrichment(&events);
        assert_eq!(result.len(), 3);
        assert!(result.contains(&"AAPL".to_string()));
        assert!(result.contains(&"MSFT".to_string()));
        assert!(result.contains(&"GOOG".to_string()));
    }

    #[test]
    fn test_plan_asset_enrichment_deduplicates() {
        let events = vec![
            DomainEvent::AssetsCreated {
                asset_ids: vec!["AAPL".to_string()],
            },
            DomainEvent::AssetsCreated {
                asset_ids: vec!["AAPL".to_string()], // Duplicate
            },
        ];

        let result = plan_asset_enrichment(&events);
        assert_eq!(result.len(), 1);
    }
}
