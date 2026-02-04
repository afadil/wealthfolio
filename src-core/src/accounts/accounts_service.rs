use log::debug;
use std::sync::{Arc, RwLock};

use super::accounts_model::{Account, AccountUpdate, NewAccount};
use super::accounts_traits::{AccountRepositoryTrait, AccountServiceTrait};
use crate::db::DbTransactionExecutor;
use crate::errors::Result;
use crate::fx::fx_traits::FxServiceTrait;

/// Service for managing accounts (Generic over Executor)
pub struct AccountService<E: DbTransactionExecutor + Send + Sync + Clone> {
    repository: Arc<dyn AccountRepositoryTrait>,
    fx_service: Arc<dyn FxServiceTrait>,
    base_currency: Arc<RwLock<String>>,
    transaction_executor: E,
}

impl<E: DbTransactionExecutor + Send + Sync + Clone> AccountService<E> {
    /// Creates a new AccountService instance
    pub fn new(
        repository: Arc<dyn AccountRepositoryTrait>,
        fx_service: Arc<dyn FxServiceTrait>,
        transaction_executor: E,
        base_currency: Arc<RwLock<String>>,
    ) -> Self {
        Self {
            repository,
            fx_service,
            transaction_executor,
            base_currency,
        }
    }
}

#[async_trait::async_trait]
impl<E: DbTransactionExecutor + Send + Sync + Clone> AccountServiceTrait for AccountService<E> {
    /// Creates a new account with currency exchange support
    async fn create_account(&self, new_account: NewAccount) -> Result<Account> {
        let base_currency = self.base_currency.read().unwrap().clone();
        debug!(
            "Creating account..., base_currency: {}, new_account.currency: {}",
            base_currency, new_account.currency
        );

        // Perform async currency pair registration if needed
        if new_account.currency != base_currency {
            self.fx_service
                .register_currency_pair(
                    new_account.currency.as_str(),
                    base_currency.as_str(), // base_currency is String, .as_str() is correct
                )
                .await?;
        }

        // Clones for the transaction closure
        let repository_for_tx = self.repository.clone();
        let new_account_for_tx = new_account.clone();
        let executor_for_tx = self.transaction_executor.clone();

        executor_for_tx.execute(move |tx_conn| {
            // The currency pair registration logic has been moved outside this closure
            repository_for_tx.create_in_transaction(new_account_for_tx, tx_conn)
        })
    }

    /// Updates an existing account
    async fn update_account(&self, account_update: AccountUpdate) -> Result<Account> {
        (*self.repository).update(account_update).await
    }

    /// Retrieves an account by its ID
    fn get_account(&self, account_id: &str) -> Result<Account> {
        (*self.repository).get_by_id(account_id)
    }

    /// Lists all accounts with optional filtering by active status and account IDs
    fn list_accounts(
        &self,
        is_active_filter: Option<bool>,
        account_ids: Option<&[String]>,
    ) -> Result<Vec<Account>> {
        (*self.repository).list(is_active_filter, account_ids)
    }

    /// Lists all accounts
    fn get_all_accounts(&self) -> Result<Vec<Account>> {
        (*self.repository).list(None, None)
    }

    /// Lists only active accounts
    fn get_active_accounts(&self) -> Result<Vec<Account>> {
        self.list_accounts(Some(true), None)
    }

    /// Retrieves multiple accounts by their IDs
    fn get_accounts_by_ids(&self, account_ids: &[String]) -> Result<Vec<Account>> {
        self.list_accounts(None, Some(account_ids))
    }

    /// Deletes an account by its ID
    async fn delete_account(&self, account_id: &str) -> Result<()> {
        (*self.repository).delete(account_id).await?;
        Ok(())
    }

    /// Finds or creates a combined portfolio for multiple accounts
    /// Returns the combined portfolio account ID
    async fn find_or_create_combined_portfolio(&self, account_ids: Vec<String>) -> Result<Account> {
        // Sort IDs for consistent lookup
        let mut sorted_ids = account_ids.clone();
        sorted_ids.sort();

        // Serialize to JSON for storage
        let ids_json = serde_json::to_string(&sorted_ids).map_err(|e| {
            crate::Error::Unexpected(format!("Failed to serialize account IDs: {}", e))
        })?;

        // Try to find existing combined portfolio
        let all_accounts = self.get_all_accounts()?;
        if let Some(existing) = all_accounts.iter().find(|a| {
            a.is_combined_portfolio && a.component_account_ids.as_ref() == Some(&ids_json)
        }) {
            debug!("Found existing combined portfolio: {}", existing.id);
            return Ok(existing.clone());
        }

        // Get names of component accounts for display
        let component_accounts = self.get_accounts_by_ids(&sorted_ids)?;
        let account_names: Vec<String> =
            component_accounts.iter().map(|a| a.name.clone()).collect();
        let combined_name = format!("Combined: {}", account_names.join(" + "));

        // Get base currency from first account (or use default)
        let base_currency = component_accounts
            .first()
            .map(|a| a.currency.clone())
            .unwrap_or_else(|| self.base_currency.read().unwrap().clone());

        // Create new combined portfolio
        let new_combined = NewAccount {
            id: None,
            name: combined_name,
            account_type: "PORTFOLIO".to_string(),
            group: Some("Combined Portfolios".to_string()),
            currency: base_currency,
            is_default: false,
            is_active: true,
            platform_id: None,
            is_combined_portfolio: true,
            component_account_ids: Some(ids_json),
        };

        debug!("Creating new combined portfolio: {:?}", new_combined.name);
        let created = self.create_account(new_combined).await?;

        Ok(created)
    }
}
