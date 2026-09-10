use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, RwLock};

use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};

/// Shared per-account gate for every holdings/valuation recalculation. Pending
/// migration accounts are serialized and forced to a full rebuild.
#[derive(Default)]
pub struct PortfolioRecalculationGate {
    locks: Mutex<HashMap<String, Arc<AsyncMutex<()>>>>,
    pending_accounts: RwLock<HashSet<String>>,
}

pub struct PortfolioRecalculationPermit {
    _guards: Vec<OwnedMutexGuard<()>>,
    force_full: bool,
}

impl PortfolioRecalculationPermit {
    pub fn force_full(&self) -> bool {
        self.force_full
    }
}

impl PortfolioRecalculationGate {
    pub fn new(pending_account_ids: impl IntoIterator<Item = String>) -> Self {
        Self {
            locks: Mutex::new(HashMap::new()),
            pending_accounts: RwLock::new(pending_account_ids.into_iter().collect()),
        }
    }

    pub fn replace_pending_accounts(&self, account_ids: impl IntoIterator<Item = String>) {
        *self
            .pending_accounts
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = account_ids.into_iter().collect();
    }

    pub fn pending_account_ids(&self) -> Vec<String> {
        let mut account_ids: Vec<String> = self
            .pending_accounts
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .iter()
            .cloned()
            .collect();
        account_ids.sort();
        account_ids
    }

    pub async fn acquire(&self, account_ids: &[String]) -> PortfolioRecalculationPermit {
        let mut ordered_ids = account_ids.to_vec();
        ordered_ids.sort();
        ordered_ids.dedup();

        let locks: Vec<Arc<AsyncMutex<()>>> = {
            let mut registry = self
                .locks
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            ordered_ids
                .iter()
                .map(|account_id| {
                    registry
                        .entry(account_id.clone())
                        .or_insert_with(|| Arc::new(AsyncMutex::new(())))
                        .clone()
                })
                .collect()
        };

        let force_full = {
            let pending = self
                .pending_accounts
                .read()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            ordered_ids
                .iter()
                .any(|account_id| pending.contains(account_id))
        };
        let mut guards = Vec::with_capacity(locks.len());
        for lock in locks {
            guards.push(lock.lock_owned().await);
        }

        PortfolioRecalculationPermit {
            _guards: guards,
            force_full,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn pending_accounts_force_full_until_replaced() {
        let gate = PortfolioRecalculationGate::new(["account-1".to_string()]);
        let permit = gate.acquire(&["account-1".to_string()]).await;
        assert!(permit.force_full());
        drop(permit);

        gate.replace_pending_accounts(Vec::new());
        let permit = gate.acquire(&["account-1".to_string()]).await;
        assert!(!permit.force_full());
    }

    #[tokio::test]
    async fn recalculations_for_the_same_account_are_serialized() {
        let gate = Arc::new(PortfolioRecalculationGate::default());
        let first = gate.acquire(&["account-1".to_string()]).await;
        let waiting_gate = gate.clone();
        let waiting =
            tokio::spawn(async move { waiting_gate.acquire(&["account-1".to_string()]).await });

        tokio::task::yield_now().await;
        assert!(!waiting.is_finished());
        drop(first);

        let second = tokio::time::timeout(Duration::from_secs(1), waiting)
            .await
            .expect("waiting recalculation should acquire after release")
            .expect("waiting task should complete");
        assert!(!second.force_full());
    }
}
